# Mesoamerica Interactive Map — Project Status

## Purpose
A React + Vite + Mapbox GL JS single-page app hosted on GitHub Pages. Two goals:
1. Integrate multiple historical/geographic datasets for Mesoamerica into one interactive map.
2. Provide a robust admin editing environment for creating, refining, and annotating geographic regions.

No backend. All data is static GeoJSON served from `public/data/`. Supabase integration is planned but deferred.

---

## Tech Stack
| Layer | Choice |
|-------|--------|
| Build | Vite 5 |
| UI | React 18 |
| Map | Mapbox GL JS v3 |
| Draw tools | @mapbox/mapbox-gl-draw v1.5.1 |
| Spatial union | @turf/union v7.3.5 + @turf/helpers |
| Deploy | GitHub Actions → GitHub Pages |
| Hosting | `https://dpenta.github.io/mesoamerica-map/` |

**Environment variable required:**
- `VITE_MAPBOX_TOKEN` — set in `.env` locally, GitHub Secret for CI.
- Public token: `pk.eyJ1IjoiZHBlbnRhIiwiYSI6ImNtcXpsajl4cTAzeDcycHE1enB0MTlqemIifQ.vO2Ay15mua_GEePuEzL2mw`

---

## Running Locally
```bash
cd mesoamerica-map
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
```

---

## Repository Structure
```
mesoamerica-map/
├── public/
│   └── data/                    # GeoJSON data files (see Data Layers below)
├── src/
│   ├── layers/
│   │   └── index.js             # LAYER_REGISTRY — single source of truth for all data layers
│   ├── hooks/
│   │   └── useUndoable.js       # Undo/redo state hook wrapping any value with past/future stacks
│   ├── utils/
│   │   ├── geoSnap.js           # Snap polygon vertices to nearest point on a reference GeoJSON
│   │   ├── topology.js          # Shared-edge detection and one-way merge between polygons
│   │   └── dissolve.js          # Dissolve N polygon features into one via turf union
│   ├── components/
│   │   ├── MapView.jsx          # Core map (forwardRef); overlay; layer syncing; edge editing; map type overlays
│   │   ├── LayerPanel.jsx       # Left sidebar: Map Style selector, Data Layers, Guide Images, My Layers
│   │   ├── DetailPanel.jsx      # Right panel shown on feature click; re-edit button
│   │   ├── DrawToolbar.jsx      # Floating toolbar; 3 modes: draw / re-edit / region-build
│   │   ├── NewLayerModal.jsx    # Modal to name + color a new user layer
│   │   └── AnnotationModal.jsx  # Modal to annotate a drawn shape (name, desc, key-value pairs)
│   ├── App.jsx                  # Root component; ALL state lives here
│   ├── App.css                  # All styles (no CSS modules)
│   └── main.jsx                 # Vite entry point
└── .github/
    └── workflows/
        └── deploy.yml           # CI: build + deploy to GitHub Pages
```

---

## Map Style Modes (Mexico → Costa Rica region)

Selectable from the Layer Panel. All modes add overlays focused on the Mesoamerica region (approx. 8–32°N, 118–77°W); the base map style is unchanged globally.

| Mode | What it adds |
|------|-------------|
| **Default** | No overlays — base light map |
| **Topographic** | Hillshading (`mapbox://mapbox.mapbox-terrain-dem-v1` raster-dem) + contour lines every 100/500 m (`mapbox://mapbox.mapbox-terrain-v2`, `source-layer: 'contour'`, minzoom 5) |
| **3D Terrain** | Hillshading + true 3D terrain extrusion via `map.setTerrain({ source: 'mt-dem', exaggeration: 1.8 })` |
| **Population** | Admin-1 choropleth — 117 state/department polygons for 7 countries (Mexico → Costa Rica), colored by population density (persons/km²), sourced from 2018–2022 national censuses |

### Map type implementation details
- Functions `applyMapType(map, mapType)` and `removeMapTypeOverlays(map)` in `MapView.jsx` add/remove Mapbox layers with stable IDs prefixed `mt-` (e.g. `mt-hillshade`, `mt-contours`, `mt-pop-fill`).
- Overlays are inserted **before** the `sites` layer so they render beneath all data layers.
- **3D Terrain**: calls `map.setTerrain(...)`. 3D terrain can interfere with draw/vertex-edit tools; revert to Default before editing.
- **Population choropleth**: YlOrRd sequential color ramp, domain 0–2000 persons/km²; labels appear at zoom ≥ 5.

