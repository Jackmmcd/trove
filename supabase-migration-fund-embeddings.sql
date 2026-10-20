-- Semantic search over the funds themselves.
--
-- Run in the Supabase SQL editor, then:
--   npx tsx scripts/build-fund-embeddings.ts
--
-- Why: fund search by keyword only knows the aliases and tags written into
-- config/fund-directory.json. "Dalio" works; "funds piling into AI chips"
-- doesn't. Each fund is embedded from what it actually holds (the generated
-- description of its book plus its largest positions) so a query about a theme
-- finds the funds whose portfolios express it. A fund whose holdings have never
-- been loaded is embedded from its directory entry instead, and upgraded the
-- first time it loads (lib/services/fund-sync.ts re-indexes after every sync).
--
-- Requires the vector extension, already enabled by supabase-migration-embeddings.sql.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS fund_embeddings (
  cik         TEXT PRIMARY KEY,
  -- 'holdings' = built from the fund's loaded portfolio; 'directory' = only the
  -- hand-written directory entry was available. Search results say which, so a
  -- weak match on a directory-only fund isn't presented as a portfolio fact.
  source      TEXT NOT NULL,
  quarter     TEXT,
  -- The exact text embedded, kept so a surprising result can be explained.
  content     TEXT NOT NULL,
  embedding   VECTOR(1024) NOT NULL,
  model       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fund_embeddings_hnsw
  ON fund_embeddings USING hnsw (embedding vector_cosine_ops);

ALTER TABLE fund_embeddings DISABLE ROW LEVEL SECURITY;

-- Same shape and reasoning as match_securities: PostgREST can't express `<=>`,
-- and the similarity floor is what lets "no fund matches" be an answer.
CREATE OR REPLACE FUNCTION match_funds(
  query_embedding VECTOR(1024),
  match_count     INT DEFAULT 10,
  min_similarity  FLOAT DEFAULT 0.35
)
RETURNS TABLE (cik TEXT, source TEXT, quarter TEXT, content TEXT, similarity FLOAT)
LANGUAGE sql STABLE
AS $$
  SELECT e.cik, e.source, e.quarter, e.content,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM fund_embeddings e
  WHERE 1 - (e.embedding <=> query_embedding) >= min_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
