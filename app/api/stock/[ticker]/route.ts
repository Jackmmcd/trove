import { NextResponse } from 'next/server';
import { getAggs, getTickerDetails, getSnapshot } from '@/lib/polygon/client';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { getValidAccessToken } from '@/lib/auth/session';
import axios from 'axios';

export const dynamic = 'force-dynamic';

function dateStr(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function pos(n: any): number | null {
  return n != null && Number(n) > 0 ? Number(n) : null;
}
function num(n: any): number | null {
  return n != null && isFinite(Number(n)) ? Number(n) : null;
}

async function fetchYahooSummary(sym: string) {
  try {
    const modules = 'summaryDetail,financialData,defaultKeyStatistics,assetProfile';
    const res = await axios.get(
      `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(sym)}`,
      {
        params: { modules },
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        timeout: 8000,
      }
    );
    const r = res.data?.quoteSummary?.result?.[0] ?? {};
    const sd = r.summaryDetail ?? {};
    const fd = r.financialData ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const ap = r.assetProfile ?? {};
    return { sd, fd, ks, ap };
  } catch {
    return { sd: {}, fd: {}, ks: {}, ap: {} };
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();

  // Fetch in parallel: Polygon data + Yahoo fundamentals
  const [details, candles1Y, snapshot, yahoo] = await Promise.all([
    getTickerDetails(sym),
    getAggs(sym, dateStr(400), dateStr(0), 1, 'day'),
    getSnapshot(sym),
    fetchYahooSummary(sym),
  ]);

  const { sd, fd, ks, ap } = yahoo;

  // Get real-time price from Tastytrade if authenticated
  let ttPrice: number | null = null;
  try {
    const token = await getValidAccessToken();
    if (token) {
      const client = getTastytradeClient(token);
      const prices = await client.getQuotes([sym]);
      ttPrice = prices[sym] > 0 ? prices[sym] : null;
    }
  } catch { /* ok */ }

  // Previous close — computed first so we can use lastClose as price fallback
  const todayStr = new Date().toISOString().slice(0, 10);
  const completedCandles = candles1Y.filter(c => new Date(c.t).toISOString().slice(0, 10) < todayStr && c.c > 0);
  const lastClose = completedCandles.length > 0 ? completedCandles[completedCandles.length - 1].c : null;
  const prevDayC = snapshot?.prevDay?.c;
  const prevClose = (prevDayC != null && prevDayC > 0 ? prevDayC : null) ?? lastClose;

  // Price: Tastytrade → Polygon snapshot → last candle close (for non-market-hours / delisted)
  const ltP = snapshot?.lastTrade?.p;
  const dayC = snapshot?.day?.c;
  const snapshotPrice = (ltP != null && ltP > 0 ? ltP : null)
                      ?? (dayC != null && dayC > 0 ? dayC : null);
  const price = ttPrice ?? snapshotPrice ?? lastClose;

  const change = price !== null && prevClose ? price - prevClose : null;
  const changePct = change !== null && prevClose ? change / prevClose : null;

  // OPEN / DAY LOW / DAY HIGH — fall back to prev day when market is closed (today's values are 0)
  const dayOpen = pos(snapshot?.day?.o) ?? pos(snapshot?.prevDay?.o);
  const dayLow  = pos(snapshot?.day?.l) ?? pos(snapshot?.prevDay?.l);
  const dayHigh = pos(snapshot?.day?.h) ?? pos(snapshot?.prevDay?.h);
  const dayVol  = snapshot?.day?.v ?? snapshot?.prevDay?.v ?? null;

  // Period performance
  const last = completedCandles.length - 1;
  const c1m = last >= 21 ? completedCandles[last - 21].c : null;
  const c3m = last >= 63 ? completedCandles[last - 63].c : null;
  const currentYear = new Date().getFullYear();
  const ytdIdx = completedCandles.findIndex(c => new Date(c.t).getUTCFullYear() === currentYear);
  const ytdStart = ytdIdx > 0 ? completedCandles[ytdIdx - 1].c : null;

  const change1m = c1m && price ? (price - c1m) / c1m : null;
  const change3m = c3m && price ? (price - c3m) / c3m : null;
  const ytdChange = ytdStart && price ? (price - ytdStart) / ytdStart : null;

  // Sparkline
  const sparkline = completedCandles.filter((_, i) => i % 5 === 0).map(c => ({ t: c.t, v: c.c }));

  // Candles for chart
  const candles = candles1Y
    .filter(c => c.o && c.h && c.l && c.c)
    .map(c => {
      const d = new Date(c.t);
      const time = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      return { time, open: c.o, high: c.h, low: c.l, close: c.c };
    });

  const d = details ?? {};

  // 52-week from candles (more reliable than snapshot)
  const recent252 = completedCandles.slice(-252);
  const week52High = recent252.length > 0 ? Math.max(...recent252.map(c => c.h)) : null;
  const week52Low  = recent252.length > 0 ? Math.min(...recent252.map(c => c.l)) : null;

  return NextResponse.json({
    success: true,
    data: {
      ticker: sym,
      name: d.name ?? sym,
      exchange: d.primary_exchange ?? null,
      currency: d.currency_name?.toUpperCase() ?? 'USD',

      currentPrice: price,
      previousClose: prevClose,
      open: dayOpen,
      dayLow,
      dayHigh,
      change,
      changePct,
      volume: dayVol,
      avgVolume: num(sd.averageVolume) ?? num(sd.averageDailyVolume10Day),

      change1d: changePct,
      change1m,
      change3m,
      ytdChange,
      sparkline,

      // Fundamentals from Yahoo Finance
      marketCap: num(sd.marketCap) ?? d.market_cap ?? null,
      enterpriseValue: num(ks.enterpriseValue),
      peRatio: num(sd.trailingPE),
      forwardPE: num(sd.forwardPE),
      priceToBook: num(ks.priceToBook),
      priceToSales: num(ks.priceToSalesTrailing12Months),
      evToEbitda: num(ks.enterpriseToEbitda),
      evToRevenue: num(ks.enterpriseToRevenue),
      revenue: num(fd.totalRevenue),
      grossMargin: num(fd.grossMargins),
      operatingMargin: num(fd.operatingMargins),
      profitMargin: num(fd.profitMargins),
      returnOnEquity: num(fd.returnOnEquity),
      returnOnAssets: num(fd.returnOnAssets),
      debtToEquity: num(fd.debtToEquity) != null ? (fd.debtToEquity / 100) : null,
      freeCashFlow: num(fd.freeCashflow),
      eps: num(ks.trailingEps),

      week52High: num(sd.fiftyTwoWeekHigh) ?? week52High,
      week52Low: num(sd.fiftyTwoWeekLow) ?? week52Low,
      beta: num(sd.beta) ?? num(ks.beta),
      dividendYield: num(sd.dividendYield),
      payoutRatio: num(sd.payoutRatio),

      sector: ap.sector ?? d.sic_description ?? null,
      industry: ap.industry ?? d.sic_description ?? null,
      employees: num(ap.fullTimeEmployees) ?? d.total_employees ?? null,
      website: ap.website ?? d.homepage_url ?? null,
      description: ap.longBusinessSummary ?? d.description ?? null,
      country: ap.country ?? (d.locale === 'us' ? 'United States' : (d.locale ?? null)),
      city: ap.city ?? null,
      state: ap.state ?? null,
      candles,
    },
  });
}
