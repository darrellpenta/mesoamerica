"""
Converts a downloaded ACLED CSV into the conflict-events.geojson used by the map.
Preserves event_id_cnty for stable database keying in Phase I migration.

Usage:
    python scripts/prepare_conflict_events.py path/to/acled_download.csv
"""

import json
import sys
import pandas as pd

CENTRAL_AMERICA = {
    'Guatemala', 'Belize', 'Honduras', 'El Salvador',
    'Nicaragua', 'Costa Rica', 'Panama'
}

# Southern Mexican states within the Mesoamerica focus area
MEXICO_STATES = {
    'Chiapas', 'Tabasco', 'Campeche', 'Yucatan', 'Yucatán',
    'Quintana Roo', 'Oaxaca', 'Veracruz', 'Veracruz De Ignacio De La Llave'
}

# Properties to carry into the GeoJSON.
# 'event_id_cnty' is the stable ACLED key — required for Phase I DB migration.
KEEP_PROPS = [
    'event_id_cnty', 'event_date', 'year', 'time_precision',
    'event_type', 'sub_event_type',
    'actor1', 'assoc_actor_1', 'actor2', 'assoc_actor_2',
    'country', 'admin1', 'admin2', 'location',
    'geo_precision', 'fatalities', 'notes', 'source',
]


def load(path):
    try:
        return pd.read_csv(path, low_memory=False)
    except Exception as e:
        sys.exit(f"Could not read CSV: {e}")


def filter_rows(df):
    ca = df[df['country'].isin(CENTRAL_AMERICA)]
    mx = df[(df['country'] == 'Mexico') & (df['admin1'].isin(MEXICO_STATES))]
    return pd.concat([ca, mx], ignore_index=True)


def to_geojson(df):
    df = df.dropna(subset=['latitude', 'longitude'])
    features = []
    for _, row in df.iterrows():
        props = {}
        for col in KEEP_PROPS:
            val = row.get(col)
            if pd.isna(val) if not isinstance(val, str) else False:
                props[col] = None
            elif col in ('year', 'fatalities', 'geo_precision', 'time_precision'):
                try:
                    props[col] = int(val)
                except (ValueError, TypeError):
                    props[col] = None
            else:
                props[col] = str(val).strip() if val else None

        features.append({
            'type': 'Feature',
            'id': props.get('event_id_cnty'),
            'geometry': {
                'type': 'Point',
                'coordinates': [float(row['longitude']), float(row['latitude'])]
            },
            'properties': props
        })
    return {'type': 'FeatureCollection', 'features': features}


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python scripts/prepare_conflict_events.py <path_to_acled.csv>")

    path = sys.argv[1]
    print(f"Loading {path}…")
    df = load(path)
    print(f"  {len(df):,} total rows in download")

    df = filter_rows(df)
    print(f"  {len(df):,} rows after Mesoamerica filter")

    # Check the key field is present
    if 'event_id_cnty' not in df.columns:
        print("  WARNING: event_id_cnty column not found — check ACLED download version")
        print(f"  Available columns: {list(df.columns)}")

    geojson = to_geojson(df)
    out = 'public/data/conflict-events.geojson'
    with open(out, 'w') as f:
        json.dump(geojson, f)

    size_mb = len(json.dumps(geojson).encode()) / 1_000_000
    print(f"  Written {len(geojson['features']):,} features → {out} ({size_mb:.1f} MB)")

    # Sanity check
    sample = geojson['features'][0]['properties']
    print(f"\nSample feature properties:")
    for k, v in sample.items():
        print(f"  {k}: {v!r}")


if __name__ == '__main__':
    main()