---

## Architecture: Layer System

### Adding a new data layer
1. Drop a GeoJSON file in `public/data/`.
2. Add one entry to `LAYER_REGISTRY` in `src/layers/index.js`.

```js
{
  id: 'my-layer',          // unique string, used as Mapbox source/layer ID
  label: 'Display Name',
  color: '#hex',
  mapboxType: 'circle',    // 'circle' | 'fill' | 'line'
  dataUrl: './data/my-layer.geojson',
  visible: false,          // default visibility
  description: '...',      // shown in sidebar
  featureColor: true,      // optional: use per-feature 'color' property for fills
  disabled: false,         // optional: grays out in sidebar, skips loading
}
```

### Layer z-order (bottom → top)
1. Mapbox base map tiles
2. Map type overlays (`mt-*` layers — inserted before `sites`)
3. Static data layers (LAYER_REGISTRY)
4. Region-builder selection highlight (`region-selection-*`)
5. Helper / guide image layers (`helper-*`, raster, attached overlays)
6. User-created draw layers (`user-*`)
7. MapboxDraw UI layers (`gl-draw-*`)

`addUserLayerToMap()` inserts `before` the first `gl-draw-*` layer.
Helper layers insert `before` the first `user-*` or `gl-draw-*` layer.
Region-selection highlight layers are added last (no `before`), so they always appear on top of data layers.

### Data Layers (`src/layers/index.js`)

39 registered layers (1 disabled). Sizes are approximate post-processing. `mapboxType` may be `circle`, `fill`, or `line`.

#### Archaeology & Sites

| ID | Label | Type | Features | File (KB) | Source | License |
|----|-------|------|----------|-----------|--------|---------|
| `sites` | Archaeological Sites | circle | ~21 | 11 | Pleiades / Wikidata | Public domain |
| `maya-inscriptions` | Maya Inscription Sites | circle | 314 | 138 | Kaggle: ujwalkandi | CC |
| `inah-archaeological-zones` | INAH Archaeological Zones | circle | 494 | 98 | INAH / Wikidata | Open (gov) |
| `unesco-world-heritage` | UNESCO World Heritage Sites | circle | 50 | 30 | UNESCO DataHub | Open |
| `lidar-surveys-opentopography` | Open LiDAR Surveys | circle | 4 | 3 | OpenTopography / NSF | CC-BY |

#### Empires & Culture

| ID | Label | Type | Features | File (KB) | Source | License |
|----|-------|------|----------|-----------|--------|---------|
| `classical-empires` | Classical Empires | fill | 16 | 45 | ArcGIS / GIS for Humanities | See source |
| `postclassical-empires` | Post-Classical Empires | fill | 5 | 36 | ArcGIS | See source |
| `maya-culture-areas` | Maya Culture Areas | fill | 39 | 837 | ArcGIS | See source |
| `mayan-sites` | Maya Sites (ArcGIS) | circle | 55 | 20 | GIS for Humanities, San Antonio Univ | See source |
| `aztec-villages` | Aztec Villages | circle | 35 | 13 | GIS for Humanities | See source |

#### Languages

| ID | Label | Type | Features | File (KB) | Source | License |
|----|-------|------|----------|-----------|--------|---------|
| `language-families` | Language Families | fill | 26 | 6,230 | Glottography / Asher & Moseley 2007 | CC BY 4.0 |
| `language-dialects` | Language Dialects (Meso-America) | fill | 99 | 275 | Glottography / Asher & Moseley 2007, Map 10 | CC BY 4.0 |

#### LIDAR & Settlement

