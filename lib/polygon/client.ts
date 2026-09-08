const BASE = 'https://api.polygon.io';
// Trimmed: the Vercel value carried a trailing whitespace character, and
// URLSearchParams percent-encodes it into the key, which Polygon 401s. A raw
// template-literal URL happened to tolerate it, which is why this failed only
// after the client was rewritten to build URLs properly.
const KEY = () => (process.env.POLYGON_API_KEY ?? '').trim();

/**
 * Polygon over `fetch`, not axios.
 *
 * The axios instance this module used returned null for every call in the
 * Vercel runtime while a raw fetch to the identical URL returned 200 — and
 * because every function here swallows errors with `catch { return null }`,
 * that failed silently in production for as long as it was deployed. Prices,
 * charts, company details and search all degraded to empty without an error
 * anywhere. Errors are now logged rather than discarded, so the next time this
 * breaks it is visible.
 */
async function get<T>(path: string, params: Record<string, unknown> = {}, timeoutMs = 10000): Promise<T | null> {
  const url = new URL(BASE + path);
  url.searchParams.set('apiKey', KEY());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: abort.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.error(`polygon ${path} -> ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`polygon ${path} failed:`, e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface Bar { o: number; h: number; l: number; c: number; v: number; t?: number }

/** Previous trading day OHLCV — used for Day P&L. `t` is the bar timestamp in epoch ms. */
export async function getPrevClose(ticker: string): Promise<Bar | null> {
  const d = await get<{ results?: Bar[] }>(`/v2/aggs/ticker/${ticker}/prev`, { adjusted: true });
  return d?.results?.[0] ?? null;
}

/** Daily OHLCV candles for a date range — used for charts */
export async function getAggs(
  ticker: string,
  from: string, // YYYY-MM-DD
  to: string,   // YYYY-MM-DD
  multiplier = 1,
  timespan = 'day',
): Promise<{ t: number; o: number; h: number; l: number; c: number; v: number }[]> {
  const d = await get<{ results?: { t: number; o: number; h: number; l: number; c: number; v: number }[] }>(
    `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`,
    { adjusted: true, sort: 'asc', limit: 50000 },
  );
  return d?.results ?? [];
}

/** Company details — name, description, sector, employees, market cap, etc. */
export async function getTickerDetails(ticker: string): Promise<Record<string, any> | null> {
  const d = await get<{ results?: Record<string, any> }>(`/v3/reference/tickers/${ticker}`);
  return d?.results ?? null;
}

/** News articles for a ticker */
export async function getNews(ticker: string, limit = 10): Promise<any[]> {
  const d = await get<{ results?: any[] }>('/v2/reference/news', {
    ticker, limit, sort: 'published_utc', order: 'desc',
  });
  return d?.results ?? [];
}

/** Ticker search — for the nav search bar */
export async function searchTickers(query: string, limit = 5): Promise<{ symbol: string; name: string; type: string }[]> {
  const d = await get<{ results?: any[] }>('/v3/reference/tickers', {
    search: query, active: true, limit, sort: 'ticker', market: 'stocks',
  });
  return (d?.results ?? []).map((r: any) => ({ symbol: r.ticker, name: r.name, type: r.type ?? '' }));
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
  const d = await get<{ tickers?: any[] }>('/v2/snapshot/locale/us/markets/stocks/tickers',
    { tickers: tickers.join(',') }, 15000);
  const out: Record<string, { prevClose: number; dayClose: number | null }> = {};
  for (const t of (d?.tickers ?? [])) {
    out[t.ticker] = { prevClose: t.prevDay?.c ?? 0, dayClose: t.day?.c ?? null };
  }
  return out;
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
  const d = await get<{ tickers?: any[] }>('/v2/snapshot/locale/us/markets/stocks/tickers',
    { tickers: ticker }, 15000);
  const t = d?.tickers?.[0];
  if (!t) return null;
  return {
    day: t.day ?? null,
    prevDay: t.prevDay ?? null,
    lastTrade: t.lastTrade ? { p: t.lastTrade.p } : null,
    todaysChange: t.todaysChange ?? null,
    todaysChangePerc: t.todaysChangePerc ?? null,
  };
}
