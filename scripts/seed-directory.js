/**
 * Add every fund in config/fund-directory.json to the global universe.
 *
 *   node scripts/seed-directory.js            # dry run — prints the plan, changes nothing
 *   node scripts/seed-directory.js --apply    # inserts missing funds, primes the CUSIP cache
 *
 * Additive only: existing fund rows are left exactly as they are, and nothing
 * is deleted. No holdings are fetched — on-demand funds load the first time
 * their page is opened (/fund/<CIK>), scheduled ones via scripts/sync-universe.js.
 *
 * Also primes the `securities` CUSIP → ticker cache from holdings already
 * stored, so a newly opened fund only sends OpenFIGI the CUSIPs no tracked fund
 * has held before.
 */
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { funds: DIRECTORY } = require('../config/fund-directory.json');

const APPLY = process.argv.includes('--apply');
const UA = process.env.SEC_USER_AGENT || '13F Follower App contact@example.com';
const EQUITY_TICKER = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function edgar(cik) {
  const { data } = await axios.get(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    timeout: 20000,
  });
  const r = data.filings.recent;
  const i = r.form.findIndex(f => f === '13F-HR' || f === '13F-HR/A');
  return { name: data.name, last13F: i >= 0 ? r.filingDate[i] : null };
}

async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

(async () => {
  console.log(APPLY ? '=== APPLY ===\n' : '=== DRY RUN (pass --apply to write) ===\n');

  const { data: existing, error } = await sb.from('funds').select('cik').is('user_id', null);
  if (error) { console.error(error.message); process.exit(1); }
  const have = new Set(existing.map(f => f.cik));
  const missing = DIRECTORY.filter(f => !have.has(f.cik));

  console.log(`directory: ${DIRECTORY.length}   already in universe: ${DIRECTORY.length - missing.length}   to add: ${missing.length}\n`);

  // Re-verify every CIK against EDGAR at write time — a mistyped CIK is a
  // different, real company, and nothing downstream would notice.
  const rows = [];
  for (const f of missing) {
    try {
      const e = await edgar(f.cik);
      const flag = !e.last13F ? '  ! NO 13F ON FILE' : e.last13F < '2025-06-01' ? `  ! last 13F ${e.last13F}` : '';
      console.log(`  + ${f.cik}  ${f.name.slice(0, 34).padEnd(34)} EDGAR: ${String(e.name).slice(0, 36).padEnd(36)} ${f.sync}${flag}`);
      rows.push({
        cik: f.cik, name: e.name, enabled: true, user_id: null,
        entity_type: f.entity_type, filer_note: f.note ?? '',
      });
    } catch (err) {
      console.log(`  ! ${f.cik}  ${f.name} — EDGAR lookup failed (${err.response?.status || err.message}), skipping`);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  // Prime the CUSIP cache from what's already stored.
  const held = await pageAll((from, to) =>
    sb.from('holdings').select('cusip, ticker, issuer_name').not('cusip', 'is', null).order('id').range(from, to));
  const cache = new Map();
  for (const h of held) {
    if (EQUITY_TICKER.test(h.ticker) && !cache.has(h.cusip)) {
      cache.set(h.cusip, { cusip: h.cusip, ticker: h.ticker, issuer_name: h.issuer_name, resolved: true });
    }
  }
  console.log(`\nwould insert ${rows.length} fund rows`);
  console.log(`would cache ${cache.size} CUSIP → ticker resolutions from ${held.length} stored holdings`);

  if (!APPLY) { console.log('\nDry run complete. Re-run with --apply to write.'); return; }

  if (rows.length) {
    const { error: e } = await sb.from('funds').insert(rows);
    if (e) { console.error(`insert failed: ${e.message}`); process.exit(1); }
  }
  const vals = [...cache.values()];
  for (let i = 0; i < vals.length; i += 500) {
    // ignoreDuplicates: never overwrite a resolution the app wrote more recently.
    const { error: e } = await sb.from('securities').upsert(vals.slice(i, i + 500), { onConflict: 'cusip', ignoreDuplicates: true });
    if (e) { console.log(`  ! securities cache: ${e.message}`); break; }
  }

  const { count } = await sb.from('funds').select('*', { count: 'exact', head: true }).is('user_id', null);
  console.log(`\ndone: ${count} funds in the universe.`);
  console.log('Open /fund to browse them; each loads from EDGAR on first view.');
  console.log('Then rebuild the Analyst digest so it knows the directory: node scripts/build-corpus.js');
})();
