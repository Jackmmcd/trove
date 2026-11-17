import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { isLedger } from '@/lib/baskets/ledger';

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
    if (!isLedger(orders)) {
      return NextResponse.json({ success: false, error: 'Malformed orders' }, { status: 400 });
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

/** The caller's own open basket, or a response explaining why not. */
async function ownOpenBasket(userId: string, id: unknown) {
  if (!id) return { error: NextResponse.json({ success: false, error: 'Missing basket id' }, { status: 400 }) };
  const { data, error } = await db
    .from('basket_purchases').select('id, user_id, sold_at, orders').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) {
    return { error: NextResponse.json({ success: false, error: 'Basket not found' }, { status: 404 }) };
  }
  if (data.sold_at) {
    return { error: NextResponse.json({ success: false, error: 'Basket is already closed' }, { status: 409 }) };
  }
  return { basket: data };
}

/**
 * Record progress while a basket's orders are being placed. The basket is
 * created with every leg queued before the first order goes out, and each
 * settled leg is written back here, so an interrupted purchase still leaves a
 * basket owning exactly what filled. See lib/baskets/ledger.ts.
 */
export async function PUT(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { id, orders } = await request.json();
    if (!isLedger(orders)) {
      return NextResponse.json({ success: false, error: 'Malformed orders' }, { status: 400 });
    }
    const own = await ownOpenBasket(user.id, id);
    if (own.error) return own.error;

    const { data, error } = await db
      .from('basket_purchases').update({ orders }).eq('id', id).eq('user_id', user.id).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: toBasket(data) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** Drop a basket none of whose orders filled. One that owns shares is closed by selling, never deleted. */
export async function DELETE(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { id } = await request.json();
    const own = await ownOpenBasket(user.id, id);
    if (own.error) return own.error;
    if ((own.basket.orders ?? []).some((o: { status: string }) => o.status === 'done')) {
      return NextResponse.json({ success: false, error: 'Basket holds filled orders' }, { status: 409 });
    }

    const { error } = await db.from('basket_purchases').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
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
