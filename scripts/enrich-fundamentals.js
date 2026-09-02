/**
 * Populate security_fundamentals from Polygon.
 *
 *   node scripts/enrich-fundamentals.js            # digest tickers, highest value first
 *   node scripts/enrich-fundamentals.js --all      # every ticker ever held
 *   node scripts/enrich-fundamentals.js --refresh  # re-fetch rows older than 7 days
 *
 * Polygon's free tier allows 5 requests/minute and market cap lives only on the
 * per-ticker detail endpoint, so this paces itself and is fully resumable —
 * stop it any time, run it again, and it picks up where it left off.
 *
 * Work is ordered by how much each name matters: breadth across funds × weight.
 * The names Analyst actually discusses are done in the first half hour.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const KEY = process.env.POLYGON_API_KEY;
const ALL = process.argv.includes('--all');
const REFRESH = process.argv.includes('--refresh');

// 5 req/min, two requests per ticker → 25s between tickers, plus headroom.
const GAP_MS = 26000;
const STALE_DAYS = 7;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const EQUITY = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

async function reference(ticker) {
  const r = await axios.get(`https://api.polygon.io/v3/reference/tickers/${ticker}`,
    { params: { apiKey: KEY }, timeout: 15000 });
  return r.data?.results ?? null;
}

async function financials(ticker) {
  try {
    const r = await axios.get('https://api.polygon.io/vX/reference/financials',
      { params: { ticker, limit: 1, timeframe: 'ttm', apiKey: KEY }, timeout: 20000 });
    return r.data?.results?.[0] ?? null;
  } catch { return null; } // financials are optional; market cap is the point
}

const val = (o, k) => o?.[k]?.value ?? null;

(async () => {
  // Rank tickers by breadth × weight so the most-discussed names land first.
  const holdings = await fetchAll((f, t) =>
    sb.from('holdings').select('ticker, weight, fund_id').order('id').range(f, t));

  const agg = new Map();
  for (const h of holdings) {
    if (!EQUITY.test(h.ticker)) continue; // unresolved pseudo-tickers aren't in Polygon
    const a = agg.get(h.ticker) ?? { funds: new Set(), weight: 0 };
    a.funds.add(h.fund_id);
    a.weight += h.weight ?? 0;
    agg.set(h.ticker, a);
  }

  let ranked = [...agg.entries()]
    .map(([ticker, a]) => ({ ticker, score: a.funds.size * a.weight }))
    .sort((a, b) => b.score - a.score)
    .map(r => r.ticker);

  if (!ALL) ranked = ranked.slice(0, 400);

  const existing = await fetchAll((f, t) =>
    sb.from('security_fundamentals').select('ticker, status, updated_at').order('ticker').range(f, t));
  const seen = new Map(existing.map(r => [r.ticker, r]));
  const staleBefore = Date.now() - STALE_DAYS * 864e5;

  const todo = ranked.filter(t => {
    const row = seen.get(t);
    if (!row) return true;
    if (row.status === 'not_found') return false;              // permanent
    if (REFRESH && new Date(row.updated_at).getTime() < staleBefore) return true;
    return row.status === 'error';                              // retry transients
  });

  console.log(`${agg.size} equity tickers held · ${seen.size} already cached · ${todo.length} to fetch`);
  console.log(`~${Math.ceil((todo.length * GAP_MS) / 60000)} min at ${GAP_MS / 1000}s/ticker (Polygon free tier: 5 req/min)\n`);
  if (!todo.length) return console.log('nothing to do.');

  let ok = 0, missing = 0, failed = 0;
  for (const [i, ticker] of todo.entries()) {
    const tag = `[${String(i + 1).padStart(4)}/${todo.length}]`;
    try {
      const d = await reference(ticker);
      if (!d) throw Object.assign(new Error('no results'), { notFound: true });

      const fin = await financials(ticker);
      const f = fin?.financials ?? {};
      const is = f.income_statement, bs = f.balance_sheet, cf = f.cash_flow_statement;

      const { error } = await sb.from('security_fundamentals').upsert({
        ticker,
        name: d.name ?? null,
        sector: d.sic_description ?? null,
        market_cap: d.market_cap ?? null,
        shares_outstanding: d.share_class_shares_outstanding ?? d.weighted_shares_outstanding ?? null,
        employees: d.total_employees ?? null,
        list_date: d.list_date ?? null,
        homepage: d.homepage_url ?? null,
        revenue: val(is, 'revenues'),
        gross_profit: val(is, 'gross_profit'),
        net_income: val(is, 'net_income_loss'),
        eps: val(is, 'diluted_earnings_per_share') ?? val(is, 'basic_earnings_per_share'),
        assets: val(bs, 'assets'),
        liabilities: val(bs, 'liabilities'),
        equity: val(bs, 'equity'),
        operating_cash_flow: val(cf, 'net_cash_flow_from_operating_activities'),
        fiscal_period: fin?.fiscal_period ?? null,
        fiscal_year: fin?.fiscal_year ?? null,
        status: 'ok',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'ticker' });
      if (error) throw new Error(error.message);

      ok++;
      const mc = d.market_cap ? `$${(d.market_cap / 1e9).toFixed(2)}B` : 'no mkt cap';
      console.log(`${tag} ✓ ${ticker.padEnd(7)} ${mc.padStart(11)}  ${String(d.name ?? '').slice(0, 34)}`);
    } catch (e) {
      const notFound = e.notFound || e.response?.status === 404;
      const status = notFound ? 'not_found' : 'error';
      if (notFound) missing++; else failed++;
      await sb.from('security_fundamentals').upsert(
        { ticker, status, updated_at: new Date().toISOString() }, { onConflict: 'ticker' });
      console.log(`${tag} ${notFound ? '–' : '✗'} ${ticker.padEnd(7)} ${notFound ? 'not on Polygon' : (e.response?.status || e.message)}`);
    }
    if (i < todo.length - 1) await sleep(GAP_MS);
  }

  console.log(`\n${ok} enriched · ${missing} not found · ${failed} failed`);
  console.log('next: node scripts/build-corpus.js');
})();
