"""
Phase III migration — polygon and line layers into Supabase entity tables.

Extension tables: territories, admin_boundaries, geo_features (polygon/line)

Usage (run from mesoamerica-fresh/):
    python3 scripts/migrate_poly_layers.py classical-empires
    python3 scripts/migrate_poly_layers.py --all
    python3 scripts/migrate_poly_layers.py --list
"""

import json
import os
import sys

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DB_URL     = os.environ.get('SUPABASE_DB_URL')
DATA_DIR   = 'public/data'
BATCH_SIZE = 500


# ── Helpers ────────────────────────────────────────────────────────────────

def geom_json(feature):
    return json.dumps(feature['geometry'])


# ── Layer configurations ───────────────────────────────────────────────────

# Territories — political / cultural

def cfg_classical_empires(f):
    p = f['properties']
    return {
        'entity_type': 'territory',
        'name':        p.get('name') or 'Unknown Empire',
        'ext_table':   'territories',
        'ext': {'territory_type': 'political'},
    }


def cfg_postclassical_empires(f):
    p = f['properties']
    return {
        'entity_type': 'territory',
        'name':        p.get('name') or 'Unknown Polity',
        'ext_table':   'territories',
        'ext': {'territory_type': 'political'},
    }


def cfg_maya_culture_areas(f):
    p = f['properties']
    return {
        'entity_type': 'territory',
        'name':        p.get('name') or 'Unknown Maya Area',
        'ext_table':   'territories',
        'ext': {'territory_type': 'cultural'},
    }


def cfg_language_families(f):
    p = f['properties']
    return {
        'entity_type': 'territory',
        'name':        p.get('name') or 'Unknown Language Family',
        'ext_table':   'territories',
        'ext': {'territory_type': 'linguistic'},
    }


def cfg_language_dialects(f):
    p = f['properties']
    return {
        'entity_type': 'territory',
        'name':        p.get('title') or p.get('name') or 'Unknown Dialect',
        'ext_table':   'territories',
        'ext': {'territory_type': 'linguistic'},
    }


def cfg_ecoregions(f):
    p = f['properties']
    return {
        'entity_type': 'territory',
        'name':        p.get('ECO_NAME') or 'Unknown Ecoregion',
        'ext_table':   'territories',
        'ext': {'territory_type': 'ecological'},
    }


def cfg_protected_areas(f):
    p = f['properties']
    yr = p.get('STATUS_YR')
    return {
        'entity_type': 'territory',
        'name':        p.get('NAME') or 'Unknown Protected Area',
        'ext_table':   'territories',
        'ext': {
            'territory_type': 'conservation',
            'date_start':     int(yr) if yr else None,
            'date_label':     f"Designated {int(yr)}" if yr else None,
        },
    }


# Territories — survey / archaeological

def cfg_lidar_coverage(f):
    p = f['properties']
    yr = p.get('Year')
    ref = p.get('Reference') or f"LiDAR {p.get('Country', '')} {yr}"
    return {
        'entity_type': 'territory',
        'name':        ref.strip(),
        'ext_table':   'territories',
        'ext': {
            'territory_type': 'survey',
            'date_start':     int(yr) if yr else None,
            'date_label':     str(int(yr)) if yr else None,
        },
    }


def cfg_lidar_coverage_2022(f):
    p = f['properties']
    yr = p.get('Year')
    name = f"LiDAR {p.get('Country', '')} {p.get('Dept', '')} {yr}".strip()
    return {
        'entity_type': 'territory',
        'name':        name or 'LiDAR Survey',
        'ext_table':   'territories',
        'ext': {
            'territory_type': 'survey',
            'date_start':     int(yr) if yr else None,
            'date_label':     str(int(yr)) if yr else None,
        },
    }


def cfg_pacunam_units(f):
    p = f['properties']
    pli = p.get('PLI_ID', '')
    return {
        'entity_type': 'territory',
        'name':        f"PACUNAM Survey Unit {pli}" if pli else 'PACUNAM Survey Unit',
        'ext_table':   'territories',
        'ext': {'territory_type': 'survey'},
    }


def cfg_maya_settlement_groups(f):
    p = f['properties']
    site  = p.get('site', '')
    gtype = p.get('group_type', '')
    name  = f"{site} — {gtype} settlement group" if site else (gtype or 'Settlement Group')
    return {
        'entity_type': 'territory',
        'name':        name,
        'ext_table':   'territories',
        'ext': {'territory_type': 'survey'},
    }


def cfg_becan(f):
    p = f['properties']
    name = p.get('Name') or p.get('Project') or 'Becan Survey Feature'
    return {
        'entity_type': 'territory',
        'name':        name,
        'ext_table':   'territories',
        'ext': {'territory_type': 'survey'},
    }