| ID | Label | Type | Features | File (KB) | Source | License |
|----|-------|------|----------|-----------|--------|---------|
| `lidar-coverage` | LIDAR Survey Coverage (2019) | fill | 99 | 416 | MarigisLab / MARI at Tulane Univ | See source |
| `lidar-coverage-2022` | LIDAR Survey Coverage (2022) | fill | 105 | 420 | ancientmayasettlement.com / MARI at Tulane | See source |
| `maya-settlement-groups` | Maya Settlement Groups (LIDAR) | fill | 1,499 | 505 | Estrada-Belli et al. / PACUNAM / NASA G-LiHT, via MarigisLab | See source |
| `pacunam-survey-units` | PACUNAM LiDAR Survey Units | fill | 12 | 63 | PACUNAM LiDAR Initiative, via MarigisLab | See source |
| `la-milpa` | La Milpa Settlement, Belize | fill | ~10,000 | 2,300 | Boston Univ / Tulane La Milpa project, via MarigisLab | See source |
| `pulltrouser-swamp` | Pulltrouser Swamp Settlement | fill | 538 | 260 | ancientmayasettlement.com / MARI at Tulane | See source |
| `pulltrouser-swamp-points` | Pulltrouser Swamp Structures (points) | circle | 399 | 97 | ancientmayasettlement.com / MARI at Tulane | See source |
| `becan` | Becan Settlement, Campeche (polygons) | fill | 2,318 | 3,095 | ancientmayasettlement.com / MARI at Tulane | See source |
| `becan-points` | Becan Structures, Campeche (points) | circle | 1,270 | 435 | ancientmayasettlement.com / MARI at Tulane | See source |

#### Physical Geography

| ID | Label | Type | Features | File (KB) | Source | License |
|----|-------|------|----------|-----------|--------|---------|
| `volcanoes` | Holocene Volcanoes | circle | 87 | 19 | Smithsonian GVP — WFS | Public domain |
| `faults-central-america` | Active Faults — Central America | line | 180 | 367 | CCAF-DB, GEM Foundation | CC-BY 4.0 |
| `faults-mexico` | Active Faults — Mexico | line | 715 | 523 | GEM Global Active Faults | CC-BY-SA 4.0 |
| `earthquakes` | Earthquakes (M5.0+, 1900–2024) | circle | 2,000 | 385 | USGS Earthquake Catalog | Public domain |
| `major-rivers` | Major Rivers | line | 21,531 | 8,524 | HydroRIVERS v10, WWF / USGS HydroSHEDS | CC-BY 4.0 |
| `major-lakes` | Major Lakes | fill | 23 | 134 | Natural Earth 10m Physical | Public domain |
| `hurricane-tracks` | Hurricane Tracks (1851–2023) | line | 1,614 | 1,629 | NOAA IBTrACS v04r01 | Public domain |
| `coral-reefs` | Coral Reefs | fill | 328 | 589 | OpenStreetMap (natural=reef) | ODbL |
| `ramsar-wetlands` | Ramsar Wetlands | circle | 23 | 4 | OpenStreetMap / Ramsar Convention | ODbL |

#### Ecology & Environment

| ID | Label | Type | Features | File (KB) | Source | License |
|----|-------|------|----------|-----------|--------|---------|
| `ecoregions` | Terrestrial Ecoregions | fill | 69 | 2,449 | RESOLVE Ecoregions 2017, WWF / Dinerstein et al. | CC-BY 4.0 |
| `mangroves-2020` | Mangrove Coverage (2020) | fill | 147 | 41 | Global Mangrove Watch 2020, JAXA / Aberystwyth | CC-BY 4.0 |
| `protected-areas` | Protected Areas (WDPA) | fill | 2,043 | 3,477 | WDPA, UNEP-WCMC / IUCN | Non-commercial |
| `culturally-significant-species` | Culturally Significant Species | circle | 600 | 121 | GBIF / iNaturalist — Quetzal, Jaguar | CC-BY |

#### Conflict & Security

| ID | Label | Type | Features | File (KB) | Source | License |
|----|-------|------|----------|-----------|--------|---------|
| `conflict-events` | Conflict Events (2022–2023) | circle | 10,781 | 2,100 | HDX / ACLED-sourced | CC BY-NC-SA |

#### Modern Administrative

| ID | Label | Type | Features | File (KB) | Source | License |
|----|-------|------|----------|-----------|--------|---------|
| `admin2-boundaries` | Municipalities / Districts (ADM-2) | fill | 3,636 | 4,319 | geoBoundaries v6.0 | CC-BY 4.0 |
| `urban-areas` | Urban Areas | fill | 289 | 1,221 | Natural Earth 10m Cultural | Public domain |
| `major-roads` | Major Roads | line | 329 | 212 | Natural Earth 10m Cultural | Public domain |

