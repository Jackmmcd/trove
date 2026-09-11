import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { runTool } from '@/lib/advisor/tools';
import { ACCESS_COOKIE, verifyAccessToken } from '@/lib/advisor/access';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Payload for one ticker: the synopsis and live fundamentals the Analyst gets
 * from get_stock_analysis, plus which tracked funds hold it — so clicking a
 * symbol answers both "what is this" and "who owns it" at once.
 *
 * Two ways in. A signed-in user gets everything including their own position.
 * A landing-page visitor who cleared the email gate gets the company and the
 * holders but no position, because they do not have one — without this, every
 * ticker link in the public Analyst led to a login wall, which defeats the
 * point of linking them.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  const demoEmail = user ? null : verifyAccessToken(cookieStore.get(ACCESS_COOKIE)?.value);

  if (!user && !demoEmail) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const ticker = new URL(request.url).searchParams.get('ticker')?.toUpperCase().trim();
  if (!ticker) return NextResponse.json({ error: 'No ticker' }, { status: 400 });

  const [analysis, holders] = await Promise.all([
    runTool('get_stock_analysis', { ticker }, user?.id ?? '', user?.email),
    runTool('get_ticker_holders', { ticker }, user?.id ?? '', user?.email),
  ]);

  // The user's own position, if any — the first thing you want to know.
  // Demo visitors have no account, so there is nothing to look up.
  const { data: position } = user
    ? await db
        .from('paper_positions')
        .select('quantity, avg_open_price')
        .eq('user_id', user.id)
        .eq('symbol', ticker)
        .maybeSingle()
    : { data: null };

  return NextResponse.json({ ticker, analysis, holders, position: position ?? null });
}
