import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { db } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/paginate';

export const dynamic = 'force-dynamic';

/**
 * Every ticker any tracked fund has ever reported.
 *
 * The chat UI uses this to decide which symbols in Ed's replies become
 * clickable. That makes it a hallucination guard as well as a convenience: a
 * symbol Ed invented is not in this set, so it renders as plain text and the
 * reader gets no false affordance suggesting it is real.
 */
export async function GET() {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const rows = await fetchAllRows<{ ticker: string }>((from, to) =>
    db.from('holdings').select('ticker').order('id').range(from, to)
  );

  // Only plain equity symbols are clickable. Unresolved CUSIP fallbacks and
  // preferred/bond descriptors have no stock page to open.
  const equity = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;
  const tickers = [...new Set(rows.map(r => r.ticker))].filter(t => equity.test(t)).sort();

  return NextResponse.json({ tickers }, {
    headers: { 'Cache-Control': 'private, max-age=300' },
  });
}
