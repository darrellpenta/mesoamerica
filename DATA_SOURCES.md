# Mesoamerica Map — Candidate Data Sources

Prospective layers for future integration. Organized by topic, with access details and integration notes. Does not repeat layers already in the map.

---

## Status

Layers marked ✅ have been downloaded, processed, and added to `LAYER_REGISTRY`. Layers marked ❌ were attempted but blocked (auth/cert/API issues). Layers marked ⬜ have not yet been attempted.

## Quick-Reference Priority Table

| # | Dataset | Topic | Status | Integration Effort |
|---|---------|--------|--------|-------------------|
| 1 | Hansen Global Forest Change 2000–2024 | Environment | ⬜ Not acquired | Medium (raster tile) |
| 2 | NOAA IBTrACS Hurricane Tracks | Climate | ✅ Added | Low |
| 3 | GVP Volcanoes (Smithsonian) | Physical geo | ✅ Added | Low |
| 4 | CCAF-DB Active Faults | Physical geo | ✅ Added | Low |
| 5 | Ramsar Wetlands | Environment | ❌ Bot-blocked | Low–Medium |
| 6 | HydroRIVERS | Physical geo | ✅ Added | Medium |
| 7 | WWF Terrestrial Ecoregions (TEOW) | Ecology | ✅ Added | Low |
| 8 | WDPA Protected Areas | Conservation | ✅ Added | Medium |
| 9 | UNESCO World Heritage Sites | Heritage | ✅ Added | Low |
| 10 | ESA WorldCover 2021 (10m land cover) | Environment | ⬜ Raster — needs Mapbox tileset | Medium (raster) |
| 11 | INEGI Marco Geoestadístico 2024 | Demographics | ⬜ Not acquired | Low |
| 12 | INEGI 2020 Indigenous Language Speakers | Demographics | ⬜ Needs tabular join | Medium (data join) |
| 13 | GPWv4 Population Grid | Demographics | ⬜ Raster — needs Mapbox tileset | Medium (raster) |
| 14 | VIIRS Night Lights (annual) | Economics | ⬜ Raster — needs Mapbox tileset | Medium (raster) |
| 15 | OpenHistoricalMap — Colonial Boundaries | History | ⬜ Not acquired | Medium–Hard |
| 16 | GBIF Species Occurrences | Ecology | ✅ Added (Quetzal, Jaguar, Tapir) | Medium |
| 17 | Global Mangrove Watch v3 | Environment | ✅ Added | Low |
| 18 | UNEP-WCMC Coral Reefs (polygons) | Environment | ❌ Auth required / 400 errors | Low |
| 19 | HydroBASINS (watersheds) | Physical geo | ⬜ Not acquired | Low–Medium |
| 20 | Beck Köppen-Geiger Climate Zones | Climate | ⬜ Raster — needs Mapbox tileset | Medium (raster) |
| 21 | GEM Global Active Faults (Mexico) | Physical geo | ✅ Added | Low |
| 22 | ACLED Conflict Events | Politics | ⬜ Registration required | Low |
| 23 | CONABIO Geoportal Layers | Multi-topic | ⬜ Not acquired | Medium |
| 24 | geoBoundaries v6 (ADM-2) | Admin | ✅ Added | Low |
| 25 | INAH Archaeological Zones | Archaeology | ✅ Added (via Wikidata) | Medium |
| 26 | OpenTopography Caracol LiDAR | Archaeology | ✅ Survey catalog added; polygons need point-cloud pipeline | Hard |
| 27 | Puuc Region LiDAR (OpenTopography) | Archaeology | ⬜ Survey catalog only | Hard |
| 28 | tDAR Archaeological GIS Datasets | Archaeology | ⬜ Not acquired | Hard (case-by-case) |
| 29 | HydroLAKES | Physical geo | ✅ Added (via Natural Earth) | Low |
| 30 | GBIF iNaturalist (culturally significant species) | Ecology | ✅ Added | Medium |
| 31 | World Bank Poverty Atlas (SPID) | Economics | ⬜ Not acquired | Medium (data join) |
| 32 | ESA CCI Land Cover 1992–2020 | Environment | ⬜ Raster time-series | Hard (time-series raster) |
| 33 | CHIRPS v3 Precipitation | Climate | ⬜ Raster — needs Mapbox tileset | Hard (raster/time-series) |
| 34 | Healthy Reefs Initiative (Mesoamerican Reef) | Environment | ⬜ Not acquired | Low |
| 35 | Geofabrik OSM Extract | Infrastructure | ⬜ Not acquired | Hard (raw OSM) |
| 36 | Natural Earth Roads & Urban Areas | Infrastructure | ✅ Added | Low |
| 37 | USGS Seismicity Catalog | Physical geo | ✅ Added | Low |
| 38 | Ring of Cenotes / Yucatan Sinkholes | Physical geo | ⬜ Academic data only | Hard (academic) |
| 39 | UNESCO ICH Intangible Heritage | Cultural | ⬜ Points only, low spatial precision | Low |
| 40 | CONABIO ANP Protected Areas (Mexico) | Conservation | ⬜ Covered by WDPA | Low |
| 41 | HydroATLAS River Attributes | Physical geo | ⬜ Not acquired | Medium |
| 42 | NASADEM 30m Elevation | Physical geo | ⬜ Raster — Mapbox DEM already serves this | Hard (raster) |

