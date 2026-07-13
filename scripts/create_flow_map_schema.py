#!/usr/bin/env python3
"""
create_flow_map_schema.py

One-time migration: create the three tables that back the story flow map feature.

  story_flow_nodes  — geographic locations (nodes) for a story's flow map
  story_flow_pops   — population/displacement counts per node per year
  story_flow_edges  — directed flows between nodes with volume and time range

Usage:
    python3 scripts/create_flow_map_schema.py [--dry-run]
"""

import os, sys
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.environ.get('SUPABASE_DB_URL')
if not DB_URL:
    sys.exit('ERROR: SUPABASE_DB_URL not set in .env')

DRY_RUN = '--dry-run' in sys.argv

SQL = """
-- ── story_flow_nodes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_flow_nodes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id    uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    name        text NOT NULL,
    lon         float NOT NULL,
    lat         float NOT NULL,
    entity_id   uuid REFERENCES entities(id) ON DELETE SET NULL,
    sort_order  int NOT NULL DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS story_flow_nodes_story_id_idx ON story_flow_nodes(story_id);

-- ── story_flow_pops ──────────────────────────────────────────────────────────
-- One row per (node, year) — UNIQUE enables clean UPSERT from the editor.
CREATE TABLE IF NOT EXISTS story_flow_pops (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id    uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    node_id     uuid NOT NULL REFERENCES story_flow_nodes(id) ON DELETE CASCADE,
    year        int  NOT NULL,
    count       int,
    label       text,
    created_at  timestamptz DEFAULT now(),
    UNIQUE (node_id, year)
);

CREATE INDEX IF NOT EXISTS story_flow_pops_story_id_idx ON story_flow_pops(story_id);
CREATE INDEX IF NOT EXISTS story_flow_pops_node_id_idx  ON story_flow_pops(node_id);

-- ── story_flow_edges ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_flow_edges (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id      uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    from_node_id  uuid NOT NULL REFERENCES story_flow_nodes(id) ON DELETE CASCADE,
    to_node_id    uuid NOT NULL REFERENCES story_flow_nodes(id) ON DELETE CASCADE,
    volume        int,
    valid_from    int,
    valid_to      int,
    flow_type     text DEFAULT 'displacement',
    label         text,
    created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS story_flow_edges_story_id_idx ON story_flow_edges(story_id);

-- ── Permissions ──────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON story_flow_nodes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON story_flow_pops  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON story_flow_edges TO anon, authenticated;
"""

def main():
    print("Connecting to Supabase…")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    print("Running migration SQL…")
    if DRY_RUN:
        print("--dry-run: SQL not executed.")
        print(SQL)
        conn.close()
        return

    cur.execute(SQL)
    conn.commit()
    conn.close()

    print("Done. Tables created:")
    print("  story_flow_nodes  — geographic locations per story")
    print("  story_flow_pops   — population counts per node × year")
    print("  story_flow_edges  — directed flows with volume + time range")

if __name__ == '__main__':
    main()
