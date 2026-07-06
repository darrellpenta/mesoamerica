"""
Phase II migration — point layers into Supabase entity tables.

Handles: sites, maya-inscriptions, inah-archaeological-zones,
         volcanoes, earthquakes, conflict-events

For each layer:
  1. Inserts rows into `entities`
  2. Inserts rows into the appropriate extension table (places / geo_features / events)
  3. Writes _entity_id back into the GeoJSON file for map-side lookups

Usage (run from mesoamerica-fresh/):
    python3 scripts/migrate_point_layers.py sites
    python3 scripts/migrate_point_layers.py --all
    python3 scripts/migrate_point_layers.py --list
"""

import json
import os
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DB_URL     = os.environ.get('SUPABASE_DB_URL')
DATA_DIR   = 'public/data'
BATCH_SIZE = 500


# ── Helpers ────────────────────────────────────────────────────────────────

def parse_date(date_str):
    """Parse YYYY-MM-DD string to aware datetime, or None."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def parse_epoch_ms(ms):
    """Convert millisecond epoch to aware datetime, or None."""
    if ms is None:
        return None
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc)
    except (ValueError, OSError):
        return None


def geom_json(feature):
    """Return the geometry dict as a JSON string for ST_GeomFromGeoJSON."""
    return json.dumps(feature['geometry'])


# ── Layer configurations ───────────────────────────────────────────────────

def cfg_sites(f):
    p = f['properties']
    return {
        'entity_type': 'place',
        'name':        p.get('name') or 'Unknown Site',
        'ext_table':   'places',
        'ext': {
            'place_type':     'archaeological_site',
            'date_label':     p.get('period'),
            'date_precision': 'approximate' if p.get('period') else 'unknown',
        },
    }


def cfg_maya_inscriptions(f):
    p = f['properties']
    return {
        'entity_type': 'place',
        'name':        p.get('name') or 'Unknown Site',
        'ext_table':   'places',
        'ext': {
            'place_type':     'archaeological_site',
            'date_precision': 'period_only',
        },
    }


def cfg_inah(f):
    p = f['properties']
    return {
        'entity_type': 'place',
        'name':        p.get('name') or 'Unknown Zone',
        'ext_table':   'places',
        'ext': {
            'place_type':     'archaeological_site',
            'date_precision': 'unknown',
        },
    }


def cfg_volcanoes(f):
    p = f['properties']
    return {
        'entity_type': 'geo_feature',
        'name':        p.get('Volcano_Name') or 'Unknown Volcano',
        'ext_table':   'geo_features',
        'ext': {
            'feature_type': 'volcano',
            'subtype':      p.get('Primary_Volcano_Type'),
        },
    }


def cfg_earthquakes(f):
    p   = f['properties']
    dt  = parse_epoch_ms(p.get('time'))
    mag = p.get('mag')
    return {
        'entity_type': 'event',
        'name':        p.get('place') or f"Earthquake {dt.year if dt else ''}",
        'ext_table':   'events',
        'ext': {
            'event_type':     'natural_disaster',
            'event_subtype':  'earthquake',
            'date_ts_start':  dt,
            'date_year_start': dt.year if dt else None,
            'date_precision': 'exact',
            'date_label':     dt.strftime('%Y-%m-%d') if dt else None,
            'notes':          f"Magnitude {mag}" if mag else None,
        },
    }


def cfg_conflict(f):
    p    = f['properties']
    dt   = parse_date(p.get('event_date'))
    yr   = int(p['event_date'][:4]) if p.get('event_date') else None
    etype = p.get('event_type', 'Conflict')
    return {
        'entity_type': 'event',
        'name':        f"{etype} — {p.get('event_date', '')}",
        'ext_table':   'events',
        'ext': {
            'event_type':     'conflict',
            'event_subtype':  etype,
            'date_ts_start':  dt,
            'date_year_start': yr,
            'date_precision': 'exact',
            'date_label':     p.get('event_date'),
            'fatalities':     p.get('fatalities'),
            'event_key':      p.get('event_key'),
        },
    }


def cfg_unesco(f):
    p = f['properties']
    yr = p.get('date_inscribed')
    return {
        'entity_type': 'place',
        'name':        p.get('name') or 'Unknown Heritage Site',
        'ext_table':   'places',
        'ext': {
            'place_type':     'heritage_site',
            'date_start':     int(yr) if yr else None,
            'date_label':     f"Inscribed {int(yr)}" if yr else None,
            'date_precision': 'exact' if yr else 'unknown',
        },
    }


def cfg_mayan_sites(f):
    p = f['properties']
    return {
        'entity_type': 'place',
        'name':        p.get('name') or 'Unknown Maya Site',
        'ext_table':   'places',
        'ext': {
            'place_type':     'archaeological_site',
            'date_precision': 'period_only',
        },
    }


def cfg_aztec_villages(f):
    p = f['properties']
    return {
        'entity_type': 'place',
        'name':        p.get('name') or 'Unknown Settlement',
        'ext_table':   'places',
        'ext': {
            'place_type':     'historic_city',
            'date_precision': 'period_only',
        },
    }


def cfg_ramsar(f):
    p = f['properties']
    return {
        'entity_type': 'geo_feature',
        'name':        p.get('official_name_e') or 'Unknown Wetland',
        'ext_table':   'geo_features',
        'ext': {
            'feature_type': 'wetland',
            'subtype':      'ramsar',
        },
    }


def cfg_lidar_opentopo(f):
    p = f['properties']
    return {
        'entity_type': 'place',
        'name':        p.get('name') or 'Unknown LiDAR Survey',
        'ext_table':   'places',
        'ext': {
            'place_type':     'survey_area',
            'date_label':     p.get('dateCollected'),
            'date_precision': 'exact' if p.get('dateCollected') else 'unknown',
        },
    }


def cfg_pulltrouser_points(f):
    p = f['properties']
    return {
        'entity_type': 'place',
        'name':        p.get('Name') or 'Unknown Structure',
        'ext_table':   'places',
        'ext': {
            'place_type':     'structure',
            'date_precision': 'period_only',
        },
    }


def cfg_becan_points(f):
    p = f['properties']
    num = p.get('Str_numb', '')
    return {
        'entity_type': 'place',
        'name':        f"Becan Structure {num}" if num else 'Becan Structure',
        'ext_table':   'places',
        'ext': {
            'place_type':     'structure',
            'date_precision': 'period_only',
        },
    }


def cfg_species(f):
    p = f['properties']
    return {
        'entity_type': 'geo_feature',
        'name':        p.get('species') or 'Unknown Species Occurrence',
        'ext_table':   'geo_features',
        'ext': {
            'feature_type': 'species_occurrence',
            'subtype':      p.get('species', '').split()[0] if p.get('species') else None,
        },
    }


LAYERS = {
    'sites':                        cfg_sites,
    'maya-inscriptions':            cfg_maya_inscriptions,
    'inah-archaeological-zones':    cfg_inah,
    'volcanoes':                    cfg_volcanoes,
    'earthquakes':                  cfg_earthquakes,
    'conflict-events':              cfg_conflict,
    'unesco-world-heritage':        cfg_unesco,
    'mayan-sites':                  cfg_mayan_sites,
    'aztec-villages':               cfg_aztec_villages,
    'ramsar-wetlands':              cfg_ramsar,
    'lidar-surveys-opentopography': cfg_lidar_opentopo,
    'pulltrouser-swamp-points':     cfg_pulltrouser_points,
    'becan-points':                 cfg_becan_points,
    'culturally-significant-species': cfg_species,
}


# ── Batch insert helpers ───────────────────────────────────────────────────

def insert_entities(cur, rows, source_id):
    """Insert entity rows and return list of UUIDs in input order."""
    values = [(r['entity_type'], r['name'], source_id) for r in rows]
    results = psycopg2.extras.execute_values(
        cur,
        "INSERT INTO public.entities (entity_type, name, source_id) "
        "VALUES %s RETURNING id",
        values,
        fetch=True,
    )
    return [row[0] for row in results]


def insert_places(cur, rows):
    values = []
    for r in rows:
        e = r['ext']
        values.append((
            r['entity_id'],
            r['geom_json'],
            e.get('place_type', 'place'),
            e.get('date_start'),
            e.get('date_end'),
            e.get('date_precision', 'unknown'),
            e.get('date_label'),
            e.get('elevation_m'),
        ))
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO public.places
             (entity_id, geom, place_type, date_start, date_end,
              date_precision, date_label, elevation_m)
           VALUES %s""",
        values,
        template=(
            "(%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s, %s, %s, %s, %s)"
        ),
    )


