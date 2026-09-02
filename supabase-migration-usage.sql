-- Daily spend ledger and cap for Analyst.
-- Run in the Supabase SQL editor.
--
-- The public demo sits behind an email allowlist, which is a shared credential
-- rather than authentication — one leaked address means unmetered Opus calls.
-- This is the ceiling that makes that survivable.

CREATE TABLE IF NOT EXISTS analyst_usage (
  day            DATE PRIMARY KEY,
  turns          INT    NOT NULL DEFAULT 0,
  input_tokens   BIGINT NOT NULL DEFAULT 0,
  output_tokens  BIGINT NOT NULL DEFAULT 0,
  cache_read     BIGINT NOT NULL DEFAULT 0,
  cache_write    BIGINT NOT NULL DEFAULT 0,
  est_cost_usd   DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE analyst_usage DISABLE ROW LEVEL SECURITY;

-- Atomic increment. Read-modify-write from the app would lose counts under
-- concurrent turns, which is exactly when a cap matters most.
CREATE OR REPLACE FUNCTION analyst_record_usage(
  p_day DATE,
  p_input BIGINT,
  p_output BIGINT,
  p_cache_read BIGINT,
  p_cache_write BIGINT,
  p_cost DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  new_total DOUBLE PRECISION;
BEGIN
  INSERT INTO analyst_usage AS u (day, turns, input_tokens, output_tokens, cache_read, cache_write, est_cost_usd, updated_at)
  VALUES (p_day, 1, p_input, p_output, p_cache_read, p_cache_write, p_cost, now())
  ON CONFLICT (day) DO UPDATE SET
    turns         = u.turns + 1,
    input_tokens  = u.input_tokens + p_input,
    output_tokens = u.output_tokens + p_output,
    cache_read    = u.cache_read + p_cache_read,
    cache_write   = u.cache_write + p_cache_write,
    est_cost_usd  = u.est_cost_usd + p_cost,
    updated_at    = now()
  RETURNING u.est_cost_usd INTO new_total;

  RETURN new_total;
END;
$$ LANGUAGE plpgsql;
