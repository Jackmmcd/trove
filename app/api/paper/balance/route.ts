import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: account, error } = await db
      .from('paper_accounts')
      .select('cash')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !account) return NextResponse.json({ success: false, error: 'No paper account' }, { status: 404 });

    // Compute positions value
    const { data: positions } = await db
      .from('paper_positions')
      .select('symbol, quantity, avg_open_price')
      .eq('user_id', user.id);

    const positionsValue = (positions ?? []).reduce(
      (sum, p) => sum + p.quantity * p.avg_open_price, 0
    );

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
