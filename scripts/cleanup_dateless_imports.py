#!/usr/bin/env python3
"""
cleanup_dateless_imports.py

Find and delete entities that were created via CSV import and are linked to a
story but have no date information in their extension tables. These are the
result of the import bug where date fields were written to the wrong column
names (date_start/date_end instead of date_year_start/date_year_end for events,
and birth_year/death_year for persons).

Usage:
    python3 scripts/cleanup_dateless_imports.py --dry-run   # preview only
    python3 scripts/cleanup_dateless_imports.py             # delete with confirmation
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ.get('SUPABASE_DB_URL')
if not DB_URL:
    sys.exit('ERROR: SUPABASE_DB_URL not set in .env')

DRY_RUN = '--dry-run' in sys.argv


def pick_story(cur):
    cur.execute("SELECT id, title FROM stories ORDER BY created_at DESC")
    stories = cur.fetchall()
    if not stories:
        sys.exit("No stories found.")
    print("\nStories:")
    for i, (sid, title) in enumerate(stories):
        print(f"  [{i}] {title}")
        print(f"       id: {sid}")
    choice = input("\nEnter story number: ").strip()
    return stories[int(choice)]


def find_dateless(cur, story_id):
    cur.execute("""
        SELECT e.id, e.name, e.entity_type
        FROM entities e
        JOIN story_entities se ON se.entity_id = e.id AND se.story_id = %s
        JOIN entity_sources es ON es.entity_id = e.id AND es.source_type = 'csv_import'
        WHERE (
            (e.entity_type = 'event' AND NOT EXISTS (
                SELECT 1 FROM events ev
                WHERE ev.entity_id = e.id
                  AND (ev.date_year_start IS NOT NULL OR ev.date_year_end IS NOT NULL)
            ))
            OR
            (e.entity_type = 'person' AND NOT EXISTS (
                SELECT 1 FROM persons p
                WHERE p.entity_id = e.id
                  AND (p.birth_year IS NOT NULL OR p.death_year IS NOT NULL
                       OR p.floruit_start IS NOT NULL OR p.floruit_end IS NOT NULL)
            ))
            OR
            (e.entity_type = 'place' AND NOT EXISTS (
                SELECT 1 FROM places pl
                WHERE pl.entity_id = e.id
                  AND (pl.date_start IS NOT NULL OR pl.date_end IS NOT NULL)
            ))
        )
        ORDER BY e.entity_type, e.name
    """, (story_id,))
    return cur.fetchall()


def delete_entities(cur, ids):
    tables = ['events', 'persons', 'places', 'territories', 'admin_boundaries', 'geo_features']

    cur.execute("DELETE FROM story_entities WHERE entity_id = ANY(%s::uuid[])", (ids,))
    print(f"  story_entities:  {cur.rowcount} rows removed")

    cur.execute("DELETE FROM annotations WHERE entity_id = ANY(%s::uuid[])", (ids,))
    print(f"  annotations:     {cur.rowcount} rows removed")

    cur.execute("DELETE FROM entity_sources WHERE entity_id = ANY(%s::uuid[])", (ids,))
    print(f"  entity_sources:  {cur.rowcount} rows removed")

    for table in tables:
        cur.execute(f"DELETE FROM {table} WHERE entity_id = ANY(%s::uuid[])", (ids,))
        if cur.rowcount:
            print(f"  {table}: {cur.rowcount} rows removed")

    cur.execute("DELETE FROM entities WHERE id = ANY(%s::uuid[])", (ids,))
    print(f"  entities:        {cur.rowcount} rows removed")


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    story_id, story_title = pick_story(cur)
    print(f"\nSelected: {story_title}")

    dateless = find_dateless(cur, story_id)

    if not dateless:
        print("\nNo dateless CSV-imported entities found — nothing to do.")
        conn.close()
        return

    # Group by type for display
    by_type = {}
    for eid, name, etype in dateless:
        by_type.setdefault(etype, []).append((eid, name))

    print(f"\nFound {len(dateless)} dateless CSV-imported entities to remove:\n")
    for etype, items in sorted(by_type.items()):
        print(f"  {etype.upper()} ({len(items)})")
        for _, name in items:
            print(f"    - {name}")

    if DRY_RUN:
        print("\n--dry-run: no changes made.")
        conn.close()
        return

    confirm = input(f"\nDelete all {len(dateless)} entities? Type 'yes' to confirm: ").strip().lower()
    if confirm != 'yes':
        print("Aborted.")
        conn.close()
        return

    ids = [eid for eid, _, _ in dateless]
    print()
    delete_entities(cur, ids)
    conn.commit()
    print(f"\nDone. {len(dateless)} entities cleaned up.")
    conn.close()


if __name__ == '__main__':
    main()
