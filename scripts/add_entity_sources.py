#!/usr/bin/env python3
"""
Creates the entity_sources provenance table.

Tracks where each entity came from: CSV import, manual entry, agentic sourcing,
or web research. Each row links an entity to a source, which may be a URL,
a file upload, a data_request, or a free-text citation.

Usage:
  python3 scripts/add_entity_sources.py
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
-- ── entity_sources ─────────────────────────────────────────────────────────────
-- Provenance record for every entity. source_type discriminates the origin.
CREATE TABLE IF NOT EXISTS entity_sources (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source_type     text        NOT NULL,   -- 'manual' | 'csv_import' | 'data_request' | 'web'
  data_request_id uuid        REFERENCES data_requests(id) ON DELETE SET NULL,
  source_url      text,
  source_label    text,
  confidence      text        NOT NULL DEFAULT 'medium',
  notes           text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_sources_entity_id ON entity_sources(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_sources_request_id ON entity_sources(data_request_id);

COMMENT ON TABLE entity_sources IS
  'Provenance records linking entities to their origin (CSV, agentic sourcing, manual, web).';
"""

cur.execute(sql)
print('Created: entity_sources')
cur.close()
conn.close()
