import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { sessionCloses } from '@/lib/market/close';

/**
 * Settled closes, so a paper position is valued the same way a live one is:
 * the last completed session during the week, Friday's all weekend.
 */
async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  const closes = await sessionCloses(symbols);
  return Object.fromEntries(Object.entries(closes).map(([s, c]) => [s, c.close]));
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: rows } = await db
      .from('paper_positions')
      .select('symbol, quantity, avg_open_price')
      .eq('user_id', user.id)
      .gt('quantity', 0);

    if (!rows?.length) return NextResponse.json({ success: true, data: [] });

    const symbols = rows.map(r => r.symbol);
    const prices = await fetchPrices(symbols);

    const positions = rows.map(p => {
      const currentPrice = prices[p.symbol] || p.avg_open_price;
      const totalValue = currentPrice * p.quantity;
      const gainLoss = (currentPrice - p.avg_open_price) * p.quantity;
      return {
        symbol: p.symbol,
        quantity: p.quantity,
        avgOpenPrice: p.avg_open_price,
        currentPrice,
        totalValue,
        gainLoss,
        dailyPnL: null,
        weeklyPnL: null,
      };
    });

    return NextResponse.json({ success: true, data: positions });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
