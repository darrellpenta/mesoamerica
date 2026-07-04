import { useState, useEffect, useRef, useCallback } from 'react'
import MapView from './components/MapView'
import LayerPanel from './components/LayerPanel'
import DetailPanel from './components/DetailPanel'
import DrawToolbar from './components/DrawToolbar'
import NewLayerModal from './components/NewLayerModal'
import AnnotationModal from './components/AnnotationModal'
import { LAYER_REGISTRY } from './layers/index'
import { useUndoable } from './hooks/useUndoable'
import { findSharedEdgeNeighbors, applyEdgeMerge } from './utils/topology'
import { dissolveFeatures } from './utils/dissolve'

// Load saved user layers from localStorage on first render
function loadSavedLayers() {
  try {
    const raw = localStorage.getItem('mesoamerica-user-layers')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export default function App() {
  const [layers, setLayers] = useState(LAYER_REGISTRY)
  const [selectedFeature, setSelectedFeature] = useState(null)

  // ── User draw layers — undo/redo enabled ────────────────────────────────
  const { value: userLayers, set: setUserLayers, undo, redo, canUndo, canRedo } = useUndoable(loadSavedLayers())

  const [activeDrawLayerId, setActiveDrawLayerId]   = useState(null)
  const [activeTool, setActiveTool]                 = useState('simple_select')
  const [pendingFeature, setPendingFeature]         = useState(null)
  const [showNewLayerModal, setShowNewLayerModal]   = useState(false)

  // ── Map type ─────────────────────────────────────────────────────────────
  const [mapType, setMapType] = useState('default')

  // ── Re-edit state ────────────────────────────────────────────────────────
  const [pendingReEdit, setPendingReEdit] = useState(null)
  const mapViewRef = useRef(null)

  // ── Region-builder state ─────────────────────────────────────────────────
  const [regionBuildMode, setRegionBuildMode] = useState(false)
  const [selectedCells, setSelectedCells]     = useState([])

  // ── Shared-edge merge prompt ─────────────────────────────────────────────
  const [pendingMerge, setPendingMerge] = useState(null)

  // ── Boundary snap ────────────────────────────────────────────────────────
  const [snapLayerId, setSnapLayerId]     = useState(null)
  const [snapGeojson, setSnapGeojson]     = useState(null)
  const SNAP_THRESHOLD = 0.05

  // ── Helper (attached guide) image layers ─────────────────────────────────
  const [helperLayers, setHelperLayers] = useState([])

  // ── Persist user layers to localStorage ─────────────────────────────────
  useEffect(() => {
    localStorage.setItem('mesoamerica-user-layers', JSON.stringify(userLayers))
  }, [userLayers])

  // ── Load snap geometry when snap layer changes ───────────────────────────
  useEffect(() => {
    if (!snapLayerId) { setSnapGeojson(null); return }
    const layer = layers.find(l => l.id === snapLayerId)
    if (!layer?.dataUrl) return
    fetch(layer.dataUrl)
      .then(r => r.json())
      .then(setSnapGeojson)
      .catch(() => setSnapGeojson(null))
  }, [snapLayerId, layers])

  // ── Global keyboard shortcuts: Ctrl+Z / Ctrl+Y ──────────────────────────
  useEffect(() => {
    const handler = e => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (!e.shiftKey && e.key === 'z') { e.preventDefault(); if (pendingReEdit) return; undo() }
      if (e.key === 'y' || (e.shiftKey && e.key === 'z')) { e.preventDefault(); if (pendingReEdit) return; redo() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undo, redo, pendingReEdit])

  // ── Base layer toggle ────────────────────────────────────────────────────
  const toggleLayer = id =>
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))

  // ── Snap layer toggle ────────────────────────────────────────────────────
  const toggleSnapLayer = useCallback((layerId) => {
    setSnapLayerId(prev => prev === layerId ? null : layerId)
  }, [])

  // ── User layer CRUD ──────────────────────────────────────────────────────
  const addUserLayer = (name, color) => {
    const id = `user-${Date.now()}`
    setUserLayers(prev => [...prev, { id, label: name, color, visible: true, features: [] }])
    setActiveDrawLayerId(id)
    setActiveTool('draw_polygon')
    setShowNewLayerModal(false)
  }

  const toggleUserLayer = id =>
    setUserLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))

  const deleteUserLayer = id => {
    setUserLayers(prev => prev.filter(l => l.id !== id))
    if (activeDrawLayerId === id) { setActiveDrawLayerId(null); setActiveTool('simple_select') }
  }

  const handleSetActiveDrawLayer = id => {
    if (pendingReEdit) return
    setActiveDrawLayerId(id)
    setActiveTool(id ? 'draw_polygon' : 'simple_select')
    if (regionBuildMode) { setRegionBuildMode(false); setSelectedCells([]) }
  }

  const handleDoneDrawing = () => {
    setActiveDrawLayerId(null)
    setActiveTool('simple_select')
    if (regionBuildMode) { setRegionBuildMode(false); setSelectedCells([]) }
  }

  // ── Draw flow ────────────────────────────────────────────────────────────
  const handleFeatureDrawn = useCallback(feature => setPendingFeature(feature), [])

  const confirmAnnotation = properties => {
    const newFeature = {
      ...pendingFeature,
      properties: {
        ...pendingFeature.properties,
        ...properties,
        _layerId: activeDrawLayerId,
        _id: pendingFeature.id, // preserve ID in properties — Mapbox click events drop non-integer feature IDs
      },
    }
    setUserLayers(prev => prev.map(layer => {
      if (layer.id !== activeDrawLayerId) return layer
      return { ...layer, features: [...layer.features, newFeature] }
    }))
    setPendingFeature(null)

    // For polygons: fit map to show the full shape, then enter vertex-edit mode immediately
    const isPolygon = newFeature.geometry?.type === 'Polygon' || newFeature.geometry?.type === 'MultiPolygon'
    if (isPolygon) {
      mapViewRef.current?.fitToFeature(newFeature)
      startReEdit(newFeature)
    }

    // Check for shared edges with existing user features
    const neighbors = findSharedEdgeNeighbors(newFeature, userLayers)
    if (neighbors.length > 0) setPendingMerge({ newFeature, neighbors })
  }

  const cancelAnnotation = () => setPendingFeature(null)

  // ── Region builder ────────────────────────────────────────────────────────
  const cellKey = (layerId, feature) =>
    `${layerId}::${feature.id ?? feature.properties?.name ?? feature.properties?.glottocode ?? JSON.stringify(feature.geometry.coordinates?.[0]?.[0])}`

  const enterRegionBuild = () => {
    if (!activeDrawLayerId) return
    setRegionBuildMode(true)
    setSelectedCells([])
    setSelectedFeature(null)
    setActiveTool('simple_select')
  }

  const cancelRegionBuild = () => {
    setRegionBuildMode(false)
    setSelectedCells([])
  }

  const handleCellToggle = useCallback((layerId, feature) => {
    const key = cellKey(layerId, feature)
    setSelectedCells(prev => {
      const exists = prev.find(c => c.key === key)
      if (exists) return prev.filter(c => c.key !== key)
      return [...prev, { key, layerId, feature }]
    })
  }, [])

  const commitRegion = () => {
    if (!selectedCells.length) return
    const dissolved = dissolveFeatures(selectedCells.map(c => c.feature))
    if (!dissolved) return
    // Strip the inherited id so AnnotationModal treats it as new
    setPendingFeature({ ...dissolved, id: `feature-${Date.now()}` })
    cancelRegionBuild()
  }

  // ── Shared-edge merge ────────────────────────────────────────────────────
  const handleMerge = () => {
    if (!pendingMerge) return
    const { newFeature, neighbors } = pendingMerge
    const merged = applyEdgeMerge(newFeature, neighbors)
    setUserLayers(prev => prev.map(layer => ({
      ...layer,
      features: layer.features.map(f => f.id === newFeature.id ? merged : f),
    })))
    setPendingMerge(null)
  }

  // ── Re-edit ──────────────────────────────────────────────────────────────
  const startReEdit = useCallback((feature) => {
    if (pendingReEdit) return
    setSelectedFeature(null)
    // Ensure the correct draw layer is active for this feature
    const layerId = feature.properties._layerId
    if (layerId) setActiveDrawLayerId(layerId)
    setActiveTool('simple_select')
    setPendingReEdit(feature)
  }, [pendingReEdit])

  const commitReEdit = () => {
    if (!pendingReEdit || !mapViewRef.current) return
    const edited = mapViewRef.current.getReEditFeature(pendingReEdit.id)
    if (edited) {
      setUserLayers(prev => prev.map(layer => ({
        ...layer,
        features: layer.features.map(f =>
          f.id === edited.id ? { ...f, geometry: edited.geometry } : f
        ),
      })))
    }
    setPendingReEdit(null)
  }

  const cancelReEdit = () => setPendingReEdit(null)

  // ── Export single layer ──────────────────────────────────────────────────
  const exportLayer = id => {
    const layer = userLayers.find(l => l.id === id)
    if (!layer) return
    const geojson = { type: 'FeatureCollection', name: layer.label, color: layer.color, exportedAt: new Date().toISOString(), features: layer.features }
    triggerDownload(JSON.stringify(geojson, null, 2), `${layer.label.toLowerCase().replace(/\s+/g, '-')}.geojson`, 'application/json')
  }

  // ── Export ALL layers (Phase 4 persistence) ──────────────────────────────
  const exportAllLayers = () => {
    const data = { version: 1, app: 'mesoamerica-map', exportedAt: new Date().toISOString(), userLayers }
    triggerDownload(JSON.stringify(data, null, 2), 'mesoamerica-all-layers.json', 'application/json')
  }

  // ── Import layers ────────────────────────────────────────────────────────
  const importLayers = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result)
        // Support both single FeatureCollection and our full export format
        const imported = Array.isArray(data.userLayers) ? data.userLayers
          : Array.isArray(data) ? data
          : [{ id: `user-${Date.now()}`, label: data.name || 'Imported', color: data.color || '#e85d04', visible: true, features: data.features || [] }]
        if (window.confirm(`Import ${imported.length} layer(s)? This will add them to your current layers.`)) {
          setUserLayers(prev => [...prev, ...imported.map(l => ({ ...l, id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}` }))])
        }
      } catch { alert('Could not read file — expected GeoJSON or a mesoamerica-map export.') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── Helper layers ────────────────────────────────────────────────────────
  const attachHelper = ({ id: passedId, src, opacity, geoCorners }) => {
    const id = passedId ?? `helper-${Date.now()}`
    setHelperLayers(prev => [...prev, { id, label: `Guide Image ${prev.length + 1}`, src, opacity, geoCorners, visible: true }])
  }
  const toggleHelper    = id => setHelperLayers(prev => prev.map(h => h.id === id ? { ...h, visible: !h.visible } : h))
  const removeHelper    = id => setHelperLayers(prev => prev.filter(h => h.id !== id))
  const setHelperOpacity = (id, opacity) => setHelperLayers(prev => prev.map(h => h.id === id ? { ...h, opacity } : h))

  // ── Helpers ──────────────────────────────────────────────────────────────
  function triggerDownload(content, filename, mime) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const effectiveTool = (activeDrawLayerId && !pendingReEdit) ? activeTool : 'simple_select'
  const snapConfig = snapGeojson ? { geojson: snapGeojson, threshold: SNAP_THRESHOLD } : null
  const snapLayerLabel = snapLayerId ? (layers.find(l => l.id === snapLayerId)?.label ?? null) : null

  return (
    <div className="app">
      <LayerPanel
        layers={layers}
        onToggle={toggleLayer}
        mapType={mapType}
        onMapTypeChange={setMapType}
        snapLayerId={snapLayerId}
        onToggleSnap={toggleSnapLayer}
        userLayers={userLayers}
        onToggleUserLayer={toggleUserLayer}
        onDeleteUserLayer={deleteUserLayer}
        onExportLayer={exportLayer}
        onExportAll={exportAllLayers}
        onImportLayers={importLayers}
        activeDrawLayerId={activeDrawLayerId}
        onSetActiveDrawLayer={handleSetActiveDrawLayer}
        onNewLayer={() => setShowNewLayerModal(true)}
        onEnterRegionBuild={enterRegionBuild}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        helperLayers={helperLayers}
        onToggleHelper={toggleHelper}
        onRemoveHelper={removeHelper}
        onSetHelperOpacity={setHelperOpacity}
      />

      <div className="map-container">
        <MapView
          ref={mapViewRef}
          layers={layers}
          userLayers={userLayers}
          mapType={mapType}
          helperLayers={helperLayers}
          activeTool={effectiveTool}
          snapConfig={snapConfig}
          pendingReEdit={pendingReEdit}
          onFeatureClick={feature => {
            if (pendingReEdit) return
            // Mapbox click events drop non-integer string IDs; look up original from userLayers
            // using _id stored in properties, so re-edit has a feature with the correct .id
            const fid = feature.properties?._id
            const lid = feature.properties?._layerId
            if (fid && lid) {
              const orig = userLayers.find(l => l.id === lid)?.features.find(f => f.id === fid)
              setSelectedFeature(orig ?? feature)
            } else {
              setSelectedFeature(feature)
            }
          }}
          onFeatureDrawn={handleFeatureDrawn}
          onAttachHelper={attachHelper}
          regionBuildMode={regionBuildMode}
          selectedCells={selectedCells}
          onCellToggle={handleCellToggle}
        />

        {/* Draw toolbar — shown when a draw layer is active OR re-editing OR region-building */}
        {(activeDrawLayerId || pendingReEdit || regionBuildMode) && (
          <DrawToolbar
            activeTool={activeTool}
            activeLayerLabel={userLayers.find(l => l.id === activeDrawLayerId)?.label ?? ''}
            onToolChange={setActiveTool}
            onDoneDrawing={handleDoneDrawing}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            snapLayerLabel={snapLayerLabel}
            pendingReEdit={pendingReEdit}
            onCommitReEdit={commitReEdit}
            onCancelReEdit={cancelReEdit}
            regionBuildMode={regionBuildMode}
            selectedCellCount={selectedCells.length}
            onCommitRegion={commitRegion}
            onCancelRegion={cancelRegionBuild}
          />
        )}

        {/* Shared-edge merge notification */}
        {pendingMerge && (
          <div className="merge-prompt">
            <span>
              Shared edge detected with {pendingMerge.neighbors.length} feature{pendingMerge.neighbors.length !== 1 ? 's' : ''}.
              Merge to eliminate gaps?
            </span>
            <button className="merge-prompt__btn merge-prompt__btn--merge" onClick={handleMerge}>Merge</button>
            <button className="merge-prompt__btn" onClick={() => setPendingMerge(null)}>Skip</button>
          </div>
        )}
      </div>

      {selectedFeature && (
        <DetailPanel
          feature={selectedFeature}
          userLayers={userLayers}
          onClose={() => setSelectedFeature(null)}
          onReEdit={startReEdit}
        />
      )}

      {showNewLayerModal && (
        <NewLayerModal onConfirm={addUserLayer} onCancel={() => setShowNewLayerModal(false)} />
      )}

      {pendingFeature && (
        <AnnotationModal onConfirm={confirmAnnotation} onCancel={cancelAnnotation} />
      )}
    </div>
  )
}