---

## Section 1: Archaeology & Heritage

### UNESCO World Heritage Sites
- **URL**: https://data.unesco.org/explore/dataset/whc001/export/
- **Polygon boundaries**: https://whc.unesco.org/en/wh-gis/
- **Format**: CSV / JSON (tabular); Shapefile (polygon boundaries separate)
- **License**: Open / CC-compatible
- **Mesoamerica sites**: Chichen Itza, Palenque, Teotihuacan, Monte Alban, Copan, Tikal, Quirigua, Tulum coast, Bay Islands (Honduras), Cocos Island, Belize Barrier Reef, and more
- **Integration plan**: Point layer from tabular CSV (lat/lon included); polygon boundary Shapefile as optional fill layer. Join inscription year, criteria codes, and site area as popup properties.

### UNESCO Intangible Cultural Heritage (ICH)
- **URL**: https://data.unesco.org/explore/dataset/ich001/
- **Format**: JSON / CSV
- **License**: Open (UNESCO open science)
- **Value**: Living-culture layer — Day of the Dead, Mariachi, K'iche' Maya ceremonies, chocolate-making, Voladores ritual. Geolocatable by country/community.
- **Integration plan**: Point layer using country centroids as approximate location; popup with inscription year, domain (performing arts / ritual / craftsmanship), and link to UNESCO page. Low precision but high interest.

### INAH Archaeological Zones (Mexico)
- **URL**: http://www.geoportal.inah.gob.mx/ and http://vica.inah.gob.mx/
- **Format**: WMS (web map service) + downloadable points
- **License**: Open Mexican government data
- **Value**: 187+ officially open pre-Hispanic sites in Mexico with INAH codes, administrative status, and zone boundaries. Authoritative — distinct from Pleiades/Wikidata in your current `sites` layer.
- **Integration plan**: Fetch as GeoJSON via WMS `GetFeature` request or download portal. Add as circle layer; may overlap with existing `sites` layer — deduplicate by name before merging or keep as separate authoritative layer.

### OpenTopography — Caracol LiDAR (Belize)
- **URL**: https://opentopography.org/ (search "Caracol")
- **Format**: LAS/LAZ point cloud + derived GeoTIFF DEM
- **License**: CC-BY
- **Value**: One of the only publicly downloadable archaeological LiDAR point-cloud datasets for Mesoamerica. Complements your PACUNAM coverage with the Caracol zone (western Belize).
- **Integration plan**: Derive structure polygons using the same pipeline as PACUNAM data (DEM → canopy height model → polygon detection). Store as a `caracol-settlement.geojson`. High effort but high value.

