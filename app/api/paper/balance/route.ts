import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import axios from 'axios';

/** Matches scripts/init-paper-accounts.js so provisioning is consistent. */
const STARTING_CASH = 10000;

async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  const prices: Record<string, number> = {};
  await Promise.allSettled(
    symbols.map(async sym => {
      try {
        const res = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`,
          { params: { interval: '1d', range: '1d' }, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000 }
        );
        const meta = res.data?.chart?.result?.[0]?.meta ?? {};
        const p = meta.regularMarketPrice ?? meta.previousClose ?? 0;
        if (p > 0) prices[sym] = p;
      } catch { /* use cost basis fallback */ }
    })
  );
  return prices;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    let { data: account } = await db
      .from('paper_accounts')
      .select('cash')
      .eq('user_id', user.id)
      .maybeSingle();

    // Provision on first visit. A 404 here used to send the dashboard down its
    // Tastytrade fallback, which authenticates with shared env credentials — so
    // every user without a paper account was shown the same real brokerage
    // account. Never let a missing row become someone else's data.
    if (!account) {
      const { data: created, error: createError } = await db
        .from('paper_accounts')
        .upsert({ user_id: user.id, cash: STARTING_CASH }, { onConflict: 'user_id' })
        .select('cash')
        .single();

      if (createError || !created) {
        return NextResponse.json(
          { success: false, error: 'Could not open a paper account' },
          { status: 500 }
        );
      }
      account = created;
    }

    const { data: positions } = await db
      .from('paper_positions')
      .select('symbol, quantity, avg_open_price')
      .eq('user_id', user.id)
      .gt('quantity', 0);

    const posRows = positions ?? [];
    const liveprices = await fetchPrices(posRows.map(p => p.symbol));

    // Use live market price; fall back to cost basis if price unavailable
    const positionsValue = posRows.reduce((sum, p) => {
      const price = liveprices[p.symbol] ?? p.avg_open_price;
      return sum + p.quantity * price;
    }, 0);

    const totalEquity = account.cash + positionsValue;

    return NextResponse.json({
      success: true,
      data: {
        netLiquidity: totalEquity,
        totalEquity,
        cashAvailableForTrading: account.cash,
        buyingPower: account.cash,
        isPaper: true,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
