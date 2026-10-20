import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { ACCESS_COOKIE, verifyAccessToken } from '@/lib/advisor/access';
import { getFundProfile, FundNotFoundError } from '@/lib/services/fund-profile';

export const dynamic = 'force-dynamic';
// A cold load downloads the filing and resolves its CUSIPs; warm reads return
// in well under a second. The ticker budget in fund-profile.ts keeps a cold
// load of the largest filers inside this.
export const maxDuration = 300;

/**
 * One fund's profile and portfolio. Served from the database once loaded;
 * the first request for a fund fetches it from EDGAR and caches it.
 *
 * Same two ways in as /api/advisor/stock: signed in, or a landing-page visitor
 * who cleared the email gate — fund pages are linked from the public Analyst.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ cik: string }> }) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  const demoEmail = user ? null : verifyAccessToken(cookieStore.get(ACCESS_COOKIE)?.value);
  if (!user && !demoEmail) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { cik } = await params;
  if (!/^\d{1,10}$/.test(cik)) {
    return NextResponse.json({ error: 'A CIK is up to 10 digits.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await getFundProfile(cik));
  } catch (e: any) {
    const status = e instanceof FundNotFoundError ? 404 : 502;
    return NextResponse.json({ error: e.message || 'Could not load this fund.' }, { status });
  }
}