### Puuc Region LiDAR (Yucatan)
- **URL**: https://opentopography.org/ (Fernandez-Diaz et al. 2021 PLOS One dataset)
- **Format**: LAS/LAZ + GeoTIFF
- **License**: CC-BY
- **Value**: ~2,000 km² around Uxmal — extends LIDAR coverage into the northern Yucatan / Puuc Hills not covered by PACUNAM. Paper documented massive undiscovered settlement density.
- **Integration plan**: Same pipeline as Caracol. Most practical initial step: use the published DEM to derive a hillshade raster layer rather than extracting structure polygons.

### tDAR — Digital Archaeological Record
- **URL**: https://core.tdar.org/browse/geographic-keyword/83901/mesoamerica-eastern
- **Format**: Shapefile / CSV / GIS datasets (varies by deposit)
- **License**: Varies by depositor (many CC-BY or academic open)
- **Value**: Peer-deposited GIS datasets including Proyecto Regional Palenque (653 sites), Caracol settlement mapping, etc. Available via request or direct download.
- **Integration plan**: Case-by-case — browse by site name, download shapefile, reproject to WGS84, add to `public/data/`. Treat each as an individual layer.

---

## Section 2: Physical Geography

### HydroRIVERS
- **URL**: https://www.hydrosheds.org/products/hydrorivers
- **Format**: Shapefile (North America + Central America tiles)
- **License**: CC-BY 4.0
- **Value**: River polylines with Strahler stream order, upstream drainage area, and estimated discharge. Far richer than OSM rivers — shows the full drainage network Maya used for agriculture and trade.
- **Integration plan**: Filter to Mesoamerica bounding box. Add as `line` layer with width driven by stream order (Strahler 1–2 = thin, 6–7 = thick). Popup shows river name, order, discharge.

### HydroBASINS (Watersheds)
- **URL**: https://www.hydrosheds.org/products/hydrobasins
- **Format**: Shapefile
- **License**: CC-BY 4.0
- **Value**: Nested watershed polygons at 12 Pfafstetter levels. Shows how the Maya lowlands drain — Usumacinta, Grijalva, Belize River basins directly connected to major site clusters.
- **Integration plan**: Use level 5 or 6 for a regional-scale fill layer. Useful toggled on alongside settlement layers to show hydrological context.

### HydroLAKES
- **URL**: https://www.hydrosheds.org/products/hydrolakes
- **Format**: Shapefile
- **License**: CC-BY 4.0
- **Value**: All lakes >10 ha with volume, area, and shoreline length. Includes Atitlan, Nicaragua, Izabal, Peten Itza — each with direct Maya cultural significance.
- **Integration plan**: Simple fill polygon layer. Can merge with HydroRIVERS for a complete water layer.

### GVP Volcanoes (Smithsonian)
- **URL**: https://volcano.si.edu/gvp_votw.cfm; WFS: https://webservices.volcano.si.edu/geoserver/web/
- **Format**: CSV, GeoJSON, KML
- **License**: Public domain
- **Value**: The authoritative global volcano registry with eruption history, classification (stratovolcano, caldera, etc.), and Holocene activity. 50+ Holocene volcanoes in Mesoamerica including Popocatepetl, Fuego, Santiaguito, Arenal.
- **Integration plan**: Filter to lat 8–22°N, lon -120 to -77°W. Add as circle layer with color coded by status (active / dormant / extinct). Popup shows last eruption, elevation, type.

