-- Options are not long positions.
-- Run in the Supabase SQL editor BEFORE deploying the code that writes put_call,
-- then re-sync stored filings: npx tsx scripts/resync-options.ts
--
-- Why: a 13F information table marks option lines with <putCall>Put</putCall>
-- or <putCall>Call</putCall>, and reports them at the value of the UNDERLYING
-- shares. The parser ignored the tag, so Scion's 5M-share Palantir PUT — a
-- $912M bet against the stock — was stored, shown and summed as 66% long
-- Palantir, and would have gone into a "buy this fund's basket" order as stock.

ALTER TABLE holdings ADD COLUMN IF NOT EXISTS put_call TEXT;

ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_put_call_check;
ALTER TABLE holdings ADD CONSTRAINT holdings_put_call_check
  CHECK (put_call IS NULL OR put_call IN ('put', 'call'));

COMMENT ON COLUMN holdings.put_call IS
  'NULL = the security itself. put/call = an option on it; value and shares describe the underlying, not the premium. A put is a bearish position.';

-- The old key was one row per (fund, ticker, quarter), but shares, calls and
-- puts on the same stock are three positions with one ticker. Drop whatever
-- unique constraint covers those columns (its name depends on how the table
-- was first created) and key on the option type as well. NULLS NOT DISTINCT so
-- two plain-share rows for one ticker still collide, as before.
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'holdings'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) ~ 'fund_id' AND pg_get_constraintdef(oid) ~ 'ticker'
      AND pg_get_constraintdef(oid) ~ 'quarter'
  LOOP
    EXECUTE format('ALTER TABLE holdings DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS holdings_position_key
  ON holdings (fund_id, ticker, quarter, put_call) NULLS NOT DISTINCT;
