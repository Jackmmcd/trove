import { NextResponse } from 'next/server';
import axios from 'axios';
import { getValidAccessToken } from '@/lib/auth/session';
import { getTastytradeClient } from '@/lib/tastytrade/client';

interface DayValue {
  date: string;   // YYYY-MM-DD
  value: number;
}

async function fetchDailyCloses(symbol: string, quantity: number): Promise<DayValue[]> {
  try {
    const res = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      {
        params: { interval: '1d', range: '3mo' },
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        timeout: 8000,
      }
    );
    const result = res.data?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];

    return timestamps
      .map((ts, i) => {
        const close = closes[i];
        if (!close || close <= 0) return null;
        const date = new Date(ts * 1000).toISOString().slice(0, 10);
        return { date, value: close * quantity };
      })
      .filter((d): d is DayValue => d !== null);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const client = getTastytradeClient(accessToken);
    const accountNumber = await client.getAccountNumber();
    const posRes = await client.client.get(`/accounts/${accountNumber}/positions`);
    const allPositions: any[] = posRes.data?.data?.items ?? [];

    const equities = allPositions.filter((p: any) => {
      const t = p['instrument-type'] || p.instrumentType || '';
      return t === 'Equity' || t === 'Stock';
    });

    if (equities.length === 0) return NextResponse.json({ success: true, data: [] });

    // Fetch history for all positions in parallel
    const histories = await Promise.all(
      equities.map((p: any) => {
        const qty = parseFloat(p.quantity || '0');
        return fetchDailyCloses(p.symbol, qty);
      })
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
