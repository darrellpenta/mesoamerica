import { useRef } from 'react'

const MAP_TYPES = [
  { id: 'default',     label: 'Default',     icon: '🗺' },
  { id: 'topographic', label: 'Topographic', icon: '📈' },
  { id: 'terrain',     label: '3D Terrain',  icon: '⛰' },
  { id: 'population',  label: 'Population',  icon: '👥' },
]

export default function LayerPanel({
  layers, onToggle,
  mapType='default', onMapTypeChange,
  snapLayerId, onToggleSnap,
  userLayers, onToggleUserLayer, onDeleteUserLayer, onExportLayer,
  onExportAll, onImportLayers,
  canUndo, canRedo, onUndo, onRedo,
  activeDrawLayerId, onSetActiveDrawLayer, onNewLayer, onEnterRegionBuild,
  helperLayers = [], onToggleHelper, onRemoveHelper, onSetHelperOpacity,
}) {
  const importRef = useRef(null)

  const fillLayers = layers.filter(l => l.mapboxType === 'fill' && !l.disabled)

  return (
    <aside className="layer-panel">
      <div className="layer-panel__header">
        <div className="layer-panel__title">Mesoamerica</div>
        <div className="layer-panel__subtitle">Interactive Historical Map</div>
      </div>

      {/* ── Map Style ────────────────────────────────────────────────── */}
      <div className="layer-panel__section-label">Map Style <span className="layer-panel__region-note">(Mexico → Costa Rica)</span></div>
      <div className="map-type-selector">
        {MAP_TYPES.map(mt => (
          <button
            key={mt.id}
            className={`map-type-btn${mapType === mt.id ? ' map-type-btn--active' : ''}`}
            onClick={() => onMapTypeChange(mt.id)}
            title={mt.label}
          >
            <span className="map-type-btn__icon">{mt.icon}</span>
            <span className="map-type-btn__label">{mt.label}</span>
          </button>
        ))}
      </div>

      {/* ── Data Layers ──────────────────────────────────────────────── */}
      <div className="layer-panel__section-label">Data Layers</div>
      <div className="layer-panel__list">
        {layers.map(layer => (
          <div
            key={layer.id}
            className={['layer-item', layer.visible&&!layer.disabled?'layer-item--active':'', layer.disabled?'layer-item--disabled':''].join(' ')}
            style={{ '--layer-color': layer.color }}
            onClick={() => !layer.disabled && onToggle(layer.id)}
            title={layer.disabled ? 'Data not yet available' : undefined}
          >
            <div className="layer-item__toggle" />
            <div className="layer-item__text">
              <div className="layer-item__name">{layer.label}</div>
              <div className="layer-item__desc">{layer.description}</div>
              {/* Snap-to-boundary toggle — only on polygon fill layers */}
              {layer.mapboxType === 'fill' && !layer.disabled && layer.visible && (
                <button
                  className={`layer-item__snap-btn${snapLayerId === layer.id ? ' layer-item__snap-btn--active' : ''}`}
                  onClick={e => { e.stopPropagation(); onToggleSnap(layer.id) }}
                  title={snapLayerId === layer.id ? 'Disable boundary snap' : 'Snap new shapes to this boundary'}
                >
                  {snapLayerId === layer.id ? '⊕ Snapping' : '⊕ Snap boundary'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Guide Images (attached from overlay) ─────────────────────── */}
      {helperLayers.length > 0 && (
        <div className="layer-panel__user-section">
          <div className="layer-panel__section-label">Guide Images</div>
          {helperLayers.map(hl => (
            <div
              key={hl.id}
              className={['layer-item', hl.visible?'layer-item--active':''].join(' ')}
              style={{ '--layer-color': '#4a90d9' }}
            >
              <div className="layer-item__toggle" onClick={() => onToggleHelper(hl.id)} style={{cursor:'pointer'}} />
              <div className="layer-item__text">
                <div className="layer-item__name" onClick={() => onToggleHelper(hl.id)} style={{cursor:'pointer'}}>
                  {hl.label}
                </div>
                <div className="layer-item__desc">Attached to map coords</div>
                <div className="layer-item__actions" style={{alignItems:'center'}}>
                  <input
                    type="range" min={0.05} max={1} step={0.05}
                    value={hl.opacity}
                    onChange={e => onSetHelperOpacity(hl.id, parseFloat(e.target.value))}
                    title={`Opacity: ${Math.round(hl.opacity*100)}%`}
                    style={{width:72, accentColor:'#4a90d9'}}
                  />
                  <button
                    className="layer-item__action-btn layer-item__action-btn--delete"
                    onClick={() => { if (confirm(`Remove "${hl.label}"?`)) onRemoveHelper(hl.id) }}
                    title="Remove guide image"
                  >✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── My Layers (user-drawn) ───────────────────────────────────── */}
      <div className="layer-panel__user-section">
        <div className="layer-panel__section-header">
          <div className="layer-panel__section-label" style={{margin:0}}>My Layers</div>
          <div className="layer-panel__undo-row">
            <button
              className="layer-panel__undo-btn"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
            >↩</button>
            <button
              className="layer-panel__undo-btn"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
            >↪</button>
          </div>
        </div>

        {userLayers.map(layer => (
          <div
            key={layer.id}
            className={['layer-item', layer.visible?'layer-item--active':'', activeDrawLayerId===layer.id?'layer-item--editing':''].join(' ')}
            style={{ '--layer-color': layer.color }}
          >
            <div className="layer-item__toggle" onClick={() => onToggleUserLayer(layer.id)} style={{cursor:'pointer'}} />
            <div className="layer-item__text">
              <div className="layer-item__name" onClick={() => onToggleUserLayer(layer.id)} style={{cursor:'pointer'}}>
                {layer.label}
                {activeDrawLayerId===layer.id && <span className="layer-item__editing-badge"> editing</span>}
              </div>
              <div className="layer-item__desc">
                {layer.features.length} shape{layer.features.length!==1?'s':''}
              </div>
              <div className="layer-item__actions">
                <button
                  className="layer-item__action-btn"
                  onClick={() => onSetActiveDrawLayer(activeDrawLayerId===layer.id ? null : layer.id)}
                  title={activeDrawLayerId===layer.id?'Stop editing':'Edit this layer'}
                >
                  {activeDrawLayerId===layer.id ? 'Stop' : 'Edit'}
                </button>
                <button
                  className="layer-item__action-btn layer-item__action-btn--export"
                  onClick={() => onExportLayer(layer.id)}
                  title="Download as GeoJSON"
                >↓ GeoJSON</button>
                <button
                  className="layer-item__action-btn layer-item__action-btn--delete"
                  onClick={() => { if (confirm(`Delete layer "${layer.label}"?`)) onDeleteUserLayer(layer.id) }}
                  title="Delete layer"
                >✕</button>
              </div>
            </div>
          </div>
        ))}

        <div className="layer-panel__layer-actions">
          <button className="layer-panel__new-btn" onClick={onNewLayer}>
            <span style={{fontSize:16}}>+</span>
            <span>New Layer</span>
          </button>

          {activeDrawLayerId && (
            <button
              className="layer-panel__new-btn layer-panel__new-btn--region"
              onClick={onEnterRegionBuild}
              title="Click polygons from any visible data layer to select and merge them into a new shape"
            >
              <span style={{fontSize:14}}>&#8862;</span>
              <span>Build from map polygons</span>
            </button>
          )}

          <div className="layer-panel__io-row">
            <button
              className="layer-panel__io-btn"
              onClick={() => importRef.current?.click()}
              title="Import layers from a GeoJSON or saved export file"
            >↑ Import</button>
            <input
              ref={importRef}
              type="file"
              accept=".json,.geojson"
              style={{display:'none'}}
              onChange={onImportLayers}
            />
            <button
              className="layer-panel__io-btn"
              onClick={onExportAll}
              title="Download all layers as a single JSON file"
              disabled={userLayers.length === 0}
            >↓ Export All</button>
          </div>
        </div>
      </div>

      <div className="layer-panel__footer">
        Click a site to view details.
        <br />Drag an image onto the map to use as a guide.
        <br /><strong>Attach to map</strong> locks it to geo coordinates.
        <br />Zoom in for location names.
      </div>
    </aside>
  )
}
