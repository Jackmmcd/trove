/**
 * Seed the global fund universe and collapse legacy per-user fund rows.
 *
 *   node scripts/seed-universe.js            # dry run — prints the plan, changes nothing
 *   node scripts/seed-universe.js --apply    # backs up, then writes
 *
 * Legacy holdings are deleted rather than repointed: every existing row is
 * labelled with a quarter derived from the filing date (one quarter ahead of the
 * period it actually covers), so they have to be re-synced regardless.
 * Run scripts/sync-universe.js afterwards.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const UA = process.env.SEC_USER_AGENT || '13F Follower App contact@example.com';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Curated starter universe. Names are pulled from EDGAR at run time — the values
// here are only for reading the file. entity_type drives how Ed frames a
// filer: a corporate treasury or an endowment is not a hedge fund conviction signal.
const UNIVERSE = [
  { cik: '0001001085', entity_type: 'asset_manager',   note: 'Alternative asset manager; balance-sheet positions, not a hedge fund book.' },
  { cik: '0001846237', entity_type: 'asset_manager',   note: 'Growth-equity manager.' },
  { cik: '0001647251', entity_type: 'hedge_fund',      note: '' },
  { cik: '0001540358', entity_type: 'asset_manager',   note: 'Venture firm; 13F covers only public positions from crossover/IPO holdings.' },
  { cik: '0001527166', entity_type: 'asset_manager',   note: 'Private-equity firm; 13F reflects public holdings only.' },
  { cik: '0001336528', entity_type: 'hedge_fund',      note: '' },
  { cik: '0001035674', entity_type: 'hedge_fund',      note: '' },
  { cik: '0001167483', entity_type: 'hedge_fund',      note: '' },
  { cik: '0001332784', entity_type: 'hedge_fund',      note: 'Credit-focused; equity book is a partial view of the strategy.' },
  { cik: '0001791786', entity_type: 'hedge_fund',      note: 'Activist; positions often precede a public campaign.' },
  { cik: '0000909661', entity_type: 'hedge_fund',      note: '' },
  { cik: '0001082621', entity_type: 'endowment',       note: 'University endowment; mandate is long-horizon, not alpha-seeking.' },
  { cik: '0001558858', entity_type: 'hedge_fund',      note: '' },
  { cik: '0001765681', entity_type: 'asset_manager',   note: 'Venture firm; 13F covers only public positions.' },
  { cik: '0001747057', entity_type: 'hedge_fund',      note: '' },
  { cik: '0001040273', entity_type: 'hedge_fund',      note: 'Activist.' },
  { cik: '0001814011', entity_type: 'sovereign_wealth',note: 'Sovereign fund; only 2 filings on record, so QoQ deltas are unavailable.' },
  { cik: '0001559706', entity_type: 'hedge_fund',      note: '' },
  { cik: '0001020066', entity_type: 'asset_manager',   note: 'Long-only growth manager.' },
];

// Deliberately excluded — never re-added by the inherit step below.
const EXCLUDE = new Set([
  '0002045724', // Situational Awareness LP — removed 2026-09-01
]);

async function edgarName(cik) {
  const { data } = await axios.get(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    timeout: 20000,
  });
  return data.name;
}

(async () => {
  console.log(APPLY ? '=== APPLY ===\n' : '=== DRY RUN (pass --apply to write) ===\n');

  const { data: existing } = await sb.from('funds').select('id, cik, name, user_id, enabled');
  const legacy = existing.filter(f => f.user_id !== null);
  const alreadyGlobal = new Map(existing.filter(f => f.user_id === null).map(f => [f.cik, f]));

  // Every CIK that should end up in the global universe: curated 20 + anything
  // already tracked by a user, so nothing the user added gets dropped.
  const curated = new Map(UNIVERSE.filter(u => !EXCLUDE.has(u.cik)).map(u => [u.cik, u]));
  const legacyCiks = [...new Set(legacy.map(f => f.cik))].filter(c => !EXCLUDE.has(c));
  const inherited = legacyCiks.filter(c => !curated.has(c));

  console.log(`curated:        ${curated.size}`);
  console.log(`legacy rows:    ${legacy.length} across ${legacyCiks.length} distinct CIKs`);
  console.log(`inherited:      ${inherited.length} (tracked by a user, not in the curated list)`);
  console.log(`already global: ${alreadyGlobal.size}`);
  console.log(`→ universe after seed: ${new Set([...curated.keys(), ...legacyCiks]).size} funds\n`);

  const targets = [
    ...UNIVERSE,
    ...inherited.map(cik => ({ cik, entity_type: 'hedge_fund', note: '' })),
  ];

  // Resolve authoritative names from EDGAR (the spreadsheet names were truncated).
  const rows = [];
  for (const t of targets) {
    if (alreadyGlobal.has(t.cik)) { rows.push({ ...t, name: alreadyGlobal.get(t.cik).name, skip: true }); continue; }
    let name;
    try { name = await edgarName(t.cik); }
    catch (e) { console.log(`  ! ${t.cik} EDGAR lookup failed (${e.response?.status || e.message}) — skipping`); continue; }
    rows.push({ ...t, name });
    console.log(`  ${t.cik}  ${String(name).slice(0, 44).padEnd(44)} ${t.entity_type}`);
    await new Promise(r => setTimeout(r, 180));
  }

  const toInsert = rows.filter(r => !r.skip);
  console.log(`\nwould insert ${toInsert.length} global fund rows`);
  console.log(`would create ${legacy.length} user_watched_funds entries`);
  console.log(`would delete ${legacy.length} legacy fund rows (cascades their holdings — all mislabelled by quarter)\n`);

  if (!APPLY) { console.log('Dry run complete. Re-run with --apply to write.'); return; }

  // --- backup before any destructive step -----------------------------------
  const dir = path.join(__dirname, '..', '.backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const { data: allHoldings } = await sb.from('holdings').select('*');
  const { data: allTheses } = await sb.from('fund_theses').select('*');
  const file = path.join(dir, `pre-universe-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ funds: existing, holdings: allHoldings, theses: allTheses }, null, 2));
  console.log(`backup: ${file} (${existing.length} funds, ${allHoldings.length} holdings)\n`);

  // --- insert global rows ---------------------------------------------------
  for (const r of toInsert) {
    const { error } = await sb.from('funds').insert({
      cik: r.cik, name: r.name, enabled: true, user_id: null,
      entity_type: r.entity_type, filer_note: r.note,
    });
    if (error) console.log(`  ! insert ${r.cik}: ${error.message}`);
  }

  // --- map every legacy row onto its global twin ----------------------------
  const { data: globals } = await sb.from('funds').select('id, cik').is('user_id', null);
  const globalByCik = new Map(globals.map(g => [g.cik, g.id]));

  let watched = 0;
  for (const f of legacy) {
    const gid = globalByCik.get(f.cik);
    if (!gid) { console.log(`  ! no global row for ${f.cik}, leaving legacy row ${f.id} intact`); continue; }
    const { error } = await sb.from('user_watched_funds').upsert(
      { user_id: f.user_id, fund_id: gid }, { onConflict: 'user_id,fund_id' }
    );
    if (error) { console.log(`  ! watch ${f.cik}: ${error.message}`); continue; }
    watched++;
    await sb.from('funds').delete().eq('id', f.id); // cascades holdings + theses
  }

  const { count } = await sb.from('funds').select('*', { count: 'exact', head: true }).is('user_id', null);
  console.log(`done: ${count} global funds, ${watched} watch entries created, legacy rows removed.`);
  console.log('next: node scripts/sync-universe.js');
})();
