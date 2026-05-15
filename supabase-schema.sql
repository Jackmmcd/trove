-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)

CREATE TABLE IF NOT EXISTS funds (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cik TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fund_id TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  shares FLOAT NOT NULL,
  value FLOAT NOT NULL,
  weight FLOAT NOT NULL,
  quarter TEXT NOT NULL,
  filing_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fund_id, ticker, quarter)
);

CREATE INDEX IF NOT EXISTS idx_holdings_fund_id ON holdings(fund_id);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_holdings_quarter ON holdings(quarter);

CREATE TABLE IF NOT EXISTS basket_purchases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fund_id TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  budget FLOAT NOT NULL,
  placed_at TIMESTAMPTZ DEFAULT now(),
  orders JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS stock_analyses (
  ticker TEXT PRIMARY KEY,
  summary TEXT NOT NULL DEFAULT '',
  bull_case TEXT NOT NULL DEFAULT '',
  bear_case TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_digests (
  date TEXT PRIMARY KEY,
  digest TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fund_theses (
  fund_id TEXT PRIMARY KEY,
  thesis TEXT NOT NULL DEFAULT '',
  quarter TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Disable RLS so the service role key (and anon key) can read/write freely
ALTER TABLE funds DISABLE ROW LEVEL SECURITY;
ALTER TABLE holdings DISABLE ROW LEVEL SECURITY;
ALTER TABLE basket_purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_analyses DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_digests DISABLE ROW LEVEL SECURITY;
ALTER TABLE fund_theses DISABLE ROW LEVEL SECURITY;

-- Auto-update updated_at on funds
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER funds_updated_at BEFORE UPDATE ON funds
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
