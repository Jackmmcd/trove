/**
 * Data audit: what the Analyst can and cannot see.
 *
 *   node scripts/audit-data.js
 *
 * Reports coverage gaps rather than just counts, because every bug this project
 * has hit was invisible in a count: a silently truncated read looked like a
 * smaller universe, a rejected insert looked like a successful sync, and
 * consensus keyed on the wrong column looked like a lonely holder.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const EQUITY = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

const pct = (n, d) => d ? `${((n / d) * 100).toFixed(1)}%` : '—';
const head = t => console.log(`\n=== ${t} ===`);

(async () => {
  const { data: funds } = await sb.from('funds')
    .select('id, cik, name, entity_type').is('user_id', null).eq('enabled', true);
  const fundMap = new Map(funds.map(f => [f.id, f]));

  const holdings = await all((f, t) => sb.from('holdings')
    .select('fund_id, ticker, cusip, cusip6, instrument_type, issuer_name, weight, value, quarter')
    .order('id').range(f, t));

  const fundamentals = await all((f, t) => sb.from('security_fundamentals')
    .select('ticker, market_cap, status').order('ticker').range(f, t));
  const analyses = await all((f, t) => sb.from('stock_analyses')
    .select('ticker, summary').order('ticker').range(f, t));

  console.log(`funds: ${funds.length} · holdings rows: ${holdings.length}`);

  // ---- fund coverage -------------------------------------------------------
  head('FUND COVERAGE');
  const prev = q => { let [y, n] = q.split('-Q').map(Number); n--; if (!n) { n = 4; y--; } return `${y}-Q${n}`; };
  let noDeltas = 0;
  for (const f of funds) {
    const qs = [...new Set(holdings.filter(h => h.fund_id === f.id).map(h => h.quarter))].sort().reverse();
    if (!qs.length) { console.log(`  ✗ ${f.name} — NO HOLDINGS`); noDeltas++; continue; }
    if (!qs.includes(prev(qs[0]))) { console.log(`  ~ ${f.name} — only ${qs.join(', ')} (no prior quarter, deltas unavailable)`); noDeltas++; }
  }
  console.log(`  ${funds.length - noDeltas}/${funds.length} funds can compute quarter-over-quarter change`);

  // ---- security identity ---------------------------------------------------
  head('SECURITY IDENTITY');
  const noCusip = holdings.filter(h => !h.cusip);
  const noCusip6 = holdings.filter(h => !h.cusip6);
  const noType = holdings.filter(h => !h.instrument_type || h.instrument_type === 'unknown');
  console.log(`  missing cusip:           ${noCusip.length} (${pct(noCusip.length, holdings.length)})`);
  console.log(`  missing cusip6 (issuer): ${noCusip6.length} (${pct(noCusip6.length, holdings.length)})`);
  console.log(`  instrument unclassified: ${noType.length} (${pct(noType.length, holdings.length)})`);

  const byType = {};
  for (const h of holdings) byType[h.instrument_type ?? 'null'] = (byType[h.instrument_type ?? 'null'] || 0) + 1;
  console.log('  by instrument:', Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(' '));

  // Issuers held through more than one instrument — the EchoStar case.
  const byIssuer = new Map();
  for (const h of holdings) {
    if (!h.cusip6) continue;
    if (!byIssuer.has(h.cusip6)) byIssuer.set(h.cusip6, { name: h.issuer_name, types: new Set(), funds: new Set() });
    const e = byIssuer.get(h.cusip6);
    e.types.add(h.instrument_type ?? 'unknown');
    e.funds.add(h.fund_id);
  }
  const mixed = [...byIssuer.values()].filter(e => e.types.size > 1);
  console.log(`  issuers held via >1 instrument type: ${mixed.length}`);
  for (const m of mixed.slice(0, 10)) {
    console.log(`     ${String(m.name).slice(0, 34).padEnd(36)} ${[...m.types].join('+')}  across ${m.funds.size} fund(s)`);
  }

  // ---- ticker resolution ---------------------------------------------------
  head('TICKER RESOLUTION');
  const tickers = [...new Set(holdings.map(h => h.ticker))];
  const unresolved = tickers.filter(t => !EQUITY.test(t));
  console.log(`  distinct tickers: ${tickers.length} · unresolved: ${unresolved.length} (${pct(unresolved.length, tickers.length)})`);
  console.log('  sample unresolved:', unresolved.slice(0, 12).join(' | '));

  // ---- company index -------------------------------------------------------
  head('COMPANY INDEX');
  const equityTickers = [...new Set(holdings.filter(h => h.instrument_type === 'equity' && EQUITY.test(h.ticker)).map(h => h.ticker))];
  const haveFund = new Set(fundamentals.filter(f => f.status === 'ok' && f.market_cap).map(f => f.ticker));
  const haveAnalysis = new Set(analyses.filter(a => a.summary).map(a => a.ticker));
  const missingFund = equityTickers.filter(t => !haveFund.has(t));
  const missingAnalysis = equityTickers.filter(t => !haveAnalysis.has(t));
  console.log(`  equity tickers held:      ${equityTickers.length}`);
  console.log(`  with market cap:          ${equityTickers.length - missingFund.length} (${pct(equityTickers.length - missingFund.length, equityTickers.length)})`);
  console.log(`  with description/pros/cons: ${equityTickers.length - missingAnalysis.length} (${pct(equityTickers.length - missingAnalysis.length, equityTickers.length)})`);

  // Weight the gap by how much it matters: breadth across funds × summed weight.
  const score = new Map();
  for (const h of holdings) {
    if (!EQUITY.test(h.ticker)) continue;
    const e = score.get(h.ticker) ?? { funds: new Set(), w: 0 };
    e.funds.add(h.fund_id); e.w += h.weight ?? 0;
    score.set(h.ticker, e);
  }
  const rank = t => { const e = score.get(t); return e ? e.funds.size * e.w : 0; };
  const worst = missingFund.concat(missingAnalysis.filter(t => !missingFund.includes(t)))
    .sort((a, b) => rank(b) - rank(a)).slice(0, 15);
  if (worst.length) {
    console.log('  highest-impact gaps (breadth × weight):');
    for (const t of worst) {
      console.log(`     ${t.padEnd(7)} cap:${haveFund.has(t) ? 'yes' : 'NO '} analysis:${haveAnalysis.has(t) ? 'yes' : 'NO '}  score ${rank(t).toFixed(0)}`);
    }
  }

  head('NEXT STEPS');
  if (noCusip6.length) console.log('  · run supabase-migration-issuer.sql, then node scripts/backfill-issuer.js');
  if (missingFund.length) console.log(`  · node scripts/enrich-fundamentals.js   (${missingFund.length} tickers need market cap)`);
  if (missingAnalysis.length) console.log(`  · descriptions + pros/cons are written by the same enrich-fundamentals pass (${missingAnalysis.length} missing)`);
  console.log('  · node scripts/build-corpus.js          (after any of the above)');
})();