def cfg_pulltrouser_swamp(f):
    p    = f['properties']
    nm   = p.get('Name', '')
    site = p.get('Site_name', '')
    name = f"{nm} ({site})".strip('() ') if (nm or site) else 'Pulltrouser Swamp Area'
    return {
        'entity_type': 'territory',
        'name':        name,
        'ext_table':   'territories',
        'ext': {'territory_type': 'survey'},
    }


def cfg_urban_areas(f):
    p    = f['properties']
    area = p.get('area_sqkm')
    name = f"Urban Area ({area:.0f} km²)" if area else 'Urban Area'
    return {
        'entity_type': 'territory',
        'name':        name,
        'ext_table':   'territories',
        'ext': {'territory_type': 'cultural'},
    }


# Admin boundaries

def cfg_admin2(f):
    p = f['properties']
    return {
        'entity_type': 'admin_boundary',
        'name':        p.get('shapeName') or 'Unknown Admin Unit',
        'ext_table':   'admin_boundaries',
        'ext': {
            'admin_level': 2,
            'iso_code':    p.get('shapeISO') or p.get('country_iso'),
        },
    }


# Geo features — polygons

def cfg_coral_reefs(f):
    p = f['properties']
    return {
        'entity_type': 'geo_feature',
        'name':        p.get('name') or 'Coral Reef',
        'ext_table':   'geo_features',
        'ext': {'feature_type': 'coral_reef'},
    }


def cfg_major_lakes(f):
    p = f['properties']
    return {
        'entity_type': 'geo_feature',
        'name':        p.get('name') or 'Unnamed Lake',
        'ext_table':   'geo_features',
        'ext': {'feature_type': 'lake'},
    }


# Geo features — lines

def cfg_major_rivers(f):
    p = f['properties']
    hid = p.get('HYRIV_ID', '')
    return {
        'entity_type': 'geo_feature',
        'name':        f"River {hid}" if hid else 'River Segment',
        'ext_table':   'geo_features',
        'ext': {
            'feature_type': 'river',
            'subtype':      str(p['ORD_FLOW']) if p.get('ORD_FLOW') is not None else None,
        },
    }


def cfg_major_roads(f):
    p = f['properties']
    return {
        'entity_type': 'geo_feature',
        'name':        p.get('name') or 'Unnamed Road',
        'ext_table':   'geo_features',
        'ext': {
            'feature_type': 'road',
            'subtype':      p.get('type'),
        },
    }


def cfg_faults_ca(f):
    p = f['properties']
    return {
        'entity_type': 'geo_feature',
        'name':        p.get('name') or p.get('fs_name') or 'Unnamed Fault',
        'ext_table':   'geo_features',
        'ext': {
            'feature_type': 'fault',
            'subtype':      p.get('slip_type'),
        },
    }


def cfg_faults_mx(f):
    p = f['properties']
    return {
        'entity_type': 'geo_feature',
        'name':        p.get('name') or 'Unnamed Fault',
        'ext_table':   'geo_features',
        'ext': {
            'feature_type': 'fault',
            'subtype':      p.get('slip_type'),
        },
    }


def cfg_hurricane_tracks(f):
    p      = f['properties']
    season = p.get('season', '')
    name   = p.get('name', 'UNNAMED')
    label  = f"{name} ({season})" if season else name
    return {
        'entity_type': 'geo_feature',
        'name':        label,
        'ext_table':   'geo_features',
        'ext': {
            'feature_type': 'hurricane_track',
            'date_start':   int(season) if season else None,
            'date_end':     int(season) if season else None,
        },
    }


def cfg_mangroves(f):
    p = f['properties']
    return {
        'entity_type': 'geo_feature',
        'name':        f"Mangrove {p.get('tile', '')}".strip(),
        'ext_table':   'geo_features',
        'ext': {'feature_type': 'mangrove'},
    }


def cfg_la_milpa(f):
    p = f['properties']
    return {
        'entity_type': 'geo_feature',
        'name':        'La Milpa Structure',
        'ext_table':   'geo_features',
        'ext': {
            'feature_type': 'structure',
            'subtype':      p.get('feature_type'),
        },
    }


