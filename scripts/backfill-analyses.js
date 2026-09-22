/**
 * Write a business summary for every held ticker that lacks one.
 *
 *   node scripts/backfill-analyses.js [--limit N] [--dry]
 *
 * Semantic search is only as complete as stock_analyses: a company with no
 * summary has nothing to embed and is therefore invisible to every thematic
 * question, silently. That is worse than a gap the user can see, so this fills
 * the table before the index is built.
 *
 * Mirrors the prompt in lib/advisor/tools.ts so a company reads the same way
 * however it was written.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const POLYGON_KEY = process.env.POLYGON_API_KEY;
const EQUITY = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

const SYSTEM = `You are a sharp equity analyst. Given a company description, output three things in plain English — no jargon, no filler.

Rules:
- Summary: 1–2 sentences max. Explain what the company does and how it makes money, as if explaining to a smart teenager.
- Bull Case: the single strongest argument for owning it.
- Bear Case: the single strongest argument against.

Format exactly:
Summary: ...
Bull Case: ...
Bear Case: ...`;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity;
})();

async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// A 13F reports funds and ETFs alongside operating companies, and the ticker
// column cannot tell them apart — SPY, XLE and SOXX are all five uppercase
// letters. Only common stock and depositary receipts belong in a search index
// of what companies do; "tracks the S&P 500" answers no thematic question and
// would surface against every one of them.
const COMPANY_TYPES = new Set(['CS', 'ADRC', 'ADRP', 'ADRR', 'GDR', 'NYRS']);

/** Polygon's free tier allows 5 requests a minute, so this paces itself. */
async function lookup(ticker) {
  if (!POLYGON_KEY) return { skip: 'no key' };
  const url = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${POLYGON_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return { skip: res.status === 404 ? 'not on Polygon' : `HTTP ${res.status}` };
  const r = (await res.json())?.results;
  if (!r) return { skip: 'no results' };
  if (!COMPANY_TYPES.has(r.type)) return { skip: `not a company (${r.type || 'unknown type'})` };
  const d = r.description;
  if (!d || d.length <= 80) return { skip: 'no description' };
  return { description: d };
}

(async () => {
  const holdings = await all((f, t) => sb.from('holdings')
    .select('ticker, instrument_type').order('id').range(f, t));
  const existing = await all((f, t) => sb.from('stock_analyses')
    .select('ticker, summary').order('ticker').range(f, t));

  const have = new Set(existing.filter(a => a.summary && a.summary.length > 20).map(a => a.ticker));
  const held = [...new Set(holdings.filter(h => h.instrument_type === 'equity').map(h => h.ticker))]
    .filter(t => EQUITY.test(t));

  const missing = held.filter(t => !have.has(t)).sort().slice(0, LIMIT);
  console.log(`held equities: ${held.length} · already summarised: ${held.length - held.filter(t => !have.has(t)).length} · to write: ${missing.length}`);
  if (DRY) { console.log(missing.join(', ')); return; }
  if (!POLYGON_KEY) { console.error('POLYGON_API_KEY is not set — nothing to describe from.'); process.exit(1); }

  let wrote = 0, noDesc = 0, failed = 0;

  for (const [i, ticker] of missing.entries()) {
    try {
      const { description: desc, skip } = await lookup(ticker);
      if (skip) {
        noDesc++;
        console.log(`  ${ticker}: skipped — ${skip}`);
        await sleep(12000);
        continue;
      }

      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Ticker: ${ticker}\n\nDescription: ${desc}` }],
      });
      const text = msg.content.find(b => b.type === 'text')?.text ?? '';

      const summary = (text.match(/Summary:\s*([\s\S]*?)(?=Bull Case:|$)/i) || [])[1]?.trim() ?? '';
      const bull = (text.match(/Bull Case:\s*([\s\S]*?)(?=Bear Case:|$)/i) || [])[1]?.trim() ?? '';
      const bear = (text.match(/Bear Case:\s*([\s\S]*?)$/i) || [])[1]?.trim() ?? '';

      if (!summary) { failed++; console.log(`  ${ticker}: model returned no summary`); continue; }

      const { error } = await sb.from('stock_analyses')
        .upsert({ ticker, summary, bull_case: bull, bear_case: bear });
      if (error) { failed++; console.error(`  ${ticker}: ${error.message}`); continue; }

      wrote++;
      console.log(`  ${ticker}  (${i + 1}/${missing.length})  ${summary.slice(0, 70)}…`);
    } catch (e) {
      failed++;
      console.error(`  ${ticker}: ${e.message}`);
    }

    // Polygon's 5/min ceiling is the binding constraint, not Anthropic's.
    await sleep(12000);
  }

  console.log(`\nwrote ${wrote} · no description ${noDesc} · failed ${failed}`);
})().catch(e => { console.error(e); process.exit(1); });
