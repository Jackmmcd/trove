/**
 * Rebuild the universe digest and activate it as the cached snapshot.
 * Requires the dev server (npm run dev).
 *
 *   node scripts/build-corpus.js          # rebuild + activate
 *   node scripts/build-corpus.js --show   # inspect the active snapshot only
 */
require('dotenv').config();

const BASE = process.env.SYNC_BASE_URL || 'http://localhost:3001';
const SHOW = process.argv.includes('--show');
const AUTH = process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {};

(async () => {
  if (SHOW) {
    const res = await fetch(`${BASE}/api/advisor/corpus`, { headers: AUTH });
    const body = await res.json();
    if (!body.active) return console.log('No active snapshot. Run without --show to build one.');
    console.log(`active snapshot: ${body.fundCount} funds, ${body.tokenCount.toLocaleString()} tokens\n`);
    console.log('--- first 1200 chars ---\n');
    console.log(body.preview);
    return;
  }

  console.log('building digest…');
  const res = await fetch(`${BASE}/api/advisor/corpus`, { method: 'POST', headers: AUTH });
  const body = await res.json();
  if (!res.ok || body.error) {
    console.error('failed:', body.error || res.status);
    process.exit(1);
  }

  const t = body.tokenCount;
  console.log(`\n✓ snapshot ${body.id}`);
  console.log(`  funds:  ${body.fundCount}`);
  console.log(`  tokens: ${t.toLocaleString()}`);

  // Cost framing at Opus 5 rates: $5/MTok in, cache read 0.1x, cache write 1.25x.
  console.log(`\n  cached read : $${((t / 1e6) * 5 * 0.1).toFixed(4)} per turn`);
  console.log(`  cache write : $${((t / 1e6) * 5 * 1.25).toFixed(4)} once per hour (or on rebuild)`);
  console.log(`  uncached    : $${((t / 1e6) * 5).toFixed(4)} per turn if caching breaks`);

  if (t < 8000) {
    console.log('\n  note: below ~8k tokens the caching layer saves very little.');
    console.log('  It is still correct — it just does not start paying off until the universe grows.');
  }
  if (t > 60000) {
    console.log('\n  warning: over 60k tokens. Lower POSITIONS_PER_FUND in lib/advisor/corpus.ts.');
  }
})();