def insert_geo_features(cur, rows):
    values = []
    for r in rows:
        e = r['ext']
        values.append((
            r['entity_id'],
            r['geom_json'],
            e.get('feature_type', 'unknown'),
            e.get('subtype'),
            e.get('date_start'),
            e.get('date_end'),
        ))
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO public.geo_features
             (entity_id, geom, feature_type, subtype, date_start, date_end)
           VALUES %s""",
        values,
        template="(%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s, %s, %s)",
    )


def insert_events(cur, rows):
    values = []
    for r in rows:
        e = r['ext']
        values.append((
            r['entity_id'],
            r['geom_json'],
            e.get('event_type', 'unknown'),
            e.get('event_subtype'),
            e.get('date_ts_start'),
            e.get('date_ts_end'),
            e.get('date_year_start'),
            e.get('date_year_end'),
            e.get('date_precision', 'approximate'),
            e.get('date_label'),
            e.get('fatalities'),
            e.get('actor_name'),
            e.get('event_key'),
            e.get('notes'),
        ))
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO public.events
             (entity_id, geom, event_type, event_subtype,
              date_ts_start, date_ts_end, date_year_start, date_year_end,
              date_precision, date_label, fatalities, actor_name, event_key, notes)
           VALUES %s""",
        values,
        template=(
            "(%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s, "
            "%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
        ),
    )


