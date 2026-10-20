import axios from 'axios';

/**
 * Settled closing prices.
 *
 * The portfolio was valued from live intraday marks, so the same holding showed
 * a different number every refresh and the weekend showed whatever the last
 * tick happened to be. Valuation here uses the last *completed* session's
 * close instead: during the week that is the most recent daily close, and all
 * weekend it stays Friday's.
 *
 * Holidays need no special handling — the exchange publishes no candle for a
 * day it was shut, so the previous session is naturally the last one found.
 *
 * This is for display and valuation only. An order ticket still quotes live,
 * because telling someone they are about to pay Friday's price on a Tuesday
 * would be wrong in the direction that costs money.
 */

export interface SessionClose {
  /** Close of the last completed session. */
  close: number;
  /** Close of the session before it, for a day-change figure. */
  prevClose: number;
  /** Which session `close` belongs to, as YYYY-MM-DD. */
  closeDate: string;
}

/** Wall-clock parts in US/Eastern, which is what the exchange calendar runs on. */
function easternNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
      .formatToParts(now)
      .map(p => [p.type, p.value]),
  ) as Record<string, string>;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    // Intl gives "24" rather than "00" for midnight in some runtimes.
    hour: Number(parts.hour) % 24,
  };
}

/**
 * Has the regular session for the current Eastern date already closed?
 * The bell is 16:00 ET; before that, today's daily candle is still moving and
 * must not be treated as a close.
 */
export function regularSessionIsOver(now = new Date()): boolean {
  return easternNow(now).hour >= 16;
}

/** Daily candles for one symbol, oldest first, invalid points dropped. */
async function dailyCandles(symbol: string, range: string): Promise<{ date: string; close: number }[]> {
  const res = await axios.get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
    {
      params: { interval: '1d', range },
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      timeout: 8000,
    },
  );
  const result = res.data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .map((ts, i) => {
      const close = closes[i];
      if (!close || close <= 0) return null;
      // Yahoo stamps a daily candle at the session open in exchange time;
      // reading the date back in Eastern keeps it on the right session.
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(ts * 1000));
      return { date, close };
    })
    .filter((d): d is { date: string; close: number } => d !== null);
}

/**
 * Trim the in-progress candle. Yahoo includes today while the session is still
 * running, with `close` set to the current price — exactly the live number this
 * is meant to avoid.
 */
export function completedSessions(
  candles: { date: string; close: number }[],
  now = new Date(),
): { date: string; close: number }[] {
  if (candles.length === 0) return candles;
  const { date: today } = easternNow(now);
  const last = candles[candles.length - 1];
  if (last.date === today && !regularSessionIsOver(now)) return candles.slice(0, -1);
  return candles;
}

/** Last completed close per symbol. Symbols with no usable history are omitted. */
export async function sessionCloses(symbols: string[]): Promise<Record<string, SessionClose>> {
  const out: Record<string, SessionClose> = {};
  const concurrency = 20;

  for (let i = 0; i < symbols.length; i += concurrency) {
    const chunk = symbols.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map(async symbol => {
        // A fortnight covers a long holiday weekend with room to spare.
        const sessions = completedSessions(await dailyCandles(symbol, '1mo'));
        return { symbol, sessions };
      }),
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { symbol, sessions } = r.value;
      const last = sessions[sessions.length - 1];
      if (!last) continue;
      out[symbol] = {
        close: last.close,
        prevClose: sessions[sessions.length - 2]?.close ?? last.close,
        closeDate: last.date,
      };
    }
  }

  return out;
}
