/**
 * Embed every held company's business summary into security_embeddings.
 *
 *   node scripts/build-embeddings.js [--force] [--dry]
 *
 * Run after scripts/backfill-analyses.js, and again after any sync that adds
 * companies. Incremental by default: a row is re-embedded only when the text it
 * was built from has changed, so a routine re-run costs nothing.
 *
 * Requires VOYAGE_API_KEY and the pgvector migration in
 * supabase-migration-embeddings.sql.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Must match lib/voyage/client.ts. Vectors from different models are not
// comparable, so if you change one, change both and re-run with --force.
const MODEL = 'voyage-4';
const DIMS = 1024;

// Voyage's free tier (no payment method on the account) allows 3 requests and
// 10,000 tokens per minute. The token cap binds, and it binds per request as
// well as per minute: a batch estimated at 9,700 tokens was rejected every
// single time, because one oversized request can never fit the quota no matter
// how long you wait. So batches are sized by an estimate of their token count,
// not by a document count — documents here average ~970 characters and the
// longest is 1,330, so a fixed count is the wrong unit.
//
// Adding a payment method raises both limits by orders of magnitude: pass
// --fast once it is set.
const FAST = process.argv.includes('--fast');

// Measured against the live API rather than assumed: a 16-document batch this
// estimator put at 4,024 tokens actually cost 2,268, so 3.2 chars/token runs
// ~1.8x hot. Kept deliberately pessimistic anyway — guessing low stalls the run
// against a hard cap, while guessing high only costs a few extra minutes.
const CHARS_PER_TOKEN = 3.2;
const TOKEN_BUDGET = FAST ? 100000 : 7000;
const PACE_MS = FAST ? 0 : 35000;
const MAX_DOCS = FAST ? 128 : 1000;

/** Split into requests that each stay inside the per-request token budget. */
function intoBatches(work) {
  const batches = [];
  let cur = [], curTokens = 0;
  for (const w of work) {
    const t = Math.ceil(w.content.length / CHARS_PER_TOKEN);
    if (cur.length && (curTokens + t > TOKEN_BUDGET || cur.length >= MAX_DOCS)) {
      batches.push(cur); cur = []; curTokens = 0;
    }
    cur.push(w); curTokens += t;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

const EQUITY = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY = args.includes('--dry');

async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

/**
 * What actually gets embedded.
 *
 * The ticker and company name lead so that a query naming a company directly
 * still finds it, and the two cases follow the summary because they carry the
 * vocabulary a thematic query uses — "hyperscaler capex" and "grid
 * interconnection queue" appear in a bull case far more often than in a
 * one-sentence description of what a company sells.
 */
function documentFor(row) {
  return [
    `${row.ticker}${row.name ? ` — ${row.name}` : ''}`,
    row.sector ? `Industry: ${row.sector.toLowerCase()}` : null,
    row.summary,
    row.bull_case ? `Bull case: ${row.bull_case}` : null,
    row.bear_case ? `Bear case: ${row.bear_case}` : null,
  ].filter(Boolean).join('\n');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * One request, retrying through the rate limiter.
 *
 * A 429 here is a quota timing problem, not a failure — retrying after a wait
 * succeeds. Giving up instead would abandon an otherwise complete run and,
 * worse, leave the index half-built with no signal that it is partial.
 */
async function embedChunk(key, chunk, attempt = 0) {
  let res;
  try {
    res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: chunk, model: MODEL, input_type: 'document', output_dimension: DIMS }),
    });
  } catch (e) {
    // A dropped connection over a run this long is expected, not exceptional.
    if (attempt >= 6) throw new Error(`network error after 7 attempts: ${e.message}`);
    const wait = 10000 * (attempt + 1);
    console.log(`    ${e.message} — retrying in ${wait / 1000}s`);
    await sleep(wait);
    return embedChunk(key, chunk, attempt + 1);
  }

  if (res.status === 429) {
    if (attempt >= 6) throw new Error('rate limited by Voyage after 7 attempts');
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 30000 * (attempt + 1);
    console.log(`    rate limited — waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
    return embedChunk(key, chunk, attempt + 1);
  }

  if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const j = await res.json();
  const vecs = (j.data ?? []).slice().sort((a, b) => a.index - b.index).map(d => d.embedding);
  if (vecs.length !== chunk.length) throw new Error(`got ${vecs.length} vectors for ${chunk.length} inputs`);
  return vecs;
}

/**
 * Embed and store, one batch at a time.
 *
 * Each batch is written before the next is requested. On the free tier this run
 * takes twenty minutes, and embedding everything before the first write would
 * mean a dropped connection at minute nineteen discarding the lot. Storing as
 * we go makes the run resumable instead: the incremental filter above skips
 * whatever already landed, so re-running simply continues.
 */
async function embedAndStore(work) {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error('VOYAGE_API_KEY is not set');

  const batches = intoBatches(work);
  if (!FAST) {
    const mins = Math.ceil((batches.length * PACE_MS) / 60000);
    console.log(`free-tier pacing: ${batches.length} requests of ~${TOKEN_BUDGET} tokens — about ${mins} minutes.`);
    console.log('Safe to interrupt: each batch is saved as it arrives, and re-running resumes.');
    console.log('Add a payment method at dashboard.voyageai.com and re-run with --fast to do it in one.');
    console.log('');
  }

  let wrote = 0;
  for (const [b, chunk] of batches.entries()) {
    const vectors = await embedChunk(key, chunk.map(w => w.content));

    const rows = chunk.map((w, j) => ({
      ticker: w.ticker,
      content: w.content,
      embedding: vectors[j],
      model: MODEL,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await sb.from('security_embeddings').upsert(rows);
    if (error) throw new Error(error.message);

    wrote += rows.length;
    console.log(`  stored ${wrote}/${work.length}`);
    if (PACE_MS && b < batches.length - 1) await sleep(PACE_MS);
  }
  return wrote;
}

(async () => {
  const [holdings, analyses, fundamentals, existing] = await Promise.all([
    all((f, t) => sb.from('holdings').select('ticker, instrument_type').order('id').range(f, t)),
    all((f, t) => sb.from('stock_analyses').select('ticker, summary, bull_case, bear_case').order('ticker').range(f, t)),
    all((f, t) => sb.from('security_fundamentals').select('ticker, name, sector').order('ticker').range(f, t)),
    all((f, t) => sb.from('security_embeddings').select('ticker, content, model').order('ticker').range(f, t)),
  ]);

  // Only names a tracked fund actually reports as equity. Embedding the whole
  // analyses table would index companies nobody holds, which then surface in
  // answers about what these funds own.
  const held = new Set(
    holdings.filter(h => h.instrument_type === 'equity' && EQUITY.test(h.ticker)).map(h => h.ticker),
  );
  const fundByTicker = new Map(fundamentals.map(f => [f.ticker, f]));
  const prior = new Map(existing.map(e => [e.ticker, e]));

  const candidates = analyses
    .filter(a => held.has(a.ticker) && a.summary && a.summary.length > 20)
    .map(a => {
      const f = fundByTicker.get(a.ticker);
      return { ticker: a.ticker, name: f?.name ?? null, sector: f?.sector ?? null, ...a };
    });

  const work = candidates
    .map(row => ({ ticker: row.ticker, content: documentFor(row) }))
    .filter(r => {
      if (FORCE) return true;
      const p = prior.get(r.ticker);
      return !p || p.content !== r.content || p.model !== MODEL;
    });

  console.log(`held equities with a summary: ${candidates.length} · already current: ${candidates.length - work.length} · to embed: ${work.length}`);
  if (DRY || !work.length) { if (!work.length) console.log('nothing to do'); return; }

  const wrote = await embedAndStore(work);

  // Companies the funds hold that still have no summary are invisible to
  // search. Naming them is the difference between a known gap and a silent one.
  const noSummary = [...held].filter(t => !candidates.some(c => c.ticker === t));
  console.log(`\nindexed ${wrote} companies.`);
  if (noSummary.length) {
    console.log(`${noSummary.length} held names have no summary and are NOT searchable: ${noSummary.slice(0, 20).join(', ')}${noSummary.length > 20 ? '…' : ''}`);
    console.log('run: node scripts/backfill-analyses.js');
  }
})().catch(e => { console.error(e.message); process.exit(1); });
