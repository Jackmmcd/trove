import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { normalizeCik } from '@/lib/funds/directory';
import { getFundProfile } from '@/lib/services/fund-profile';

type Params = { params: Promise<{ cik: string }> };

export const maxDuration = 300;

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Unfollow. Removes only this user's watch row; the shared fund and its data stay. */
export async function DELETE(_req: Request, { params }: Params) {
  const { cik } = await params;
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data: fund } = await db.from('funds').select('id').eq('cik', normalizeCik(cik)).is('user_id', null).maybeSingle();
    if (!fund) return NextResponse.json({ success: false, error: 'Fund not found' }, { status: 404 });

    const { error } = await db.from('user_watched_funds').delete().eq('user_id', user.id).eq('fund_id', fund.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * Refresh one fund: loads it if it has never been fetched, reloads it if EDGAR
 * has a newer filing, otherwise returns what's cached.
 */
export async function PUT(_req: Request, { params }: Params) {
  const { cik } = await params;
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const p = await getFundProfile(cik);
    return NextResponse.json({
      success: true,
      data: { cik: p.fund.cik, name: p.fund.name, success: true, holdingsCount: p.stats.positions, quarter: p.quarter },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