### CCAF-DB Active Faults (Central America & Caribbean)
- **URL**: https://github.com/GEMScienceTools/central_am_carib_faults
- **Format**: GeoJSON, Shapefile, GeoPackage
- **License**: CC-BY 4.0
- **Value**: 259 fault traces with slip rates, kinematics (normal, thrust, strike-slip), and quality ratings. Explains why Guatemala City, San Salvador, and Managua have repeatedly been destroyed and rebuilt.
- **Integration plan**: Direct GeoJSON download → `public/data/active-faults.geojson`. Add as `line` layer, colored by fault type. Combine with GEM Global Active Faults (#21) for Mexico coverage.

### GEM Global Active Faults
- **URL**: https://github.com/GEMScienceTools/gem-global-active-faults
- **Format**: GeoJSON, Shapefile
- **License**: CC-BY-SA 4.0
- **Value**: Global companion to CCAF-DB; covers Mexican fault systems (Trans-Mexican Volcanic Belt, Gulf of California) not in the Caribbean-focused CCAF-DB.
- **Integration plan**: Clip to Mesoamerica bbox. Merge with CCAF-DB into a single `fault-lines.geojson` to avoid two separate fault layers.

### WWF Terrestrial Ecoregions (TEOW / Resolve 2017)
- **URL**: https://ecoregions.appspot.com/
- **Format**: Shapefile (global download ~150 MB)
- **License**: CC-BY 4.0
- **Value**: 825 ecoregions under 14 biomes. Mesoamerica spans Tropical Moist Broadleaf Forests, Tropical Dry Forests, Pine-Oak Forests, Montane Grasslands, Mangroves, and Deserts. These boundaries largely drove ancient settlement patterns.
- **Integration plan**: Filter to Mesoamerica bbox. Fill layer with per-feature color by biome type (use `featureColor: true`). Popup shows ecoregion name, biome, endemic species count.

### Global Mangrove Watch v3.0
- **URL**: https://zenodo.org/records/6894273
- **Format**: Shapefile / GeoTIFF (11 epochs 1996–2020)
- **License**: CC-BY 4.0
- **Value**: Time-series mangrove extent covering Mesoamerica's Caribbean and Pacific coasts — mangroves served as key resources for coastal Maya sites.
- **Integration plan**: Use the 2020 polygon layer as a static fill. If time-series animation is built out, use all 11 epochs with a year slider.

### Ramsar Wetlands
- **URL**: https://rsis.ramsar.org/
- **Format**: Shapefile / KML (centroid and boundary)
- **License**: Open (Ramsar Secretariat)
- **Value**: Mexico has 144 Ramsar sites; Central America has 56. Includes key Maya lowland bajo swamps (Calakmul, Peten), Caribbean lagoon systems, and Pacific estuaries.
- **Integration plan**: Download boundary shapefile, filter to Mesoamerica, add as fill layer. Popup shows site name, designation year, and ecological description.

### Beck Köppen-Geiger Climate Zones
- **URL**: https://www.gloh2o.org/koppen/
- **Format**: GeoTIFF (1 km resolution)
- **License**: CC-BY 4.0
- **Value**: Most current 1-km climate zone classification — shows tropical/subtropical transition sharply across Mesoamerica. Relevant to ancient agricultural strategy and settlement distribution.
- **Integration plan**: Raster tile layer (similar to population map type overlay). Either vectorize top-level zone boundaries (Af, Am, Aw, BSh, Cfb, etc.) for fill polygons, or display as a raster overlay with opacity control.

### NOAA IBTrACS Hurricane Tracks
- **URL**: https://www.ncei.noaa.gov/products/international-best-track-archive; HDX: https://data.humdata.org/dataset/ibtracs-global-tropical-storm-tracks
- **Format**: CSV, Shapefile, GeoJSON
- **License**: Public domain
- **Value**: 6,000+ named storm tracks since 1842. Caribbean coast of Belize, Honduras, and the Yucatan are among the world's most hurricane-exposed zones — historically devastating to coastal Maya sites.
- **Integration plan**: Filter to Atlantic + Eastern Pacific basins, clip to Mesoamerica extended bounding box. Add as line layer (polylines per storm). Color by wind speed category. Year-range filter slider would be ideal.

---

## Section 3: Historical & Colonial

### OpenHistoricalMap — Colonial Administrative Boundaries
- **URL**: https://www.openhistoricalmap.org/; Overpass API with `date` filter
- **Format**: OSM PBF / GeoJSON (via Overpass query)
- **License**: ODbL
- **Value**: Time-aware OSM rendering of colonial units — viceroyalties, audiencias (Audiencia de Mexico City, Audiencia de Guatemala), intendancies, dioceses. Queryable for any year between ~1519 and 1821.
- **Integration plan**: Use the Overpass API to extract audiencia boundaries as polygons for a given year (e.g. 1650). Convert to GeoJSON. Add as `colonial-audiencias.geojson` fill layer. This is the most practical approach; a full time-slider is complex.

### Dartmouth Historical Mexico Boundaries
- **URL**: https://researchguides.dartmouth.edu/gisdata/mexicodata
- **Format**: Shapefile
- **License**: Academic open access
- **Value**: Pre-modern administrative boundary reconstructions (intendancies, colonial provinces) not available in GADM or INEGI.
- **Integration plan**: Download, reproject to WGS84, clip to Mexico. Merge with OpenHistoricalMap colonial data for a composite colonial-administrative layer.

---

## Section 4: Modern Political / Administrative

### geoBoundaries v6.0 — ADM-2 Boundaries (Open License)
- **URL**: https://www.geoboundaries.org/countryDownloads.html
- **Format**: GeoJSON, Shapefile
- **License**: CC-BY 4.0 (fully open — can be redistributed, unlike GADM)
- **Value**: ADM-2 (municipality / county level) for all Mesoamerica countries in a consistent schema. Unlike GADM, legally clear to redistribute as part of a public map.
- **Integration plan**: Download ADM-2 for all 7 countries, merge into `municipalities.geojson`. Add as a fill layer (outline only by default) — useful as a reference grid for demographic joins.

### INEGI Marco Geoestadístico 2024 (Mexico Municipalities)
- **URL**: https://www.inegi.org.mx/temas/mg/
- **Format**: Shapefile
- **License**: Open Mexican government data
- **Value**: 2,471 Mexican municipalities updated annually with AGEB urban block sub-divisions. The definitive source for Mexico — more current and authoritative than geoBoundaries for Mexico specifically.
- **Integration plan**: Use as the Mexico component of the municipalities layer above; merge with geoBoundaries for Guatemala/Belize/Honduras/El Salvador/Nicaragua/Costa Rica.

### WDPA — World Database on Protected Areas
- **URL**: https://www.protectedplanet.net/en/thematic-areas/wdpa (registration required)
- **Format**: Shapefile, GeoPackage (monthly update)
- **License**: Free for non-commercial use with attribution
- **Value**: 312,000+ protected areas globally. Biosphere reserves (Calakmul, Maya, Sian Ka'an), national parks (Tikal, Monteverde), wildlife refuges — shows modern conservation overlay on ancient landscapes.
- **Integration plan**: Filter to Mesoamerica bbox, dissolve by IUCN category for a manageable polygon count. Add as fill layer with per-feature color by protection level.

### CONABIO ANP — Mexico Federal Protected Areas
- **URL**: http://geoportal.conabio.gob.mx/metadatos/doc/html/anpmx.html
- **Format**: Shapefile
- **License**: CC-NC 2.5
- **Value**: More current and detailed than WDPA for Mexico specifically — 191 federal areas as of 2024, maintained by CONANP.
- **Integration plan**: Use as the Mexico component of a protected areas layer, supplemented by WDPA for Central America.

---

## Section 5: Demographics & Economics

### INEGI 2020 Census — Indigenous Language Speakers by Municipality
- **URL**: https://en.www.inegi.org.mx/programas/ccpv/2020/; joined shapefile via https://blog.diegovalle.net/2022/11/inegi-mexico-2020-census-shapefiles.html
- **Format**: CSV (join to INEGI municipal shapefile)
- **License**: Open Mexican government data
- **Value**: Municipality-level speaker counts for all 68 indigenous languages (Nahuatl, Yucatec Maya, Tzeltal, Tzotzil, Mixtec, Zapotec, Totonac, and more). Directly bridges ancient language layer to living speakers.
- **Integration plan**: Python script to join census CSV to municipal shapefile. Add as choropleth fill layer showing % of municipal population speaking indigenous languages. Popup lists the top-3 languages for that municipality.

### GPWv4 — Gridded Population of the World
- **URL**: https://sedac.ciesin.columbia.edu/data/collection/gpw-v4
- **Format**: GeoTIFF (30 arc-second = ~1 km)
- **License**: CC-BY 4.0
- **Value**: Grid-based population independent of administrative boundaries — shows population pressure on archaeological zones without political distortion. Available for 2000, 2005, 2010, 2015, 2020.
- **Integration plan**: Raster tile overlay (similar to existing population map type but at grid rather than admin-1 resolution). Clip to Mesoamerica. Could be used as a second map-type option ("Fine Population Grid").

### VIIRS Black Marble Night Lights (Annual)
- **URL**: https://eogdata.mines.edu/products/vnl/ (Earth Observation Group annual composites)
- **Format**: GeoTIFF (500m annual average radiance)
- **License**: Public domain (NASA)
- **Value**: Night lights as urbanization/development proxy. The contrast between Mexico City and the dark Peten/Chiapas lowlands is visually striking; highlights development pressure on archaeological zones.
- **Integration plan**: Raster tile overlay; add as a map-type option ("Night Lights") alongside the existing population/topographic/terrain options.

### World Bank Subnational Poverty Atlas (SPID)
- **URL**: https://pipmaps.worldbank.org/en/data/datatopics/poverty-portal/poverty-geospatial
- **Format**: CSV with geographic IDs (join to admin boundaries)
- **License**: Open (World Bank)
- **Value**: Poverty headcount ratio by subnational region — shows spatial correlation between indigenous territories, archaeological zones, and modern poverty. Covers all Mesoamerica.
- **Integration plan**: Join to geoBoundaries ADM-1 or ADM-2 geometries. Choropleth fill layer. Most impactful when toggled alongside the indigenous language speakers layer.

### ESA WorldCover 2021 (10m Land Cover)
- **URL**: https://esa-worldcover.org/en/data-access
- **Format**: Cloud-Optimized GeoTIFF (COG), 1°×1° tiles
- **License**: CC-BY 4.0
- **Value**: Global 10m land cover (trees, shrubs, cropland, urban, water, mangrove, etc.) — shows current land use around archaeological sites at a resolution detailed enough to distinguish individual fields and clearings.
- **Integration plan**: Serve as raster tile overlay via Mapbox raster source pointing to COG tiles, or vectorize dominant class per 30m block. Could be an additional map-type option ("Land Cover").

---

## Section 6: Climate & Environment

### GBIF Species Occurrences (Culturally Significant Species)
- **URL**: https://api.gbif.org/v1/occurrence/search; bulk download: https://www.gbif.org/occurrence/download
- **Format**: CSV, Darwin Core Archive
- **License**: CC-BY / CC0 (varies by contributing institution)
- **Target species for Mesoamerica**:
  - Resplendent Quetzal (*Pharomachrus mocinno*) — Maya deity bird
  - Jaguar (*Panthera onca*) — most powerful Maya symbol
  - Ceiba (*Ceiba pentandra*) — Maya world-tree / axis mundi
  - Cacao (*Theobroma cacao*) — origin species + cultivated range
  - Maize wild relatives (*Zea mays* ssp. *mexicana*, *parviglumis*) — origins of agriculture
- **Integration plan**: Query GBIF API per species, filter to Mesoamerica bbox, output as GeoJSON point layers. Could group as a single "Maya Cultural Species" layer with species name as popup, or as separate layers per species.

### UNEP-WCMC Global Coral Reef Distribution
- **URL**: https://data.unep-wcmc.org/datasets/1; also via Ocean+ Habitats: https://habitats.oceanplus.org/
- **Format**: Shapefile
- **License**: Open for non-commercial / research
- **Value**: The Belize Barrier Reef (UNESCO World Heritage) and the full Mesoamerican Reef System (world's second largest) — directly relevant to ancient coastal Maya trade networks and modern tourism.
- **Integration plan**: Filter to Caribbean coast (15–22°N, 85–88°W). Add as fill layer. Combine with Healthy Reefs Initiative data (#34) for more detailed regional reef health attributes.

### Healthy Reefs Initiative — Mesoamerican Reef
- **URL**: https://www.healthyreefs.org/cms/maps-data/
- **Format**: Shapefile / KML
- **License**: Open for research/conservation
- **Value**: Regional reef zones with health scores (fish biomass, coral cover, macroalgae) specifically for Belize, Mexico (Quintana Roo), Guatemala, and Honduras.
- **Integration plan**: Supplement the global UNEP-WCMC reef layer with this higher-detail regional layer for the Caribbean coast.

---

## Section 7: Conflict & Politics

### ACLED Armed Conflict Events (Latin America)
- **URL**: https://acleddata.com/ (registration required, free); HDX: https://data.humdata.org/dataset/mexico-acled-conflict-data
- **Format**: CSV (event-level with lat/lon, date, event type, actor, fatalities)
- **License**: Free with registration; non-commercial
- **Value**: Real-time updated event database for political violence, protests, and battles. Relevant for the Northern Triangle (Guatemala, Honduras, El Salvador), Chiapas/Guerrero in Mexico, and drug-trade geography overlapping indigenous territories.
- **Integration plan**: Filter to Mesoamerica bbox and relevant event types (battles, explosions/remote violence, violence against civilians). Time-slice to recent 5 years. Circle layer with color by event type, size by fatality count.

---

## Section 8: Infrastructure

### Natural Earth 1:10m Roads and Urban Areas
- **URL**: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
- **Format**: Shapefile (public domain)
- **License**: Public domain
- **Value**: Schematic road network and urban areas at 1:10m scale — not detailed but extremely clean and usable at regional zoom levels. Zero preprocessing needed.
- **Integration plan**: Filter to Mesoamerica. Add as a reference infrastructure layer (roads as `line`, urban as `fill` or `circle`). Default off — useful when zoomed out.

### Geofabrik OSM Extract — Central America & Mexico
- **URL**: https://download.geofabrik.de/central-america.html; https://download.geofabrik.de/north-america/mexico.html
- **Format**: Shapefile, OSM PBF
- **License**: ODbL (OpenStreetMap)
- **Value**: Daily-updated full OSM for both regions — roads, railways, airports, ports, land use, buildings, waterways, POIs. The most complete freely available infrastructure dataset.
- **Integration plan**: Use ogr2ogr or osmium to extract specific layers (e.g. roads, railways, airports). High effort but maximum coverage. Start with major roads (`fclass = 'motorway' OR 'primary'`) and airports as quick wins.

---

## Integration Approach

### Effort tiers

**Low effort (vector GeoJSON/Shapefile → direct add)**
Datasets where the download is already a clean GeoJSON or simple Shapefile in WGS84:
1. Download and clip to Mesoamerica bbox
2. `python3 -c "import geopandas as gpd; gdf = gpd.read_file('input.shp').clip(bbox); gdf.to_file('output.geojson', driver='GeoJSON')"`
3. Drop in `public/data/`, add entry to `LAYER_REGISTRY`

Target candidates: volcanoes, fault lines, hurricane tracks, HydroLAKES, mangroves, coral reefs, UNESCO sites, ACLED events, geoBoundaries ADM-2, WWF ecoregions, Ramsar wetlands, Natural Earth roads

**Medium effort (data join or format conversion required)**
4. Join demographic CSVs to boundary geometries before generating GeoJSON
5. Raster datasets need either vectorization (slow) or serving as a Mapbox raster tile overlay

Raster overlay approach (Mapbox raster source):
```js
map.addSource('worldcover', {
  type: 'raster',
  tiles: ['https://your-hosted-tile/{z}/{x}/{y}.png'],
  tileSize: 256,
})
map.addLayer({ id: 'worldcover', type: 'raster', source: 'worldcover', paint: { 'raster-opacity': 0.7 } })
```
For large global rasters (WorldCover, Night Lights, GPWv4), the most practical approach is hosting tiles on Mapbox Studio as a custom tileset — upload the COG and Mapbox handles tile serving.

Target candidates: ESA WorldCover, night lights, GPWv4 grid, Köppen climate, CHIRPS precipitation, Hansen forest change

**High effort (significant data processing)**
- Archaeological LiDAR point clouds (Caracol, Puuc) → need DEM derivation → canopy height model → polygon extraction
- OSM extracts → ogr2ogr pipeline to isolate specific feature classes
- Time-series rasters (Hansen, ESA CCI 1992–2020) → need a year-slider UI component in addition to data processing
- GBIF species occurrences → API query per species, deduplication, clustering

### Recommended first-pass batch (low effort, high visual value)

In rough order of uniqueness-to-effort ratio:

1. **Volcanoes (GVP)** — download GeoJSON from WFS, filter bbox, add as circle layer with eruption year popup
2. **Fault lines (CCAF-DB + GEM merged)** — two GeoJSON downloads, merge, clip, add as line layer
3. **Hurricane tracks (IBTrACS)** — CSV download, convert to LineString GeoJSON per storm, filter to Atlantic/Pacific + Mesoamerica bbox
4. **UNESCO World Heritage points** — CSV with lat/lon, convert to GeoJSON, add circle layer
5. **HydroRIVERS** — download North/Central America Shapefile, clip, add as line layer with stream order–driven width
6. **WWF Ecoregions** — download global Shapefile, clip, add as fill layer with per-feature biome color
7. **Mangroves (GMW 2020)** — download polygon Shapefile, clip to coasts, add as fill
8. **WDPA Protected Areas** — download after registration, filter Mesoamerica, add as fill
9. **ACLED conflict events** — CSV from HDX (no registration), convert to GeoJSON, add as circle layer
10. **geoBoundaries ADM-2** — JSON downloads per country, merge, add as outline-only fill layer

### New map-type options
The existing map-type system (`default`, `topographic`, `terrain`, `population`) could be extended with:

| New type | Data source | Implementation |
|----------|-------------|----------------|
| Night Lights | VIIRS Black Marble | Mapbox raster tileset (upload COG) |
| Land Cover | ESA WorldCover 2021 | Mapbox raster tileset (upload COG) |
| Forest Change | Hansen GFC 2024 | Mapbox raster tileset (loss year band) |
| Climate Zones | Beck Köppen 1km | Vectorize or raster tileset |

For a 5th and 6th map-type button, "Night Lights" and "Land Cover" are the most visually impactful and thematically distinct from existing options.

---

## Known Gaps (No Confirmed Open Source)

| Topic | Gap | Notes |
|-------|-----|-------|
| Maya sacbe (road) network | No standalone open GIS layer exists | Only in site-specific publications; must digitize from LiDAR or published maps |
| Encomienda regions | No authoritative polygon dataset found | OpenHistoricalMap coverage is partial; Dartmouth data covers only Mexico |
| Colonial mission locations | No single open Shapefile | tDAR has fragments; Berkeley GeoData has some — requires case-by-case aggregation |
| Cenote polygons | No complete open polygon dataset | INEGI base topo + academic synthesis; best approach is CONABIO + INEGI portal |
| Maya trade route corridors | No open GIS layer | Must be constructed from archaeological literature + site network analysis |
| Municipal election results | Patchy and country-specific | Mexico's INE publishes by election; Central American equivalents are inconsistent |
