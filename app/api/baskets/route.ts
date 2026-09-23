import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function toBasket(r: any) {
  return {
    id: r.id,
    fundId: r.fund_id,
    fundName: r.fund_name,
    budget: r.budget,
    placedAt: r.placed_at,
    orders: r.orders,
    isPaper: r.is_paper ?? false,
    soldAt: r.sold_at ?? null,
    saleOrders: r.sale_orders ?? [],
  };
}

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { fundId, fundName, budget, orders, isPaper } = await request.json();
    if (!fundId || !fundName || !budget || !orders) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }
    const { data, error } = await db.from('basket_purchases').insert({
      fund_id: fundId,
      fund_name: fundName,
      budget,
      orders,
      user_id: user.id,
      is_paper: isPaper ?? false,
    }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: toBasket(data) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * Close a basket: record the sells that were placed and stamp it sold.
 *
 * The orders themselves go through the broker from the client, exactly as the
 * buy side does, so this only records the outcome. It is scoped to the calling
 * user's own row — the admin client bypasses RLS, so the ownership check is the
 * only thing standing between a guessed id and someone else's basket.
 */
export async function PATCH(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { id, saleOrders } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: 'Missing basket id' }, { status: 400 });

    const { data: existing, error: readErr } = await db
      .from('basket_purchases')
      .select('id, user_id, sold_at')
      .eq('id', id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Basket not found' }, { status: 404 });
    }
    if (existing.sold_at) {
      return NextResponse.json({ success: false, error: 'Basket is already closed' }, { status: 409 });
    }

    const { data, error } = await db
      .from('basket_purchases')
      .update({ sold_at: new Date().toISOString(), sale_orders: saleOrders ?? [] })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: toBasket(data) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await db
      .from('basket_purchases')
      .select('*')
      .eq('user_id', user.id)
      .order('placed_at', { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: (data ?? []).map(toBasket) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
