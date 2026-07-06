"""
Adds a stable synthetic key to each conflict event in the existing GeoJSON.

Key is a deterministic hash of: event_date + event_type + lon + lat
This uniquely identifies each event within this dataset and is stable
across re-runs of this script on the same input file.

Usage:
    python scripts/add_event_keys.py
"""

import json
import hashlib


def base_key(props, coords):
    date  = str(props.get('event_date', ''))
    etype = str(props.get('event_type', ''))
    fatal = str(props.get('fatalities', ''))
    lon   = f"{coords[0]:.6f}"
    lat   = f"{coords[1]:.6f}"
    raw   = f"{date}|{etype}|{fatal}|{lon}|{lat}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]


path = 'public/data/conflict-events.geojson'

with open(path) as f:
    data = json.load(f)

# Count occurrences of each base key to handle true duplicates
from collections import Counter
base_counts = Counter(
    base_key(f['properties'], f['geometry']['coordinates'])
    for f in data['features']
)

seen_counts = {}
assigned = set()

for feature in data['features']:
    bk = base_key(feature['properties'], feature['geometry']['coordinates'])
    if base_counts[bk] == 1:
        key = bk
    else:
        # True duplicate — append sequential suffix
        n = seen_counts.get(bk, 0)
        key = f"{bk}_{n}"
        seen_counts[bk] = n + 1
    assigned.add(key)
    feature['properties']['event_key'] = key
    feature['id'] = key

with open(path, 'w') as f:
    json.dump(data, f)

true_dupes = sum(1 for c in base_counts.values() if c > 1)
print(f"Processed {len(data['features']):,} features")
print(f"Unique keys assigned: {len(assigned):,}")
print(f"Groups with true duplicates: {true_dupes} (suffixed _0, _1, …)")
