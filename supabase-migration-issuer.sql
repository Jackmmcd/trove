-- Issuer identity and instrument type.
-- Run in the Supabase SQL editor, then: node scripts/backfill-issuer.js
--
-- Why: consensus was aggregated on the full 9-character CUSIP, which is the
-- identity of a *security*, not a *company*. Silver Point holds EchoStar's
-- 3.875% 2030 bond (278768AB2) while Pennant holds EchoStar common stock
-- (278768106). Keyed on full CUSIP those are unrelated, so the Analyst said
-- "no other fund reports it" about a company two funds hold.
--
-- A CUSIP is: 6 chars issuer + 2 chars issue + 1 check digit. The issuer half
-- is shared by every security a company issues, and the issue half says what
-- kind. Both were already stored and both were being ignored.

ALTER TABLE holdings ADD COLUMN IF NOT EXISTS cusip6          TEXT;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS instrument_type TEXT;

CREATE INDEX IF NOT EXISTS idx_holdings_cusip6 ON holdings(cusip6);

COMMENT ON COLUMN holdings.cusip6 IS
  'First 6 CUSIP characters — the issuer. Two rows sharing this are the same company, whatever instrument each holds. This is the correct key for "who holds this company".';
COMMENT ON COLUMN holdings.instrument_type IS
  'equity | debt | warrant | unknown, derived from CUSIP issue characters 7-8: numeric issue codes are equity, alphabetic are fixed income.';

-- Backfill what can be derived in SQL; the script fills the rest and keeps
-- future syncs populated.
UPDATE holdings SET cusip6 = substring(cusip from 1 for 6)
  WHERE cusip IS NOT NULL AND cusip6 IS NULL;

UPDATE holdings SET instrument_type =
  CASE
    WHEN cusip IS NULL THEN 'unknown'
    WHEN substring(cusip from 7 for 2) ~ '^[0-9]{2}$' THEN
      CASE WHEN substring(cusip from 7 for 2)::int BETWEEN 88 AND 99
           THEN 'warrant' ELSE 'equity' END
    ELSE 'debt'
  END
  WHERE instrument_type IS NULL;