LAYERS = {
    # Territories
    'classical-empires':      cfg_classical_empires,
    'postclassical-empires':  cfg_postclassical_empires,
    'maya-culture-areas':     cfg_maya_culture_areas,
    'language-families':      cfg_language_families,
    'language-dialects':      cfg_language_dialects,
    'ecoregions':             cfg_ecoregions,
    'protected-areas':        cfg_protected_areas,
    'lidar-coverage':         cfg_lidar_coverage,
    'lidar-coverage-2022':    cfg_lidar_coverage_2022,
    'pacunam-survey-units':   cfg_pacunam_units,
    'maya-settlement-groups': cfg_maya_settlement_groups,
    'becan':                  cfg_becan,
    'pulltrouser-swamp':      cfg_pulltrouser_swamp,
    'urban-areas':            cfg_urban_areas,
    # Admin boundaries
    'admin2-boundaries':      cfg_admin2,
    # Geo features
    'coral-reefs':            cfg_coral_reefs,
    'major-lakes':            cfg_major_lakes,
    'major-rivers':           cfg_major_rivers,
    'major-roads':            cfg_major_roads,
    'faults-central-america': cfg_faults_ca,
    'faults-mexico':          cfg_faults_mx,
    'hurricane-tracks':       cfg_hurricane_tracks,
    'mangroves-2020':         cfg_mangroves,
    'la-milpa':               cfg_la_milpa,
}


# ── Batch insert helpers ───────────────────────────────────────────────────

def insert_entities(cur, rows, source_id):
    values  = [(r['entity_type'], r['name'], source_id) for r in rows]
    results = psycopg2.extras.execute_values(
        cur,
        "INSERT INTO public.entities (entity_type, name, source_id) VALUES %s RETURNING id",
        values,
        fetch=True,
    )
    return [row[0] for row in results]


def insert_territories(cur, rows):
    values = []
    for r in rows:
        e = r['ext']
        values.append((
            r['entity_id'], r['geom_json'],
            e.get('territory_type', 'political'),
            e.get('date_start'), e.get('date_end'), e.get('date_label'),
        ))
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO public.territories
             (entity_id, geom, territory_type, date_start, date_end, date_label)
           VALUES %s""",
        values,
        template="(%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s, %s, %s)",
    )


def insert_admin_boundaries(cur, rows):
    values = []
    for r in rows:
        e = r['ext']
        values.append((
            r['entity_id'], r['geom_json'],
            e.get('admin_level', 2),
            e.get('iso_code'),
        ))
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO public.admin_boundaries
             (entity_id, geom, admin_level, iso_code)
           VALUES %s""",
        values,
        template="(%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s)",
    )


def insert_geo_features(cur, rows):
    values = []
    for r in rows:
        e = r['ext']
        values.append((
            r['entity_id'], r['geom_json'],
            e.get('feature_type', 'unknown'),
            e.get('subtype'),
            e.get('date_start'), e.get('date_end'),
        ))
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO public.geo_features
             (entity_id, geom, feature_type, subtype, date_start, date_end)
           VALUES %s""",
        values,
        template="(%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s, %s, %s)",
    )


EXT_INSERTERS = {
    'territories':      insert_territories,
    'admin_boundaries': insert_admin_boundaries,
    'geo_features':     insert_geo_features,
}


# ── Core migration ─────────────────────────────────────────────────────────

def migrate_layer(conn, layer_id, cfg_fn):
    geojson_path = os.path.join(DATA_DIR, f'{layer_id}.geojson')
    if not os.path.exists(geojson_path):
        print(f'  ERROR: {geojson_path} not found')
        return

    with open(geojson_path) as f:
        data = json.load(f)

    features = data['features']

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
        cur.execute(
            "SELECT source_id FROM public.layer_definitions WHERE id = %s",
            (layer_id,)
        )
        row = cur.fetchone()
        source_id = row[0] if row else None

        inserted = 0
        for batch_start in range(0, total, BATCH_SIZE):
            batch_features = pending[batch_start: batch_start + BATCH_SIZE]

            rows = []
            for feat in batch_features:
                cfg = cfg_fn(feat)
                rows.append({**cfg, 'geom_json': geom_json(feat)})

            entity_ids = insert_entities(cur, rows, source_id)

            ext_table = rows[0]['ext_table']
            for row, eid in zip(rows, entity_ids):
                row['entity_id'] = str(eid)

            EXT_INSERTERS[ext_table](cur, rows)

            for feat, row in zip(batch_features, rows):
                feat['properties']['_entity_id'] = row['entity_id']

            inserted += len(rows)
            if total > BATCH_SIZE:
                print(f'    {inserted:,}/{total:,}…', end='\r')

        conn.commit()

    print(f'  inserted {inserted:,} entities + {ext_table} rows')

    with open(geojson_path, 'w') as f:
        json.dump(data, f)
    print(f'  updated {geojson_path} with _entity_id')


# ── Entry point ────────────────────────────────────────────────────────────

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
