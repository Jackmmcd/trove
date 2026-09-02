/**
 * Pull the latest 13F for every fund in the global universe.
 *
 *   node scripts/sync-universe.js           # all global funds
 *   node scripts/sync-universe.js 0001040273  # one CIK
 *
 * Slow by design: OpenFIGI allows ~25 requests/min without a key and the client
 * sleeps 2.6s between CUSIP batches of 10. A 200-position filer takes ~1 minute.
 */
// Drives the app's own sync route rather than reimplementing the SEC client,
// so the dev server (npm run dev) must be running.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const BASE = process.env.SYNC_BASE_URL || 'http://localhost:3001';
const only = process.argv[2];

(async () => {
  let q = sb.from('funds').select('cik, name, entity_type').is('user_id', null).eq('enabled', true);
  if (only) q = q.eq('cik', only);
  const { data: funds, error } = await q;
  if (error) { console.error(error.message); process.exit(1); }

  console.log(`syncing ${funds.length} funds via ${BASE}/api/cron/sync\n`);

  let ok = 0, fail = 0;
  for (const f of funds) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE}/api/cron/sync?cik=${f.cik}`, {
        method: 'POST',
        headers: process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
      });
      const body = await res.json();
      const n = body?.results?.[0]?.holdingsCount ?? body?.holdingsCount ?? '?';
      const qtr = body?.results?.[0]?.quarter ?? body?.quarter ?? '?';
      if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
      ok++;
      console.log(`  ✓ ${f.cik} ${String(f.name).slice(0, 38).padEnd(38)} ${String(n).padStart(4)} holdings  ${qtr}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${f.cik} ${String(f.name).slice(0, 38).padEnd(38)} ${e.message}`);
    }
  }
  console.log(`\n${ok} synced, ${fail} failed`);
  console.log('next: node scripts/build-corpus.js');
})();
