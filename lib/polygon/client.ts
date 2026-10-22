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
/**
 * Response cache, and in-flight de-duplication.
 *
 * The plan allows five calls a minute. One stock page spends four on its own
 * (details, a year of dailies, a snapshot, plus the chart's candles), so a
 * second page view inside the same minute started coming back 429 — and since
 * a failed call resolves to null, the page silently degraded to "—" for every
 * price and an empty chart rather than showing an error.
 *
 * Everything served here is end-of-day data that does not change while the
 * market is open, so holding it briefly costs nothing in accuracy and keeps
 * the budget for calls that are actually new. Identical concurrent calls share
 * one request instead of racing each other for the same quota.
 */
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/** Keep the map from growing without bound on a long-lived instance. */
function prune(now: number) {
  if (cache.size < 200) return;
  for (const [k, v] of cache) if (now - v.at > TTL_MS) cache.delete(k);
}

async function get<T>(path: string, params: Record<string, unknown> = {}, timeoutMs = 10000): Promise<T | null> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  // Key on the URL without the secret, so the key never carries the API key.
  const key = url.toString();
  url.searchParams.set('apiKey', KEY());

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value as T | null;

  const running = inflight.get(key);
  if (running) return running as Promise<T | null>;

  const request = (async (): Promise<T | null> => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: abort.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        // 403 means the plan does not cover this endpoint and retrying will
        // never help; 429 means the minute's budget is spent. Both are worth
        // naming, because both used to vanish into a null.
        console.error(`polygon ${path} -> ${res.status}${res.status === 429 ? ' (rate limited)' : res.status === 403 ? ' (not on plan)' : ''}`);
        return null;
      }
      const json = (await res.json()) as T;
      prune(now);
      cache.set(key, { at: now, value: json });
      return json;
    } catch (e) {
      console.error(`polygon ${path} failed:`, e instanceof Error ? e.message : e);
      return null;
    } finally {
      clearTimeout(timer);
      inflight.delete(key);
    }
  })();

  inflight.set(key, request);
  return request;
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