### Language Dialect Layer Notes
- 99 features from Asher 2007 **Map 10 "Meso-America: Time of Contact"** via `cldf/traditional/features.geojson` in the `glottography/asher2007world` GitHub dataset.
- Family colors from canonical Glottography color lookup; glottocodes without matches resolved via `MANUAL_FAMILY` and `NAME_FAMILY` dicts in the data-prep script.
- 8 features classified as "Bookkeeping" (amber color): undocumented or extinct languages (?Kaskan, ?Tekockin, Chumbia, Kotoke, Tekwexe, Tolimec, etc.) — as noted in the atlas.
- Features 1 (Huastec), 34 (Pame), 52 (Cora), 53 (Huichol) use **full unclipped polygons** restored from source; they extend naturally beyond the 22.5°N bounding-box ceiling.
- Each feature has properties: `title`, `number`, `glottocode`, `family`, `color`, `fill-opacity`, `note`, `source`.

### LIDAR / Settlement Layer Notes
- **LIDAR Coverage (2019)**: ArcGIS FeatureServer at MarigisLab; layer ID is `430`, not `0`. Simplified at 0.005° from 4.4 MB raw.
- **Maya Settlement Groups**: Large + medium settlement clusters only (100–400 per site). Individual structures (10K–24K each) not included to keep file manageable.
- **PACUNAM Survey Units**: 12 polygons that were 47 MB raw (ultra-detailed). Simplified at 0.005°.
- **La Milpa**: 4 researcher surveys (LMBU 2000/26628 due to ArcGIS API pagination cap of 2,000, Scarborough 1422, Kunen 1270, Robichaux 1675) + berms + polyline survey boundaries. Simplified at 0.00005°.
- **ancientmayasettlement.com shapefiles**: All (except becan structure polygons) were in UTM Zone 16N (EPSG:32616). Reprojected to WGS84 using `pyproj.Transformer.from_crs("EPSG:32616", "EPSG:4326")`.

### Population Layer Notes
- 117 admin-1 polygons for Mexico, Guatemala, Belize, Honduras, El Salvador, Nicaragua, Costa Rica.
- Source boundaries: Natural Earth admin-1 shapefile filtered by ISO country code.
- Population from 2018–2022 national censuses: INEGI 2020 (Mexico), INE 2018 (Guatemala), national estimates for others.
- `area_sqkm` computed via `pyproj.Geod.geometry_area_perimeter()` — the Natural Earth GeoJSON export does not include this field.
- Density range: ~6.8 persons/km² (Gracias a Dios, Honduras) to ~6,810 persons/km² (Distrito Federal, Mexico).

### Attribution
| Source | License / Notes |
|--------|----------------|
| Asher & Moseley 2007 Atlas | CC BY 4.0 — via Glottography/asher2007world on GitHub |
| MarigisLab / MARI at Tulane | Public ArcGIS FeatureServices; no explicit license — contact mcanuto@tulane.edu for publication use |
| ancientmayasettlement.com | Public downloads; no explicit license — contact MARI at Tulane for publication use |
| Natural Earth (admin-1, roads, lakes, urban, reefs) | Public domain |
| Mapbox terrain-dem / terrain-v2 | Mapbox terms of service (requires API key) |
| Smithsonian GVP | Public domain (US government / Smithsonian) |
| CCAF-DB, GEM Foundation | CC-BY 4.0 / CC-BY-SA 4.0 |
| USGS Earthquake Catalog | Public domain |
| WWF HydroRIVERS v10 | CC-BY 4.0 |
| NOAA IBTrACS v04r01 | Public domain (NOAA) |
| RESOLVE Ecoregions 2017 | CC-BY 4.0 (Dinerstein et al.) |
| Global Mangrove Watch 2020 | CC-BY 4.0 (JAXA / Aberystwyth) |
| WDPA | Free for non-commercial use with attribution (UNEP-WCMC / IUCN) |
| GBIF / iNaturalist | CC-BY / CC0 varies by contributing dataset |
| geoBoundaries v6.0 | CC-BY 4.0 (fully open, including redistribution) |
| UNESCO DataHub | Open (UNESCO open science principles) |
| INAH / Wikidata | Open government data (Mexico) / CC0 |
| OpenTopography / NSF | CC-BY |
| OpenStreetMap contributors | ODbL (coral reefs, Ramsar wetlands) |
| HDX / ACLED | CC BY-NC-SA (conflict events — non-commercial use) |

