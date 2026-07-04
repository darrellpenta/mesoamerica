function coords(geometry) {
  if (geometry.type === 'Point') return geometry.coordinates
  const ring = geometry.type === 'Polygon'
    ? geometry.coordinates[0]
    : geometry.coordinates[0][0]
  return [
    ring.reduce((s, c) => s + c[0], 0) / ring.length,
    ring.reduce((s, c) => s + c[1], 0) / ring.length,
  ]
}

// Keys that are rendered via dedicated fields — hidden in the "extra" dump
const KNOWN_KEYS = new Set(['name','culture','period','country','description','significance','glottocode','source','_layerId'])

export default function DetailPanel({ feature, userLayers = [], onClose, onReEdit }) {
  const p   = feature.properties ?? {}
  const [lon, lat] = coords(feature.geometry)

  // Determine if this is a user-drawn feature (has _layerId property)
  const isUserFeature = !!p._layerId
  const parentLayer   = isUserFeature ? userLayers.find(l => l.id === p._layerId) : null

  // Collect extra custom key-value pairs the user annotated
  const extraKeys = Object.keys(p).filter(k => !KNOWN_KEYS.has(k))

  return (
    <aside className="detail-panel">
      <div className="detail-panel__header">
        <div>
          <div className="detail-panel__name">{p.name || '(unnamed)'}</div>
          {p.culture && <span className="detail-panel__culture-badge">{p.culture}</span>}
          {isUserFeature && parentLayer && (
            <span className="detail-panel__culture-badge" style={{background:'rgba(0,119,182,0.2)',color:'#64b5f6',marginLeft:4}}>
              {parentLayer.label}
            </span>
          )}
        </div>
        <button className="detail-panel__close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="detail-panel__body">
        {p.period && <Field label="Period" value={p.period} />}
        {p.country && <Field label="Modern Location" value={p.country} />}
        {p.description && <Field label="About" value={p.description} />}
        {p.significance && <Field label="Significance" value={p.significance} />}

        <Field
          label="Coordinates"
          value={`${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(5)}°${lon >= 0 ? 'E' : 'W'}`}
          mono
        />

        {p.glottocode && <Field label="Glottocode" value={p.glottocode} mono />}
        {p.source      && <Field label="Source"    value={p.source}    small />}

        {/* Custom annotations (user-drawn features) */}
        {extraKeys.length > 0 && (
          <div style={{marginTop:12,borderTop:'1px solid #eee',paddingTop:12}}>
            {extraKeys.map(k => <Field key={k} label={k} value={String(p[k])} />)}
          </div>
        )}

        {/* Re-edit button for user-drawn features */}
        {isUserFeature && onReEdit && (
          <button
            className="detail-panel__reedit-btn"
            onClick={() => { onReEdit(feature); onClose() }}
            title="Drag vertices to reshape this polygon"
          >
            ✎ Re-edit vertices
          </button>
        )}

        {/* Artifacts placeholder for non-user, non-language features */}
        {!p.glottocode && !isUserFeature && (
          <div className="detail-panel__placeholder">
            <div className="detail-panel__placeholder-label">Artifacts</div>
            <div className="detail-panel__placeholder-text">No artifacts recorded yet.</div>
          </div>
        )}
      </div>
    </aside>
  )
}

function Field({ label, value, mono, small }) {
  return (
    <div className="detail-field">
      <div className="detail-field__label">{label}</div>
      <div className={`detail-field__value${mono ? ' detail-field__value--coords' : ''}`}
           style={small ? {fontSize:11,color:'#888'} : undefined}>
        {value}
      </div>
    </div>
  )
}
