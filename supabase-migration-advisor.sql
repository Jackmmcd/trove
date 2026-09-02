-- Ed / global fund universe migration
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor), then:
--   node scripts/seed-universe.js
--   node scripts/sync-universe.js
--
-- Safe to re-run: every statement is guarded.

-- ---------------------------------------------------------------------------
-- 1. Global fund universe
-- ---------------------------------------------------------------------------
-- A fund is now a shared, canonical entity (user_id IS NULL). Users no longer
-- own fund rows; they follow them via user_watched_funds. This is what lets one
-- cached corpus serve every user instead of one per user.

ALTER TABLE funds ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'hedge_fund';
ALTER TABLE funds ADD COLUMN IF NOT EXISTS filer_note  TEXT NOT NULL DEFAULT '';
ALTER TABLE funds ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN funds.entity_type IS
  'hedge_fund | asset_manager | endowment | sovereign_wealth | corporate — 13F filers are not all hedge funds; Ed must label the difference.';

-- One canonical row per CIK in the global universe. Legacy per-user rows are
-- unaffected by this index because it only covers user_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS funds_global_cik_key ON funds (cik) WHERE user_id IS NULL;

CREATE TABLE IF NOT EXISTS user_watched_funds (
  user_id    UUID NOT NULL,
  fund_id    TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, fund_id)
);
CREATE INDEX IF NOT EXISTS idx_watched_user ON user_watched_funds(user_id);

-- ---------------------------------------------------------------------------
-- 2. Report period vs. filing date
-- ---------------------------------------------------------------------------
-- A 13F lodged 2026-08-14 reports positions as of 2026-06-30. The old code
-- derived `quarter` from the filing date, labelling that data Q3 when it is Q2.
-- period_end stores the truth; quarter is now derived from it.

ALTER TABLE holdings ADD COLUMN IF NOT EXISTS period_end DATE;
COMMENT ON COLUMN holdings.period_end IS
  'EDGAR reportDate — the date these positions are as of. quarter is derived from this, never from filing_date.';

-- ---------------------------------------------------------------------------
-- 3. Corpus snapshots — the cached context blob
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fund_corpus_snapshots (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  label       TEXT NOT NULL DEFAULT '',
  digest      TEXT NOT NULL,
  token_count INT  NOT NULL DEFAULT 0,
  fund_count  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_snapshot ON fund_corpus_snapshots (is_active) WHERE is_active;

-- ---------------------------------------------------------------------------
-- 4. Investor profile
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investor_profiles (
  user_id    UUID PRIMARY KEY,
  declared   JSONB NOT NULL DEFAULT '{}',
  derived    JSONB NOT NULL DEFAULT '{}',
  derived_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. Ed conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS advisor_conversations (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    UUID NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON advisor_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS advisor_messages (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id TEXT NOT NULL REFERENCES advisor_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  -- Full content-block array, not just text: thinking, tool_use, and compaction
  -- blocks must replay verbatim on the next turn.
  content         JSONB NOT NULL DEFAULT '[]',
  evidence        JSONB NOT NULL DEFAULT '[]',
  usage           JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON advisor_messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- 6. RLS off, consistent with the rest of this schema (service role only)
-- ---------------------------------------------------------------------------
ALTER TABLE user_watched_funds    DISABLE ROW LEVEL SECURITY;
ALTER TABLE fund_corpus_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE investor_profiles     DISABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_messages      DISABLE ROW LEVEL SECURITY;
