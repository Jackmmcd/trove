import { NextResponse } from 'next/server';
import { getAggs } from '@/lib/polygon/client';

export const dynamic = 'force-dynamic';

function dateStr(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toDaily(c: { t: number; o: number; h: number; l: number; c: number }) {
  const d = new Date(c.t);
  const time = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { time, open: c.o, high: c.h, low: c.l, close: c.c };
}

function toIntraday(c: { t: number; o: number; h: number; l: number; c: number }) {
  return { time: Math.floor(c.t / 1000), open: c.o, high: c.h, low: c.l, close: c.c };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();
  const { searchParams } = new URL(_req.url);
  const range = searchParams.get('range') ?? '1d';

  let candles: { time: string | number; open: number; high: number; low: number; close: number }[] = [];

  switch (range) {
    case '1d': {
      // 5-minute candles for today; fall back to the previous trading day if market hasn't opened yet
      let raw = await getAggs(sym, today(), today(), 5, 'minute');
      if (raw.length === 0) raw = await getAggs(sym, dateStr(4), today(), 5, 'minute');
      // Keep only the most recent trading session
      if (raw.length > 0) {
        const lastDate = new Date(raw[raw.length - 1].t).toISOString().slice(0, 10);
        raw = raw.filter(c => new Date(c.t).toISOString().slice(0, 10) === lastDate);
      }
      candles = raw.map(toIntraday);
      break;
    }

    case '5d': {
      // 30-minute candles over the last 7 calendar days (covers 5 trading days)
      const raw = await getAggs(sym, dateStr(7), today(), 30, 'minute');
      candles = raw.map(toIntraday);
      break;
    }

    case '1mo': {
      const raw = await getAggs(sym, dateStr(31), today(), 1, 'day');
      candles = raw.map(toDaily);
      break;
    }

    case '3mo': {
      const raw = await getAggs(sym, dateStr(92), today(), 1, 'day');
      candles = raw.map(toDaily);
      break;
    }

    case 'ytd': {
      const ytdStart = `${new Date().getFullYear()}-01-01`;
      const raw = await getAggs(sym, ytdStart, today(), 1, 'day');
      candles = raw.map(toDaily);
      break;
    }

    case '1y': {
      const raw = await getAggs(sym, dateStr(365), today(), 1, 'day');
      candles = raw.map(toDaily);
      break;
    }

    case '2y': {
      const raw = await getAggs(sym, dateStr(730), today(), 1, 'day');
      candles = raw.map(toDaily);
      break;
    }

    case '5y': {
      const raw = await getAggs(sym, dateStr(1825), today(), 1, 'week');
      candles = raw.map(toDaily);
      break;
    }

    default: {
      const raw = await getAggs(sym, dateStr(92), today(), 1, 'day');
      candles = raw.map(toDaily);
    }
  }

  return NextResponse.json({ success: true, data: candles });
}