---

## Architecture: User Draw Layers

### State (all in App.jsx)
```js
// Undo/redo-enabled user layers (see useUndoable.js)
const { value: userLayers, set: setUserLayers, undo, redo, canUndo, canRedo } = useUndoable(loadSavedLayers())

activeDrawLayerId: string | null   // which user layer is being edited
activeTool: string                  // MapboxDraw mode string
pendingFeature: GeoJSON | null      // feature drawn, awaiting annotation
pendingReEdit: GeoJSON | null       // feature being vertex-edited in Draw
pendingMerge: { newFeature, neighbors } | null   // shared-edge merge prompt
snapLayerId: string | null          // which data layer to snap to
snapGeojson: GeoJSON | null         // loaded GeoJSON for the snap layer
regionBuildMode: boolean            // region-builder mode active
selectedCells: [{key, layerId, feature}]  // polygons selected for merge
helperLayers: [{id, label, src, opacity, geoCorners, visible}]
mapType: 'default'|'topographic'|'terrain'|'population'  // active map style mode
```

### Draw flow
1. User clicks "New Layer" → `NewLayerModal` → `addUserLayer(name, color)` → creates entry + sets active.
2. User draws shape → MapboxDraw fires `draw.create` → snap applied if configured → `onFeatureDrawn(feature)` → `pendingFeature` set.
3. `AnnotationModal` opens → user fills name/desc/key-values → `confirmAnnotation(props)`:
   - Saves feature to layer with `_layerId` property stamped on it.
   - For polygons: calls `mapViewRef.current.fitToFeature(newFeature)` → map animates to show the full polygon.
   - Immediately enters re-edit mode (`startReEdit(newFeature)`) so vertex handles appear right away.
   - Checks for shared edges with existing user features → may show merge prompt.
4. After re-edit commit: final geometry saved back to userLayers.

### Persistence
User layers are saved to `localStorage` key `'mesoamerica-user-layers'` on every change.
`loadSavedLayers()` reads this on first render.

### Keyboard shortcuts
- `Ctrl+Z` / `Cmd+Z` — undo (disabled while re-editing)
- `Ctrl+Y` / `Ctrl+Shift+Z` / `Cmd+Shift+Z` — redo (disabled while re-editing)

### Export / Import
- **Export single layer** — GeoJSON FeatureCollection download.
- **Export All** — full JSON with `{ version: 1, app: 'mesoamerica-map', userLayers }`.
- **Import** — additive (appends with new IDs); accepts both single FeatureCollection and full export format.

---

## Architecture: Snap-to-Boundary

When a fill layer has "Snap boundary" toggled on in LayerPanel, its GeoJSON is fetched into `snapGeojson`. After each `draw.create` event, `snapFeatureToGeometry()` is called, which moves each vertex of the new polygon to the nearest point on any ring segment of the reference layer if within 0.05° (~5.5 km). A toast notification shows how many vertices snapped.

Key functions in `src/utils/geoSnap.js`:
- `snapCoord(coord, rings, thresholdDeg)` — snaps one coordinate
- `snapFeatureToGeometry(feature, refGeojson, thresholdDeg)` — snaps all vertices
- `countSnappedVertices(original, snapped)` — count for notification

---

## Architecture: Shared-Edge Topology

After each polygon is saved, `findSharedEdgeNeighbors(newFeature, userLayers)` scans all existing user features for pairs of vertices within 0.02° (~2.2 km). If ≥2 matches exist between the new feature and an existing one, a merge prompt appears.

"Merge" calls `applyEdgeMerge(newFeature, neighbors)` which snaps the new feature's vertices to the exact coordinates of the neighbor, eliminating gaps.

Key functions in `src/utils/topology.js`:
- `detectSharedVertices(featureA, featureB, thresholdDeg)`
- `mergeSharedEdge(featureA, featureB, thresholdDeg)` — featureB snaps to featureA
- `findSharedEdgeNeighbors(feature, userLayers, thresholdDeg)`
- `applyEdgeMerge(newFeature, neighbors)`

---

## Architecture: Re-Edit Mode

Allows vertex-level editing of any previously saved user polygon.

### Entering re-edit
- From DetailPanel: click "Re-edit vertices" button (only shown if `feature.properties._layerId` is set).
- Automatically entered after any polygon annotation is confirmed.
- `startReEdit(feature)` → sets `pendingReEdit` → MapView useEffect calls `draw.add(feature)` + `draw.changeMode('direct_select', { featureId })`.

