import axios from 'axios';

const BASE = 'https://api.polygon.io';
const KEY = () => process.env.POLYGON_API_KEY!;

const http = axios.create({ baseURL: BASE, timeout: 10000 });

function p(extra: Record<string, any> = {}) {
  return { apiKey: KEY(), ...extra };
}

/** Previous trading day OHLCV — used for Day P&L */
export async function getPrevClose(ticker: string): Promise<{ o: number; h: number; l: number; c: number; v: number } | null> {
  try {
    const res = await http.get(`/v2/aggs/ticker/${ticker}/prev`, { params: p({ adjusted: true }) });
    return res.data?.results?.[0] ?? null;
  } catch { return null; }
}

/** Daily OHLCV candles for a date range — used for charts */
export async function getAggs(
  ticker: string,
  from: string, // YYYY-MM-DD
  to: string,   // YYYY-MM-DD
  multiplier = 1,
  timespan = 'day',
): Promise<{ t: number; o: number; h: number; l: number; c: number; v: number }[]> {
  try {
    const res = await http.get(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, {
      params: p({ adjusted: true, sort: 'asc', limit: 50000 }),
    });
    return res.data?.results ?? [];
  } catch { return []; }
}

/** Company details — name, description, sector, employees, market cap, etc. */
export async function getTickerDetails(ticker: string): Promise<Record<string, any> | null> {
  try {
    const res = await http.get(`/v3/reference/tickers/${ticker}`, { params: p() });
    return res.data?.results ?? null;
  } catch { return null; }
}

/** News articles for a ticker */
export async function getNews(ticker: string, limit = 10): Promise<any[]> {
  try {
    const res = await http.get(`/v2/reference/news`, {
      params: p({ ticker, limit, sort: 'published_utc', order: 'desc' }),
    });
    return res.data?.results ?? [];
  } catch { return []; }
}

/** Ticker search — for the nav search bar */
export async function searchTickers(query: string, limit = 5): Promise<{ symbol: string; name: string; type: string }[]> {
  try {
    const res = await http.get(`/v3/reference/tickers`, {
      params: p({ search: query, active: true, limit, sort: 'ticker', market: 'stocks' }),
    });
    return (res.data?.results ?? []).map((r: any) => ({
      symbol: r.ticker,
      name: r.name,
      type: r.type ?? '',
    }));
  } catch { return []; }
}

/** Batch previous closes for multiple tickers */
export async function getBatchPrevClose(tickers: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  await Promise.allSettled(
    tickers.map(async t => {
      const r = await getPrevClose(t);
      if (r) results[t] = r.c;
    })
  );
  return results;
}

/** Snapshot for multiple tickers — returns prevDay.c and current day data in one API call */
export async function getSnapshots(tickers: string[]): Promise<Record<string, { prevClose: number; dayClose: number | null }>> {
  try {
    const res = await http.get('/v2/snapshot/locale/us/markets/stocks/tickers', {
      params: p({ tickers: tickers.join(',') }),
      timeout: 15000,
    });
    const out: Record<string, { prevClose: number; dayClose: number | null }> = {};
    for (const t of (res.data?.tickers ?? [])) {
      out[t.ticker] = {
        prevClose: t.prevDay?.c ?? 0,
        dayClose: t.day?.c ?? null,
      };
    }
    return out;
  } catch { return {}; }
}

export interface PolygonSnapshot {
  day: { o: number; h: number; l: number; c: number; v: number } | null;
  prevDay: { o: number; h: number; l: number; c: number; v: number } | null;
  lastTrade: { p: number } | null;
  todaysChange: number | null;
  todaysChangePerc: number | null;
}

/** Full snapshot for a single ticker — today's intraday data + previous day close */
export async function getSnapshot(ticker: string): Promise<PolygonSnapshot | null> {
  try {
    const res = await http.get('/v2/snapshot/locale/us/markets/stocks/tickers', {
      params: p({ tickers: ticker }),
      timeout: 15000,
    });
    const t = res.data?.tickers?.[0];
    if (!t) return null;
    return {
      day: t.day ?? null,
      prevDay: t.prevDay ?? null,
      lastTrade: t.lastTrade ? { p: t.lastTrade.p } : null,
      todaysChange: t.todaysChange ?? null,
      todaysChangePerc: t.todaysChangePerc ?? null,
    };
  } catch { return null; }
}
