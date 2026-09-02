/**
 * Backfill historical 13F filings so quarter-over-quarter deltas exist.
 *
 *   node scripts/backfill-quarters.js            # two quarters back
 *   node scripts/backfill-quarters.js 3          # three quarters back
 *
 * Without at least two quarters per fund, every position reads as unchanged:
 * no "NEW", no "exited", and the consensus "new" column is all zeros. That is
 * the single most valuable signal in the product, so this is not optional.
 *
 * Requires the dev server. Slow — OpenFIGI rate limits dominate.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const BASE = process.env.SYNC_BASE_URL || 'http://localhost:3001';
const AUTH = process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {};
const DEPTH = parseInt(process.argv[2] ?? '2', 10);

function stepBack(q, n) {
  let [y, qn] = q.split('-Q').map(Number);
  for (let i = 0; i < n; i++) { qn--; if (qn === 0) { qn = 4; y--; } }
  return `${y}-Q${qn}`;
}

(async () => {
  const { data: funds } = await sb
    .from('funds').select('id, cik, name').is('user_id', null).eq('enabled', true).order('name');

  const { data: holdings } = await sb.from('holdings').select('fund_id, quarter');
  const have = new Map();
  for (const r of holdings) {
    if (!have.has(r.fund_id)) have.set(r.fund_id, new Set());
    have.get(r.fund_id).add(r.quarter);
  }

  // Build the work list first so the run is resumable and its size is knowable.
  const jobs = [];
  for (const f of funds) {
    const known = have.get(f.id);
    if (!known?.size) continue;
    const latest = [...known].sort().reverse()[0];
    for (let n = 1; n <= DEPTH; n++) {
      const q = stepBack(latest, n);
      if (!known.has(q)) jobs.push({ ...f, quarter: q });
    }
  }

  console.log(`${funds.length} funds · ${DEPTH} quarters back · ${jobs.length} filings to fetch\n`);

  let ok = 0, missing = 0, failed = 0;
  for (const [i, j] of jobs.entries()) {
    const t0 = Date.now();
    const tag = `[${String(i + 1).padStart(3)}/${jobs.length}]`;
    try {
      const res = await fetch(`${BASE}/api/cron/sync?cik=${j.cik}&quarter=${j.quarter}`, {
        method: 'POST', headers: AUTH,
      });
      const body = await res.json();
      const r = body?.results?.[0];
      if (r?.success) {
        ok++;
        console.log(`${tag} ✓ ${String(j.name).slice(0, 32).padEnd(34)} ${j.quarter}  ${String(r.holdingsCount).padStart(4)} holdings  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      } else if (/No 13F-HR filing found/i.test(r?.error ?? '')) {
        // Normal: the fund simply did not file that quarter, or it predates them.
        missing++;
        console.log(`${tag} – ${String(j.name).slice(0, 32).padEnd(34)} ${j.quarter}  no filing`);
      } else {
        failed++;
        console.log(`${tag} ✗ ${String(j.name).slice(0, 32).padEnd(34)} ${j.quarter}  ${r?.error ?? body?.error ?? res.status}`);
      }
    } catch (e) {
      failed++;
      console.log(`${tag} ✗ ${String(j.name).slice(0, 32).padEnd(34)} ${j.quarter}  ${e.message}`);
    }
  }

  console.log(`\n${ok} backfilled · ${missing} had no filing · ${failed} failed`);
  console.log('next: node scripts/build-corpus.js');
})();
