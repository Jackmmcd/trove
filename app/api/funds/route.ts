import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase/admin';
import { syncAllFunds } from '@/lib/services/fund-sync';

export async function GET() {
  try {
    const { data: funds, error } = await db.from('funds').select('*').order('name');
    if (error) throw new Error(error.message);

    const fundsWithHoldings = await Promise.all(
      (funds ?? []).map(async (fund: any) => {
        const { data: latest } = await db
          .from('holdings')
          .select('quarter')
          .eq('fund_id', fund.id)
          .order('quarter', { ascending: false })
          .limit(1)
          .maybeSingle();

        const holdings = latest
          ? (await db.from('holdings').select('*').eq('fund_id', fund.id).eq('quarter', latest.quarter).order('weight', { ascending: false })).data ?? []
          : [];

        const { data: thesis } = await db.from('fund_theses').select('thesis').eq('fund_id', fund.id).maybeSingle();
        return { ...fund, holdings, thesis: thesis?.thesis ?? null };
      })
    );

    return NextResponse.json({ success: true, data: fundsWithHoldings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { cik, name, enabled = true } = await request.json();
    if (!cik || !name) {
      return NextResponse.json({ success: false, error: 'CIK and name are required' }, { status: 400 });
    }
    const { data: fund, error } = await db.from('funds').insert({
      cik: cik.padStart(10, '0'),
      name,
      enabled,
    }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: fund });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT() {
  try {
    const results = await syncAllFunds();
    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
