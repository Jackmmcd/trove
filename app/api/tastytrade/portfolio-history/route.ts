import { NextResponse } from 'next/server';
import axios from 'axios';
import { getValidAccessToken } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { isBrokerOwner } from '@/lib/broker/owner';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { completedSessions } from '@/lib/market/close';

interface DayValue {
  date: string;   // YYYY-MM-DD
  value: number;
}

async function fetchDailyCloses(symbol: string, quantity: number, range: string): Promise<DayValue[]> {
  try {
    const res = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      {
        params: { interval: '1d', range },
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        timeout: 8000,
      }
    );
    const result = res.data?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];

    const daily = timestamps
      .map((ts, i) => {
        const close = closes[i];
        if (!close || close <= 0) return null;
        // Eastern, so a candle lands on the session it belongs to rather than
        // slipping a day either side of UTC midnight.
        const date = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date(ts * 1000));
        return { date, close };
      })
      .filter((d): d is { date: string; close: number } => d !== null);

    // Drop today's part-formed candle so the final point of the chart is the
    // same settled close the headline figure uses.
    return completedSessions(daily).map(d => ({ date: d.date, value: d.close * quantity }));
  } catch {
    return [];
  }
}

/** Ranges the chart's timeframe pills can ask for. */
const RANGES = new Set(['1mo', '3mo', '6mo', '1y']);

/**
 * History for whichever account is actually this user's — the brokerage if
 * they own the credentials, otherwise their own paper account. It used to be
 * broker-only, which left every paper user staring at an empty chart that
 * could never fill in.
 *
 * Either way it reconstructs today's holdings backwards over past closes, so
 * it is the shape of what you hold now, not a record of what you held then.
 */
export async function GET(request: Request) {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });

  const requested = new URL(request.url).searchParams.get('range') ?? '1y';
  const range = RANGES.has(requested) ? requested : '1y';

  try {
    let holdings: { symbol: string; quantity: number }[] = [];

    if (isBrokerOwner(user.email)) {
      const accessToken = await getValidAccessToken();
      if (!accessToken) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

      const client = getTastytradeClient(accessToken);
      const allPositions = await client.getPositions();
      holdings = allPositions
        .filter((p: any) => {
          const t = p['instrument-type'] || p.instrumentType || '';
          return t === 'Equity' || t === 'Stock';
        })
        .map((p: any) => ({ symbol: p.symbol, quantity: parseFloat(p.quantity || '0') }));
    } else {
      const { data: rows } = await db
        .from('paper_positions')
        .select('symbol, quantity')
        .eq('user_id', user.id)
        .gt('quantity', 0);
      holdings = (rows ?? []).map(r => ({ symbol: r.symbol as string, quantity: Number(r.quantity) }));
    }

    const equities = holdings.filter(h => h.quantity > 0);
    if (equities.length === 0) return NextResponse.json({ success: true, data: [] });

    const histories = await Promise.all(
      equities.map(h => fetchDailyCloses(h.symbol, h.quantity, range))
    );

    // Merge: sum values by date
    const dateMap = new Map<string, number>();
    for (const days of histories) {
      for (const { date, value } of days) {
        dateMap.set(date, (dateMap.get(date) ?? 0) + value);
      }
    }

    // Only keep dates where ALL positions have data (i.e. full portfolio represented)
    // Use a minimum threshold: at least 80% of positions must have data for that date
    const minPositions = Math.ceil(equities.length * 0.8);
    const dateCounts = new Map<string, number>();
    for (const days of histories) {
      for (const { date } of days) {
        dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
      }
    }

    const result: DayValue[] = Array.from(dateMap.entries())
      .filter(([date]) => (dateCounts.get(date) ?? 0) >= minPositions)
      .map(([date, value]) => ({ date, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
