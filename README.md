# Mesoamerica Interactive Map

An interactive historical/geographic map of Mesoamerica built with React, Mapbox GL JS, and Supabase. Covers archaeology, ecology, linguistics, conflict, and modern administrative data across 39 thematic layers, plus a multi-entity timeline and a full-featured entity knowledge-graph editor.

**Live site:** https://darrellpenta.github.io/mesoamerica/
**Repo:** https://github.com/darrellpenta/mesoamerica
**Working directory (local):** `~/mesoamerica-fresh`

> **For Claude Code:** start every session from `~/mesoamerica-fresh`. For git commands, use `git -C /Users/darrell.penta/mesoamerica-fresh` because the shell's working directory may be the home folder.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 + Mapbox GL JS v3 |
| Database | Supabase (Postgres + PostGIS) |
| Hosting | GitHub Pages via GitHub Actions |
| Draw tools | `@mapbox/mapbox-gl-draw` v1.5 |
| Routing | React Router v7 — `HashRouter` (required for GitHub Pages) |
| Supabase client | `@supabase/supabase-js` v2 |

---

## Data Architecture

```
Supabase (Postgres + PostGIS)          ← runtime queries (Admin, Timeline, Detail panel)
  ↓  [CI: scripts/generate_geojson.py]
public/data/*.geojson                  ← 39 files, build artifacts, regenerated on deploy
  ↓  [vite build]
dist/  →  GitHub Pages
```

**Supabase is the single source of truth for entity data.** GeoJSON files in `public/data/` are build artifacts — do not edit them directly for entity data. However, some GeoJSON files also carry **computed color properties** added by `scripts/add_feature_colors.py` (see Auto-Color System below); those are committed and treated as stable preprocessing outputs.

**Supabase project URL:** `https://vqovdkjdawqdpzxomsiw.supabase.co`

---

## Frontend Routes

All routes use `HashRouter` — paths are `/#/path`.

| Route | Component | Description |
|-------|-----------|-------------|
| `/#/` | `src/App.jsx` | Interactive map with 39 layers |
| `/#/timeline` | `src/pages/TimelinePage.jsx` | Multi-entity historical timeline |
| `/#/admin` | `src/pages/AdminPage.jsx` | Entity browser + knowledge-graph editor |

---

## UI Theme — Light Mode

The entire app uses a light CSS palette (set in `src/App.css`):

| Token | Value | Used for |
|-------|-------|---------|
| `--bg-page` | `#f5f7fb` | Page background |
| `--bg-panel` | `#ffffff` | Panels, cards |
| `--text` | `#1a1d2e` | Body text |
| `--accent` | `#2563eb` | Primary CTAs, active nav |
| `--warm` | `#e85d04` | Secondary accent |
| `--border` | `#e0e4f0` | Dividers |

---

## Admin Password Protection

`/#/admin` is gated by `AdminAuthGate` in `src/main.jsx`:

```js
const ADMIN_PW = 'mesoamerica2026'
// Stores 'yes' in localStorage['admin-authed-v1'] on success
```

To change the password, edit the `ADMIN_PW` constant in `src/main.jsx`.

---

## Database Schema

### Core tables

```
sources            — citation provenance
entities           — base registry (id, entity_type, name, source_id, layer_id)
  ├── places       — point geometry, archaeological/historic sites
  ├── geo_features — natural features
  ├── territories  — time-bounded political/cultural polygons
  ├── admin_boundaries — modern administrative polygons
  ├── events       — discrete occurrences (battles, eruptions, conflicts)
  └── persons      — historical figures (rulers, explorers, leaders)
relationships      — typed, time-bounded edges between entities
layer_definitions  — map layer config (mirrors src/layers/index.js)
annotations        — key-value freeform notes on any entity
```

### Stories tables (narrative platform)

