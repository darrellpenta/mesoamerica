import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const supabase = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return url && key ? createClient(url, key) : null
})()

const TYPE_COLORS = {
  person:         '#8b5cf6',
  event:          '#ef4444',
  place:          '#10b981',
  territory:      '#3b82f6',
  geo_feature:    '#f59e0b',
  admin_boundary: '#6b7280',
}

const ERAS = [
  { num: 0, label: 'All Eras',                    start: 1950, end: 2026, color: '#7a82a8' },
  { num: 1, label: 'Cold War Origins',             start: 1950, end: 1979, color: '#6366f1' },
  { num: 2, label: 'Peak Civil War',               start: 1979, end: 1992, color: '#dc2626' },
  { num: 3, label: 'Post-War & Gang Seeding',      start: 1992, end: 2000, color: '#d97706' },
  { num: 4, label: 'Gang Violence Era',            start: 2000, end: 2014, color: '#ea580c' },
  { num: 5, label: 'Caravan Era',                  start: 2014, end: 2021, color: '#7c3aed' },
  { num: 6, label: 'Divergence',                   start: 2022, end: 2026, color: '#0891b2' },
]

const FLOW_COLORS = {
  displacement: '#6366f1',
  refugee:      '#dc2626',
  economic:     '#d97706',
  deportation:  '#7c3aed',
  repatriation: '#0891b2',
  caravan:      '#ea580c',
  other:        '#6b7280',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatYear(y) {
  if (y == null) return null
  return y < 0 ? `${Math.abs(y)} BCE` : String(y)
}

function formatCount(n) {
  if (n == null) return ''
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`
  return n.toLocaleString()
}

function bezierArc(from, to, numPts = 24) {
  const [x0, y0] = from
  const [x1, y1] = to
  const dx = x1 - x0, dy = y1 - y0
  const cx = (x0 + x1) / 2 - dy * 0.25
  const cy = (y0 + y1) / 2 + dx * 0.25
  const pts = []
  for (let i = 0; i <= numPts; i++) {
    const t = i / numPts, mt = 1 - t
    pts.push([
      mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
      mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
    ])
  }
  return pts
}

function interpCount(pops, nodeId, year) {
  const nodePops = pops
    .filter(p => p.node_id === nodeId && p.count != null)
    .sort((a, b) => a.year - b.year)
  if (!nodePops.length) return null
  if (year <= nodePops[0].year) return nodePops[0].count
  if (year >= nodePops[nodePops.length - 1].year) return nodePops[nodePops.length - 1].count
  const hi = nodePops.find(p => p.year >= year)
  const lo = [...nodePops].reverse().find(p => p.year <= year)
  if (!hi || !lo) return null
  if (hi.year === lo.year) return lo.count
  const t = (year - lo.year) / (hi.year - lo.year)
  return Math.round(lo.count + t * (hi.count - lo.count))
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 10,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
      background: `${TYPE_COLORS[type] ?? '#7a82a8'}22`,
      color: TYPE_COLORS[type] ?? '#7a82a8', textTransform: 'uppercase',
    }}>
      {type?.replace(/_/g, ' ')}
    </span>
  )
}

// ── Story Map (migration corridors) ───────────────────────────────────────────
function StoryMap({ storyId }) {
  const container = useRef(null)
  const map       = useRef(null)
  const popup     = useRef(null)
  const [era, setEra] = useState(0)
  const [ready, setReady] = useState(false)

  const flowsUrl = new URL('./data/migration-flows.geojson', document.baseURI).href

  useEffect(() => {
    if (!container.current || !import.meta.env.VITE_MAPBOX_TOKEN) return
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

    const m = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-95, 18], zoom: 3.2,
      attributionControl: false,
    })
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.current = m

    popup.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '300px', className: 'story-map-popup' })

    m.on('load', async () => {
      m.addSource('migration-flows', { type: 'geojson', data: flowsUrl })
      m.addLayer({
        id: 'migration-lines',
        type: 'line', source: 'migration-flows',
        filter: ['!=', ['get', 'flow_type'], 'deportation'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.5, 6, 3], 'line-opacity': 0.8 },
      })
      m.addLayer({
        id: 'migration-lines-dashed',
        type: 'line', source: 'migration-flows',
        filter: ['any', ['==', ['get', 'flow_type'], 'deportation'], ['==', ['get', 'flow_type'], 'repatriation']],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.5, 6, 3], 'line-opacity': 0.75, 'line-dasharray': [3, 2] },
      })

      let placesGeoJSON = { type: 'FeatureCollection', features: [] }
      if (supabase) {
        const { data: raw } = await supabase.rpc('export_entity_type', { p_type: 'place', p_story_id: storyId, p_limit: 200 })
        const rows = (raw ?? []).map(r => r.row_data ?? r)
        placesGeoJSON = {
          type: 'FeatureCollection',
          features: rows.filter(r => r.lon != null && r.lat != null).map(r => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
            properties: { entity_id: r.entity_id, name: r.name, date_start: r.date_start ?? null, date_end: r.date_end ?? null },
          })),
        }
      }
      m.addSource('story-places', { type: 'geojson', data: placesGeoJSON })
      m.addLayer({
        id: 'story-places-circles',
        type: 'circle', source: 'story-places',
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 8, 9], 'circle-color': '#10b981', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-opacity': 0.92 },
      })

      const showFlowPopup = (e) => {
        const p = e.features[0].properties
        const dateRange = p.valid_from === p.valid_to ? String(p.valid_from) : `${p.valid_from}–${p.valid_to}`
        const typeLabel = { displacement: 'Displacement', refugee: 'Refugee flow', deportation: 'Deportation ↩', repatriation: 'Repatriation ↩', economic: 'Economic migration', caravan: 'Caravan' }[p.flow_type] ?? p.flow_type
        popup.current.setLngLat(e.lngLat).setHTML(`<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5"><div style="font-weight:700;margin-bottom:4px">${p.name}</div><div style="font-size:11px;color:#7a82a8;margin-bottom:6px">${typeLabel} · ${dateRange}</div><div style="color:#374151">${p.description}</div></div>`).addTo(m)
      }
      const showPlacePopup = (e) => {
        const p = e.features[0].properties
        const ds = p.date_start != null ? formatYear(p.date_start) : null
        const de = p.date_end   != null ? formatYear(p.date_end)   : null
        const dateStr = ds ? (de && de !== ds ? `${ds}–${de}` : ds) : ''
        popup.current.setLngLat(e.lngLat).setHTML(`<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5"><div style="font-weight:700;margin-bottom:2px">${p.name}</div>${dateStr ? `<div style="font-size:11px;color:#7a82a8">${dateStr}</div>` : ''}</div>`).addTo(m)
      }

      m.on('click', 'migration-lines',        showFlowPopup)
      m.on('click', 'migration-lines-dashed', showFlowPopup)
      m.on('click', 'story-places-circles',   showPlacePopup)
      ;['migration-lines', 'migration-lines-dashed', 'story-places-circles'].forEach(id => {
        m.on('mouseenter', id, () => { m.getCanvas().style.cursor = 'pointer' })
        m.on('mouseleave', id, () => { m.getCanvas().style.cursor = '' })
      })

      setReady(true)
    })

    return () => { popup.current?.remove(); m.remove() }
  }, [storyId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map.current || !ready) return
    ;['migration-lines', 'migration-lines-dashed'].forEach(id => {
      const baseFilter = id === 'migration-lines'
        ? ['!=', ['get', 'flow_type'], 'deportation']
        : ['any', ['==', ['get', 'flow_type'], 'deportation'], ['==', ['get', 'flow_type'], 'repatriation']]
      map.current.setFilter(id, era === 0 ? baseFilter : ['all', ['==', ['get', 'era'], era], baseFilter])
    })
  }, [era, ready])

  if (!import.meta.env.VITE_MAPBOX_TOKEN) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#7a82a8', fontSize: 14 }}>Mapbox token not configured.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div ref={container} style={{ flex: 1 }} />
      {/* Era filter strip */}
      <div style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.92)', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.12)', backdropFilter: 'blur(6px)', maxWidth: 'calc(100vw - 48px)' }}>
        {ERAS.map(e => (
          <button key={e.num} onClick={() => setEra(e.num)} style={{ padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', background: era === e.num ? e.color : 'transparent', color: era === e.num ? '#fff' : e.num === 0 ? '#7a82a8' : e.color, outline: era === e.num ? 'none' : `1.5px solid ${e.num === 0 ? '#e0e4f0' : e.color}44`, transition: 'all 0.15s' }}>
            {e.label}
          </button>
        ))}
      </div>
      {/* Legend */}
      <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', backdropFilter: 'blur(6px)', fontSize: 11, lineHeight: 1.8 }}>
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7a82a8' }}>Flow type</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151' }}>
          <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" stroke="#374151" strokeWidth="2" strokeLinecap="round" /></svg>
          Displacement / Migration
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151' }}>
          <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" stroke="#374151" strokeWidth="2" strokeDasharray="5,3" strokeLinecap="butt" /></svg>
          Deportation / Repatriation
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', marginTop: 2 }}>
          <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="#10b981" stroke="white" strokeWidth="1.5" /></svg>
          Key location
        </div>
      </div>
    </div>
  )
}

