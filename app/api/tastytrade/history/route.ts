import { NextResponse } from 'next/server';
import { getSnapshots, getAggs } from '@/lib/polygon/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') ?? '';
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ success: false, error: 'No symbols' }, { status: 400 });

  const todayStr = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 20);
  const from = fromDate.toISOString().slice(0, 10);

  // Snapshot gives prevDay.c for ALL tickers in one call (requires Starter+)
  const snapshots = await getSnapshots(symbols);

  // Week P&L: sequential getAggs per symbol
  const data: Record<string, { prev1Close: number | null; prev5Close: number | null }> = {};
  for (const symbol of symbols) {
    const snap = snapshots[symbol];
    let prev5Close: number | null = null;
    try {
      const candles = await getAggs(symbol, from, todayStr, 1, 'day');
      const completed = candles.filter(c => {
        const d = new Date(c.t).toISOString().slice(0, 10);
        return d < todayStr && c.c > 0;
      });
      prev5Close = completed.length >= 5 ? completed[completed.length - 5].c : (completed[0]?.c ?? null);
    } catch { /* leave null */ }

    data[symbol] = {
      prev1Close: snap?.prevClose ?? null,
      prev5Close,
    };
  }

  return NextResponse.json({ success: true, data });
}
