import { NextResponse } from 'next/server';
import { getAggs, getTickerDetails, getSnapshot } from '@/lib/polygon/client';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { getValidAccessToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

function dateStr(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();

  // Fetch in parallel: company details, 1Y daily candles, Polygon snapshot
  const [details, candles1Y, snapshot] = await Promise.all([
    getTickerDetails(sym),
    getAggs(sym, dateStr(400), dateStr(0), 1, 'day'),
    getSnapshot(sym),
  ]);

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

  // Previous close from snapshot (prevDay) — computed before price so we can use lastClose as fallback
  const todayStr = new Date().toISOString().slice(0, 10);
  const completedCandles = candles1Y.filter(c => new Date(c.t).toISOString().slice(0, 10) < todayStr && c.c > 0);
  const lastClose = completedCandles.length > 0 ? completedCandles[completedCandles.length - 1].c : null;
  const prevDayC = snapshot?.prevDay?.c;
  const prevClose = (prevDayC != null && prevDayC > 0 ? prevDayC : null) ?? lastClose;

  // Prefer Tastytrade live price, then Polygon snapshot (lastTrade or day close), then last candle close
  // Treat 0 as invalid — Polygon returns 0 for delisted / no-trade-today stocks
  const ltP = snapshot?.lastTrade?.p;
  const dayC = snapshot?.day?.c;
  const snapshotPrice = (ltP != null && ltP > 0 ? ltP : null)
                      ?? (dayC != null && dayC > 0 ? dayC : null);
  const price = ttPrice ?? snapshotPrice ?? lastClose;

  const change = price !== null && prevClose ? price - prevClose : null;
  // When price === prevClose (fell back to lastClose for both), show 0 change rather than null
  const changePct = change !== null && prevClose ? change / prevClose : null;

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

  // Sparkline (1Y, every 5th candle for performance)
  const sparkline = completedCandles
    .filter((_, i) => i % 5 === 0)
    .map(c => ({ t: c.t, v: c.c }));

  // Candles for chart — format as YYYY-MM-DD strings for lightweight-charts
  const candles = candles1Y
    .filter(c => c.o && c.h && c.l && c.c)
    .map(c => {
      const d = new Date(c.t);
      const time = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      return { time, open: c.o, high: c.h, low: c.l, close: c.c };
    });

  // Company details from Polygon
  const d = details ?? {};

  return NextResponse.json({
    success: true,
    data: {
      ticker: sym,
      name: d.name ?? sym,
      exchange: d.primary_exchange ?? null,
      currency: d.currency_name?.toUpperCase() ?? 'USD',

      currentPrice: price,
      previousClose: prevClose,
      open: snapshot?.day?.o ?? null,
      dayLow: snapshot?.day?.l ?? null,
      dayHigh: snapshot?.day?.h ?? null,
      change,
      changePct,
      volume: snapshot?.day?.v ?? null,
      avgVolume: null, // not available on free tier

      change1d: changePct,
      change1m,
      change3m,
      ytdChange,
      sparkline,

      // Fundamentals — Polygon free tier provides market cap only
      marketCap: d.market_cap ?? null,
      enterpriseValue: null,
      peRatio: null,
      forwardPE: null,
      priceToBook: null,
      priceToSales: null,
      evToEbitda: null,
      evToRevenue: null,
      revenue: null,
      grossMargin: null,
      operatingMargin: null,
      profitMargin: null,
      returnOnEquity: null,
      returnOnAssets: null,
      debtToEquity: null,
      freeCashFlow: null,
      eps: null,

      week52High: completedCandles.length > 0 ? Math.max(...completedCandles.slice(-252).map(c => c.h)) : null,
      week52Low: completedCandles.length > 0 ? Math.min(...completedCandles.slice(-252).map(c => c.l)) : null,
      beta: null,
      dividendYield: null,
      payoutRatio: null,

      sector: d.sic_description ?? null,
      industry: d.sic_description ?? null,
      employees: d.total_employees ?? null,
      website: d.homepage_url ?? null,
      description: d.description ?? null,
      country: d.locale === 'us' ? 'United States' : (d.locale ?? null),
      city: null,
      state: null,
      candles,
    },
  });
}
