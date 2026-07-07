import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const REL_TYPES = [
  'RULED', 'FOUNDED', 'TRADED_WITH', 'ALLIED_WITH',
  'DEFEATED', 'SUCCEEDED', 'LOCATED_IN',
]

const EXT_TABLES = {
  person:           'persons',
  place:            'places',
  geo_feature:      'geo_features',
  territory:        'territories',
  admin_boundary:   'admin_boundaries',
  event:            'events',
}

const TYPE_COLORS = {
  person:           '#a78bfa',
  place:            '#34d399',
  geo_feature:      '#60a5fa',
  territory:        '#f59e0b',
  admin_boundary:   '#e879f9',
  event:            '#fb923c',
}

// Fields to strip from extension table display
const SYSTEM_FIELDS = new Set([
  'id', 'entity_id', 'created_at', 'updated_at', 'source_id', 'geom', 'geometry',
])

// Year-valued fields that should render as "615 CE" / "300 BCE"
const YEAR_KEYS = new Set([
  'birth_year', 'death_year', 'floruit_start', 'floruit_end',
  'date_start', 'date_end', 'date_year_start',
])

function formatYear(y) {
  if (y == null) return ''
  return y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`
}

function formatFieldValue(key, value) {
  if (YEAR_KEYS.has(key) && typeof value === 'number') return formatYear(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

// ── Type badge ────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  return (
    <span
      className="admin-type-badge"
      style={{ '--type-color': TYPE_COLORS[type] ?? '#8890b0' }}
    >
      {type?.replace(/_/g, ' ') ?? 'unknown'}
    </span>
  )
}

// ── Entity search hook ────────────────────────────────────────────────────────
function useEntitySearch(query) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!supabase || !query || query.length < 2) { setResults([]); return }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('entities')
        .select('id, name, entity_type')
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(30)
      if (!cancelled) { setResults(data ?? []); setLoading(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  return { results, loading }
}

// ── Entity picker (used in add-relationship form) ─────────────────────────────
function EntityPicker({ label, value, onChange, exclude }) {
  const [q, setQ] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const { results } = useEntitySearch(q)
  const filtered = results.filter(e => e.id !== exclude)

  const pick = (e) => { onChange(e); setQ(e.name); setOpen(false) }

  return (
    <div className="admin-ent-search">
      {label && <label className="admin-label">{label}</label>}
      <input
        className="admin-input"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); if (!e.target.value) onChange(null) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Type to search…"
      />
      {open && filtered.length > 0 && (
        <ul className="admin-ent-dropdown">
          {filtered.map(e => (
            <li key={e.id} className="admin-ent-option" onMouseDown={() => pick(e)}>
              <span className="admin-ent-name">{e.name}</span>
              <TypeBadge type={e.entity_type} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Add relationship form ─────────────────────────────────────────────────────
function AddRelForm({ selectedEntity, onAdded }) {
  const [open, setOpen]           = useState(false)
  const [relType, setRelType]     = useState('RULED')
  const [otherEntity, setOther]   = useState(null)
  const [direction, setDirection] = useState('out')
  const [validFrom, setFrom]      = useState('')
  const [validTo, setTo]          = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState(null)

  const save = async () => {
    if (!selectedEntity || !otherEntity) return
    setSaving(true); setErr(null)
    const row = {
      from_entity_id: direction === 'out' ? selectedEntity.id : otherEntity.id,
      to_entity_id:   direction === 'out' ? otherEntity.id    : selectedEntity.id,
      relation_type:  relType,
      valid_from: validFrom ? parseInt(validFrom, 10) : null,
      valid_to:   validTo   ? parseInt(validTo, 10)   : null,
      notes: notes || null,
    }
    const { error } = await supabase.from('relationships').insert(row)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setOther(null); setFrom(''); setTo(''); setNotes(''); setOpen(false)
    onAdded?.()
  }

  if (!open) {
    return (
      <button className="admin-add-rel-btn" onClick={() => setOpen(true)}>
        + Add relationship
      </button>
    )
  }

  return (
    <div className="admin-add-form">
      <div className="admin-add-form__header">
        <span className="admin-add-form__title">Add relationship</span>
        <button className="admin-add-form__close" onClick={() => setOpen(false)}>✕</button>
      </div>

      <div className="admin-form-row">
        <label className="admin-label">Direction</label>
        <select className="admin-select" value={direction} onChange={e => setDirection(e.target.value)}>
          <option value="out">{selectedEntity?.name} → other entity</option>
          <option value="in">other entity → {selectedEntity?.name}</option>
        </select>
      </div>

      <div className="admin-form-row">
        <label className="admin-label">Relation type</label>
        <select className="admin-select" value={relType} onChange={e => setRelType(e.target.value)}>
          {REL_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <EntityPicker
        label="Other entity"
        value={otherEntity}
        onChange={setOther}
        exclude={selectedEntity?.id}
      />

      <div className="admin-form-row admin-form-row--dates">
        <div>
          <label className="admin-label">From year (neg = BCE)</label>
          <input className="admin-input" type="number" value={validFrom} onChange={e => setFrom(e.target.value)} placeholder="e.g. 615" />
        </div>
        <div>
          <label className="admin-label">To year</label>
          <input className="admin-input" type="number" value={validTo} onChange={e => setTo(e.target.value)} placeholder="e.g. 683" />
        </div>
      </div>

      <div className="admin-form-row">
        <label className="admin-label">Notes (optional)</label>
        <input className="admin-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any context…" />
      </div>

      {err && <div className="admin-error">{err}</div>}
      <button className="admin-save-btn" onClick={save} disabled={saving || !otherEntity}>
        {saving ? 'Saving…' : 'Save relationship'}
      </button>
    </div>
  )
}

// ── Relationship card ─────────────────────────────────────────────────────────
function RelCard({ rel, onNavigate, onDelete }) {
  const canNavigate = !!rel.other?.id

  return (
    <div className="admin-rel-card">
      <span className="admin-rel-card__type">{rel.relation_type.replace(/_/g, ' ')}</span>

      <button
        className="admin-rel-card__entity"
        onClick={() => canNavigate && onNavigate(rel.other)}
        disabled={!canNavigate}
        title={canNavigate ? `Open ${rel.other?.name}` : undefined}
      >
        {rel.other?.name ?? '(unknown)'}
        {rel.other?.entity_type && <TypeBadge type={rel.other.entity_type} />}
      </button>

      {(rel.valid_from != null || rel.valid_to != null) && (
        <span className="admin-rel-card__dates">
          {formatYear(rel.valid_from) || '?'} – {formatYear(rel.valid_to) || '?'}
        </span>
      )}

      <button className="admin-rel-card__del" onClick={onDelete} title="Delete relationship">✕</button>

      {rel.notes && <div className="admin-rel-card__notes">{rel.notes}</div>}
    </div>
  )
}

// ── Person mini timeline ──────────────────────────────────────────────────────
function PersonSparkline({ startYear, endYear }) {
  const YEAR_MIN = -800, YEAR_MAX = 1600, RANGE = YEAR_MAX - YEAR_MIN
  const W = 400, H = 22, PAD = 6
  const toX = y => PAD + ((y - YEAR_MIN) / RANGE) * (W - PAD * 2)

  const x1 = startYear != null ? toX(Math.max(YEAR_MIN, startYear)) : toX(YEAR_MIN)
  const x2 = endYear   != null ? toX(Math.min(YEAR_MAX, endYear))   : toX(YEAR_MAX)
  const barW = Math.max(6, x2 - x1)

  return (
    <div className="admin-person-sparkline">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="#252840" strokeWidth={1} />
        <line
          x1={toX(0)} y1={2} x2={toX(0)} y2={H - 2}
          stroke="#2a2e50" strokeWidth={1} strokeDasharray="3 3"
        />
        <rect x={x1} y={5} width={barW} height={H - 10} rx={2} fill="#6070c0" opacity={0.85} />
      </svg>
      <div className="admin-person-sparkline__labels">
        <span>{startYear != null ? formatYear(startYear) : '?'}</span>
        <span>800 BCE – 1600 CE</span>
        <span>{endYear != null ? formatYear(endYear) : '?'}</span>
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, count, children }) {
  return (
    <div className="admin-record__section">
      <div className="admin-section-header">
        <span className="admin-section-title">{title}</span>
        {count != null && <span className="admin-section-count">{count}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Entity Record ─────────────────────────────────────────────────────────────
function EntityRecord({ entity, onNavigate }) {
  const [ext, setExt]       = useState(undefined)
  const [rels, setRels]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [relKey, setRelKey] = useState(0)

  const load = useCallback(async () => {
    if (!supabase || !entity) return
    setLoading(true)

    const table = EXT_TABLES[entity.entity_type]
    const extPromise = table
      ? supabase.from(table).select('*').eq('entity_id', entity.id).maybeSingle()
      : Promise.resolve({ data: null })

    const [outRes, inRes, extRes] = await Promise.all([
      supabase.from('relationships')
        .select('id, relation_type, valid_from, valid_to, notes, to_entity:to_entity_id(id, name, entity_type)')
        .eq('from_entity_id', entity.id),
      supabase.from('relationships')
        .select('id, relation_type, valid_from, valid_to, notes, from_entity:from_entity_id(id, name, entity_type)')
        .eq('to_entity_id', entity.id),
      extPromise,
    ])

    const out = (outRes.data ?? []).map(r => ({ ...r, direction: 'out', other: r.to_entity }))
    const inc = (inRes.data ?? []).map(r => ({ ...r, direction: 'in', other: r.from_entity }))

    setRels([...out, ...inc])
    setExt(extRes?.data ?? null)
    setLoading(false)
  }, [entity?.id])

  useEffect(() => { load() }, [load])

  const deleteRel = async (id) => {
    await supabase.from('relationships').delete().eq('id', id)
    setRels(prev => prev.filter(r => r.id !== id))
  }

  if (loading) {
    return (
      <div className="admin-record">
        <div className="admin-record__loading"><div className="admin-spinner" /></div>
      </div>
    )
  }

  // Extension fields: strip system keys and nulls, format year values
  const extFields = ext
    ? Object.entries(ext).filter(([k, v]) => !SYSTEM_FIELDS.has(k) && v != null && v !== '')
    : []

  // Person date range for sparkline
  const personStart = ext?.birth_year ?? ext?.floruit_start ?? null
  const personEnd   = ext?.death_year ?? ext?.floruit_end   ?? null

  // Separate relationships by direction
  const outgoing = (rels ?? []).filter(r => r.direction === 'out')
  const incoming = (rels ?? []).filter(r => r.direction === 'in')
  const totalRels = (rels ?? []).length

  // Geo connections: related entities that are places or geo_features
  const geoRels = (rels ?? []).filter(r =>
    r.other?.entity_type === 'place' || r.other?.entity_type === 'geo_feature'
  )

  return (
    <div className="admin-record">
      {/* Header */}
      <div className="admin-record__header">
        <div className="admin-record__name">{entity.name}</div>
        <TypeBadge type={entity.entity_type} />
      </div>

      {/* Person timeline sparkline */}
      {entity.entity_type === 'person' && (
        <PersonSparkline startYear={personStart} endYear={personEnd} />
      )}

      {/* Extension / detail fields */}
      {extFields.length > 0 && (
        <Section title="Details">
          <div className="admin-fields-grid">
            {extFields.map(([k, v]) => (
              <div key={k} className="admin-field">
                <div className="admin-field__label">{k.replace(/_/g, ' ')}</div>
                <div className="admin-field__value">{formatFieldValue(k, v)}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Relationships */}
      <Section title="Relationships" count={totalRels}>
        {outgoing.length > 0 && (
          <div className="admin-rels-group">
            <div className="admin-rels-group__label">Outgoing</div>
            {outgoing.map(r => (
              <RelCard key={r.id} rel={r} onNavigate={onNavigate} onDelete={() => deleteRel(r.id)} />
            ))}
          </div>
        )}

        {incoming.length > 0 && (
          <div className="admin-rels-group">
            <div className="admin-rels-group__label">Incoming</div>
            {incoming.map(r => (
              <RelCard key={r.id} rel={r} onNavigate={onNavigate} onDelete={() => deleteRel(r.id)} />
            ))}
          </div>
        )}

        {totalRels === 0 && (
          <div className="admin-empty-state">No relationships recorded.</div>
        )}

        <AddRelForm
          key={relKey}
          selectedEntity={entity}
          onAdded={() => { load(); setRelKey(k => k + 1) }}
        />
      </Section>

      {/* Geo connections (derived from relationships) */}
      {geoRels.length > 0 && (
        <Section title="Geographic Connections" count={geoRels.length}>
          <div className="admin-geo-list">
            {geoRels.map(r => (
              <button
                key={r.id}
                className="admin-geo-item"
                onClick={() => r.other && onNavigate(r.other)}
              >
                <div className="admin-geo-item__name">{r.other?.name}</div>
                <div className="admin-geo-item__meta">
                  <TypeBadge type={r.other?.entity_type} />
                  <span className="admin-geo-item__rel">
                    {r.relation_type.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [query, setQuery]       = useState('')
  const [selected, setSelected] = useState(null)
  const [history, setHistory]   = useState([])

  const { results, loading: searching } = useEntitySearch(query)

  // Navigate to a related entity, pushing current onto history stack
  const navigate = (entity) => {
    setHistory(h => selected ? [...h, selected] : h)
    setSelected(entity)
  }

  const goBack = () => {
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setSelected(prev ?? null)
  }

  const selectFromSidebar = (entity) => {
    setSelected(entity)
    setHistory([])
  }

  return (
    <div className="admin-page">

      {/* Sidebar */}
      <div className="admin-sidebar">
        <div className="admin-sidebar__header">
          <div className="admin-sidebar__title">Entity Browser</div>
          <input
            className="admin-search-input"
            placeholder="Search entities…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <ul className="admin-entity-list">
          {results.map(e => (
            <li
              key={e.id}
              className={`admin-entity-item${selected?.id === e.id ? ' admin-entity-item--active' : ''}`}
              onClick={() => selectFromSidebar(e)}
            >
              <span className="admin-entity-name">{e.name}</span>
              <TypeBadge type={e.entity_type} />
            </li>
          ))}
          {!searching && !results.length && query.length >= 2 && (
            <li className="admin-empty">No entities found.</li>
          )}
          {query.length < 2 && (
            <li className="admin-hint">Type 2+ characters to search</li>
          )}
        </ul>
      </div>

      {/* Main area */}
      <div className="admin-main">
        {history.length > 0 && (
          <div className="admin-breadcrumb">
            <button className="admin-back-btn" onClick={goBack}>
              ← {history[history.length - 1]?.name}
            </button>
            <span className="admin-breadcrumb__sep">/</span>
            <span className="admin-breadcrumb__current">{selected?.name}</span>
          </div>
        )}

        {!selected ? (
          <div className="admin-placeholder">
            <div className="admin-placeholder__text">Search and select an entity to view its record</div>
          </div>
        ) : (
          <EntityRecord
            key={selected.id}
            entity={selected}
            onNavigate={navigate}
          />
        )}
      </div>
    </div>
  )
}