EXT_INSERTERS = {
    'places':       insert_places,
    'geo_features': insert_geo_features,
    'events':       insert_events,
}


# ── Core migration ────────────────────────────────────────────────────────

def migrate_layer(conn, layer_id, cfg_fn):
    geojson_path = os.path.join(DATA_DIR, f'{layer_id}.geojson')
    if not os.path.exists(geojson_path):
        print(f'  ERROR: {geojson_path} not found')
        return

    with open(geojson_path) as f:
        data = json.load(f)

    features = data['features']

    # Skip features already migrated (idempotency — safe to re-run)
    pending = [f for f in features if not f['properties'].get('_entity_id')]
    already = len(features) - len(pending)
    if already:
        print(f'  {already:,} already migrated, skipping')
    if not pending:
        print('  nothing to do')
        return

    total = len(pending)
    print(f'  {total:,} features to insert')

    with conn.cursor() as cur:
        # Look up source_id from layer_definitions
        cur.execute(
            "SELECT source_id FROM public.layer_definitions WHERE id = %s",
            (layer_id,)
        )
        row = cur.fetchone()
        source_id = row[0] if row else None

        inserted = 0
        for batch_start in range(0, total, BATCH_SIZE):
            batch_features = pending[batch_start: batch_start + BATCH_SIZE]

            # Build enriched rows
            rows = []
            for feat in batch_features:
                cfg    = cfg_fn(feat)
                rows.append({
                    **cfg,
                    'geom_json': geom_json(feat),
                })

            # Insert entities → get UUIDs
            entity_ids = insert_entities(cur, rows, source_id)

            # Attach UUIDs and insert into extension table
            ext_table = rows[0]['ext_table']
            for row, eid in zip(rows, entity_ids):
                row['entity_id'] = str(eid)

            EXT_INSERTERS[ext_table](cur, rows)

            # Write entity_id back into GeoJSON features
            for feat, row in zip(batch_features, rows):
                feat['properties']['_entity_id'] = row['entity_id']

            inserted += len(rows)
            if total > BATCH_SIZE:
                print(f'    {inserted:,}/{total:,}…', end='\r')

        conn.commit()

    print(f'  inserted {inserted:,} entities + {ext_table} rows')

    # Save updated GeoJSON (with _entity_id on each feature)
    with open(geojson_path, 'w') as f:
        json.dump(data, f)
    print(f'  updated {geojson_path} with _entity_id')


# ── Entry point ───────────────────────────────────────────────────────────

def main():
    if not DB_URL:
        sys.exit('ERROR: SUPABASE_DB_URL not set in .env')

    args = sys.argv[1:]
    if not args or '--help' in args:
        print(__doc__)
        return

    if '--list' in args:
        print('Available layers:')
        for k in LAYERS:
            print(f'  {k}')
        return

    targets = list(LAYERS.keys()) if '--all' in args else args

    for layer_id in targets:
        if layer_id not in LAYERS:
            print(f'Unknown layer: {layer_id}. Run --list to see options.')
            continue
        print(f'\n→ {layer_id}')
        try:
            conn = psycopg2.connect(DB_URL)
            migrate_layer(conn, layer_id, LAYERS[layer_id])
            conn.close()
        except Exception as e:
            print(f'  ERROR: {e}')
            if 'conn' in dir():
                conn.rollback()
                conn.close()


if __name__ == '__main__':
    main()
