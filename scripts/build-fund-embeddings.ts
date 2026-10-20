/**
 * Embed every fund for semantic fund search.
 *
 *   npx tsx scripts/build-fund-embeddings.ts
 *
 * Run once after supabase-migration-fund-embeddings.sql. After that, each fund
 * re-embeds itself whenever it syncs; re-running this is only needed after
 * editing config/fund-directory.json or changing the Voyage model. Funds whose
 * text hasn't changed are skipped, so re-runs are cheap.
 */
import 'dotenv/config';

(async () => {
  const { indexAllFunds } = await import('@/lib/funds/embeddings');
  const r = await indexAllFunds();
  console.log(`embedded ${r.indexed} funds, ${r.unchanged} unchanged`);
})().catch(e => { console.error(e.message); process.exit(1); });
