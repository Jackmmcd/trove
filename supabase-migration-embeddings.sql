-- Semantic search over the companies these funds hold.
--
-- Run in the Supabase SQL editor, then:
--   node scripts/backfill-analyses.js     (fills missing company summaries)
--   node scripts/build-embeddings.js      (embeds them)
--
-- Why embeddings rather than the sector column: `security_fundamentals.sector`
-- is Polygon's SIC description — 208 all-caps industrial categories written for
-- 1987 filing clerks. A data-centre REIT is "REAL ESTATE INVESTMENT TRUSTS" and
-- the company selling its cooling systems is "REFRIGERATION & SERVICE MACHINERY",
-- so no SIC filter can answer "data centre infrastructure". The written summary
-- can, because it describes the business in the words a person would use.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS security_embeddings (
  ticker      TEXT PRIMARY KEY,
  -- The exact text that was embedded. Kept so a re-index can tell whether the
  -- source actually changed, and so a bad result can be explained by looking at
  -- what the model was given rather than guessed at.
  content     TEXT NOT NULL,
  embedding   VECTOR(1024) NOT NULL,
  model       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Under a thousand rows, a sequential scan is already sub-millisecond; the index
-- is here so this stays fast if the tracked universe grows by an order of
-- magnitude. HNSW rather than IVFFlat because it needs no training set and does
-- not degrade when the table is small.
CREATE INDEX IF NOT EXISTS idx_security_embeddings_hnsw
  ON security_embeddings USING hnsw (embedding vector_cosine_ops);

ALTER TABLE security_embeddings DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE security_embeddings IS
  'Voyage embeddings of each holding''s written business summary. Built by scripts/build-embeddings.js; queried by the Analyst''s search_securities tool.';

-- PostgREST cannot express the `<=>` operator, so the ranking has to live in the
-- database as a function.
--
-- `min_similarity` matters more than it looks: cosine similarity never returns
-- nothing, so without a floor a query for "uranium enrichment" happily comes
-- back with twenty consumer-staples companies ranked by which is least unlike
-- uranium. A floor makes an empty result possible, which is the honest answer.
CREATE OR REPLACE FUNCTION match_securities(
  query_embedding VECTOR(1024),
  match_count     INT DEFAULT 20,
  min_similarity  FLOAT DEFAULT 0.35
)
RETURNS TABLE (ticker TEXT, content TEXT, similarity FLOAT)
LANGUAGE sql STABLE
AS $$
  SELECT e.ticker,
         e.content,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM security_embeddings e
  WHERE 1 - (e.embedding <=> query_embedding) >= min_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