```
stories            — named narrative container (title, description, theme, time_start, time_end)
story_entities     — junction: story_id → entity_id; carries role_in_story and notes
data_requests      — sourcing queue: natural-language prompts submitted by the admin,
                     processed by scripts/source_data.py; status: pending → processing → review → done | failed
staged_imports     — rows staged by source_data.py for human review before committing to entities;
                     carries name, entity_type, dates, description, source_url, confidence,
                     review_status (pending | approved | rejected)
```

Migration scripts (run once, in order):
```bash
python3 scripts/create_stories_schema.py   # stories, story_entities, data_requests
python3 scripts/add_staged_imports.py      # staged_imports
```

### relationships table

```sql
id, from_entity_id, to_entity_id,
relation_type  -- 'RULED' | 'FOUNDED' | 'TRADED_WITH' | 'ALLIED_WITH'
               -- | 'DEFEATED' | 'SUCCEEDED' | 'LOCATED_IN'
valid_from int, valid_to int,   -- year (negative = BCE)
source_id, notes
```

### Current data inventory

| Entity type | Count |
|-------------|-------|
| places | 2,642 |
| events | 12,781 |
| territories | 7,157 |
| admin_boundaries | 3,636 |
| geo_features | 35,314 |
| persons | 112 (92 Maya/Aztec rulers + 20 modern figures) |
| **Total** | **~61,650** |
| **Relationships** | **~195** |

