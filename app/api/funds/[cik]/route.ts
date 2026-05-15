import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase/admin';
import { syncFund } from '@/lib/services/fund-sync';

type Params = { params: Promise<{ cik: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { cik } = await params;
  try {
    const { data: fund, error } = await db.from('funds').select('id').eq('cik', cik).maybeSingle();
    if (error) throw new Error(error.message);
    if (!fund) return NextResponse.json({ success: false, error: 'Fund not found' }, { status: 404 });

    await db.from('holdings').delete().eq('fund_id', fund.id);
    await db.from('funds').delete().eq('cik', cik);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { cik } = await params;
  try {
    const { enabled, name } = await req.json();
    const updates: Record<string, unknown> = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();

    const { data: fund, error } = await db.from('funds').update(updates).eq('cik', cik).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: fund });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(_req: Request, { params }: Params) {
  const { cik } = await params;
  try {
    const result = await syncFund(cik);
    return NextResponse.json({ success: result.success, data: result, error: result.error });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
