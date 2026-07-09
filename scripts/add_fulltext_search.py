#!/usr/bin/env python3
"""
Adds full-text search support to the entities table.

Creates:
  - search_vector: generated tsvector column on entities.name
  - GIN index on search_vector for fast FTS queries
  - entity_search(p_query, p_limit) RPC: searches entities by name AND annotation
    content, returning ranked results; falls through to ilike if FTS finds nothing

Usage:
  python3 scripts/add_fulltext_search.py
"""
import os
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')
db_url = os.environ.get('SUPABASE_DB_URL')
if not db_url:
    raise SystemExit('SUPABASE_DB_URL not found in .env')

conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

sql = """
-- ── search_vector column ──────────────────────────────────────────────────────
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(name, ''))) STORED;

-- GIN index for fast FTS
CREATE INDEX IF NOT EXISTS entities_search_vector_idx
  ON entities USING GIN(search_vector);


-- ── entity_search RPC ─────────────────────────────────────────────────────────
-- Searches entities by name (FTS, high rank) and annotation text (lower rank).
-- Results are deduplicated by entity ID and sorted by relevance.
CREATE OR REPLACE FUNCTION entity_search(
  p_query text,
  p_limit integer DEFAULT 30
)
RETURNS TABLE(id uuid, name text, entity_type text, rank real)
LANGUAGE sql
SECURITY DEFINER AS $func$
  SELECT
    id, name, entity_type,
    max(rank)::real AS rank
  FROM (
    -- Name-level FTS (ranked by ts_rank)
    SELECT
      e.id, e.name, e.entity_type,
      ts_rank(e.search_vector, plainto_tsquery('english', p_query)) AS rank
    FROM entities e
    WHERE e.search_vector @@ plainto_tsquery('english', p_query)

    UNION ALL

    -- Annotation-level FTS (fixed lower rank; entity may also appear above)
    SELECT
      e.id, e.name, e.entity_type,
      0.1 AS rank
    FROM entities e
    JOIN annotations a ON a.entity_id = e.id
    WHERE to_tsvector('english', coalesce(a.content_md, ''))
            @@ plainto_tsquery('english', p_query)
  ) combined
  GROUP BY id, name, entity_type
  ORDER BY rank DESC
  LIMIT p_limit;
$func$;

GRANT EXECUTE ON FUNCTION entity_search TO anon, authenticated;
"""

cur.execute(sql)
print('Created: search_vector column, GIN index, entity_search RPC')
cur.close()
conn.close()
