import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';

async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbols[0]}?interval=1d&range=1d`;
    const prices: Record<string, number> = {};
    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 60 } }
          );
          const json = await res.json();
          const meta = json?.chart?.result?.[0]?.meta;
          prices[sym] = meta?.regularMarketPrice ?? meta?.previousClose ?? 0;
        } catch { prices[sym] = 0; }
      })
    );
    return prices;
  } catch { return {}; }
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