### Vertex interactions (active only in re-edit mode)
- **Drag a vertex handle** — MapboxDraw native behaviour.
- **Left-click on any edge** — custom `map.on('click')` handler detects the nearest edge in screen-pixel space (threshold: 14px), inserts a new vertex at the exact click point, re-enters `direct_select`.
- **Right-click on any vertex** — custom `map.on('contextmenu')` handler detects nearest vertex (threshold: 14px), removes it (guard: polygon must keep ≥3 unique vertices), re-enters `direct_select`. Browser context menu is suppressed.

### Committing
"Commit" button → `commitReEdit()` → calls `mapViewRef.current.getReEditFeature(id)` → updates geometry in userLayers state → clears `pendingReEdit`. The useEffect cleanup deletes the feature from Draw on commit or cancel.

### Imperative handle (MapView forwardRef)
```js
mapViewRef.current.getReEditFeature(featureId)  // returns current Draw feature
mapViewRef.current.fitToFeature(feature)          // map.fitBounds to feature's bbox
```

---

## Architecture: Region Builder

An alternative polygon-creation workflow. Instead of drawing freehand, the user clicks existing data layer polygons to select them, then dissolves them into a single feature.

### Flow
1. Have a user layer active ("Edit" mode).
2. Click "Build from map polygons" in LayerPanel (appears when `activeDrawLayerId` is set).
3. `enterRegionBuild()` → `regionBuildMode = true`, `selectedCells = []`, cursor changes to crosshair.
4. Enable a fill data layer. Click polygons to select (highlighted orange); click again to deselect.
5. Click "✓ Merge & Create" → `commitRegion()`:
   - `dissolveFeatures(selectedCells.map(c => c.feature))` uses `turf.union(featureCollection([...]))` to merge all selected polygons.
   - Result set as `pendingFeature` → AnnotationModal opens.
   - After annotation: map fits to the new polygon and re-edit mode is entered immediately.

### Key implementation details
- Fill layer click handlers check `callbacksRef.current.regionBuildMode` — if true, route to `onCellToggle` instead of `onFeatureClick`.
- `selectedCells` is synced to a `'region-selection'` GeoJSON source in Mapbox, which drives two overlay layers (`region-selection-fill`, `region-selection-outline`) rendered at the top of the stack.
- Cell deduplication key: `${layerId}::${feature.id ?? feature.properties?.name ?? ...}`.
- `dissolveFeatures()` is in `src/utils/dissolve.js`; uses turf v7 `union(featureCollection([...]))` API.
- Non-adjacent selections produce MultiPolygon (re-edit works but vertex handles are per-sub-polygon).
- `regionBuildMode` is cleared when: Cancel clicked, "Done" drawing, switching active layer.

---

## Architecture: Image Overlay (Guide Images)

### Floating (unattached) state
Dropped via drag-and-drop. Stored in MapView local state:
```js
overlay: {
  src: string,              // base64 data URL
  width: number,            // natural image width (source rect for matrix3d)
  height: number,
  opacity: number,          // 0.05–1.0
  corners: [[x,y]×4],      // [TL, TR, BR, BL] in container pixel coords
  pinnedCorners: [bool×4],  // shift+click a corner handle to toggle pin
}
```

Rendering uses CSS `matrix3d` (projective/homographic transform) computed from the 4 corners via `basisToPoints` + `adj3` + `mul33`. This supports free perspective warping with no mode-switching.

**Handles (always visible):**
- **Body drag** — translates all unpinned corners.
- **Orange circle** — rotate; positioned perpendicular above top edge midpoint; rotates all unpinned corners around centroid.
- **Blue square** — scale; offset from BR corner along TL→BR diagonal; scales all unpinned corners from centroid.
- **4 corner handles** — drag = move that corner independently (warp/skew). **Shift+click = pin/unpin**. Pinned corners show orange fill.
- **4 edge midpoint handles** — drag = move both corners on that edge together.

Pinned corners stay fixed during rotate/scale/move/edge operations.

