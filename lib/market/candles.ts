/**
 * Daily closes for one symbol, oldest first, dated in Eastern time.
 *
 * Every price view in the app (the portfolio chart, paper valuations, settled
 * quotes, week-over-week change) is built from these, one request per symbol.
 * A basket alone is 20–50 symbols, so opening the dashboard used to fan out
 * that many uncached Yahoo requests several times over. Daily candles change
 * at most once a session, so they are cached: in Next's data cache, shared
 * across server instances, and in memory for the life of this one.
 *
 * Today's part-formed candle can sit in the cache for up to REVALIDATE_S; the
 * callers trim it with completedSessions() before treating anything as a close.
 */

export interface DailyClose { date: string; close: number }

const REVALIDATE_S = 600;
const memo = new Map<string, { at: number; value: Promise<DailyClose[]> }>();

/** A failure from Yahoo itself, as opposed to the cache around it. */
class QuoteSourceError extends Error {}

const easternDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});

async function fetchYahoo(symbol: string, range: string): Promise<DailyClose[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store', // cached one level up, where errors can be kept out of it
  });
  if (!res.ok) throw new QuoteSourceError(`yahoo ${symbol} ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];

  const out = timestamps
    .map((ts, i) => {
      const close = closes[i];
      if (!close || close <= 0) return null;
      // Yahoo stamps a daily candle at the session open in exchange time;
      // reading the date back in Eastern keeps it on the right session.
      return { date: easternDate.format(new Date(ts * 1000)), close };
    })
    .filter((d): d is DailyClose => d !== null);
  // Throwing keeps an empty answer (delisted, throttled) out of the cache.
  if (!out.length) throw new QuoteSourceError(`yahoo ${symbol}: no candles`);
  return out;
}

// Loaded on first use: next/cache pulls in server internals that scripts and
// the jsdom test environment can't load.
let shared: ((symbol: string, range: string) => Promise<DailyClose[]>) | null = null;
async function viaDataCache(symbol: string, range: string): Promise<DailyClose[]> {
  if (!shared) {
    const { unstable_cache } = await import('next/cache');
    shared = unstable_cache(fetchYahoo, ['daily-candles-v1'], { revalidate: REVALIDATE_S });
  }
  return shared(symbol, range);
}

export function dailyCloses(symbol: string, range: string): Promise<DailyClose[]> {
  const key = `${symbol}|${range}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < REVALIDATE_S * 1000) return hit.value;

  // A Yahoo failure is final. Anything else is the data cache being
  // unavailable (no request context in scripts and tests), so go direct.
  const value = viaDataCache(symbol, range).catch(err => {
    if (err instanceof QuoteSourceError) throw err;
    return fetchYahoo(symbol, range);
  });
  memo.set(key, { at: Date.now(), value });
  value.catch(() => memo.delete(key));
  if (memo.size > 2000) memo.delete(memo.keys().next().value!);
  return value;
}