// ── Flow Map (proportional symbols + arcs + time slider) ──────────────────────
function FlowMap({ storyId, storyTitle }) {
  const container = useRef(null)
  const map       = useRef(null)
  const popup     = useRef(null)
  const playRef   = useRef(null)
  const yearRef   = useRef(null)

  const [nodes, setNodes]   = useState([])
  const [pops, setPops]     = useState([])
  const [edges, setEdges]   = useState([])
  const [loading, setLoading] = useState(true)
  const [ready, setReady]   = useState(false)
  const [year, setYear]     = useState(null)
  const [playing, setPlaying] = useState(false)

  // Keep yearRef in sync for use in Mapbox event handlers
  useEffect(() => { yearRef.current = year }, [year])

  // Snapshot years that have data
  const snapYears = [...new Set(pops.map(p => p.year))].sort((a, b) => a - b)
  const minYear   = snapYears[0]   ?? 1950
  const maxYear   = snapYears[snapYears.length - 1] ?? 2026

  // Fetch flow data
  useEffect(() => {
    if (!supabase || !storyId) return
    let active = true
    ;(async () => {
      setLoading(true)
      const [nr, pr, er] = await Promise.all([
        supabase.from('story_flow_nodes').select('*').eq('story_id', storyId).order('sort_order'),
        supabase.from('story_flow_pops').select('*').eq('story_id', storyId),
        supabase.from('story_flow_edges').select('*').eq('story_id', storyId),
      ])
      if (!active) return
      setNodes(nr.data ?? [])
      setPops(pr.data ?? [])
      setEdges(er.data ?? [])
      setLoading(false)
    })()
    return () => { active = false }
  }, [storyId])

  // Set initial year once pops load
  useEffect(() => {
    if (snapYears.length && year == null) setYear(snapYears[0])
  }, [snapYears.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize Mapbox map
  useEffect(() => {
    if (!container.current || !import.meta.env.VITE_MAPBOX_TOKEN) return
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

    const m = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-95, 18], zoom: 3.2,
      preserveDrawingBuffer: true,   // required for PNG export
      attributionControl: false,
    })
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.current = m

    popup.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '260px' })

    m.on('load', () => {
      // Arc layer (flows)
      m.addSource('flow-arcs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({
        id: 'flow-arcs', type: 'line', source: 'flow-arcs',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 6, 5],
          'line-opacity': 0.6,
        },
      })

      // Node circles
      m.addSource('flow-nodes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({
        id: 'flow-circles', type: 'circle', source: 'flow-nodes',
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': '#2563eb',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.72,
        },
      })
      m.addLayer({
        id: 'flow-labels', type: 'symbol', source: 'flow-nodes',
        layout: {
          'text-field': ['concat', ['get', 'name'], '\n', ['get', 'label']],
          'text-anchor': 'top',
          'text-offset': [0, 0.7],
          'text-size': 11,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#1f2937',
          'text-halo-color': 'rgba(255,255,255,0.88)',
          'text-halo-width': 2,
        },
      })

      // Popup on node click (properties are current because we call setData on year change)
      m.on('click', 'flow-circles', e => {
        const p = e.features[0].properties
        const yr = yearRef.current
        popup.current
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-family:system-ui;font-size:13px;line-height:1.5"><b>${p.name}</b><br><span style="color:#2563eb">${p.label || '—'}</span><span style="color:#7a82a8;font-size:11px"> in ${yr}</span></div>`)
          .addTo(m)
      })
      m.on('click', 'flow-arcs', e => {
        const p = e.features[0].properties
        const v = p.volume ? formatCount(Number(p.volume)) : '—'
        popup.current
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-family:system-ui;font-size:13px;line-height:1.5"><b>${p.from} → ${p.to}</b><br>${p.flow_type} · ${v}${p.label ? `<br><span style="color:#7a82a8">${p.label}</span>` : ''}</div>`)
          .addTo(m)
      })
      ;['flow-circles', 'flow-arcs'].forEach(id => {
        m.on('mouseenter', id, () => { m.getCanvas().style.cursor = 'pointer' })
        m.on('mouseleave', id, () => { m.getCanvas().style.cursor = '' })
      })

      setReady(true)
    })

    return () => {
      clearInterval(playRef.current)
      popup.current?.remove()
      m.remove()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update map data whenever year, nodes, pops, or edges change
  useEffect(() => {
    if (!ready || !map.current || year == null) return
    const m = map.current

    // Proportional circles
    const counts = nodes.map(n => interpCount(pops, n.id, year)).filter(v => v != null && v > 0)
    const maxCount = counts.length ? Math.max(...counts) : 1

    const nodeFeatures = nodes.map(n => {
      const count  = interpCount(pops, n.id, year)
      const radius = count != null && count > 0 ? Math.max(5, Math.sqrt(count / maxCount) * 36) : 4
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
        properties: { id: n.id, name: n.name, count, radius, label: count ? formatCount(count) : '' },
      }
    })

    // Bezier arcs — only edges active at this year
    const arcFeatures = edges
      .filter(e => {
        if (e.valid_from == null && e.valid_to == null) return true
        if (e.valid_from != null && year < e.valid_from) return false
        if (e.valid_to   != null && year > e.valid_to)  return false
        return true
      })
      .map(e => {
        const from = nodes.find(n => n.id === e.from_node_id)
        const to   = nodes.find(n => n.id === e.to_node_id)
        if (!from || !to) return null
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: bezierArc([from.lon, from.lat], [to.lon, to.lat]) },
          properties: {
            from: from.name, to: to.name,
            volume: e.volume, flow_type: e.flow_type ?? 'other',
            color: FLOW_COLORS[e.flow_type] ?? '#6b7280',
            label: e.label ?? '',
          },
        }
      }).filter(Boolean)

    m.getSource('flow-nodes')?.setData({ type: 'FeatureCollection', features: nodeFeatures })
    m.getSource('flow-arcs')?.setData({ type: 'FeatureCollection', features: arcFeatures })
  }, [year, nodes, pops, edges, ready])

  // Play / pause
  const startPlay = () => {
    if (playing) return
    setPlaying(true)
    playRef.current = setInterval(() => {
      setYear(y => {
        if (y >= maxYear) { clearInterval(playRef.current); setPlaying(false); return maxYear }
        return y + 1
      })
    }, 200)
  }
  const stopPlay = () => { setPlaying(false); clearInterval(playRef.current) }

  // Exports
  const exportPopCsv = () => {
    const rows = [['node', 'year', 'count']]
    nodes.forEach(n => {
      pops.filter(p => p.node_id === n.id && p.count != null)
        .sort((a, b) => a.year - b.year)
        .forEach(p => rows.push([`"${n.name}"`, p.year, p.count]))
    })
    downloadBlob(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }), `${storyTitle ?? 'story'}-populations.csv`)
  }

  const exportFlowsCsv = () => {
    const rows = [['from', 'to', 'volume', 'valid_from', 'valid_to', 'flow_type', 'label']]
    edges.forEach(e => {
      const from = nodes.find(n => n.id === e.from_node_id)?.name ?? ''
      const to   = nodes.find(n => n.id === e.to_node_id)?.name   ?? ''
      rows.push([`"${from}"`, `"${to}"`, e.volume ?? '', e.valid_from ?? '', e.valid_to ?? '', e.flow_type ?? '', `"${e.label ?? ''}"`])
    })
    downloadBlob(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }), `${storyTitle ?? 'story'}-flows.csv`)
  }

  const exportRScript = () => {
    const nodesStr = nodes.map(n => `"${n.name}"`).join(', ')
    const script = `library(tidyverse)

# ── Load exported data ────────────────────────────────────────────────────────
pop   <- read_csv("${storyTitle ?? 'story'}-populations.csv")
flows <- read_csv("${storyTitle ?? 'story'}-flows.csv")

# ── Population trends: line chart ─────────────────────────────────────────────
ggplot(pop, aes(year, count, color = node, group = node)) +
  geom_line(linewidth = 1.2) +
  geom_point(size = 2.5) +
  scale_y_continuous(labels = scales::label_comma()) +
  labs(title = "${storyTitle ?? 'Story'}: Population by Location",
       x = "Year", y = "Count", color = "Location") +
  theme_minimal(base_size = 13)
ggsave("population_trends.png", width = 10, height = 6, dpi = 150)

# ── Population trends: stacked area ───────────────────────────────────────────
ggplot(pop, aes(year, count, fill = node, group = node)) +
  geom_area(alpha = 0.75, position = "stack") +
  scale_y_continuous(labels = scales::label_comma()) +
  labs(title = "${storyTitle ?? 'Story'}: Population Stack",
       x = "Year", y = "Count", fill = "Location") +
  theme_minimal(base_size = 13)
ggsave("population_stacked.png", width = 10, height = 6, dpi = 150)

# ── Flow diagram: alluvial (requires ggalluvial) ───────────────────────────────
# install.packages("ggalluvial")
# library(ggalluvial)
# ggplot(flows, aes(axis1 = from, axis2 = to, y = volume, fill = flow_type)) +
#   geom_alluvium(alpha = 0.7) +
#   geom_stratum() +
#   geom_text(stat = "stratum", aes(label = after_stat(stratum))) +
#   theme_void()
`
    downloadBlob(new Blob([script], { type: 'text/plain' }), `${storyTitle ?? 'story'}-analysis.R`)
  }

  const exportPng = () => {
    if (!map.current) return
    map.current.getCanvas().toBlob(blob => {
      downloadBlob(blob, `${storyTitle ?? 'story'}-flow-map-${year ?? 'map'}.png`)
    }, 'image/png')
  }

  // Empty state
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>Loading…</div>

  if (!nodes.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, padding: 32 }}>
      <div style={{ fontSize: 32, lineHeight: 1 }}>📍</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>No flow map data yet</div>
      <div style={{ fontSize: 13, color: '#7a82a8', textAlign: 'center', maxWidth: 340, lineHeight: 1.55 }}>
        Administrators can add geographic nodes, population snapshots, and migration flows through Admin → Stories → this story → Flow Map.
      </div>
    </div>
  )

  const token = import.meta.env.VITE_MAPBOX_TOKEN
  if (!token) return <div style={{ padding: 32, color: '#7a82a8', fontSize: 14 }}>Mapbox token not configured.</div>

  const btnStyle = { padding: '5px 12px', borderRadius: 6, border: '1px solid #e0e4f0', fontSize: 12, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#374151', transition: 'background 0.1s' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Time controls bar */}
      <div style={{ flexShrink: 0, padding: '8px 16px', borderBottom: '1px solid #e0e4f0', background: '#fafbfe', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Year display */}
        <div style={{ fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums', minWidth: 40, color: '#1f2937' }}>
          {year ?? minYear}
        </div>
        {/* Play / pause */}
        <button
          onClick={playing ? stopPlay : startPlay}
          style={{ ...btnStyle, padding: '5px 10px', fontSize: 14 }}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        {/* Slider */}
        <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <input
            type="range"
            min={minYear} max={maxYear} step={1}
            value={year ?? minYear}
            list={`snap-years-${storyId}`}
            onChange={e => { stopPlay(); setYear(Number(e.target.value)) }}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#2563eb' }}
          />
          <datalist id={`snap-years-${storyId}`}>
            {snapYears.map(y => <option key={y} value={y} />)}
          </datalist>
          {snapYears.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#7a82a8', marginTop: 1, userSelect: 'none' }}>
              <span>{minYear}</span>
              <span>{maxYear}</span>
            </div>
          )}
        </div>
        {/* Export buttons */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button onClick={exportPopCsv}    style={btnStyle} title="Download population data as CSV">Pop CSV</button>
          <button onClick={exportFlowsCsv}  style={btnStyle} title="Download flow edges as CSV">Flows CSV</button>
          <button onClick={exportRScript}   style={btnStyle} title="Download R analysis script">R Script</button>
          <button onClick={exportPng}       style={btnStyle} title="Export current map view as PNG">PNG</button>
        </div>
      </div>

      {/* Map canvas */}
      <div ref={container} style={{ flex: 1 }} />

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 36, right: 12, background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', backdropFilter: 'blur(6px)', fontSize: 11, lineHeight: 1.8, pointerEvents: 'none' }}>
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7a82a8' }}>Flow type</div>
        {Object.entries(FLOW_COLORS).map(([k, c]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151', fontSize: 11 }}>
            <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={c} strokeWidth="2.5" strokeLinecap="round" /></svg>
            {k.charAt(0).toUpperCase() + k.slice(1)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── About tab ─────────────────────────────────────────────────────────────────
function StoryAbout({ story, entities }) {
  const byType = entities.reduce((acc, link) => {
    const t = link.entity_type ?? 'other'
    ;(acc[t] = acc[t] ?? []).push(link)
    return acc
  }, {})

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 28 }}>
        {story.theme && (
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a82a8', marginBottom: 6 }}>
            {story.theme}
          </div>
        )}
        <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
          {story.title}
        </h1>
        {(story.time_start != null || story.time_end != null) && (
          <div style={{ fontSize: 13, color: '#7a82a8', marginBottom: 8 }}>
            {formatYear(story.time_start)}{story.time_end != null ? ` – ${formatYear(story.time_end)}` : ''}
          </div>
        )}
        {story.description && (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, opacity: 0.85 }}>
            {story.description}
          </p>
        )}
      </div>

      {Object.entries(byType).map(([type, links]) => (
        <div key={type} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TYPE_COLORS[type] ?? '#7a82a8', marginBottom: 8 }}>
            {type.replace(/_/g, ' ')} ({links.length})
          </div>
          {links.map(link => (
            <div key={link.entity_id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{link.entity?.name ?? '(unnamed)'}</span>
              {link.role_in_story && <span style={{ fontSize: 12, color: '#7a82a8', flexShrink: 0 }}>{link.role_in_story}</span>}
            </div>
          ))}
        </div>
      ))}

      {!entities.length && (
        <p style={{ color: '#7a82a8', fontSize: 14 }}>No entities added to this story yet.</p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StoryViewerPage() {
  const { id }                    = useParams()
  const [story, setStory]         = useState(null)
  const [entities, setEntities]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [tab, setTab]             = useState('about')  // 'about' | 'map' | 'flow'

  useEffect(() => {
    if (!supabase || !id) return
    let active = true
    ;(async () => {
      const { data: s, error: sErr } = await supabase.from('stories').select('*').eq('id', id).single()
      if (!active) return
      if (sErr || !s) { setError('Story not found.'); setLoading(false); return }
      setStory(s)
      const { data: links } = await supabase
        .from('story_entities')
        .select('entity_id, entity_type, role_in_story, notes, entity:entity_id(name)')
        .eq('story_id', id)
        .order('entity_type')
      if (active) { setEntities(links ?? []); setLoading(false) }
    })()
    return () => { active = false }
  }, [id])

  if (loading) return <div style={{ padding: 48, textAlign: 'center', opacity: 0.5 }}>Loading…</div>
  if (error)   return <div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>{error}</div>

  const TABS = [
    { key: 'about', label: 'About' },
    { key: 'map',   label: '🗺 Map' },
    { key: 'flow',  label: '📊 Flow Map' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header strip */}
      <div style={{ flexShrink: 0, padding: '10px 20px', borderBottom: '1px solid #e0e4f0', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#fff' }}>
        <Link to="/" style={{ fontSize: 12, color: '#7a82a8', textDecoration: 'none', flexShrink: 0 }}>← Map</Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          {story.theme && (
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a82a8' }}>{story.theme}</div>
          )}
          <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {story.title}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: tab === t.key ? '#2563eb' : 'transparent',
                color:      tab === t.key ? '#fff'    : '#7a82a8',
                outline:    tab === t.key ? 'none'    : '1.5px solid #e0e4f0',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: tab === 'about' ? 'auto' : 'hidden', position: 'relative' }}>
        {tab === 'about' && <StoryAbout story={story} entities={entities} />}
        {tab === 'map'   && <StoryMap   storyId={id} />}
        {tab === 'flow'  && <FlowMap    storyId={id} storyTitle={story.title} />}
      </div>
    </div>
  )
}
