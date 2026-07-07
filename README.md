# Mesoamerica Interactive Map

An interactive map of Mesoamerica built with React, Mapbox GL JS, and Supabase. Covers archaeology, ecology, history, and modern data across 39 thematic layers with a relational knowledge graph of historical entities and relationships.

**Live site:** https://darrellpenta.github.io/mesoamerica/  
**Repo:** https://github.com/darrellpenta/mesoamerica-fresh  
**Working directory:** `~/mesoamerica-fresh`

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 + Mapbox GL JS v3 |
| Database | Supabase (Postgres + PostGIS) |
| Hosting | GitHub Pages via GitHub Actions |
| Draw tools | `@mapbox/mapbox-gl-draw` |
| Routing | React Router v7 (HashRouter) |
| Supabase client | `@supabase/supabase-js` v2 |

---

## Three-Tier Architecture

```
Supabase (Postgres + PostGIS)
  ↓  [build time]
GitHub Actions: scripts/generate_geojson.py
  → public/data/*.geojson  (39 files, one per layer)
  ↓  [vite build]
React + Mapbox GL JS
  → dist/  →  GitHub Pages
```

**Supabase is the single source of truth.** The GeoJSON files in `public/data/` are build artifacts — regenerated fresh on every deploy from the database. The app also queries Supabase directly at runtime for entity relationships and the Admin/Timeline pages.

---

## Frontend Routes

The app uses `HashRouter` (required for GitHub Pages):

| Route | Component | Description |
|-------|-----------|-------------|
| `/#/` | `src/App.jsx` | Interactive map with 39 layers |
| `/#/timeline` | `src/pages/TimelinePage.jsx` | SVG timeline of 92 historical rulers |
| `/#/admin` | `src/pages/AdminPage.jsx` | Entity browser + relationship editor |

---

## Data Layers (39 total)

Layers are defined in `src/layers/index.js` (frontend registry) and mirrored in the `layer_definitions` table in Supabase. Each GeoJSON file in `public/data/` corresponds to one layer.

### Point layers (14)

| Layer ID | Description |
|----------|-------------|
| `sites` | Major archaeological sites |
| `mayan-sites` | Maya-specific sites |
| `maya-inscriptions` | Inscription locations |
| `inah-archaeological-zones` | INAH-registered zones (Mexico) |
| `volcanoes` | Active/historic volcanoes |
| `earthquakes` | Seismic events |
| `conflict-events` | ACLED armed conflict data |
| `unesco-world-heritage` | UNESCO WH sites |
| `aztec-villages` | Aztec settlement locations |
| `ramsar-wetlands` | Ramsar-designated wetlands |
| `lidar-surveys-opentopography` | LiDAR survey points |
| `pulltrouser-swamp-points` | Pulltrouser Swamp survey points |
| `becan-points` | Becan site survey points |
| `culturally-significant-species` | Species occurrence records |

### Polygon / line layers (25)

`classical-empires`, `postclassical-empires`, `maya-culture-areas`, `language-families`, `language-dialects`, `ecoregions`, `protected-areas`, `lidar-coverage`, `lidar-coverage-2022`, `pacunam-survey-units`, `maya-settlement-groups`, `becan`, `pulltrouser-swamp`, `urban-areas`, `admin2-boundaries`, `coral-reefs`, `major-lakes`, `major-rivers`, `major-roads`, `faults-central-america`, `faults-mexico`, `hurricane-tracks`, `mangroves-2020`, `la-milpa`, `artifacts`

---

## Database Schema

Project URL: `https://vqovdkjdawqdpzxomsiw.supabase.co`

### Core tables

```
sources            — citation provenance for entities and relationships
entities           — base registry (every entity has a row here)
  ├── places       — point geometry, archaeological/historic sites
  ├── geo_features — natural features (rivers, lakes, volcanoes, coral reefs…)
  ├── territories  — time-bounded political/cultural polygons
  ├── admin_boundaries — modern country/state/municipality polygons
  ├── events       — discrete occurrences (battles, eruptions, conflicts)
  └── persons      — historical figures (rulers, explorers, leaders)
relationships      — typed, time-bounded edges between any two entities
layer_definitions  — map layer configuration (mirrors src/layers/index.js)
```

### entities table

```sql
id          uuid PRIMARY KEY
entity_type text  -- 'place' | 'geo_feature' | 'territory' | 'admin_boundary'
                  -- | 'person' | 'event'
name        text NOT NULL
source_id   uuid REFERENCES sources(id)
layer_id    text REFERENCES layer_definitions(id)  -- added for build-time GeoJSON generation
```

