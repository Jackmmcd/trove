/**
 * Re-fetch every stored 13F so option lines get their put_call flag.
 *
 *   npx tsx scripts/resync-options.ts            # every fund with holdings
 *   npx tsx scripts/resync-options.ts 0001649339 # one CIK
 *
 * Run once, after supabase-migration-options.sql. Before that migration the
 * parser ignored <putCall>, so every stored quarter has puts and calls merged
 * into (or standing in for) share positions. Each (fund, quarter) already in
 * the database is re-synced from EDGAR; the latest quarter also regenerates the
 * fund's description. Then the fund embeddings and the Analyst digest are
 * rebuilt so neither keeps describing a put as a holding.
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

(async () => {
  const { db } = await import('@/lib/supabase/admin');
  const { fetchAllRows } = await import('@/lib/supabase/paginate');
  const { syncFund } = await import('@/lib/services/fund-sync');
  const { indexAllFunds } = await import('@/lib/funds/embeddings');
  const { refreshSnapshot } = await import('@/lib/advisor/corpus');

  const only = process.argv[2];
  let q = db.from('funds').select('id, cik, name').is('user_id', null);
  if (only) q = q.eq('cik', only);
  const { data: funds, error } = await q;
  if (error) throw new Error(error.message);

  const rows = await fetchAllRows<{ fund_id: string; quarter: string }>((from, to) =>
    db.from('holdings').select('fund_id, quarter').is('user_id', null).order('id').range(from, to));
  const quarters = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!quarters.has(r.fund_id)) quarters.set(r.fund_id, new Set());
    quarters.get(r.fund_id)!.add(r.quarter);
  }

  let options = 0, failed = 0;
  for (const f of funds ?? []) {
    const qs = [...(quarters.get(f.id) ?? [])].sort().reverse();
    for (const [i, quarter] of qs.entries()) {
      const t = Date.now();
      // Latest quarter syncs without a quarter argument so its description is regenerated.
      const r = await syncFund(f.cik, undefined, i === 0 ? undefined : quarter, { tickerBudgetMs: 90_000 });
      const { count } = await db.from('holdings').select('*', { count: 'exact', head: true })
        .eq('fund_id', f.id).eq('quarter', r.quarter ?? quarter).not('put_call', 'is', null);
      options += count ?? 0;
      if (!r.success) failed++;
      console.log(`${r.success ? '✓' : '✗'} ${f.cik} ${f.name.slice(0, 32).padEnd(32)} ${quarter}  ${String(r.holdingsCount).padStart(5)} rows  ${String(count ?? 0).padStart(4)} options  ${((Date.now() - t) / 1000).toFixed(0)}s${r.error ? '  ' + r.error : ''}`);
    }
  }
  console.log(`\n${options} option rows flagged, ${failed} failures`);

  const emb = await indexAllFunds();
  console.log(`fund embeddings: ${emb.indexed} re-embedded, ${emb.unchanged} unchanged`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const snap = await refreshSnapshot(async text =>
    (await client.messages.countTokens({ model: 'claude-opus-5', messages: [{ role: 'user', content: text }] })).input_tokens);
  console.log(`analyst digest rebuilt: ${snap.fundCount} funds, ${snap.tokenCount.toLocaleString()} tokens`);
})().catch(e => { console.error(e.message); process.exit(1); });
