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

const KNOWN_KEYS = new Set([
  'name','culture','period','country','description','significance',
  'glottocode','source','_layerId','_id','color','fill-opacity','note',
  'number','family','title','event_date','event_type','fatalities',
  'BIOME_NAME','ECO_NAME','NNH_NAME',
])

// ── Layer citation panel ────────────────────────────────────────────────────
function CitationPanel({ layer, onClose }) {
  return (
    <aside className="detail-panel">
      <div className="detail-panel__header">
        <div>
          <div className="detail-panel__name">{layer.label}</div>
          <span className="detail-panel__badge detail-panel__badge--layer">Data Layer</span>
        </div>
        <button className="detail-panel__close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="detail-panel__body">
        <Field label="Description" value={layer.description} />
        {layer.sourceUrl && (
          <div className="detail-field">
            <div className="detail-field__label">Source</div>
            <div className="detail-field__value">
              <a
                href={layer.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="detail-panel__link"
              >
                {layer.sourceUrl}
              </a>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

// ── What's here section ─────────────────────────────────────────────────────
function WhatsHere({ items }) {
  if (!items.length) return null
  return (
    <div className="detail-panel__whats-here">
      <div className="detail-panel__whats-here-title">Also at this location</div>
      {items.map(({ layer, features }) => (
        <div key={layer.id} className="whats-here-row">
          <div className="whats-here-row__layer" style={{ '--layer-color': layer.color }}>
            <span className="whats-here-row__dot" />
            <span>{layer.label}</span>
          </div>
          <div className="whats-here-row__features">
            {features.slice(0, 3).map((f, i) => (
              <span key={i} className="whats-here-row__feat">
                {f.properties?.name || f.properties?.ECO_NAME || f.properties?.event_type
                  || f.properties?.BIOME_NAME || f.properties?.title || '—'}
              </span>
            ))}
            {features.length > 3 && (
              <span className="whats-here-row__more">+{features.length - 3} more</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main export ─────────────────────────────────────────────────────────────
export default function DetailPanel({ feature, layer, whatIsHere = [], userLayers = [], onClose, onReEdit }) {
  // Citation mode: layer activated, no feature selected
  if (!feature && layer) {
    return <CitationPanel layer={layer} onClose={onClose} />
  }

  // Location summary: map click with layer hits but no specific feature
  if (!feature && whatIsHere.length > 0) {
    return (
      <aside className="detail-panel">
        <div className="detail-panel__header">
          <div><div className="detail-panel__name">Location Summary</div></div>
          <button className="detail-panel__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="detail-panel__body">
          <WhatsHere items={whatIsHere} />
        </div>
      </aside>
    )
  }

  if (!feature) return null

  // Feature detail mode (existing behaviour + optional whatIsHere)
  const p   = feature.properties ?? {}
  const [lon, lat] = coords(feature.geometry)
  const isUserFeature = !!p._layerId
  const parentLayer   = isUserFeature ? userLayers.find(l => l.id === p._layerId) : null
  const extraKeys     = Object.keys(p).filter(k => !KNOWN_KEYS.has(k))
  const displayName   = p.name || p.ECO_NAME || p.BIOME_NAME || p.event_type || p.title || '(unnamed)'

  return (
    <aside className="detail-panel">
      <div className="detail-panel__header">
        <div>
          <div className="detail-panel__name">{displayName}</div>
          {p.culture && <span className="detail-panel__badge">{p.culture}</span>}
          {isUserFeature && parentLayer && (
            <span className="detail-panel__badge detail-panel__badge--user">{parentLayer.label}</span>
          )}
        </div>
        <button className="detail-panel__close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="detail-panel__body">
        {p.period      && <Field label="Period"          value={p.period} />}
        {p.country     && <Field label="Modern Location" value={p.country} />}
        {p.description && <Field label="About"           value={p.description} />}
        {p.significance && <Field label="Significance"   value={p.significance} />}
        {p.BIOME_NAME  && <Field label="Biome"           value={p.BIOME_NAME} />}
        {p.ECO_NAME && p.ECO_NAME !== p.name && <Field label="Ecoregion" value={p.ECO_NAME} />}
        {p.event_date  && <Field label="Date"            value={p.event_date} />}
        {p.fatalities != null && <Field label="Fatalities" value={String(p.fatalities)} />}

        <Field
          label="Coordinates"
          value={`${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(5)}°${lon >= 0 ? 'E' : 'W'}`}
          mono
        />

        {p.glottocode && <Field label="Glottocode" value={p.glottocode} mono />}
        {p.source      && <Field label="Source"    value={p.source}    small />}

        {extraKeys.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
            {extraKeys.map(k => <Field key={k} label={k} value={String(p[k])} />)}
          </div>
        )}

        {isUserFeature && onReEdit && (
          <button
            className="detail-panel__reedit-btn"
            onClick={() => { onReEdit(feature); onClose() }}
            title="Drag vertices to reshape this polygon"
          >
            ✎ Re-edit vertices
          </button>
        )}

        {!p.glottocode && !isUserFeature && (
          <div className="detail-panel__placeholder">
            <div className="detail-panel__placeholder-label">Artifacts</div>
            <div className="detail-panel__placeholder-text">No artifacts recorded yet.</div>
          </div>
        )}

        <WhatsHere items={whatIsHere} />
      </div>
    </aside>
  )
}

function Field({ label, value, mono, small }) {
  return (
    <div className="detail-field">
      <div className="detail-field__label">{label}</div>
      <div
        className={`detail-field__value${mono ? ' detail-field__value--coords' : ''}`}
        style={small ? { fontSize: 11, color: '#888' } : undefined}
      >
        {value}
      </div>
    </div>
  )
}
