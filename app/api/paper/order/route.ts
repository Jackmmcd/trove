import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';

async function fetchPrice(symbol: string): Promise<number> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  return meta?.regularMarketPrice ?? meta?.previousClose ?? 0;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { symbol, quantity, action } = await request.json();
    if (!symbol || !quantity || !action) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }

    const qty = parseFloat(quantity);
    if (qty <= 0) return NextResponse.json({ success: false, error: 'Invalid quantity' }, { status: 400 });

    // Get live price
    const price = await fetchPrice(symbol.toUpperCase());
    if (!price) return NextResponse.json({ success: false, error: 'Could not fetch price' }, { status: 400 });

    const totalCost = qty * price;

    // Load account
    const { data: account } = await db
      .from('paper_accounts')
      .select('cash')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!account) return NextResponse.json({ success: false, error: 'No paper account' }, { status: 404 });

    if (action === 'buy') {
      if (account.cash < totalCost) {
        return NextResponse.json({
          success: false,
          error: `INSUFFICIENT FUNDS — need $${totalCost.toFixed(2)}, have $${account.cash.toFixed(2)}`,
        }, { status: 400 });
      }

      // Upsert position with new avg price
      const { data: existing } = await db
        .from('paper_positions')
        .select('quantity, avg_open_price')
        .eq('user_id', user.id)
        .eq('symbol', symbol.toUpperCase())
        .maybeSingle();

      const prevQty = existing?.quantity ?? 0;
      const prevAvg = existing?.avg_open_price ?? 0;
      const newQty = prevQty + qty;
      const newAvg = (prevQty * prevAvg + qty * price) / newQty;

      await db.from('paper_positions').upsert({
        user_id: user.id,
        symbol: symbol.toUpperCase(),
        quantity: newQty,
        avg_open_price: newAvg,
      }, { onConflict: 'user_id,symbol' });

      await db.from('paper_accounts')
        .update({ cash: account.cash - totalCost })
        .eq('user_id', user.id);

    } else if (action === 'sell') {
      const { data: existing } = await db
        .from('paper_positions')
        .select('quantity, avg_open_price')
        .eq('user_id', user.id)
        .eq('symbol', symbol.toUpperCase())
        .maybeSingle();

      const heldQty = existing?.quantity ?? 0;
      if (qty > heldQty) {
        return NextResponse.json({
          success: false,
          error: `INSUFFICIENT SHARES — have ${heldQty}, selling ${qty}`,
        }, { status: 400 });
      }

      const newQty = heldQty - qty;
      if (newQty < 0.0001) {
        await db.from('paper_positions')
          .delete()
          .eq('user_id', user.id)
          .eq('symbol', symbol.toUpperCase());
      } else {
        await db.from('paper_positions')
          .update({ quantity: newQty })
          .eq('user_id', user.id)
          .eq('symbol', symbol.toUpperCase());
      }

      await db.from('paper_accounts')
        .update({ cash: account.cash + totalCost })
        .eq('user_id', user.id);
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        action,
        quantity: qty,
        price,
        total: totalCost,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
