import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { directoryEntry } from '@/lib/funds/directory';
import { ensureFund, getFundProfile, FundNotFoundError } from '@/lib/services/fund-profile';

export const dynamic = 'force-dynamic';
// PUT refreshes every followed fund; a never-opened large filer loads cold.
export const maxDuration = 300;

/**
 * The funds a user follows. Funds are shared rows (user_id IS NULL); following
 * is a row in user_watched_funds. Unfollowing removes only that row — the
 * fund, its holdings and its thesis belong to everyone.
 */

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function watchedFunds(userId: string) {
  const { data: watched, error } = await db
    .from('user_watched_funds').select('fund_id, created_at').eq('user_id', userId);
  if (error) throw new Error(error.message);
  const ids = (watched ?? []).map(w => w.fund_id);
  if (!ids.length) return [];
  const { data: funds, error: fe } = await db
    .from('funds').select('id, cik, name, enabled, entity_type').in('id', ids).order('name');
  if (fe) throw new Error(fe.message);
  return funds ?? [];
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const funds = await watchedFunds(user.id);

    const fundsWithHoldings = await Promise.all(
      funds.map(async fund => {
        const { data: latest } = await db
          .from('holdings').select('quarter')
          .eq('fund_id', fund.id).is('user_id', null)
          .order('quarter', { ascending: false }).limit(1).maybeSingle();

        // The list shows a preview, not the book — the fund page has the rest.
        // Capped so following Citadel doesn't ship 7,000 rows to this page.
        const holdings = latest
          ? (await db.from('holdings').select('ticker, shares, value, weight, issuer_name')
              .eq('fund_id', fund.id).is('user_id', null).eq('quarter', latest.quarter)
              .order('weight', { ascending: false }).limit(50)).data ?? []
          : [];
        const { count } = latest
          ? await db.from('holdings').select('*', { count: 'exact', head: true })
              .eq('fund_id', fund.id).is('user_id', null).eq('quarter', latest.quarter)
          : { count: 0 };

        const { data: thesis } = await db.from('fund_theses').select('thesis').eq('fund_id', fund.id).maybeSingle();
        return {
          ...fund,
          name: directoryEntry(fund.cik)?.name ?? fund.name,
          quarter: latest?.quarter ?? null,
          holdings_total: count ?? holdings.length,
          holdings,
          thesis: thesis?.thesis ?? null,
        };
      })
    );

    return NextResponse.json({ success: true, data: fundsWithHoldings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** Follow a fund by CIK. Works for any 13F filer; directory funds need no EDGAR check. */
export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { cik } = await request.json();
    if (!cik || !/^\d{1,10}$/.test(String(cik).trim())) {
      return NextResponse.json({ success: false, error: 'A CIK is up to 10 digits.' }, { status: 400 });
    }

    const fund = await ensureFund(String(cik).trim());
    const { error } = await db.from('user_watched_funds')
      .upsert({ user_id: user.id, fund_id: fund.id }, { onConflict: 'user_id,fund_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, data: { ...fund, name: directoryEntry(fund.cik)?.name ?? fund.name } });
  } catch (error: any) {
    const status = error instanceof FundNotFoundError ? 404 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

/**
 * Refresh every followed fund: loads any that have never been fetched and
 * reloads any with a newer filing on EDGAR. Funds already current are a cache read.
 */
export async function PUT() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const results = [];
    for (const fund of await watchedFunds(user.id)) {
      try {
        const p = await getFundProfile(fund.cik);
        results.push({ cik: fund.cik, name: p.fund.name, success: true, holdingsCount: p.stats.positions, quarter: p.quarter });
      } catch (e: any) {
        results.push({ cik: fund.cik, name: fund.name, success: false, holdingsCount: 0, error: e.message });
      }
    }
    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
