import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { runTool } from '@/lib/advisor/tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Side-panel payload for one ticker: the same synopsis and live fundamentals Ed
 * gets from get_stock_analysis, plus which tracked funds hold it — so clicking a
 * symbol in a reply answers both "what is this" and "who owns it" at once.
 */
export async function GET(request: Request) {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const ticker = new URL(request.url).searchParams.get('ticker')?.toUpperCase().trim();
  if (!ticker) return NextResponse.json({ error: 'No ticker' }, { status: 400 });

  const [analysis, holders] = await Promise.all([
    runTool('get_stock_analysis', { ticker }, user.id),
    runTool('get_ticker_holders', { ticker }, user.id),
  ]);

  // The user's own position, if any — the first thing you want to know.
  const { data: position } = await db
    .from('paper_positions')
    .select('quantity, avg_open_price')
    .eq('user_id', user.id)
    .eq('symbol', ticker)
    .maybeSingle();

  return NextResponse.json({ ticker, analysis, holders, position: position ?? null });
}