### relationships table

```sql
id             uuid PRIMARY KEY
from_entity_id uuid REFERENCES entities(id)
to_entity_id   uuid REFERENCES entities(id)
relation_type  text  -- 'RULED' | 'FOUNDED' | 'TRADED_WITH' | 'ALLIED_WITH'
                     -- | 'DEFEATED' | 'SUCCEEDED' | 'LOCATED_IN'
valid_from     int   -- year (negative = BCE)
valid_to       int
source_id      uuid REFERENCES sources(id)
notes          text
```

### Current data inventory

| Entity type | Count |
|-------------|-------|
| places | 2,642 |
| events | 12,781 |
| territories | 7,157 |
| admin_boundaries | 3,636 |
| geo_features | 35,314 |
| persons | 92 |
| **Total entities** | **~61,600** |
| **Relationships** | **145** |

The 92 persons are Maya and Aztec rulers seeded from Wikidata (see `scripts/seed_from_wikidata.py`). Cities covered: Palenque (19), Copán (19), Tenochtitlan (21), Calakmul (15), Piedras Negras (12), Yaxchilan (6).

### RLS policies

All tables have permissive RLS (personal project — anon key is the only auth layer):
```sql
CREATE POLICY "public_all" ON <table> FOR ALL USING (true) WITH CHECK (true);
```

---

## Key Frontend Patterns

### `callbacksRef` in MapView

Mapbox event handlers are closures set up once on map load. To keep them current without recreating the map, all callbacks are stored in a ref and read at call time:

```js
// In MapView.jsx — sync on every render
callbacksRef.current = { onMapClick, onFeatureClick, onFeatureDrawn, ... }

// In Mapbox event handler (closure from map load)
map.on('click', e => callbacksRef.current.onMapClick(features, e.lngLat))
```

Any new prop passed to `MapView` that's used inside a Mapbox event handler must be added to `callbacksRef.current`.

### `useImperativeHandle` + `forwardRef` in MapView

Imperative map operations are exposed to `App.jsx` via ref:

```js
useImperativeHandle(ref, () => ({
  syncLayerOrder,   // called after layer reorder
  getReEditFeature, // returns edited feature geometry
  fitToFeature,     // flies to a feature's bbox
}))
```

### Detail panel entity lookup

When a clicked feature has `_entity_id` in its properties, `DetailPanel.jsx` queries Supabase for the entity's extension data and relationships. The FK `persons.entity_id → entities.id` is only recognized by PostgREST from the child side — queries must go `FROM persons` not `FROM entities JOIN persons`:

```js
// Works
supabase.from('persons').select('*, entity:entity_id(name)').eq('entity_id', id)

// Doesn't work (FK not inferred this direction)
supabase.from('entities').select('*, persons(*)').eq('id', id)
```

### `base: './'` in vite.config.js

All asset paths are relative (`./assets/...`). This is required for GitHub Pages subdirectory hosting. **Do not change this to an absolute path** — it will break the deployed site.

### `.env.production` for Supabase vars

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are committed in `.env.production` (safe — the anon key is a public browser credential). They are **not** in GitHub Secrets because GitHub Actions would inject empty strings that override the file. `VITE_MAPBOX_TOKEN` is in GitHub Secrets only and is not committed.

---

## Environment Variables

### `.env` (local only, gitignored)

```
VITE_MAPBOX_TOKEN=pk.eyJ...          # Mapbox GL public token
VITE_SUPABASE_URL=https://...        # Supabase project URL
VITE_SUPABASE_ANON_KEY=eyJ...        # Supabase anon key
SUPABASE_DB_URL=postgres://...       # Direct DB connection (scripts only)
```

### `.env.production` (committed)

