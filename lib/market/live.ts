/**
 * Live intraday market data for the Analyst.
 *
 * Polygon is the source for history and company facts, but the key on this
 * plan is explicitly not entitled to the current session: the snapshot
 * endpoint 403s, and a minute-aggregate request dated today comes back
 * "your plan doesn't include this data timeframe". The most recent bar it
 * will serve is the previous trading day's close. That is why the Analyst
 * used to say it had no intraday view at all.
 *
 * The broker data feed does have the current session, and the rest of the app
 * already quotes from it. This module is that feed, in the shape the Analyst
 * needs: one price, what it is relative to yesterday, and when it was struck.
 */

export interface LiveQuote {
  symbol: string;
  /** Last traded price in the current session. */
  price: number;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  day_open: number | null;
  day_high: number | null;
  day_low: number | null;
  day_volume: number | null;
  /** ISO timestamp of the last trade — this is how stale the number is. */
  as_of: string | null;
}

export interface MarketClock {
  is_open: boolean;
  next_open: string | null;
  next_close: string | null;
}

interface AlpacaBar { o?: number; h?: number; l?: number; c?: number; v?: number; t?: string }

/** Only the fields used below — Alpaca's snapshot payload carries a great deal more. */
interface AlpacaSnapshot {
  latestTrade?: { p?: number; t?: string };
  minuteBar?: AlpacaBar;
  dailyBar?: AlpacaBar;
  prevDailyBar?: AlpacaBar;
}

function alpacaHeaders(): Record<string, string> | null {
  const key = (process.env.ALPACA_API_KEY ?? '').trim();
  const secret = (process.env.ALPACA_API_SECRET ?? '').trim();
  if (!key || !secret) return null;
  return { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };
}

async function getJson<T>(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<T | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { ...headers, Accept: 'application/json' }, signal: abort.signal });
    if (!res.ok) {
      // Logged, not swallowed: a silent failure here degrades the Analyst back
      // to "I can't see intraday", which reads as a product limit rather than
      // the outage it actually is.
      console.error(`market data ${url.split('?')[0]} -> ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error('market data request failed:', e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function num(n: unknown): number | null {
  const v = Number(n);
  return n != null && isFinite(v) && v > 0 ? v : null;
}

/**
 * Current-session quotes for up to a few hundred symbols.
 *
 * Symbols with no live print are omitted rather than returned at zero — a
 * missing quote must not read as a price of nothing.
 */
export async function getLiveQuotes(symbols: string[]): Promise<Record<string, LiveQuote>> {
  const headers = alpacaHeaders();
  const wanted = [...new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean))];
  if (!headers || wanted.length === 0) return {};

  const out: Record<string, LiveQuote> = {};

  for (let i = 0; i < wanted.length; i += 100) {
    const chunk = wanted.slice(i, i + 100);
    const d = await getJson<Record<string, AlpacaSnapshot>>(
      `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(chunk.join(','))}`,
      headers,
    );
    if (!d) continue;

    for (const [symbol, s] of Object.entries(d)) {
      // Last trade first, then the latest minute bar. The daily bar is the
      // fallback that still belongs to the current session; prevDailyBar is
      // deliberately not a price source, only the comparison point.
      const price = num(s?.latestTrade?.p) ?? num(s?.minuteBar?.c) ?? num(s?.dailyBar?.c);
      if (price === null) continue;

      const prevClose = num(s?.prevDailyBar?.c);
      out[symbol] = {
        symbol,
        price,
        prev_close: prevClose,
        change: prevClose ? price - prevClose : null,
        change_pct: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
        day_open: num(s?.dailyBar?.o),
        day_high: num(s?.dailyBar?.h),
        day_low: num(s?.dailyBar?.l),
        day_volume: num(s?.dailyBar?.v),
        as_of: s?.latestTrade?.t ?? s?.minuteBar?.t ?? s?.dailyBar?.t ?? null,
      };
    }
  }

  return out;
}

/** One symbol, same data. */
export async function getLiveQuote(symbol: string): Promise<LiveQuote | null> {
  const q = await getLiveQuotes([symbol]);
  return q[symbol.trim().toUpperCase()] ?? null;
}

/** Whether the US equity session is open right now. */
export async function getMarketClock(): Promise<MarketClock | null> {
  const headers = alpacaHeaders();
  if (!headers) return null;
  const base = (process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets/v2').replace(/\/$/, '');
  const d = await getJson<{ is_open?: boolean; next_open?: string; next_close?: string }>(`${base}/clock`, headers);
  if (!d) return null;
  return {
    is_open: Boolean(d.is_open),
    next_open: d.next_open ?? null,
    next_close: d.next_close ?? null,
  };
}