**Person cohorts:**
- 92 Maya/Aztec rulers from Wikidata — Palenque (19), Copán (19), Tenochtitlan (21), Calakmul (15), Piedras Negras (12), Yaxchilan (6)
- 20 modern Central American figures from *The Long Shadow* (Walker, Zemurray, Sandino, Árbenz, Ríos Montt, Romero, D'Aubuisson, Noriega, et al.)

**Events from *The Long Shadow*:** La Matanza (1932), Operation PBSUCCESS (1954), El Mozote Massacre (1981), Río Negro Massacres (1980–82), Gerardi Assassination (1998), Iran-Contra, Panama Invasion, Honduras Coup, and others (date range 1932–2013)

### PostgREST FK join direction

FK joins from the child side only:
```js
// Works — querying from the child table
supabase.from('persons').select('*, entity:entity_id(name)').eq('entity_id', id)

// Does NOT work — PostgREST can't infer the join this direction
supabase.from('entities').select('*, persons(*)').eq('id', id)
```

---

## Timeline Page (`src/pages/TimelinePage.jsx`)

A pure-SVG multi-entity historical timeline. Queries Supabase for 6 entity types and renders them as horizontal bars on a shared year axis.

### Entity types

| Type | Supabase table | Date fields | Color |
|------|---------------|-------------|-------|
| `person` | `persons` | `birth_year`, `death_year`, `floruit_start`, `floruit_end` | `#7c3aed` |
| `event` | `events` | `date_year_start`, `date_year_end` | `#dc2626` |
| `place` | `places` | `date_start`, `date_end` | `#059669` |
| `territory` | `territories` | `date_start`, `date_end` | `#d97706` |
| `admin_boundary` | `admin_boundaries` | `date_start`, `date_end` | `#9333ea` |

Relationships (`relation_type = 'RULED'`) are loaded as a 6th query and shown as thin lines connecting persons to territories.

### Eras

```js
const ERAS = [
  { key: 'all',         label: 'All Eras',    dMin: -800, dMax: 2030 },
  { key: 'preclassic',  label: 'Preclassic',  dMin: -900, dMax:  350, eStart: -800, eEnd:  250 },
  { key: 'classic',     label: 'Classic',     dMin:  150, dMax: 1000, eStart:  250, eEnd:  900 },
  { key: 'postclassic', label: 'Postclassic', dMin:  800, dMax: 1600, eStart:  900, eEnd: 1521 },
  { key: 'colonial',    label: 'Colonial',    dMin: 1450, dMax: 1850, eStart: 1521, eEnd: 1821 },
  { key: 'modern',      label: 'Modern',      dMin: 1800, dMax: 2030, eStart: 1821, eEnd: 2030 },
]
```

`dMin`/`dMax` = display range (with buffer); `eStart`/`eEnd` = historical period boundaries shown as colored bands. Year → pixel x: `yearToX(year, width, dMin, dMax)`. Era boundary lines at 250, 900, 1521, 1821.

---

## Admin Page (`src/pages/AdminPage.jsx`)

Full knowledge-graph editor behind password gate. Two modes: **Entity browser** and **Stories**.

### Entity browser features
- **Dashboard** — entity counts by type, mini sparkline graphs, type-filter pills, browse-by-type without search
- **Entity record** — master/detail; inline name editing; extension field editing (persons dates, place type, etc.)
- **Relationship management** — add/delete typed, time-bounded relationships with entity search
- **Annotations** — freeform key-value notes (text/number/date/url/markdown types)
- **Create entity** — "New" button with live duplicate detection
- **Suggested connections** — surfaces co-rulers and name-similar entities not yet linked

### Stories mode features

Accessed via the "Stories" toggle at the bottom of the entity sidebar. Each story is a named narrative container binding a theme, time range, and a curated set of entities.

- **Story list** — sidebar of all stories; click to open; "New story" button
- **StoryMeta** — editable title, description, theme, time range
- **StoryEntityList** — entities linked to this story via `story_entities`; add with role + notes
- **CSV Import** — upload any CSV, map columns to entity fields (name, type, dates, notes), bulk-create entities and auto-link to story; progress bar + result summary
- **StoryExportPanel** — export story entities as CSV or GeoJSON (properties only, geometry null)
- **DataRequestPanel** — submit natural-language sourcing prompts to the `data_requests` queue; run `source_data.py` offline to process; status badges: pending / processing / review / done / failed
- **StagingReviewPanel** — appears when a request reaches `review` status; shows each staged row with confidence badge (high/medium/low/model_knowledge), approve or reject per row; approve creates entity + extension record + annotation + story link in one shot; "Mark request done" closes the loop

### Data Explorer mode

Accessed via "Data Explorer" in the entity browser sidebar. A self-service query builder for exporting data to R / Python / tidyverse / ggplot.

- **Export tab** — pick entity type, check fields, hit Preview (100 rows via RPC), inspect per-field completeness bars (green ≥90%, amber 50–90%, red <50%), download full CSV (up to 5,000 rows, selected fields only). Geometry fields (`lon`/`lat`) are extracted server-side via `ST_X`/`ST_Y` for points or `ST_Centroid` for polygons.
- **Summarize tab** — database-wide bar chart of entity counts per type; group-by picker for categorical fields (`event_type`, `place_type`, etc.) → grouped count table, exportable as CSV.

Three Supabase RPCs power the explorer (see `scripts/add_explorer_rpcs.py`):

```js
// Export full field set for one entity type (lon/lat extracted from geometry)
supabase.rpc('export_entity_type', { p_type: 'event', p_story_id: null, p_limit: 5000 })
// Returns: [{ row_data: { entity_id, name, event_type, date_year_start, lon, lat, ... } }, ...]

// Count per entity type
supabase.rpc('entity_type_counts')
// Returns: [{ entity_type: 'event', entity_count: 12781 }, ...]

// Grouped count for a categorical field (allowlisted fields only — no SQL injection)
supabase.rpc('entity_field_counts', { p_type: 'event', p_field: 'event_type' })
// Returns: [{ field_value: 'Battles', entity_count: 4201 }, ...]
```

**Geometry extraction rules:**
- `place`, `event` → `ST_X(geom)` / `ST_Y(geom)` (point)
- `geo_feature`, `territory`, `admin_boundary` → `ST_X(ST_Centroid(geom))` / `ST_Y(ST_Centroid(geom))` (polygon centroid)
- Null geom rows get null lon/lat (shown in completeness bars)

### Key Admin patterns

```js
// EXT_TABLES mapping (entity_type → extension table name)
const EXT_TABLES = {
  person: 'persons', place: 'places', geo_feature: 'geo_features',
  territory: 'territories', admin_boundary: 'admin_boundaries', event: 'events',
}

// FIELD_DEFS — static field definitions per entity type (in DataExplorer)
// Keys: entity_id, name, <type-specific fields>, lon, lat
// Properties: type ('text'|'number'|'id'), geom (bool), groupable (bool)
// See EXPLORER_DEFAULTS for per-type default field selections

// Story entity query (child → parent FK join)
supabase.from('story_entities')
  .select('id, entity_id, entity_type, role_in_story, notes, entity:entity_id(id, name, entity_type)')
  .eq('story_id', storyId)

// Staged imports for a request
supabase.from('staged_imports').select('*').eq('request_id', requestId)
```

---

## Map: Layer Registry (`src/layers/index.js`)

All 39 layers are defined in `LAYER_REGISTRY`. Each entry:

```js
{
  id: 'layer-id',          // Mapbox source/layer ID — must be unique
  group: 'Group Name',     // Section header in LayerPanel
  label: 'Display Name',
  color: '#hex',           // fallback/solid color
  mapboxType: 'fill',      // 'circle' | 'fill' | 'line'
  dataUrl: './data/layer-id.geojson',
  visible: false,
  description: '...',
  sourceUrl: '...',

  // Auto-color fields (see Auto-Color System below):
  featureColor: true,      // enables per-feature coloring
  colorBy: 'family',       // GeoJSON property to match on
  colorDetails: { 'Name': '#hex', ... },  // fine-grained name→color map (takes priority)
  colorLegend: [{ label, value, color, count }],  // group-level chips for panel legend
}
```

### Layer groups

| Group | Layer IDs |
|-------|-----------|
| Archaeology & Sites | `sites`, `maya-inscriptions`, `inah-archaeological-zones`, `unesco-world-heritage`, `lidar-surveys-opentopography` |
| Empires & Culture | `classical-empires`, `postclassical-empires`, `maya-culture-areas`, `mayan-sites`, `aztec-villages` |
| Languages | `language-families`, `language-dialects` |
| LiDAR & Settlement | `lidar-coverage`, `lidar-coverage-2022`, `maya-settlement-groups`, `pacunam-survey-units`, `la-milpa`, `pulltrouser-swamp`, `pulltrouser-swamp-points`, `becan`, `becan-points` |
| Physical Geography | `volcanoes`, `faults-central-america`, `faults-mexico`, `earthquakes`, `major-rivers`, `major-lakes`, `hurricane-tracks`, `coral-reefs`, `ramsar-wetlands` |
| Ecology & Environment | `ecoregions`, `mangroves-2020`, `protected-areas`, `culturally-significant-species` |
| Conflict & History | `modern-conflict-sites`, `conflict-events` |
| Modern Administrative | `admin2-boundaries`, `urban-areas`, `major-roads` |

---

## Auto-Color System

9 polygon/circle layers are auto-colored by categorical property. The system lives in `MapView.jsx` (`buildColorExpr`) and the layer config (`colorBy`, `colorDetails`, `colorLegend`).

### `buildColorExpr(layer)` — priority order

```js
function buildColorExpr(layer) {
  if (layer.colorBy) {
    // 1. colorDetails: { value: '#hex' } — fine-grained, e.g. per-dialect (99 entries)
    if (layer.colorDetails) {
      const pairs = Object.entries(layer.colorDetails).flat()
      return ['match', ['get', layer.colorBy], ...pairs, layer.color]
    }
    // 2. colorLegend: [{ value, color }] — group-level, e.g. per-empire
    if (layer.colorLegend?.length) {
      const pairs = layer.colorLegend.flatMap(e => [e.value, e.color])
      return ['match', ['get', layer.colorBy], ...pairs, layer.color]
    }
  }
  // 3. featureColor: reads GeoJSON 'color' property (legacy fallback)
  if (layer.featureColor) return ['coalesce', ['get', 'color'], layer.color]
  return layer.color
}
```

This expression is applied to `fill-color`, `line-color` (outlines), and `circle-color`.

### Auto-colored layers

| Layer | `colorBy` | Match source | Groups |
|-------|-----------|-------------|--------|
| `language-dialects` | `name` | `colorDetails` (99 entries) | 18 family hues, shades within family |
| `language-families` | `name` | `colorLegend` (26 entries) | 26 distinct colors |
| `classical-empires` | `name` | `colorLegend` | Mayan=blue, Teotihuacan=amber, Zapotec=green |
| `postclassical-empires` | `name` | `colorLegend` | Aztec=orange, Tarascan=green, Tlaxcalan=cyan, Zapotec=violet |
| `maya-culture-areas` | `name` | `colorLegend` | 9 distinct zone colors |
| `maya-settlement-groups` | `site` | `colorLegend` | 6 site hues (Python-added `site` property) |
| `ecoregions` | `biome` | `colorLegend` | 7 biome types (Python-added `biome` property) |
| `conflict-events` | `event_subtype` | `colorLegend` | Battles=red, Protests=blue, Riots=purple… |
| `culturally-significant-species` | `subtype` | `colorLegend` | Jaguar=amber, Quetzal=green |

**Important:** `colorBy` should reference a GeoJSON property that already exists in the original file, OR one that was added by `scripts/add_feature_colors.py` and committed. Properties added only by the script but not in the original GeoJSON will fail silently if the browser caches the old file. Language dialects uses `name` (original), which is safe. Ecoregions uses `biome` and settlements use `site` (both script-added and committed).

**Do not use `['get', 'color']` directly as a fill-color expression** — Mapbox GL JS doesn't reliably coerce a string feature property to its internal color type. Always use a `match` expression instead.

### Preprocessing script

`scripts/add_feature_colors.py` adds `color`, `family`, `biome`, and `site` properties to the target GeoJSON files. Re-run if you add new features or change the palette:

```bash
cd ~/mesoamerica-fresh
python3 scripts/add_feature_colors.py
```

### Color legend chips

When a layer is toggled on and has a `colorLegend`, `LayerPanel.jsx` renders compact colored chips below the layer description. Each chip shows a dot (CSS `--chip-color: entry.color`) + label + optional count. Styled in `App.css` under `.layer-legend` / `.layer-legend__chip`.

---

## Key Frontend Patterns

### `buildColorExpr` in `MapView.jsx`

Defined above `addLayerToMap`. Called once per layer when it's added to the Mapbox map. Returns a Mapbox expression string or array.

### `callbacksRef` — stale closure fix

Mapbox event handlers are closures set up once on `map.on('load')`. To access current props:

```js
callbacksRef.current = { onMapClick, onFeatureClick, onFeatureDrawn, regionBuildMode, onCellToggle, ... }
// All Mapbox handlers read from callbacksRef.current at call time, not capture time
```

Any new prop used inside a Mapbox event handler must be added here.

### `useImperativeHandle` + `forwardRef` in MapView

```js
useImperativeHandle(ref, () => ({
  syncLayerOrder,      // called after layer reorder in LayerPanel
  getReEditFeature,    // returns edited feature geometry from MapboxDraw
  fitToFeature,        // map.fitBounds to feature bbox (80px padding, maxZoom 12, 700ms)
}))
```

### `vite.config.js` — relative base path

```js
base: './'   // DO NOT change — required for GitHub Pages subdirectory hosting
```

### `.env.production` — committed Supabase vars

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are committed in `.env.production` (the anon key is a public browser credential). `VITE_MAPBOX_TOKEN` is in GitHub Secrets only.

### Map type overlays

Selectable from LayerPanel: Default, Topographic, 3D Terrain, Population (choropleth). Implemented as Mapbox layers/sources with stable `mt-*` IDs. `removeMapTypeOverlays(map)` clears them before each switch.

---

## CI/CD

File: `.github/workflows/deploy.yml`

On every push to `main`:
1. `pip install psycopg2-binary python-dotenv`
2. `python3 scripts/generate_geojson.py` — regenerates all 39 GeoJSON files from Supabase
3. `npm run build` — Vite build with `VITE_MAPBOX_TOKEN` from GitHub Secrets
4. Deploy `dist/` to GitHub Pages

---

## Scripts Reference

| Script | Purpose | Status |
|--------|---------|--------|
| `scripts/generate_geojson.py` | Regenerate all `public/data/*.geojson` from Supabase | Runs in CI; run locally with `SUPABASE_DB_URL` in `.env` |
| `scripts/add_feature_colors.py` | Add `color`, `family`, `biome`, `site` properties to 9 GeoJSON layers for auto-coloring | Re-run if palette changes; commit output |
| `scripts/create_stories_schema.py` | One-time migration: create `stories`, `story_entities`, `data_requests` | Already run |
| `scripts/add_staged_imports.py` | One-time migration: create `staged_imports` | Already run |
| `scripts/source_data.py` | Agentic sourcing agent: polls `data_requests` where `status='pending'`, calls LLM to find entities, writes `staged_imports` for review | See below |
| `scripts/add_explorer_rpcs.py` | One-time migration: create `export_entity_type`, `entity_type_counts`, `entity_field_counts` Postgres functions; grant to anon + authenticated | Already run |
| `scripts/seed_from_wikidata.py` | Seed rulers from `scripts/wp_rulers_enriched.json` | `python3 scripts/seed_from_wikidata.py [--dry-run]` |
| `scripts/seed_long_shadow.py` | Seed 20 persons, 16 events, 5 places from *The Long Shadow* | Already run |
| `scripts/migrate_point_layers.py` | One-time: point GeoJSON → Supabase | Already run |
| `scripts/migrate_poly_layers.py` | One-time: polygon/line GeoJSON → Supabase | Already run |

### `source_data.py` — agentic sourcing agent

Processes `data_requests` rows and stages results for human review in the admin UI.

```bash
pip install requests psycopg2-binary python-dotenv
pip install anthropic   # optional — enables Claude + web search

python3 scripts/source_data.py              # one pending request
python3 scripts/source_data.py --all        # all pending
python3 scripts/source_data.py --id <uuid>  # specific request
python3 scripts/source_data.py --dry-run    # preview, no DB writes
```

**Fallback chain (tried in order):**
1. Claude `claude-sonnet-5` + web search — best quality, live sources (needs `ANTHROPIC_API_KEY`)
2. Claude + fetched URL content — uses `url_hints` from the request (needs `ANTHROPIC_API_KEY`)
3. Claude model knowledge only — training data, all rows flagged `confidence='model_knowledge'` (needs `ANTHROPIC_API_KEY`)
4. Ollama (local) + fetched URL content — free, no key, needs Ollama running (`ollama serve`)
5. Ollama model knowledge only — free fallback, all rows flagged `model_knowledge`

The script auto-detects Ollama model availability via `http://localhost:11434/api/tags` and prints which LLMs are active at startup. Set `ANTHROPIC_API_KEY` in `.env` to enable Claude.

---

## Local Development

```bash
cd ~/mesoamerica-fresh
npm install
npm run dev       # http://localhost:5173
```

Minimum: `VITE_MAPBOX_TOKEN` in `.env`. Without Supabase vars, the map and draw tools work; Admin/Timeline show no data.

To regenerate GeoJSON locally (requires `SUPABASE_DB_URL` in `.env`):
```bash
python3 scripts/generate_geojson.py
```

---

## Feature Status

### Implemented

- **39-layer map** — toggle, drag to reorder, citation panel, click → feature detail
- **Auto-color by category** — 9 layers colored by categorical property (family, biome, empire name, event subtype, etc.) via Mapbox match expressions; color legend chips in LayerPanel
- **Light mode UI** — full CSS rewrite; all panels, nav, admin, timeline in light palette
- **Draw tools** — polygon/point/freehand, undo/redo, snap-to-boundary, region-build, image overlay, vertex re-edit
- **User layers** — persist to localStorage; export/import GeoJSON
- **Timeline** — multi-entity SVG timeline: persons, events, places, territories, admin boundaries across 6 historical eras with era zoom and reference strip
- **Admin (password-protected)** — entity browser, full record editing, relationship management, annotations, entity creation, suggested connections
- **Knowledge graph** — 112 persons seeded with RULED relationships; *The Long Shadow* events and places
- **Stories (narrative platform)** — named story containers with theme + time bounds; entity curation with roles; CSV bulk import; CSV/GeoJSON export; data request queue
- **Agentic data sourcing** — `source_data.py` polls the request queue, uses Claude + web search (or Ollama as a free local fallback), stages results; admin reviews rows one-by-one before anything commits
- **Data Explorer** — self-service query builder in Admin; field picker with completeness bars; geometry extracted as lon/lat; CSV export (up to 5k rows); grouped count summaries; three Supabase RPCs

### Not Yet Implemented

- Public story viewer (`/#/stories/:id`) — read-only map/chart view for a curated story
- Admin point placement on map (drop new point from admin interface)
- Wikipedia / external content in the detail sidebar
- Polity, culture, time_period entity types (schema supports them; no data)
- MultiPolygon vertex right-click deletion in re-edit mode
- INEGI indigenous language speakers (tabular join to municipalities)
- Raster datasets (ESA WorldCover, Night Lights, Hansen GFC) — require Mapbox tileset upload

---

## Resuming with Claude Code

Paste this file at the start of a new session. Key reminders:

- **Working dir:** `~/mesoamerica-fresh`; for git, always use `git -C /Users/darrell.penta/mesoamerica-fresh <command>`
- **Supabase:** `https://vqovdkjdawqdpzxomsiw.supabase.co` — anon key in `.env` and `.env.production`; direct DB URL in `.env` only
- **GeoJSON files** in `public/data/` are CI build artifacts for entity data — edit data in Supabase. The exception: color/family/biome/site properties added by `add_feature_colors.py` are committed and stable.
- **Auto-color:** Never use `['get', 'color']` as a fill-color expression — use a `['match', ...]` expression via `buildColorExpr()` in `MapView.jsx`
- **`colorBy` must reference an existing GeoJSON property** (or a script-added one that's committed) — browser caching will silently break match expressions that depend on freshly-added properties that haven't propagated
- **`HashRouter`** — all routes are `/#/path`; never use `BrowserRouter`
- **`callbacksRef`** — any new prop used inside a Mapbox event handler must be added to `callbacksRef.current` in `MapView.jsx`
- **Admin password:** `mesoamerica2026` (in `src/main.jsx` as `ADMIN_PW`)
- **PostgREST FK joins** go from child → parent only (e.g., `from('persons').select('*, entity:entity_id(name)')`, not from `entities`)
- **`base: './'`** in `vite.config.js` — required for GitHub Pages; do not change
- **Stories mode** — toggled via the "Stories" button at the bottom of the Admin sidebar; `storiesMode` + `selectedStory` state in `AdminPage`; story operations use `stories`, `story_entities`, `staged_imports`, `data_requests` tables
- **Agentic sourcing flow:** user submits prompt in DataRequestPanel → run `python3 scripts/source_data.py` → status becomes `review` → admin clicks "Review staged data" → StagingReviewPanel appears → approve/reject rows → "Mark request done"
- **`staged_imports` confidence values:** `high`, `medium`, `low`, `model_knowledge` — displayed as colored badges in the review panel
- **Ollama fallback:** `source_data.py` auto-detects Ollama at `http://localhost:11434`; prefers llama3 family. Override with `OLLAMA_BASE_URL` in `.env`.
- **Data Explorer mode** — toggled via "Data Explorer" button in entity sidebar; `explorerMode` state in `AdminPage`; powered by three RPCs: `export_entity_type` (geometry-aware export), `entity_type_counts` (totals), `entity_field_counts` (group-by). RPC results return `[{ row_data: {...} }]` — unwrap with `data.map(r => r.row_data)`. `FIELD_DEFS` and `EXPLORER_DEFAULTS` constants define available fields and default selections per type.
