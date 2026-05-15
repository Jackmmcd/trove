import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase/admin';

function toBasket(r: any) {
  return {
    id: r.id,
    fundId: r.fund_id,
    fundName: r.fund_name,
    budget: r.budget,
    placedAt: r.placed_at,
    orders: r.orders,
  };
}

export async function POST(request: Request) {
  try {
    const { fundId, fundName, budget, orders } = await request.json();
    if (!fundId || !fundName || !budget || !orders) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }
    const { data, error } = await db.from('basket_purchases').insert({
      fund_id: fundId,
      fund_name: fundName,
      budget,
      orders,
    }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: toBasket(data) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await db.from('basket_purchases').select('*').order('placed_at', { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: (data ?? []).map(toBasket) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
