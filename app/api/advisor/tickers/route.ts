import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/paginate';

export const dynamic = 'force-dynamic';

/**
 * Every ticker any tracked fund has reported, plus the company names those
 * tickers go by.
 *
 * The chat UI uses this to decide what in a reply becomes clickable, which
 * makes it a hallucination guard as well as a convenience: a symbol the Analyst
 * invented is not in this set, so it renders as plain text and the reader gets
 * no false affordance suggesting it is real.
 *
 * Names matter because the Analyst writes prose. It says "TransDigm" and "GE
 * Aerospace", not TDG and GE — symbol-only matching left most of what it
 * actually named unlinkable.
 *
 * Unauthenticated: the public Analyst on the landing page needs the same guard,
 * and a list of symbols already disclosed in public SEC filings is not private.
 */

// Legal-entity noise. Stripping it turns "Transdigm Group Inc" into the word a
// person actually writes, and lets one key match both.
const SUFFIXES = new RegExp(
  '\\s+(?:' + [
    'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'group',
    'holdings?', 'holdings? inc', 'ltd', 'limited', 'plc', 'llc', 'lp', 'l\\.p',
    'nv', 'n\\.v', 'sa', 's\\.a', 'ag', 'se', 'trust', 'tr', 'the',
    'cl [a-c]', 'class [a-c]', 'adr', 'ads', 'sponsored adr', 'common stock',
    'com', 'cmn', 'ordinary shares', 'new', 'del', 'md',
  ].join('|') + ')(?=\\s|$)',
  'gi',
);

function coreName(raw: string): string | null {
  let n = raw.replace(/[.,]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  for (let i = 0; i < 4; i++) n = n.replace(SUFFIXES, '').trim();
  n = n.replace(/\s{2,}/g, ' ').trim();
  // Two characters is not a name, it is an abbreviation that will match noise.
  if (n.length < 4) return null;
  // A name that is itself a ticker-shaped token adds nothing over symbol matching.
  if (/^[A-Z]{1,5}$/.test(n)) return null;
  return n;
}

export async function GET() {
  const [holdings, fundamentals] = await Promise.all([
    fetchAllRows<{ ticker: string; issuer_name: string | null; instrument_type: string | null }>(
      (from, to) => db.from('holdings')
        .select('ticker, issuer_name, instrument_type').order('id').range(from, to)
    ),
    fetchAllRows<{ ticker: string; name: string | null }>(
      (from, to) => db.from('security_fundamentals')
        .select('ticker, name').eq('status', 'ok').order('ticker').range(from, to)
    ).catch(() => []),
  ]);

  // Only plain equity symbols are clickable. Unresolved CUSIP fallbacks and
  // bond descriptors have no company page to open.
  const equity = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;
  const tickers = [...new Set(holdings.map(r => r.ticker))].filter(t => equity.test(t)).sort();
  const valid = new Set(tickers);

  // name -> ticker. Ambiguous names are dropped rather than guessed: linking
  // the wrong company is worse than not linking it.
  const claims = new Map<string, Set<string>>();
  const add = (rawName: string | null | undefined, ticker: string) => {
    if (!rawName || !valid.has(ticker)) return;
    const core = coreName(rawName);
    if (!core) return;
    const key = core.toLowerCase();
    if (!claims.has(key)) claims.set(key, new Set());
    claims.get(key)!.add(ticker);
  };

  for (const f of fundamentals) add(f.name, f.ticker);
  for (const h of holdings) if (h.instrument_type === 'equity') add(h.issuer_name, h.ticker);

  const names: Record<string, string> = {};
  for (const [name, owners] of claims) {
    if (owners.size === 1) names[name] = [...owners][0];
  }

  return NextResponse.json({ tickers, names }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
