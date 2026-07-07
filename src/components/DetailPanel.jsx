import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

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
  'BIOME_NAME','ECO_NAME','NNH_NAME','_entity_id',
  'place_type','date_start','date_end','date_precision','date_label',
  'elevation_m','feature_type','subtype','territory_type','admin_level',
  'iso_code','date_ts_start','date_year_start','event_subtype','event_key',
])

function formatYear(y) {
  if (y == null) return '?'
  return y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`
}

// ── Entity relationship section ───────────────────────────────────────────────
function EntitySection({ entityId }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!entityId) return
    let cancelled = false

    async function load() {
      if (!supabase) { setLoading(false); return }
      const [entityRes, personRes, outRes, inRes] = await Promise.all([
        supabase.from('entities')
          .select('id, name, entity_type')
          .eq('id', entityId)
          .single(),
        supabase.from('persons')
          .select('birth_year, death_year, floruit_start, floruit_end, date_label, person_type')
          .eq('entity_id', entityId)
          .maybeSingle(),
        supabase.from('relationships')
          .select('id, relation_type, valid_from, valid_to, to_entity:to_entity_id(id, name, entity_type)')
          .eq('from_entity_id', entityId),
        supabase.from('relationships')
          .select('id, relation_type, valid_from, valid_to, from_entity:from_entity_id(id, name, entity_type)')
          .eq('to_entity_id', entityId),
      ])
      if (cancelled) return
      const entity = entityRes.data ? { ...entityRes.data, persons: personRes.data ? [personRes.data] : [] } : null
      setData({ entity, outgoing: outRes.data ?? [], incoming: inRes.data ?? [] })
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [entityId])

  if (loading) return (
    <div className="entity-section entity-section--loading">
      <div className="entity-section__spinner" />
    </div>
  )
  if (!data?.entity) return null

  const { entity, outgoing, incoming } = data
  const person = entity.persons?.[0]
  if (!person && outgoing.length === 0 && incoming.length === 0) return null

  return (
    <div className="entity-section">
      {person && (
        <div className="entity-section__person">
          <span className="entity-section__badge">{person.person_type || 'Person'}</span>
          {person.date_label && (
            <span className="entity-section__person-dates">{person.date_label}</span>
          )}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="entity-section__group">
          {outgoing.map(r => (
            <div key={r.id} className="entity-rel entity-rel--out">
              <span className="entity-rel__verb">{relVerb(r.relation_type)}</span>
              <span className="entity-rel__name">{r.to_entity?.name}</span>
              {(r.valid_from != null || r.valid_to != null) && (
                <span className="entity-rel__dates">
                  {formatYear(r.valid_from)} – {formatYear(r.valid_to)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {incoming.length > 0 && (
        <div className="entity-section__group">
          <div className="entity-section__group-label">
            {entity.entity_type === 'place' ? 'Rulers' : 'Referenced by'}
          </div>
          {incoming.map(r => (
            <div key={r.id} className="entity-rel entity-rel--in">
              <span className="entity-rel__name">{r.from_entity?.name}</span>
              <span className="entity-rel__verb entity-rel__verb--small">
                {r.relation_type.replace(/_/g, ' ').toLowerCase()}
              </span>
              {(r.valid_from != null || r.valid_to != null) && (
                <span className="entity-rel__dates">
                  {formatYear(r.valid_from)} – {formatYear(r.valid_to)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function relVerb(type) {
  const map = {
    RULED: 'Ruled', FOUNDED: 'Founded', TRADED_WITH: 'Traded with',
    ALLIED_WITH: 'Allied with', DEFEATED: 'Defeated', SUCCEEDED: 'Succeeded',
    LOCATED_IN: 'Located in',
  }
  return map[type] ?? type.replace(/_/g, ' ').toLowerCase()
}

// ── Layer citation panel ──────────────────────────────────────────────────────
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
              <a href={layer.sourceUrl} target="_blank" rel="noopener noreferrer" className="detail-panel__link">
                {layer.sourceUrl}
              </a>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

// ── What's here section ───────────────────────────────────────────────────────
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

// ── Main export ───────────────────────────────────────────────────────────────
export default function DetailPanel({ feature, layer, whatIsHere = [], userLayers = [], onClose, onReEdit }) {
  if (!feature && layer) {
    return <CitationPanel layer={layer} onClose={onClose} />
  }

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
        {p.date_label  && <Field label="Period"          value={p.date_label} />}
        {p.place_type  && <Field label="Type"            value={p.place_type} />}
        {p.territory_type && <Field label="Type"         value={p.territory_type} />}
        {p.description && <Field label="About"           value={p.description} />}
        {p.significance && <Field label="Significance"   value={p.significance} />}
        {p.BIOME_NAME  && <Field label="Biome"           value={p.BIOME_NAME} />}
        {p.ECO_NAME && p.ECO_NAME !== p.name && <Field label="Ecoregion" value={p.ECO_NAME} />}
        {p.event_date  && <Field label="Date"            value={p.event_date} />}
        {p.fatalities != null && <Field label="Fatalities" value={String(p.fatalities)} />}
        {p.elevation_m != null && <Field label="Elevation" value={`${p.elevation_m} m`} />}

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

        {p._entity_id && <EntitySection entityId={p._entity_id} />}

        {isUserFeature && onReEdit && (
          <button
            className="detail-panel__reedit-btn"
            onClick={() => { onReEdit(feature); onClose() }}
            title="Drag vertices to reshape this polygon"
          >
            ✎ Re-edit vertices
          </button>
        )}

        {!p.glottocode && !isUserFeature && !p._entity_id && (
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
