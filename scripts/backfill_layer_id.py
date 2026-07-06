"""
Backfills entities.layer_id from the _entity_id values written into each GeoJSON file.

Run once after add_layer_id.sql:
    python3 scripts/backfill_layer_id.py
"""

import json
import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DB_URL   = os.environ.get('SUPABASE_DB_URL')
DATA_DIR = 'public/data'

LAYERS = [
    'sites', 'maya-inscriptions', 'inah-archaeological-zones',
    'volcanoes', 'earthquakes', 'conflict-events',
    'unesco-world-heritage', 'mayan-sites', 'aztec-villages',
    'ramsar-wetlands', 'lidar-surveys-opentopography',
    'pulltrouser-swamp-points', 'becan-points',
    'culturally-significant-species',
    'classical-empires', 'postclassical-empires', 'maya-culture-areas',
    'language-families', 'language-dialects', 'ecoregions',
    'protected-areas', 'lidar-coverage', 'lidar-coverage-2022',
    'pacunam-survey-units', 'maya-settlement-groups',
    'becan', 'pulltrouser-swamp', 'urban-areas',
    'admin2-boundaries', 'coral-reefs', 'major-lakes',
    'major-rivers', 'major-roads', 'faults-central-america',
    'faults-mexico', 'hurricane-tracks', 'mangroves-2020', 'la-milpa',
]


def main():
    conn = psycopg2.connect(DB_URL)
    total_updated = 0

    with conn.cursor() as cur:
        for layer_id in LAYERS:
            path = os.path.join(DATA_DIR, f'{layer_id}.geojson')
            if not os.path.exists(path):
                print(f'  SKIP {layer_id} — file not found')
                continue

            with open(path) as f:
                data = json.load(f)

            ids = [
                feat['properties']['_entity_id']
                for feat in data['features']
                if feat['properties'].get('_entity_id')
            ]

            if not ids:
                print(f'  SKIP {layer_id} — no _entity_id values')
                continue

            cur.execute(
                "UPDATE public.entities SET layer_id = %s WHERE id = ANY(%s::uuid[])",
                (layer_id, ids),
            )
            n = cur.rowcount
            total_updated += n
            print(f'  {layer_id}: {n:,} rows')

    conn.commit()
    conn.close()
    print(f'\nTotal: {total_updated:,} entities updated')


if __name__ == '__main__':
    main()