### Attaching to the map
"Attach to map" button:
1. Calls `map.unproject(corner)` for each of the 4 corners → `[lng, lat]`.
2. `onAttachHelper({ src, opacity, geoCorners })` → App creates `helperLayers` entry.
3. MapView syncs as Mapbox `ImageSource` + `raster` layer, inserted before user layers.
4. Managed from LayerPanel (toggle, opacity slider, remove).

---

## Architecture: Component Props

### `<MapView ref={mapViewRef}>`
| Prop | Type | Description |
|------|------|-------------|
| `layers` | LAYER_REGISTRY[] | Static data layers |
| `userLayers` | UserLayer[] | User-created draw layers |
| `helperLayers` | HelperLayer[] | Attached guide images |
| `activeTool` | string | Current MapboxDraw mode |
| `snapConfig` | `{geojson, threshold}` \| null | Active snap configuration |
| `pendingReEdit` | GeoJSON feature \| null | Feature being vertex-edited |
| `regionBuildMode` | boolean | Whether region-builder is active |
| `selectedCells` | Cell[] | Cells selected in region-builder |
| `mapType` | string | Active map style mode |
| `onFeatureClick` | fn(feature) | Sets selectedFeature in App |
| `onFeatureDrawn` | fn(feature) | Sets pendingFeature in App |
| `onAttachHelper` | fn({src,opacity,geoCorners}) | Promotes overlay to a geo-locked layer |
| `onCellToggle` | fn(layerId, feature) | Toggle cell selection in region-builder |

**Imperative methods (via ref):**
- `getReEditFeature(featureId)` — returns current Draw feature by id
- `fitToFeature(feature)` — calls `map.fitBounds` with 80px padding, maxZoom 12, 700ms animation

### `<LayerPanel>`
| Prop | Notes |
|------|-------|
| `layers` / `onToggle` | Data layers |
| `mapType` / `onMapTypeChange` | Map style selector |
| `snapLayerId` / `onToggleSnap` | Snap-to-boundary toggle per fill layer |
| `userLayers` + CRUD handlers | User draw layers |
| `canUndo/canRedo` / `onUndo/onRedo` | Undo/redo buttons in My Layers header |
| `onExportAll` / `onImportLayers` | File I/O |
| `activeDrawLayerId` / `onSetActiveDrawLayer` / `onNewLayer` / `onEnterRegionBuild` | Draw state |
| `helperLayers` + `onToggleHelper` / `onRemoveHelper` / `onSetHelperOpacity` | Guide images |

### `<DrawToolbar>`
Three modes (checked in order):
1. `regionBuildMode` — shows region-builder UI (count, Merge & Create, Cancel)
2. `pendingReEdit` — shows re-edit UI (feature name, Commit, Cancel)
3. Normal — shows tool buttons, undo/redo, snap badge, Done

### `<DetailPanel>`
| Prop | Notes |
|------|-------|
| `feature` | Currently selected GeoJSON feature |
| `userLayers` | Used to look up parent layer label for user features |
| `onClose` | Closes panel |
| `onReEdit` | Called with feature when "Re-edit vertices" is clicked; only shown if `feature.properties._layerId` is set |

---

## Key Patterns / Gotchas

### `callbacksRef` pattern — stale closure fix for Mapbox event handlers
Mapbox event handlers (registered once in `map.on('load')`) capture props from the initial render. To always read current props:
```js
const callbacksRef = useRef({})
callbacksRef.current = { onFeatureClick, onFeatureDrawn, snapConfig, onAttachHelper, regionBuildMode, onCellToggle }
// All Mapbox handlers read from callbacksRef.current at call time
```

### `forwardRef` + `useImperativeHandle`
MapView exposes imperative methods to App:
```js
const MapView = forwardRef(function MapView(props, ref) {
  useImperativeHandle(ref, () => ({
    getReEditFeature: (featureId) => draw.getAll().features.find(f => f.id === featureId) ?? null,
    fitToFeature: (feature) => { map.fitBounds(bbox, { padding: 80, maxZoom: 12, duration: 700 }) },
  }))
})
```

### `pendingReEdit` timing
`startReEdit` sets `activeDrawLayerId`, `activeTool`, and `pendingReEdit` in sequence. Two separate useEffects in MapView watch `activeTool` and `pendingReEdit`. React's declaration-order guarantee ensures the `pendingReEdit` effect runs after the `activeTool` effect, so `direct_select` mode is set last (correct).

