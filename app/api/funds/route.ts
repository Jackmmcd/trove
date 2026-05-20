import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { syncAllFunds } from '@/lib/services/fund-sync';

export const dynamic = 'force-dynamic';

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: funds, error } = await db
      .from('funds')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    if (error) throw new Error(error.message);

    const fundsWithHoldings = await Promise.all(
      (funds ?? []).map(async (fund: any) => {
        const { data: latest } = await db
          .from('holdings')
          .select('quarter')
          .eq('fund_id', fund.id)
          .eq('user_id', user.id)
          .order('quarter', { ascending: false })
          .limit(1)
          .maybeSingle();

        const holdings = latest
          ? (await db.from('holdings').select('*').eq('fund_id', fund.id).eq('user_id', user.id).eq('quarter', latest.quarter).order('weight', { ascending: false })).data ?? []
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
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { cik, name, enabled = true } = await request.json();
    if (!cik || !name) {
      return NextResponse.json({ success: false, error: 'CIK and name are required' }, { status: 400 });
    }
    const paddedCik = cik.padStart(10, '0');

    // Check for duplicate before hitting the DB constraint
    const { data: existing } = await db.from('funds').select('id').eq('cik', paddedCik).eq('user_id', user.id).maybeSingle();
    if (existing) {
      return NextResponse.json({ success: false, error: 'You are already following this fund' }, { status: 409 });
    }

    const { data: fund, error } = await db.from('funds').insert({
      cik: paddedCik,
      name,
      enabled,
      user_id: user.id,
    }).select().single();
    if (error) {
      if (error.message.includes('unique constraint') || error.message.includes('duplicate key')) {
        return NextResponse.json({ success: false, error: 'You are already following this fund' }, { status: 409 });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ success: true, data: fund });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const results = await syncAllFunds(user.id);
    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
