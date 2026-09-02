// One-time migration: Neon (Prisma) → Supabase
// Run with: node migrate-to-supabase.js

require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('./node_modules/.prisma/client');
const { createClient } = require('@supabase/supabase-js');

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://neondb_owner:npg_GpZROw7m8Yxu@ep-nameless-cell-ani779i7-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' } },
});

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function migrate() {
  console.log('Starting migration from Neon → Supabase...\n');

  // ── Funds ──────────────────────────────────────────────────────
  const funds = await prisma.fund.findMany();
  console.log(`Migrating ${funds.length} funds...`);
  if (funds.length > 0) {
    const { error } = await db.from('funds').upsert(
      funds.map(f => ({
        id: f.id,
        cik: f.cik,
        name: f.name,
        enabled: f.enabled,
        created_at: f.createdAt.toISOString(),
        updated_at: f.updatedAt.toISOString(),
      })),
      { onConflict: 'id' }
    );
    if (error) console.error('  funds error:', error.message);
    else console.log(`  ✓ ${funds.length} funds`);
  }

  // ── Holdings (batch in chunks of 500) ─────────────────────────
  const holdings = await prisma.holding.findMany();
  console.log(`Migrating ${holdings.length} holdings...`);
  if (holdings.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < holdings.length; i += chunkSize) {
      const chunk = holdings.slice(i, i + chunkSize);
      const { error } = await db.from('holdings').upsert(
        chunk.map(h => ({
          id: h.id,
          fund_id: h.fundId,
          ticker: h.ticker,
          shares: h.shares,
          value: h.value,
          weight: h.weight,
          quarter: h.quarter,
          filing_date: h.filingDate.toISOString(),
          created_at: h.createdAt.toISOString(),
        })),
        { onConflict: 'id' }
      );
      if (error) console.error(`  holdings chunk ${i} error:`, error.message);
      else console.log(`  ✓ holdings ${i + 1}–${Math.min(i + chunkSize, holdings.length)}`);
    }
  }

  // ── Basket purchases ───────────────────────────────────────────
  const baskets = await prisma.basketPurchase.findMany();
  console.log(`Migrating ${baskets.length} basket purchases...`);
  if (baskets.length > 0) {
    const { error } = await db.from('basket_purchases').upsert(
      baskets.map(b => ({
        id: b.id,
        fund_id: b.fundId,
        fund_name: b.fundName,
        budget: b.budget,
        placed_at: b.placedAt.toISOString(),
        orders: b.orders,
      })),
      { onConflict: 'id' }
    );
    if (error) console.error('  baskets error:', error.message);
    else console.log(`  ✓ ${baskets.length} basket purchases`);
  }

  // ── Stock analyses ─────────────────────────────────────────────
  const analyses = await prisma.stockAnalysis.findMany();
  console.log(`Migrating ${analyses.length} stock analyses...`);
  if (analyses.length > 0) {
    const { error } = await db.from('stock_analyses').upsert(
      analyses.map(a => ({
        ticker: a.ticker,
        summary: a.summary,
        bull_case: a.bullCase,
        bear_case: a.bearCase,
        created_at: a.createdAt.toISOString(),
      })),
      { onConflict: 'ticker' }
    );
    if (error) console.error('  stock_analyses error:', error.message);
    else console.log(`  ✓ ${analyses.length} stock analyses`);
  }

  // ── Daily digests ──────────────────────────────────────────────
  const digests = await prisma.dailyDigest.findMany();
  console.log(`Migrating ${digests.length} daily digests...`);
  if (digests.length > 0) {
    const { error } = await db.from('daily_digests').upsert(
      digests.map(d => ({
        date: d.date,
        digest: d.digest,
        created_at: d.createdAt.toISOString(),
      })),
      { onConflict: 'date' }
    );
    if (error) console.error('  daily_digests error:', error.message);
    else console.log(`  ✓ ${digests.length} daily digests`);
  }

  // ── Fund theses ────────────────────────────────────────────────
  const theses = await prisma.fundThesis.findMany();
  console.log(`Migrating ${theses.length} fund theses...`);
  if (theses.length > 0) {
    const { error } = await db.from('fund_theses').upsert(
      theses.map(t => ({
        fund_id: t.fundId,
        thesis: t.thesis,
        quarter: t.quarter,
        created_at: t.createdAt.toISOString(),
      })),
      { onConflict: 'fund_id' }
    );
    if (error) console.error('  fund_theses error:', error.message);
    else console.log(`  ✓ ${theses.length} fund theses`);
  }

  console.log('\nMigration complete.');
  await prisma.$disconnect();
}

migrate().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
