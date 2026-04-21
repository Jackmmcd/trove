import { NextResponse } from 'next/server';
import axios from 'axios';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { getValidAccessToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Crumb cache
let _crumb: string | null = null;
let _cookie: string | null = null;
let _crumbAt = 0;

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (_crumb && _cookie && Date.now() - _crumbAt < 25 * 60 * 1000) return { crumb: _crumb, cookie: _cookie };
  try {
    const r1 = await axios.get('https://finance.yahoo.com', {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      maxRedirects: 5, timeout: 12000,
    });
    const cookies = (r1.headers['set-cookie'] ?? []).map((c: string) => c.split(';')[0]).join('; ');
    const r2 = await axios.get('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookies },
      timeout: 6000,
    });
    const crumb = typeof r2.data === 'string' ? r2.data.trim() : null;
    if (!crumb || crumb.includes('{') || crumb.includes('<')) return null;
    _crumb = crumb; _cookie = cookies; _crumbAt = Date.now();
    return { crumb, cookie: cookies };
  } catch { return null; }
}

async function fetchChart(sym: string): Promise<any> {
  // Use same params as existing working history route (range: '1y' gets 429, shorter ranges work)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`, {
        params: { interval: '1d', range: '1y' },
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        timeout: 10000,
      });
      return res.data?.chart?.result?.[0] ?? null;
    } catch (e: any) {
      if (e.response?.status === 429) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function fetchSummary(sym: string): Promise<Record<string, any> | null> {
  const auth = await getCrumb();
  if (!auth) return null;
  try {
    const res = await axios.get(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}`, {
      params: { modules: 'price,summaryDetail,defaultKeyStatistics,assetProfile,financialData', crumb: auth.crumb },
      headers: { 'User-Agent': UA, Cookie: auth.cookie, Accept: 'application/json' },
      timeout: 10000,
    });
    return res.data?.quoteSummary?.result?.[0] ?? null;
  } catch (e: any) {
    if (e.response?.status === 401 || e.response?.status === 403) { _crumb = null; _cookie = null; _crumbAt = 0; }
    return null;
  }
}

// Local Python yfinance microservice (scripts/stock_server.py on port 3002)
async function fetchPython(sym: string): Promise<Record<string, any> | null> {
  try {
    const res = await axios.get(`http://127.0.0.1:3002/stock/${encodeURIComponent(sym)}`, { timeout: 8000 });
    return res.data?.success ? res.data.data : null;
  } catch { return null; }
}

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();

  // Try local Python yfinance microservice first (scripts/stock_server.py on :3002)
  const py = await fetchPython(sym);

  // Get real-time price from Tastytrade (overrides yfinance price when available)
  let currentPrice: number | null = py?.currentPrice ?? null;
  try {
    const token = await getValidAccessToken();
    if (token) {
      const client = getTastytradeClient(token);
      const prices = await client.getQuotes([sym]);
      currentPrice = prices[sym] ?? currentPrice;
    }
  } catch { /* ok */ }

  // Get company info from Yahoo search as fallback for name/sector
  let searchQuote: any = null;
  if (!py) {
    try {
      const res = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
        params: { q: sym, quotesCount: 1, newsCount: 0 },
        headers: { 'User-Agent': UA },
        timeout: 6000,
      });
      searchQuote = (res.data?.quotes ?? []).find((q: any) => q.symbol === sym) ?? null;
    } catch { /* ok */ }
  }

  // Get chart data for OHLCV/sparkline (Yahoo chart — still useful for history)
  const chart = await fetchChart(sym);

  // Yahoo quoteSummary fallback (only if Python server not available)
  const summary = py ? null : await fetchSummary(sym);

  const meta = chart?.meta ?? {};
  const q = chart?.indicators?.quote?.[0] ?? {};
  const closes: number[] = (q.close ?? []).filter((c: number | null) => c != null);
  const opens: number[] = q.open ?? [];
  const highs: number[] = q.high ?? [];
  const lows: number[] = q.low ?? [];
  const volumes: number[] = q.volume ?? [];
  const timestamps: number[] = chart?.timestamp ?? [];

  const last = closes.length - 1;
  const prevClose = py?.previousClose ?? meta.chartPreviousClose ?? (last > 0 ? closes[last - 1] : null);
  const price = currentPrice ?? py?.currentPrice ?? meta.regularMarketPrice ?? closes[last] ?? null;
  const change = price !== null && prevClose ? price - prevClose : null;
  const changePct = change !== null && prevClose ? change / prevClose : null;

  const ytdChange = closes[0] && price ? (price - closes[0]) / closes[0] : null;
  const c3m = closes[Math.max(0, last - 63)];
  const change3m = c3m && price ? (price - c3m) / c3m : null;
  const c1m = closes[Math.max(0, last - 21)];
  const change1m = c1m && price ? (price - c1m) / c1m : null;

  const sparkline = timestamps
    .map((t: number, i: number) => ({ t: t * 1000, v: closes[i] }))
    .filter((p: any) => p.v != null)
    .filter((_: any, i: number) => i % 5 === 0);

  // Candle data for chart (YYYY-MM-DD time strings required by lightweight-charts)
  const candles = timestamps
    .map((t: number, i: number) => {
      const o = (q.open ?? [])[i];
      const h = (q.high ?? [])[i];
      const l = (q.low ?? [])[i];
      const c = (q.close ?? [])[i];
      if (!o || !h || !l || !c) return null;
      const d = new Date(t * 1000);
      const time = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      return { time, open: o, high: h, low: l, close: c };
    })
    .filter(Boolean);

  // Yahoo summary fallback fields (only used when Python server is unavailable)
  const sp = summary?.price ?? {};
  const sd = summary?.summaryDetail ?? {};
  const sk = summary?.defaultKeyStatistics ?? {};
  const sa = summary?.assetProfile ?? {};
  const sf = summary?.financialData ?? {};

  return NextResponse.json({
    success: true,
    data: {
      ticker: sym,
      name: py?.name || sp.longName || sp.shortName || meta.longName || meta.shortName || searchQuote?.longname || sym,
      exchange: py?.exchange || sp.exchangeName || meta.fullExchangeName || searchQuote?.exchDisp || null,
      currency: py?.currency || sp.currency || meta.currency || 'USD',

      currentPrice: price,
      previousClose: prevClose,
      open: py?.open ?? opens[opens.length - 1] ?? null,
      dayLow: py?.dayLow ?? meta.regularMarketDayLow ?? lows[lows.length - 1] ?? null,
      dayHigh: py?.dayHigh ?? meta.regularMarketDayHigh ?? highs[highs.length - 1] ?? null,
      change, changePct,
      volume: py?.volume ?? meta.regularMarketVolume ?? volumes[volumes.length - 1] ?? null,
      avgVolume: py?.avgVolume ?? sd.averageVolume?.raw ?? null,

      change1d: changePct, change1m, change3m, ytdChange,
      sparkline,

      marketCap: py?.marketCap ?? sp.marketCap?.raw ?? null,
      enterpriseValue: py?.enterpriseValue ?? sk.enterpriseValue?.raw ?? null,
      peRatio: py?.peRatio ?? sd.trailingPE?.raw ?? null,
      forwardPE: py?.forwardPE ?? sd.forwardPE?.raw ?? null,
      priceToBook: py?.priceToBook ?? sk.priceToBook?.raw ?? null,
      priceToSales: py?.priceToSales ?? sk.priceToSalesTrailing12Months?.raw ?? null,
      evToEbitda: py?.evToEbitda ?? sk.enterpriseToEbitda?.raw ?? null,
      evToRevenue: py?.evToRevenue ?? sk.enterpriseToRevenue?.raw ?? null,

      revenue: py?.revenue ?? sf.totalRevenue?.raw ?? null,
      grossMargin: py?.grossMargin ?? sf.grossMargins?.raw ?? null,
      operatingMargin: py?.operatingMargin ?? sf.operatingMargins?.raw ?? null,
      profitMargin: py?.profitMargin ?? sf.profitMargins?.raw ?? null,
      returnOnEquity: py?.returnOnEquity ?? sf.returnOnEquity?.raw ?? null,
      returnOnAssets: py?.returnOnAssets ?? sf.returnOnAssets?.raw ?? null,
      debtToEquity: py?.debtToEquity ?? sf.debtToEquity?.raw ?? null,
      freeCashFlow: py?.freeCashFlow ?? sf.freeCashflow?.raw ?? null,
      eps: py?.eps ?? sk.trailingEps?.raw ?? null,

      week52High: py?.week52High ?? sd.fiftyTwoWeekHigh?.raw ?? meta.fiftyTwoWeekHigh ?? null,
      week52Low: py?.week52Low ?? sd.fiftyTwoWeekLow?.raw ?? meta.fiftyTwoWeekLow ?? null,
      beta: py?.beta ?? sd.beta?.raw ?? null,
      dividendYield: py?.dividendYield ?? sd.dividendYield?.raw ?? null,
      payoutRatio: py?.payoutRatio ?? sd.payoutRatio?.raw ?? null,

      sector: py?.sector ?? sa.sector ?? searchQuote?.sectorDisp ?? null,
      industry: py?.industry ?? sa.industry ?? searchQuote?.industryDisp ?? null,
      employees: py?.employees ?? sa.fullTimeEmployees ?? null,
      website: py?.website ?? sa.website ?? null,
      description: py?.description ?? sa.longBusinessSummary ?? null,
      country: py?.country ?? sa.country ?? null,
      city: py?.city ?? sa.city ?? null,
      state: py?.state ?? sa.state ?? null,
      candles,
    },
  });
}
