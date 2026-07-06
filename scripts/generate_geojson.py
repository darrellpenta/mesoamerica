"""
Regenerates all GeoJSON files in public/data/ from Supabase.

Queries each layer by layer_id, joins to the appropriate extension table,
and writes a GeoJSON FeatureCollection to public/data/<layer_id>.geojson.

Run locally:
    python3 scripts/generate_geojson.py

Run in CI (uses SUPABASE_DB_URL env var from GitHub Secrets):
    python3 scripts/generate_geojson.py
"""

import json
import os
import sys
from datetime import datetime, date

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DB_URL   = os.environ.get('SUPABASE_DB_URL')
DATA_DIR = 'public/data'

# One query per extension table — parameterized by layer_id
QUERIES = {
    'place': """
        SELECT e.id          AS _entity_id,
               e.name,
               ST_AsGeoJSON(p.geom) AS geometry,
               p.place_type,
               p.date_start,
               p.date_end,
               p.date_precision,
               p.date_label,
               p.elevation_m
        FROM   public.entities e
        JOIN   public.places   p ON p.entity_id = e.id
        WHERE  e.layer_id = %s
    """,
    'geo_feature': """
        SELECT e.id           AS _entity_id,
               e.name,
               ST_AsGeoJSON(gf.geom) AS geometry,
               gf.feature_type,
               gf.subtype,
               gf.date_start,
               gf.date_end
        FROM   public.entities   e
        JOIN   public.geo_features gf ON gf.entity_id = e.id
        WHERE  e.layer_id = %s
    """,
    'event': """
        SELECT e.id          AS _entity_id,
               e.name,
               ST_AsGeoJSON(ev.geom) AS geometry,
               ev.event_type,
               ev.event_subtype,
               ev.date_ts_start,
               ev.date_year_start,
               ev.date_precision,
               ev.date_label,
               ev.fatalities,
               ev.event_key
        FROM   public.entities e
        JOIN   public.events   ev ON ev.entity_id = e.id
        WHERE  e.layer_id = %s
    """,
    'territory': """
        SELECT e.id          AS _entity_id,
               e.name,
               ST_AsGeoJSON(t.geom) AS geometry,
               t.territory_type,
               t.date_start,
               t.date_end,
               t.date_label
        FROM   public.entities    e
        JOIN   public.territories t ON t.entity_id = e.id
        WHERE  e.layer_id = %s
    """,
    'admin_boundary': """
        SELECT e.id          AS _entity_id,
               e.name,
               ST_AsGeoJSON(ab.geom) AS geometry,
               ab.admin_level,
               ab.iso_code
        FROM   public.entities        e
        JOIN   public.admin_boundaries ab ON ab.entity_id = e.id
        WHERE  e.layer_id = %s
    """,
}


def serialize(value):
    """Convert psycopg2 types to JSON-safe primitives."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def fetch_layer(cur, layer_id, entity_type):
    query = QUERIES.get(entity_type)
    if not query:
        print(f'  WARN: no query for entity_type "{entity_type}"', file=sys.stderr)
        return None

    cur.execute(query, (layer_id,))
    rows = cur.fetchall()
    cols = [desc[0] for desc in cur.description]

    features = []
    for row in rows:
        record = dict(zip(cols, row))
        geom = json.loads(record.pop('geometry') or 'null')
        if geom is None:
            continue
        props = {k: serialize(v) for k, v in record.items()}
        props['_entity_id'] = str(props['_entity_id'])
        features.append({
            'type':       'Feature',
            'id':         props['_entity_id'],
            'geometry':   geom,
            'properties': props,
        })

    return {'type': 'FeatureCollection', 'features': features}


def main():
    if not DB_URL:
        sys.exit('ERROR: SUPABASE_DB_URL not set')

    conn = psycopg2.connect(DB_URL)
    os.makedirs(DATA_DIR, exist_ok=True)

    with conn.cursor() as cur:
        # Load all layer definitions
        cur.execute('SELECT id, entity_type FROM public.layer_definitions ORDER BY display_order')
        layers = cur.fetchall()

    written = 0
    errors  = 0

    for layer_id, entity_type in layers:
        out_path = os.path.join(DATA_DIR, f'{layer_id}.geojson')

        with conn.cursor() as cur:
            try:
                fc = fetch_layer(cur, layer_id, entity_type)
            except Exception as e:
                print(f'  ERROR {layer_id}: {e}', file=sys.stderr)
                errors += 1
                continue

        if fc is None:
            continue

        with open(out_path, 'w') as f:
            json.dump(fc, f)

        n = len(fc['features'])
        print(f'  {layer_id}: {n:,} features → {out_path}')
        written += 1

    conn.close()
    print(f'\n{written} files written, {errors} errors')
    if errors:
        sys.exit(1)


if __name__ == '__main__':
    main()