### `draw.create` immediately deletes from Draw
After MapboxDraw fires `draw.create`, the feature is immediately deleted from Draw state (`draw.delete(f.id)`) and passed to App state instead. Draw never holds user features permanently — App is the single source of truth.

### Re-edit cleanup via useEffect return
When `pendingReEdit` changes (on commit or cancel), the useEffect cleanup deletes the temporary Draw feature:
```js
return () => {
  if (pendingReEdit && draw) {
    try { draw.delete(pendingReEdit.id) } catch(_) {}
    try { draw.changeMode('simple_select') } catch(_) {}
  }
}
```

### Map type overlay cleanup
`removeMapTypeOverlays(map)` removes all `mt-*` layers, calls `map.setTerrain(null)`, then removes `mt-*` sources. Called before every `applyMapType()` call and also on style reload. Stable layer IDs prevent duplicates.

### `useUndoable` hook
```js
const MAX_HISTORY = 50
// Returns: { value, set, undo, redo, canUndo, canRedo, historySize }
// set() pushes present to past and clears future
// undo() pops past → present, pushes present → future
// redo() pops future → present, pushes present → past
```

### Edge pixel-space math
All edge-click and right-click detection uses `map.project(coord)` to convert geo coords to screen pixels. This keeps the 14px threshold zoom-independent.

### Visibility sync suffix list
Fill layers have `['', '-outline', '-labels']` suffixes; circle layers have `['', '-labels']`; line layers have `['']` only. User layers have `['-fill', '-stroke', '-points', '-labels']`. The `layers` useEffect uses `layer.mapboxType` to pick the right suffix list.

### `featureColor: true`
Uses `['coalesce', ['get', 'color'], layer.color]` Mapbox expression so per-feature `color` properties override the layer default. Used by `language-families`, `language-dialects`, `ecoregions`, and `culturally-significant-species` layers.

### `line` mapboxType
Added alongside `circle` and `fill`. Renders a single Mapbox `line` layer with `line-cap: round`. Optional `lineWidth` property in the registry entry sets the default width (fallback: 1.5). Visibility suffix list is `['']` only (no outline or label sublayers). Used by fault lines, river network, hurricane tracks, and road layers.

### Freehand mode
Custom `FreehandPolygonMode` uses `mousedown/mousemove/mouseup` to accumulate coordinates. `map.dragPan` is disabled while `activeTool === 'freehand_polygon'`.

### MultiPoint ArcGIS normalization
Single-coord `MultiPoint` geometry in ArcGIS data was normalized to `Point` during data prep.

### Overlay interaction uses document events
Mouse move/up handlers for image overlay dragging are on `document`, not the div, so drags don't break when the cursor leaves the image area. `iaRef` (not state) tracks the active interaction type to avoid stale closures.

---

## Pending / Backlog
| Item | Status | Notes |
|------|--------|-------|
| Artifacts layer | Disabled in registry | Needs data source |
| Cultural regions | Not started | Digitize from reference image |
| Supabase persistence | Deferred | Needs credentials/account |
| GitHub API save | Deferred | Needs PAT |
| Language families review | Low priority | Some US Southwest families in dataset |
| Bundle size | Warning only | Mapbox + Draw dominate; can code-split later |
| MultiPolygon edge editing | Not started | Right-click vertex removal only handles Polygon type |
| La Milpa LMBU full dataset | Known gap | 26,628 structures; current file has 2,000 due to ArcGIS API pagination cap |
| Ramsar Wetlands | ✅ Added | 23 point features from OSM; full polygon inventory still bot-blocked at RSIS |
| INEGI indigenous language speakers | Not acquired | Tabular join to municipalities — needs Python post-processing |
| ESA WorldCover / Night Lights / Hansen GFC | Not acquired | Raster datasets require Mapbox tileset upload (large COG files) |
| Mesoamerican Barrier Reef detail | Not acquired | WCMC ArcGIS service returns 400; WCMC direct download requires registration |
| Caracol / Puuc LiDAR settlement polygons | Not acquired | Need DEM → CHM → polygon pipeline from OpenTopography point cloud |

---

## Deployment
GitHub Actions workflow at `.github/workflows/deploy.yml` runs on push to `main`:
1. `npm ci`
2. `npm run build` (requires `VITE_MAPBOX_TOKEN` GitHub Secret)
3. Deploys `dist/` to GitHub Pages
