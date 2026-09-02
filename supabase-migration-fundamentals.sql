-- Per-ticker fundamentals cache.
-- Run in the Supabase SQL editor, then: node scripts/enrich-fundamentals.js
--
-- Why a cache rather than live lookups: Polygon's free tier allows 5 requests
-- per minute and market cap is only on the per-ticker detail endpoint (the bulk
-- list omits it). Fetching on demand would rate-limit after two questions.
-- Market cap and TTM financials move slowly, so a cache refreshed weekly is
-- accurate enough and makes every lookup instant.

CREATE TABLE IF NOT EXISTS security_fundamentals (
  ticker              TEXT PRIMARY KEY,
  name                TEXT,
  sector              TEXT,              -- Polygon sic_description
  market_cap          DOUBLE PRECISION,
  shares_outstanding  DOUBLE PRECISION,
  employees           INT,
  list_date           DATE,
  homepage            TEXT,

  -- TTM financials
  revenue             DOUBLE PRECISION,
  gross_profit        DOUBLE PRECISION,
  net_income          DOUBLE PRECISION,
  eps                 DOUBLE PRECISION,
  assets              DOUBLE PRECISION,
  liabilities         DOUBLE PRECISION,
  equity              DOUBLE PRECISION,
  operating_cash_flow DOUBLE PRECISION,
  fiscal_period       TEXT,
  fiscal_year         TEXT,

  -- 'ok' = enriched; 'not_found' = Polygon has no such ticker (usually an
  -- unresolved CUSIP fallback); 'error' = transient, retry later.
  status              TEXT NOT NULL DEFAULT 'ok',
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fundamentals_status ON security_fundamentals(status);
ALTER TABLE security_fundamentals DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE security_fundamentals IS
  'Cached Polygon reference + TTM financials per ticker. Refreshed by scripts/enrich-fundamentals.js; rate-limited to 5 req/min on the free tier.';