```
VITE_SUPABASE_URL=https://vqovdkjdawqdpzxomsiw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### GitHub Secrets (repo → Settings → Secrets → Actions)

| Secret | Used by |
|--------|---------|
| `VITE_MAPBOX_TOKEN` | `npm run build` |
| `SUPABASE_DB_URL` | `scripts/generate_geojson.py` |

---

## CI/CD — GitHub Actions

File: `.github/workflows/deploy.yml`

On every push to `main`:

1. **Python setup** — installs `psycopg2-binary`, `python-dotenv`
2. **`scripts/generate_geojson.py`** — queries Supabase via `SUPABASE_DB_URL`, regenerates all 39 GeoJSON files in `public/data/`
3. **`npm run build`** — Vite build with `VITE_MAPBOX_TOKEN` injected; Supabase vars come from `.env.production`
4. **Deploy** — uploads `dist/` to GitHub Pages

---

## Scripts Reference

| Script | Purpose | Run how |
|--------|---------|---------|
| `scripts/generate_geojson.py` | Regenerate all `public/data/*.geojson` from Supabase | Automatically in CI; locally with `SUPABASE_DB_URL` in `.env` |
| `scripts/migrate_point_layers.py` | One-time: migrated 14 point layer GeoJSON files into Supabase | Already run |
| `scripts/migrate_poly_layers.py` | One-time: migrated 25 polygon/line layer GeoJSON files into Supabase | Already run |
| `scripts/backfill_layer_id.py` | One-time: set `entities.layer_id` from GeoJSON `_entity_id` values | Already run |
| `scripts/seed_from_wikidata.py` | Seed rulers from `scripts/wp_rulers_enriched.json` into Supabase | `python3 scripts/seed_from_wikidata.py [--dry-run] [--fix-rels]` |
| `scripts/add_layer_id.sql` | Added `layer_id` column to entities table | Already run in Supabase SQL Editor |
| `scripts/phase1_schema.sql` | Initial schema creation | Already run |
| `scripts/phase1_seed.sql` | Seed `layer_definitions` table | Already run |
| `scripts/create_annotations_table.sql` | Create `annotations` table for admin freeform notes | **Run in Supabase SQL Editor** |

---

## Local Development

```bash
cd ~/mesoamerica-fresh
npm install
npm run dev       # starts at http://localhost:5173
```

Requires `.env` with `VITE_MAPBOX_TOKEN` (minimum). Without Supabase vars, the app runs with `supabase = null` — the map and draw tools work, but the entity sidebar, Timeline, and Admin pages show no data.

To regenerate GeoJSON locally (requires `SUPABASE_DB_URL` in `.env`):
```bash
python3 scripts/generate_geojson.py
```

---

## Feature Status

### Implemented

- **39-layer map** — toggle visibility, drag to reorder, citation panel on activation
- **Click → What's Here** — cross-layer feature summary on map click
- **Entity detail panel** — shows feature properties + Supabase relationship data (rulers, connections) when feature has `_entity_id`
- **Draw tools** — polygon/point drawing, freehand mode, undo/redo, snap-to-boundary, region-build mode, image overlay, vertex re-edit
- **User layers** — persistent to localStorage, export/import GeoJSON
- **Timeline** (`/#/timeline`) — SVG timeline of 92 rulers grouped by city, with birth/reign date bars
- **Admin — Entity Record** — master/detail layout; clicking an entity shows full record with extension fields, relationships (in/out), geo connections, and a reign-period sparkline for persons
- **Admin — Inline editing** — edit entity name in-place; edit all extension fields (persons dates, place type, etc.) via section edit mode; upserts extension table row
- **Admin — Relationship management** — collapsible add-relationship form with entity search, direction, type, date range, and notes; delete relationships
- **Admin — Annotations** — freeform key-value notes on any entity (text/number/date/url/markdown types); click-to-edit values; requires `annotations` table migration (see below)
- **Admin — Create entity** — "+ New" button with live duplicate detection; opens entity record after creation
- **Admin — Suggested connections** — surfaces co-rulers and name-similar entities not yet linked; inline quick-connect form per suggestion
- **Knowledge graph** — 92 rulers seeded from Wikidata with RULED relationships to cities

### Not Yet Implemented

- Admin point placement (drop a new point on the map from the admin interface)
- Timeline filtering by time period / entity type beyond city grouping
- Polity, culture, time_period entity types (schema supports them; no data seeded)
- Wikipedia/external content integration in the sidebar panel

---

## Resuming with Claude Code

To re-engage on this project, paste this file into a new Claude Code session. Key things Claude needs to know:

- The working directory is `~/mesoamerica-fresh`
- Supabase project: `https://vqovdkjdawqdpzxomsiw.supabase.co`
- The anon key is in `.env` and `.env.production`; the direct DB URL is in `.env` only
- GeoJSON files in `public/data/` are build artifacts — edit data in Supabase, not the files
- `entities.layer_id` is how `generate_geojson.py` knows which entities belong to which layer
- PostgREST FK joins only work from the child table side (see Key Frontend Patterns above)
- `HashRouter` is used — all routes are `/#/path`
- The `callbacksRef` pattern is used in `MapView.jsx` — read the section above before adding new props
