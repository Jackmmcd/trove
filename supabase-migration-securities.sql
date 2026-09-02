-- Preserve the security identity that the 13F filing actually reports.
-- Run in the Supabase SQL editor, then: node scripts/sync-universe.js
--
-- Why: the parser reads <cusip> and <nameOfIssuer> from every position and then
-- discards both, keeping only a ticker guessed from CUSIP via OpenFIGI. When that
-- lookup misses, the fallback is the first six letters of the issuer name — so
-- Spotify becomes SPOTIF, Nebius becomes NEBIUS, and neither matches the same
-- company held by another fund. Cross-fund consensus is computed on that guessed
-- string, so real positions silently fail to aggregate.
--
-- CUSIP is unique per security and is what the filing reports. Join on it.

ALTER TABLE holdings ADD COLUMN IF NOT EXISTS cusip        TEXT;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS issuer_name  TEXT;

CREATE INDEX IF NOT EXISTS idx_holdings_cusip ON holdings(cusip);

COMMENT ON COLUMN holdings.cusip IS
  'CUSIP as reported in the filing. The authoritative cross-fund join key — ticker is display only.';
COMMENT ON COLUMN holdings.issuer_name IS
  'nameOfIssuer as reported. Gives Ed a readable name when the ticker is unresolved.';

-- Cache of CUSIP -> ticker resolutions so a failed OpenFIGI lookup can be
-- backfilled later instead of re-failing on every sync.
CREATE TABLE IF NOT EXISTS securities (
  cusip       TEXT PRIMARY KEY,
  ticker      TEXT,
  issuer_name TEXT,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE securities DISABLE ROW LEVEL SECURITY;

-- fund_theses has no FK, so deleting a fund orphans its thesis. Add the
-- constraint and clear the 17 rows already pointing at deleted funds.
DELETE FROM fund_theses WHERE fund_id NOT IN (SELECT id FROM funds);

ALTER TABLE fund_theses DROP CONSTRAINT IF EXISTS fund_theses_fund_id_fkey;
ALTER TABLE fund_theses
  ADD CONSTRAINT fund_theses_fund_id_fkey
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE;
