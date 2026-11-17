import { NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/broker/guard';
import { dailyCloses } from '@/lib/market/candles';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await requireSignedIn();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') ?? '';
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ success: false, error: 'No symbols' }, { status: 400 });

  // Closes from sessions before today, in Eastern time: the last is the
  // previous close a day's change is measured from, the fifth-last the week's.
  // These used to come from one Polygon call per symbol, in sequence, against
  // a ~5-a-minute limit, so a basket's worth of symbols mostly failed slowly.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const data: Record<string, { prev1Close: number | null; prev5Close: number | null }> = {};
  await Promise.all(symbols.map(async symbol => {
    let prior: { close: number }[] = [];
    try { prior = (await dailyCloses(symbol, '1mo')).filter(c => c.date < today); } catch { /* leave null */ }
    data[symbol] = {
      prev1Close: prior[prior.length - 1]?.close ?? null,
      prev5Close: prior.length >= 5 ? prior[prior.length - 5].close : (prior[0]?.close ?? null),
    };
  }));

  return NextResponse.json({ success: true, data });
}
