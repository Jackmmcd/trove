import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/paginate';

export const dynamic = 'force-dynamic';

/**
 * Every ticker any tracked fund has ever reported.
 *
 * The chat UI uses this to decide which symbols in Analyst's replies become
 * clickable. That makes it a hallucination guard as well as a convenience: a
 * symbol Analyst invented is not in this set, so it renders as plain text and the
 * reader gets no false affordance suggesting it is real.
 *
 * Unauthenticated: the public Analyst on the landing page needs the same guard,
 * and a list of symbols already disclosed in public SEC filings is not private.
 */
export async function GET() {
  const rows = await fetchAllRows<{ ticker: string }>((from, to) =>
    db.from('holdings').select('ticker').order('id').range(from, to)
  );

  // Only plain equity symbols are clickable. Unresolved CUSIP fallbacks and
  // preferred/bond descriptors have no stock page to open.
  const equity = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;
  const tickers = [...new Set(rows.map(r => r.ticker))].filter(t => equity.test(t)).sort();

  return NextResponse.json({ tickers }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
