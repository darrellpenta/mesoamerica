import { useState, useEffect, useCallback, useRef } from 'react'
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

// Colors chosen to read well on white backgrounds (outlined badge style)
const TYPE_COLORS = {
  person:           '#7c3aed',
  place:            '#059669',
  geo_feature:      '#2563eb',
  territory:        '#d97706',
  admin_boundary:   '#9333ea',
  event:            '#dc2626',
}

const TYPE_INFO = [
  { type: 'person',         label: 'Persons',          icon: '👤' },
  { type: 'event',          label: 'Events',            icon: '⚡' },
  { type: 'place',          label: 'Places',            icon: '📍' },
  { type: 'territory',      label: 'Territories',       icon: '🗺' },
  { type: 'geo_feature',    label: 'Geo Features',      icon: '🏔' },
  { type: 'admin_boundary', label: 'Admin Boundaries',  icon: '🔲' },
]

const SYSTEM_FIELDS = new Set([
  'id', 'entity_id', 'created_at', 'updated_at', 'source_id', 'geom', 'geometry',
])

const YEAR_KEYS = new Set([
  'birth_year', 'death_year', 'floruit_start', 'floruit_end',
  'date_start', 'date_end', 'date_year_start',
])

const KNOWN_EXT_FIELDS = {
  person: [
    { key: 'person_type',    type: 'text',   label: 'Person Type',    placeholder: 'e.g. ruler' },
    { key: 'birth_year',     type: 'number', label: 'Birth Year',     placeholder: 'e.g. -615' },
    { key: 'death_year',     type: 'number', label: 'Death Year',     placeholder: 'e.g. -683' },
    { key: 'floruit_start',  type: 'number', label: 'Floruit Start',  placeholder: 'year' },
    { key: 'floruit_end',    type: 'number', label: 'Floruit End',    placeholder: 'year' },
    { key: 'date_label',     type: 'text',   label: 'Date Label',     placeholder: 'e.g. 615–683 CE' },
  ],
  place: [
    { key: 'place_type',  type: 'text',   label: 'Place Type',  placeholder: 'e.g. city' },
    { key: 'elevation_m', type: 'number', label: 'Elevation (m)' },
    { key: 'date_start',  type: 'number', label: 'Date Start (year)' },
    { key: 'date_end',    type: 'number', label: 'Date End (year)' },
    { key: 'date_label',  type: 'text',   label: 'Date Label' },
  ],
  geo_feature: [
    { key: 'feature_type', type: 'text', label: 'Feature Type' },
    { key: 'subtype',      type: 'text', label: 'Subtype' },
  ],
  territory: [
    { key: 'territory_type',  type: 'text',   label: 'Territory Type' },
    { key: 'date_start',      type: 'number', label: 'Date Start (year)' },
    { key: 'date_end',        type: 'number', label: 'Date End (year)' },
    { key: 'date_precision',  type: 'text',   label: 'Date Precision' },
  ],
  admin_boundary: [
    { key: 'admin_level', type: 'number', label: 'Admin Level' },
    { key: 'iso_code',    type: 'text',   label: 'ISO Code' },
  ],
  event: [
    { key: 'event_type',       type: 'text',   label: 'Event Type' },
    { key: 'event_subtype',    type: 'text',   label: 'Event Subtype' },
    { key: 'date_year_start',  type: 'number', label: 'Year Start' },
    { key: 'date_year_end',    type: 'number', label: 'Year End' },
    { key: 'fatalities',       type: 'number', label: 'Fatalities' },
  ],
}

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
      style={{ '--type-color': TYPE_COLORS[type] ?? '#7a82a8' }}
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

// ── Entity picker ─────────────────────────────────────────────────────────────
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
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="#e0e4f0" strokeWidth={1} />
        <line
          x1={toX(0)} y1={2} x2={toX(0)} y2={H - 2}
          stroke="#d0d4e8" strokeWidth={1} strokeDasharray="3 3"
        />
        <rect x={x1} y={5} width={barW} height={H - 10} rx={2} fill="#2563eb" opacity={0.85} />
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
function Section({ title, count, action, children }) {
  return (
    <div className="admin-record__section">
      <div className="admin-section-header">
        <span className="admin-section-title">{title}</span>
        {count != null && <span className="admin-section-count">{count}</span>}
        {action && <div className="admin-section-action">{action}</div>}
      </div>
      {children}
    </div>
  )
}

// ── Editable name field ───────────────────────────────────────────────────────
function EditableName({ entity, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(entity.name)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)

  const save = async () => {
    const trimmed = value.trim()
    if (!trimmed || trimmed === entity.name) { setEditing(false); return }
    setSaving(true); setErr(null)
    const { error } = await supabase.from('entities').update({ name: trimmed }).eq('id', entity.id)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setEditing(false)
    onSaved?.(trimmed)
  }

  const cancel = () => { setValue(entity.name); setEditing(false); setErr(null) }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') cancel()
  }

  if (editing) {
    return (
      <div className="admin-name-edit">
        <input
          className="admin-name-input"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
        />
        <button className="admin-name-save" onClick={save} disabled={saving}>
          {saving ? '…' : 'Save'}
        </button>
        <button className="admin-name-cancel" onClick={cancel}>Cancel</button>
        {err && <div className="admin-error" style={{ marginTop: 4 }}>{err}</div>}
      </div>
    )
  }

  return (
    <div className="admin-record__name-row">
      <div className="admin-record__name">{entity.name}</div>
      <button className="admin-edit-icon-btn" onClick={() => setEditing(true)} title="Edit name">
        ✎
      </button>
    </div>
  )
}

// ── Editable details section ──────────────────────────────────────────────────
function EditableDetails({ entityType, entityId, ext, onSaved }) {
  const fields = KNOWN_EXT_FIELDS[entityType] ?? []
  const [editing, setEditing]   = useState(false)
  const [form, setForm]         = useState({})
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState(null)

  const extFields = ext
    ? Object.entries(ext).filter(([k, v]) => !SYSTEM_FIELDS.has(k) && v != null && v !== '')
    : []

  const startEdit = () => {
    const initial = {}
    for (const f of fields) {
      const raw = ext?.[f.key]
      initial[f.key] = raw != null ? String(raw) : ''
    }
    setForm(initial)
    setEditing(true)
    setErr(null)
  }

  const cancel = () => { setEditing(false); setErr(null) }

  const save = async () => {
    setSaving(true); setErr(null)
    const table = EXT_TABLES[entityType]
    if (!table) { setSaving(false); setEditing(false); return }

    const updates = {}
    for (const f of fields) {
      const raw = form[f.key]
      if (raw === '' || raw == null) {
        updates[f.key] = null
      } else if (f.type === 'number') {
        const parsed = parseInt(raw, 10)
        updates[f.key] = isNaN(parsed) ? null : parsed
      } else {
        updates[f.key] = raw
      }
    }

    let error
    if (ext) {
      ({ error } = await supabase.from(table).update(updates).eq('entity_id', entityId))
    } else {
      ({ error } = await supabase.from(table).insert({ entity_id: entityId, ...updates }))
    }

    setSaving(false)
    if (error) { setErr(error.message); return }
    setEditing(false)
    onSaved?.()
  }

  if (!editing) {
    return (
      <Section
        title="Details"
        action={fields.length > 0
          ? <button className="admin-section-edit-btn" onClick={startEdit}>Edit</button>
          : null
        }
      >
        {extFields.length > 0 ? (
          <div className="admin-fields-grid">
            {extFields.map(([k, v]) => (
              <div key={k} className="admin-field">
                <div className="admin-field__label">{k.replace(/_/g, ' ')}</div>
                <div className="admin-field__value">{formatFieldValue(k, v)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-empty-state">
            {fields.length > 0 ? 'No details recorded. Click Edit to add.' : 'No editable fields for this entity type.'}
          </div>
        )}
      </Section>
    )
  }

  return (
    <Section title="Details">
      <div className="admin-edit-form">
        <div className="admin-fields-edit-grid">
          {fields.map(f => (
            <div key={f.key} className="admin-field-edit">
              <label className="admin-field__label">{f.label}</label>
              <input
                className="admin-input admin-input--compact"
                type={f.type}
                value={form[f.key] ?? ''}
                placeholder={f.placeholder ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {err && <div className="admin-error">{err}</div>}
        <div className="admin-edit-actions">
          <button className="admin-save-btn admin-save-btn--sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button className="admin-cancel-btn" onClick={cancel}>Cancel</button>
        </div>
      </div>
    </Section>
  )
}

// ── Entity Record ─────────────────────────────────────────────────────────────
function EntityRecord({ entity: initialEntity, onNavigate }) {
  const [entity, setEntity]   = useState(initialEntity)
  const [ext, setExt]         = useState(undefined)
  const [rels, setRels]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [relKey, setRelKey]   = useState(0)

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

  const personStart = ext?.birth_year ?? ext?.floruit_start ?? null
  const personEnd   = ext?.death_year ?? ext?.floruit_end   ?? null

  const outgoing = (rels ?? []).filter(r => r.direction === 'out')
  const incoming = (rels ?? []).filter(r => r.direction === 'in')
  const totalRels = (rels ?? []).length

  const geoRels = (rels ?? []).filter(r =>
    r.other?.entity_type === 'place' || r.other?.entity_type === 'geo_feature'
  )

  return (
    <div className="admin-record">
      <div className="admin-record__header">
        <EditableName
          entity={entity}
          onSaved={(newName) => setEntity(e => ({ ...e, name: newName }))}
        />
        <TypeBadge type={entity.entity_type} />
      </div>

      {entity.entity_type === 'person' && (
        <PersonSparkline startYear={personStart} endYear={personEnd} />
      )}

      <EditableDetails
        entityType={entity.entity_type}
        entityId={entity.id}
        ext={ext}
        onSaved={load}
      />

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

      <SuggestionsSection
        entity={entity}
        rels={rels ?? []}
        onRelAdded={load}
      />

      <AnnotationsSection entityId={entity.id} />
    </div>
  )
}

// ── Inline markdown renderer ──────────────────────────────────────────────────
function renderInline(text) {
  const tokens = []
  let remaining = text
  let key = 0
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*([^*]+)\*\*/)
    const linkMatch = remaining.match(/^([\s\S]*?)\[([^\]]+)\]\(([^)]+)\)/)
    if (!boldMatch && !linkMatch) {
      tokens.push(<span key={key++}>{remaining}</span>)
      break
    }
    const boldIdx = boldMatch ? boldMatch[1].length : Infinity
    const linkIdx = linkMatch ? linkMatch[1].length : Infinity
    if (boldIdx <= linkIdx && boldMatch) {
      if (boldMatch[1]) tokens.push(<span key={key++}>{boldMatch[1]}</span>)
      tokens.push(<strong key={key++}>{boldMatch[2]}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
    } else if (linkMatch) {
      if (linkMatch[1]) tokens.push(<span key={key++}>{linkMatch[1]}</span>)
      tokens.push(
        <a key={key++} href={linkMatch[3]} target="_blank" rel="noopener noreferrer"
           className="admin-annotation-link">{linkMatch[2]}</a>
      )
      remaining = remaining.slice(linkMatch[0].length)
    } else break
  }
  return tokens
}

function MarkdownBlock({ content }) {
  return (
    <div className="admin-annotation-md-content">
      {content.split('\n\n').map((para, i) => (
        <p key={i} className="admin-annotation-md-para">
          {para.split('\n').map((line, j) => (
            <span key={j}>{j > 0 && <br />}{renderInline(line)}</span>
          ))}
        </p>
      ))}
    </div>
  )
}

// ── Annotations section ───────────────────────────────────────────────────────
function AnnotationsSection({ entityId }) {
  const [row, setRow]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    const { data } = await supabase
      .from('annotations')
      .select('id, content_md')
      .eq('entity_id', entityId)
      .maybeSingle()
    setRow(data ?? null)
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  const startEdit = () => {
    setDraft(row?.content_md ?? '')
    setEditing(true)
    setErr(null)
  }

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    setSaving(true); setErr(null)
    let error
    if (row) {
      ;({ error } = await supabase.from('annotations').update({ content_md: trimmed }).eq('id', row.id))
    } else {
      ;({ error } = await supabase.from('annotations').insert({ entity_id: entityId, content_md: trimmed }))
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setEditing(false)
    load()
  }

  const del = async () => {
    if (!row) return
    await supabase.from('annotations').delete().eq('id', row.id)
    setRow(null)
  }

  if (loading) return null

  return (
    <Section
      title="Notes & Annotations"
      action={
        !editing
          ? <button className="admin-section-edit-btn" onClick={startEdit}>
              {row ? 'Edit' : '+ Add'}
            </button>
          : null
      }
    >
      {!editing && !row && (
        <div className="admin-empty-state">No notes yet. Click + Add to write freeform markdown notes.</div>
      )}

      {!editing && row && (
        <div className="admin-annotation-md">
          <MarkdownBlock content={row.content_md} />
          <button className="admin-rel-card__del admin-annotation-del" onClick={del} title="Clear annotation">✕</button>
        </div>
      )}

      {editing && (
        <div className="admin-annotation-add">
          <textarea
            className="admin-input admin-annotation-input admin-annotation-input--full"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={'Write notes in markdown…\n\n**Source:** …\n**Key facts:** …'}
            rows={10}
            autoFocus
          />
          {err && <div className="admin-error">{err}</div>}
          <div className="admin-edit-actions">
            <button className="admin-save-btn admin-save-btn--sm" onClick={save}
              disabled={saving || !draft.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="admin-cancel-btn" onClick={() => { setEditing(false); setErr(null) }}>Cancel</button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ── Suggestion helpers ────────────────────────────────────────────────────────
async function buildSuggestions(entity, rels) {
  if (!supabase) return []
  const connectedIds = new Set([entity.id])
  for (const r of rels) { if (r.other?.id) connectedIds.add(r.other.id) }
  const suggestions = []

  if (entity.entity_type === 'person') {
    const ruledCityIds = rels
      .filter(r => r.direction === 'out' && r.relation_type === 'RULED' && r.other?.id)
      .map(r => r.other.id)

    if (ruledCityIds.length > 0) {
      const { data: coRulerRels } = await supabase
        .from('relationships')
        .select('from_entity:from_entity_id(id, name, entity_type)')
        .eq('relation_type', 'RULED')
        .in('to_entity_id', ruledCityIds)
        .limit(25)

      for (const r of (coRulerRels ?? [])) {
        const e = r.from_entity
        if (e?.id && !connectedIds.has(e.id)) {
          suggestions.push({ id: e.id, name: e.name, entity_type: e.entity_type, reason: 'Also ruled same city' })
          connectedIds.add(e.id)
        }
      }
    }
  }

  const words = entity.name.split(/[\s,.']+/).filter(w => w.length >= 4)
  if (words.length > 0 && suggestions.length < 8) {
    const { data: nameMatches } = await supabase
      .from('entities')
      .select('id, name, entity_type')
      .ilike('name', `%${words[0]}%`)
      .neq('id', entity.id)
      .limit(12)

    for (const e of (nameMatches ?? [])) {
      if (!connectedIds.has(e.id)) {
        suggestions.push({ id: e.id, name: e.name, entity_type: e.entity_type, reason: 'Similar name' })
        connectedIds.add(e.id)
      }
    }
  }

  return suggestions.slice(0, 8)
}

function QuickConnectForm({ fromEntity, toEntity, onSaved, onCancel }) {
  const [relType, setRelType]     = useState('SUCCEEDED')
  const [direction, setDirection] = useState('out')
  const [validFrom, setFrom]      = useState('')
  const [validTo, setTo]          = useState('')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState(null)

  const save = async () => {
    setSaving(true); setErr(null)
    const row = {
      from_entity_id: direction === 'out' ? fromEntity.id : toEntity.id,
      to_entity_id:   direction === 'out' ? toEntity.id   : fromEntity.id,
      relation_type:  relType,
      valid_from: validFrom ? parseInt(validFrom, 10) : null,
      valid_to:   validTo   ? parseInt(validTo, 10)   : null,
    }
    const { error } = await supabase.from('relationships').insert(row)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved?.()
  }

  return (
    <div className="admin-quick-connect">
      <div className="admin-quick-connect__row">
        <span className="admin-quick-connect__entity">{fromEntity.name}</span>
        <select className="admin-select admin-input--compact" value={direction} onChange={e => setDirection(e.target.value)}>
          <option value="out">→</option>
          <option value="in">←</option>
        </select>
        <select className="admin-select admin-input--compact admin-quick-connect__type" value={relType} onChange={e => setRelType(e.target.value)}>
          {REL_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <span className="admin-quick-connect__entity">{toEntity.name}</span>
      </div>
      <div className="admin-quick-connect__dates">
        <input className="admin-input admin-input--compact" type="number" placeholder="From year" value={validFrom} onChange={e => setFrom(e.target.value)} />
        <input className="admin-input admin-input--compact" type="number" placeholder="To year" value={validTo} onChange={e => setTo(e.target.value)} />
      </div>
      {err && <div className="admin-error">{err}</div>}
      <div className="admin-edit-actions">
        <button className="admin-save-btn admin-save-btn--sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save connection'}
        </button>
        <button className="admin-cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function SuggestionsSection({ entity, rels, onRelAdded }) {
  const [items, setItems]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [dismissed, setDismissed]   = useState(new Set())
  const [connecting, setConnecting] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    buildSuggestions(entity, rels).then(s => {
      if (!cancelled) { setItems(s); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [entity.id])

  const dismiss = (id) => setDismissed(d => new Set([...d, id]))

  const handleSaved = (id) => {
    dismiss(id)
    setConnecting(null)
    onRelAdded?.()
  }

  const visible = items.filter(s => !dismissed.has(s.id))
  if (loading || !visible.length) return null

  return (
    <Section title="Suggested Connections" count={visible.length}>
      <div className="admin-suggestions-list">
        {visible.map(s => (
          <div key={s.id} className="admin-suggestion">
            {connecting?.id === s.id ? (
              <QuickConnectForm
                fromEntity={entity}
                toEntity={s}
                onSaved={() => handleSaved(s.id)}
                onCancel={() => setConnecting(null)}
              />
            ) : (
              <div className="admin-suggestion__body">
                <div className="admin-suggestion__info">
                  <span className="admin-suggestion__name">{s.name}</span>
                  <TypeBadge type={s.entity_type} />
                  <span className="admin-suggestion__reason">{s.reason}</span>
                </div>
                <div className="admin-suggestion__actions">
                  <button className="admin-suggestion__connect-btn" onClick={() => setConnecting(s)}>
                    Connect
                  </button>
                  <button className="admin-suggestion__dismiss" onClick={() => dismiss(s.id)} title="Dismiss">✕</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── New entity panel ──────────────────────────────────────────────────────────
function NewEntityPanel({ onCreated, onCancel }) {
  const [name, setName]             = useState('')
  const [entityType, setEntityType] = useState('person')
  const [creating, setCreating]     = useState(false)
  const [err, setErr]               = useState(null)

  const { results: similar } = useEntitySearch(name)

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed || !supabase) return
    setCreating(true); setErr(null)
    const { data, error } = await supabase
      .from('entities')
      .insert({ name: trimmed, entity_type: entityType })
      .select('id, name, entity_type')
      .single()
    setCreating(false)
    if (error) { setErr(error.message); return }
    onCreated(data)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') create()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="admin-new-entity">
      <div className="admin-new-entity__title">New entity</div>

      <div className="admin-form-row">
        <label className="admin-label">Name</label>
        <input
          className="admin-search-input"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Entity name…"
          autoFocus
        />
      </div>

      {similar.length > 0 && name.length >= 2 && (
        <div className="admin-new-entity__warning">
          <div className="admin-new-entity__warning-title">Similar entities already exist:</div>
          {similar.slice(0, 4).map(e => (
            <div key={e.id} className="admin-new-entity__match">
              <span className="admin-new-entity__match-name">{e.name}</span>
              <TypeBadge type={e.entity_type} />
            </div>
          ))}
          {similar.length > 4 && (
            <div className="admin-new-entity__more">+{similar.length - 4} more</div>
          )}
        </div>
      )}

      <div className="admin-form-row">
        <label className="admin-label">Entity type</label>
        <select
          className="admin-select"
          value={entityType}
          onChange={e => setEntityType(e.target.value)}
        >
          {Object.keys(EXT_TABLES).map(t => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {err && <div className="admin-error">{err}</div>}

      <div className="admin-edit-actions">
        <button
          className="admin-save-btn admin-save-btn--sm"
          onClick={create}
          disabled={creating || !name.trim()}
        >
          {creating ? 'Creating…' : 'Create entity'}
        </button>
        <button className="admin-cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Force-directed graph simulation ──────────────────────────────────────────
function runForceSimulation(nodes, edges, width, height) {
  if (!nodes || !nodes.length) return {}
  const pos = {}
  const vel = {}

  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2
    const r = Math.min(width, height) * 0.3
    pos[n.id] = { x: width / 2 + r * Math.cos(angle), y: height / 2 + r * Math.sin(angle) }
    vel[n.id] = { vx: 0, vy: 0 }
  })

  const REPEL = 1600, ATTRACT = 0.05, CENTER = 0.003, DAMP = 0.86

  for (let step = 0; step < 280; step++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].id, b = nodes[j].id
        const dx = pos[b].x - pos[a].x
        const dy = pos[b].y - pos[a].y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.5)
        const force = REPEL / (dist * dist)
        const fx = (dx / dist) * force, fy = (dy / dist) * force
        vel[a].vx -= fx; vel[a].vy -= fy
        vel[b].vx += fx; vel[b].vy += fy
      }
    }
    for (const e of edges) {
      const a = pos[e.from_entity_id], b = pos[e.to_entity_id]
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      vel[e.from_entity_id].vx += dx * ATTRACT
      vel[e.from_entity_id].vy += dy * ATTRACT
      vel[e.to_entity_id].vx -= dx * ATTRACT
      vel[e.to_entity_id].vy -= dy * ATTRACT
    }
    for (const n of nodes) {
      vel[n.id].vx += (width / 2 - pos[n.id].x) * CENTER
      vel[n.id].vy += (height / 2 - pos[n.id].y) * CENTER
      vel[n.id].vx *= DAMP
      vel[n.id].vy *= DAMP
      pos[n.id].x = Math.max(28, Math.min(width - 28, pos[n.id].x + vel[n.id].vx))
      pos[n.id].y = Math.max(20, Math.min(height - 20, pos[n.id].y + vel[n.id].vy))
    }
  }

  return pos
}

// ── Mini knowledge graph ──────────────────────────────────────────────────────
function MiniGraph({ data, onSelect }) {
  const { nodes, edges } = data
  const W = 580, H = 360

  const [positions] = useState(() => runForceSimulation(nodes, edges, W, H))
  const [hover, setHover] = useState(null)

  const seen = new Set()
  const dedupedEdges = []
  for (const e of edges) {
    const key = [e.from_entity_id, e.to_entity_id].sort().join('-')
    if (!seen.has(key)) { seen.add(key); dedupedEdges.push(e) }
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="admin-graph-svg">
      {dedupedEdges.map((e, i) => {
        const a = positions[e.from_entity_id], b = positions[e.to_entity_id]
        if (!a || !b) return null
        return (
          <line key={i}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="#dde1f0" strokeWidth={1} opacity={0.8}
          />
        )
      })}
      {nodes.map(n => {
        const p = positions[n.id]
        if (!p) return null
        const color = TYPE_COLORS[n.entity_type] ?? '#7a82a8'
        const isHover = hover === n.id
        return (
          <g key={n.id} className="admin-graph-node"
            onClick={() => onSelect(n)}
            onMouseEnter={() => setHover(n.id)}
            onMouseLeave={() => setHover(null)}
          >
            <circle
              cx={p.x} cy={p.y}
              r={isHover ? 10 : 7}
              fill={color}
              fillOpacity={isHover ? 1 : 0.85}
              stroke="white"
              strokeWidth={isHover ? 2 : 1.5}
            />
            <text
              x={p.x} y={p.y + (isHover ? 22 : 18)}
              textAnchor="middle"
              fontSize={isHover ? 10 : 9}
              fill={isHover ? '#1a1d2e' : '#7a82a8'}
              fontWeight={isHover ? '600' : '400'}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Admin dashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ onSelectEntity, onBrowseType }) {
  const [stats, setStats]           = useState(null)
  const [recent, setRecent]         = useState([])
  const [graphData, setGraphData]   = useState(null)
  const [graphLoading, setGraphLoading] = useState(true)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    async function load() {
      const [entRes, relCountRes, recentRes] = await Promise.all([
        supabase.from('entities').select('entity_type'),
        supabase.from('relationships').select('id', { count: 'exact', head: true }),
        supabase.from('entities')
          .select('id, name, entity_type')
          .order('created_at', { ascending: false })
          .limit(12),
      ])

      if (cancelled) return

      const counts = {}
      for (const e of (entRes.data ?? [])) {
        counts[e.entity_type] = (counts[e.entity_type] || 0) + 1
      }
      counts._total = (entRes.data ?? []).length
      counts._rels = relCountRes.count ?? 0

      setStats(counts)
      setRecent(recentRes.data ?? [])

      // Load graph data
      const { data: rels } = await supabase
        .from('relationships')
        .select('from_entity_id, to_entity_id, relation_type')

      if (!cancelled && rels && rels.length) {
        const connCount = {}
        for (const r of rels) {
          connCount[r.from_entity_id] = (connCount[r.from_entity_id] || 0) + 1
          connCount[r.to_entity_id]   = (connCount[r.to_entity_id]   || 0) + 1
        }

        const topIds = Object.entries(connCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 28)
          .map(([id]) => id)

        const { data: topEntities } = await supabase
          .from('entities')
          .select('id, name, entity_type')
          .in('id', topIds)

        const topSet = new Set(topIds)
        const graphEdges = rels.filter(
          r => topSet.has(r.from_entity_id) && topSet.has(r.to_entity_id)
        )

        if (!cancelled) setGraphData({ nodes: topEntities ?? [], edges: graphEdges })
      }

      if (!cancelled) setGraphLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <div className="admin-dash-header">
        <div className="admin-dash-title">Knowledge Browser</div>
        <div className="admin-dash-subtitle">Mesoamerica Research Database — click any entity to open its record</div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="admin-dash-stats">
          <div className="admin-dash-stat admin-dash-stat--total">
            <span className="admin-dash-stat__count">{stats._total}</span>
            <span className="admin-dash-stat__label">Total Entities</span>
          </div>
          <div className="admin-dash-stat">
            <span className="admin-dash-stat__count">{stats._rels}</span>
            <span className="admin-dash-stat__label">Relationships</span>
          </div>
          {TYPE_INFO.map(t => stats[t.type] ? (
            <div key={t.type} className="admin-dash-stat" style={{ '--type-color': TYPE_COLORS[t.type] }}>
              <span className="admin-dash-stat__count">{stats[t.type]}</span>
              <span className="admin-dash-stat__label">{t.label}</span>
            </div>
          ) : null)}
        </div>
      )}

      {/* Browse by type */}
      <div className="admin-dash-section">
        <div className="admin-dash-section__title">Browse by Type</div>
        <div className="admin-dash-type-grid">
          {TYPE_INFO.map(t => (
            <button
              key={t.type}
              className="admin-dash-type-card"
              style={{ '--type-color': TYPE_COLORS[t.type] ?? '#7a82a8' }}
              onClick={() => onBrowseType(t.type)}
            >
              <span className="admin-dash-type-card__icon">{t.icon}</span>
              <span className="admin-dash-type-card__label">{t.label}</span>
              {stats?.[t.type] != null && (
                <span className="admin-dash-type-card__count">{stats[t.type]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column: recent + graph */}
      <div className="admin-dash-cols">

        {/* Recently added */}
        <div className="admin-dash-panel admin-dash-panel--recent">
          <div className="admin-dash-panel__title">Recently Added</div>
          <div className="admin-dash-recent-list">
            {recent.map(e => (
              <button key={e.id} className="admin-dash-recent-item" onClick={() => onSelectEntity(e)}>
                <span className="admin-dash-recent-item__name">{e.name}</span>
                <TypeBadge type={e.entity_type} />
              </button>
            ))}
            {!recent.length && (
              <div className="admin-empty-state">No entities yet.</div>
            )}
          </div>
        </div>

        {/* Knowledge graph */}
        <div className="admin-dash-panel admin-dash-panel--graph">
          <div className="admin-dash-panel__title">
            Relationship Network
            <span className="admin-dash-panel__subtitle"> — top 28 most-connected entities</span>
          </div>
          {graphLoading && (
            <div className="admin-dash-graph-loading">
              <div className="admin-spinner" />
              <span>Building graph…</span>
            </div>
          )}
          {!graphLoading && graphData && (
            <MiniGraph data={graphData} onSelect={onSelectEntity} />
          )}
          {!graphLoading && !graphData && (
            <div className="admin-empty-state">No relationship data to display.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helper: browser download ──────────────────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── New story form ────────────────────────────────────────────────────────────
function NewStoryForm({ onCreated, onCancel }) {
  const [title, setTitle]   = useState('')
  const [theme, setTheme]   = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)

  const save = async () => {
    const t = title.trim()
    if (!t || !supabase) return
    setSaving(true); setErr(null)
    const { data, error } = await supabase
      .from('stories')
      .insert({ title: t, theme: theme.trim() || null })
      .select('id, title, theme, time_start, time_end, description, created_at')
      .single()
    setSaving(false)
    if (error) { setErr(error.message); return }
    onCreated(data)
  }

  return (
    <div className="admin-new-entity">
      <div className="admin-new-entity__title">New story</div>
      <div className="admin-form-row">
        <label className="admin-label">Title</label>
        <input
          className="admin-search-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Maya territorial decline"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
        />
      </div>
      <div className="admin-form-row">
        <label className="admin-label">Theme (optional)</label>
        <input
          className="admin-input admin-input--compact"
          value={theme}
          onChange={e => setTheme(e.target.value)}
          placeholder="linguistics, land, conflict…"
        />
      </div>
      {err && <div className="admin-error">{err}</div>}
      <div className="admin-edit-actions">
        <button className="admin-save-btn admin-save-btn--sm" onClick={save} disabled={saving || !title.trim()}>
          {saving ? 'Creating…' : 'Create story'}
        </button>
        <button className="admin-cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Stories list sidebar ──────────────────────────────────────────────────────
function StoriesListPanel({ selectedId, onSelect, onExit, refreshKey }) {
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    supabase.from('stories')
      .select('id, title, theme, time_start, time_end')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setStories(data ?? []); setLoading(false) })
  }, [refreshKey])

  return (
    <>
      <div className="admin-sidebar__header">
        <div className="admin-sidebar__header-row">
          <div className="admin-sidebar__title">Stories</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="admin-new-btn" onClick={() => setShowNew(v => !v)}>
              {showNew ? '✕' : '+ New'}
            </button>
          </div>
        </div>
        <button className="admin-stories-back-btn" onClick={onExit}>
          ← Entity browser
        </button>
        {showNew && (
          <NewStoryForm
            onCreated={s => { setShowNew(false); setStories(prev => [s, ...prev]); onSelect(s) }}
            onCancel={() => setShowNew(false)}
          />
        )}
      </div>
      <ul className="admin-entity-list">
        {loading && <li className="admin-hint">Loading…</li>}
        {!loading && !stories.length && !showNew && (
          <li className="admin-hint">No stories yet. Click + New to create one.</li>
        )}
        {stories.map(s => (
          <li
            key={s.id}
            className={`admin-entity-item${selectedId === s.id ? ' admin-entity-item--active' : ''}`}
            onClick={() => onSelect(s)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="admin-entity-name">{s.title}</div>
              {s.theme && <div className="admin-story-meta-tag">{s.theme}</div>}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

// ── Stories landing ───────────────────────────────────────────────────────────
function StoriesLanding() {
  return (
    <div className="admin-dashboard">
      <div className="admin-dash-header">
        <div className="admin-dash-title">Stories</div>
        <div className="admin-dash-subtitle">
          Select a story from the sidebar, or create a new one to get started.
        </div>
      </div>
      <div className="admin-stories-landing-body">
        <p>Stories let you curate entity selections, add narrative context, and export flat data files for use in maps, charts, and other visualization tools.</p>
        <p>Each story can hold a collection of entities from across the database — persons, events, places, territories — along with the role each plays in the narrative and notes on why it matters.</p>
        <p>Use <strong>Data Requests</strong> to ask Claude to source data you don't yet have. Submitted requests queue for processing and link automatically to the story when fulfilled.</p>
      </div>
    </div>
  )
}

// ── Story meta editor ─────────────────────────────────────────────────────────
function StoryMeta({ story, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({})
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)

  const startEdit = () => {
    setForm({
      title:       story.title ?? '',
      description: story.description ?? '',
      theme:       story.theme ?? '',
      time_start:  story.time_start != null ? String(story.time_start) : '',
      time_end:    story.time_end   != null ? String(story.time_end)   : '',
    })
    setEditing(true); setErr(null)
  }

  const save = async () => {
    const trimmed = form.title.trim()
    if (!trimmed) return
    setSaving(true); setErr(null)
    const updates = {
      title:       trimmed,
      description: form.description.trim() || null,
      theme:       form.theme.trim() || null,
      time_start:  form.time_start ? parseInt(form.time_start, 10) : null,
      time_end:    form.time_end   ? parseInt(form.time_end,   10) : null,
    }
    const { error } = await supabase.from('stories').update(updates).eq('id', story.id)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setEditing(false)
    onSaved?.({ ...story, ...updates })
  }

  if (!editing) {
    return (
      <div className="admin-record__header admin-record__header--story">
        <div className="admin-story-header-row">
          <div className="admin-record__name">{story.title}</div>
          <button className="admin-section-edit-btn" onClick={startEdit}>Edit</button>
        </div>
        {story.theme && <span className="admin-story-theme-badge">{story.theme}</span>}
        {(story.time_start != null || story.time_end != null) && (
          <div className="admin-story-time-range">
            {formatYear(story.time_start) || '?'} – {formatYear(story.time_end) || '?'}
          </div>
        )}
        {story.description && (
          <div className="admin-story-description">{story.description}</div>
        )}
      </div>
    )
  }

  return (
    <div className="admin-record__header">
      <div className="admin-add-form" style={{ width: '100%' }}>
        <div className="admin-add-form__header">
          <span className="admin-add-form__title">Edit story</span>
          <button className="admin-add-form__close" onClick={() => setEditing(false)}>✕</button>
        </div>
        <div className="admin-form-row">
          <label className="admin-label">Title</label>
          <input className="admin-input" value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
        </div>
        <div className="admin-form-row">
          <label className="admin-label">Description</label>
          <textarea className="admin-input admin-annotation-input" rows={3}
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="What is this story about?" />
        </div>
        <div className="admin-form-row">
          <label className="admin-label">Theme</label>
          <input className="admin-input" value={form.theme}
            onChange={e => setForm(p => ({ ...p, theme: e.target.value }))}
            placeholder="linguistics, land, conflict…" />
        </div>
        <div className="admin-form-row admin-form-row--dates">
          <div>
            <label className="admin-label">Start year</label>
            <input className="admin-input" type="number" value={form.time_start}
              onChange={e => setForm(p => ({ ...p, time_start: e.target.value }))}
              placeholder="-800" />
          </div>
          <div>
            <label className="admin-label">End year</label>
            <input className="admin-input" type="number" value={form.time_end}
              onChange={e => setForm(p => ({ ...p, time_end: e.target.value }))}
              placeholder="1521" />
          </div>
        </div>
        {err && <div className="admin-error">{err}</div>}
        <div className="admin-edit-actions">
          <button className="admin-save-btn admin-save-btn--sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="admin-cancel-btn" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Add story entity form ─────────────────────────────────────────────────────
function AddStoryEntityForm({ storyId, onAdded }) {
  const [open, setOpen]           = useState(false)
  const [pickedEntity, setPicked] = useState(null)
  const [role, setRole]           = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState(null)

  const save = async () => {
    if (!pickedEntity || !supabase) return
    setSaving(true); setErr(null)
    const { error } = await supabase.from('story_entities').insert({
      story_id:     storyId,
      entity_id:    pickedEntity.id,
      entity_type:  pickedEntity.entity_type,
      role_in_story: role.trim() || null,
      notes:         notes.trim() || null,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setPicked(null); setRole(''); setNotes(''); setOpen(false)
    onAdded?.()
  }

  if (!open) {
    return (
      <button className="admin-add-rel-btn" onClick={() => setOpen(true)}>
        + Add entity to story
      </button>
    )
  }

  return (
    <div className="admin-add-form">
      <div className="admin-add-form__header">
        <span className="admin-add-form__title">Add entity</span>
        <button className="admin-add-form__close" onClick={() => setOpen(false)}>✕</button>
      </div>
      <EntityPicker label="Entity" value={pickedEntity} onChange={setPicked} />
      <div className="admin-form-row">
        <label className="admin-label">Role in story (optional)</label>
        <input className="admin-input" value={role}
          onChange={e => setRole(e.target.value)}
          placeholder="subject, context, reference…" />
      </div>
      <div className="admin-form-row">
        <label className="admin-label">Notes (optional)</label>
        <input className="admin-input" value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Why this entity matters to the story…" />
      </div>
      {err && <div className="admin-error">{err}</div>}
      <button className="admin-save-btn" onClick={save} disabled={saving || !pickedEntity}>
        {saving ? 'Adding…' : 'Add to story'}
      </button>
    </div>
  )
}

// ── Story entity list ─────────────────────────────────────────────────────────
function StoryEntityList({ storyId }) {
  const [links, setLinks]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [addKey, setAddKey] = useState(0)

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('story_entities')
      .select('id, entity_id, entity_type, role_in_story, notes, entity:entity_id(id, name, entity_type)')
      .eq('story_id', storyId)
      .order('created_at', { ascending: true })
    setLinks(data ?? [])
    setLoading(false)
  }, [storyId])

  useEffect(() => { load() }, [load])

  const remove = async (linkId) => {
    await supabase.from('story_entities').delete().eq('id', linkId)
    setLinks(prev => prev.filter(l => l.id !== linkId))
  }

  return (
    <Section title="Entities" count={links?.length ?? 0}>
      {loading && <div className="admin-record__loading"><div className="admin-spinner" /></div>}
      {!loading && !links?.length && (
        <div className="admin-empty-state">No entities linked yet. Add some below.</div>
      )}
      {!loading && links?.length > 0 && (
        <div className="admin-story-entity-list">
          {links.map(link => (
            <div key={link.id} className="admin-story-entity-row">
              <div className="admin-story-entity-row__main">
                <span className="admin-entity-name" style={{ fontSize: 13 }}>
                  {link.entity?.name ?? link.entity_id}
                </span>
                <TypeBadge type={link.entity_type} />
                {link.role_in_story && (
                  <span className="admin-story-entity-row__role">{link.role_in_story}</span>
                )}
              </div>
              {link.notes && (
                <div className="admin-story-entity-row__notes">{link.notes}</div>
              )}
              <button className="admin-rel-card__del" onClick={() => remove(link.id)} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
      <AddStoryEntityForm
        key={addKey}
        storyId={storyId}
        onAdded={() => { load(); setAddKey(k => k + 1) }}
      />
    </Section>
  )
}

// ── Export panel ──────────────────────────────────────────────────────────────
function StoryExportPanel({ storyId, storyTitle }) {
  const [format, setFormat]     = useState('csv')
  const [exporting, setExporting] = useState(false)
  const [err, setErr]           = useState(null)

  const doExport = async () => {
    if (!supabase) return
    setExporting(true); setErr(null)
    try {
      const { data: links, error: linkErr } = await supabase
        .from('story_entities')
        .select('entity_id, entity_type, role_in_story, notes, entity:entity_id(name)')
        .eq('story_id', storyId)

      if (linkErr) throw new Error(linkErr.message)
      if (!links?.length) { setErr('No entities in this story to export.'); setExporting(false); return }

      const extData = await Promise.all(links.map(async (link) => {
        const table = EXT_TABLES[link.entity_type]
        if (!table) return {}
        const { data } = await supabase.from(table).select('*').eq('entity_id', link.entity_id).maybeSingle()
        return data ?? {}
      }))

      const rows = links.map((link, i) => {
        const ext = extData[i]
        return {
          entity_id:    link.entity_id,
          name:         link.entity?.name ?? '',
          entity_type:  link.entity_type,
          role_in_story: link.role_in_story ?? '',
          notes:        link.notes ?? '',
          date_start:   ext.date_start ?? ext.birth_year ?? ext.date_year_start ?? '',
          date_end:     ext.date_end   ?? ext.death_year ?? ext.date_year_end   ?? '',
          date_label:   ext.date_label ?? '',
          subtype:      ext.event_type ?? ext.place_type ?? ext.territory_type ?? ext.feature_type ?? ext.person_type ?? '',
        }
      })

      const slug = (storyTitle ?? 'story').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

      if (format === 'csv') {
        const headers = ['entity_id', 'name', 'entity_type', 'role_in_story', 'notes', 'date_start', 'date_end', 'date_label', 'subtype']
        const esc = v => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s }
        const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n')
        downloadBlob(new Blob([csv], { type: 'text/csv' }), `${slug}.csv`)
      } else {
        const features = rows.map(r => ({ type: 'Feature', geometry: null, properties: r }))
        const geojson = JSON.stringify({ type: 'FeatureCollection', features }, null, 2)
        downloadBlob(new Blob([geojson], { type: 'application/geo+json' }), `${slug}.geojson`)
      }
    } catch (e) {
      setErr(e.message)
    }
    setExporting(false)
  }

  return (
    <Section title="Export">
      <div className="admin-story-export">
        <div className="admin-story-export__formats">
          <label className="admin-story-export__fmt">
            <input type="radio" name={`fmt-${storyId}`} value="csv"
              checked={format === 'csv'} onChange={() => setFormat('csv')} />
            CSV — all entity fields, one row per entity
          </label>
          <label className="admin-story-export__fmt">
            <input type="radio" name={`fmt-${storyId}`} value="geojson"
              checked={format === 'geojson'} onChange={() => setFormat('geojson')} />
            GeoJSON — properties only, for visualization tools (Datawrapper, Flourish)
          </label>
        </div>
        {err && <div className="admin-error">{err}</div>}
        <button
          className="admin-save-btn admin-save-btn--sm"
          style={{ marginTop: 8 }}
          onClick={doExport}
          disabled={exporting}
        >
          {exporting ? 'Exporting…' : 'Download'}
        </button>
      </div>
    </Section>
  )
}

// ── Data request panel ────────────────────────────────────────────────────────
// ── Staging review panel ──────────────────────────────────────────────────────
const CONF_COLOR = {
  high:            '#059669',
  medium:          '#2563eb',
  low:             '#d97706',
  model_knowledge: '#7c3aed',
}

function StagingReviewPanel({ requestId, storyId, onClose, onDone }) {
  const [rows, setRows]             = useState(null)
  const [processing, setProcessing] = useState({})

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('staged_imports')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true })
    setRows(data ?? [])
  }, [requestId])

  useEffect(() => { load() }, [load])

  const approve = async (row) => {
    if (!supabase) return
    setProcessing(p => ({ ...p, [row.id]: 'approving' }))

    // Create entity
    const { data: ent, error: entErr } = await supabase
      .from('entities')
      .insert({ name: row.name, entity_type: row.entity_type })
      .select('id, entity_type')
      .single()

    if (entErr) {
      setProcessing(p => ({ ...p, [row.id]: null }))
      alert(`Could not create entity: ${entErr.message}`)
      return
    }

    // Extension record (dates)
    const extTable = EXT_TABLES[ent.entity_type]
    if (extTable && (row.date_start || row.date_end)) {
      const ext = { entity_id: ent.id }
      if (row.date_start) ext.date_start = row.date_start
      if (row.date_end)   ext.date_end   = row.date_end
      await supabase.from(extTable).insert(ext)
    }

    // Description + source as annotation
    if (row.description) {
      let md = row.description
      if (row.source_url) {
        md += `\n\nSource: [${row.source_label || row.source_url}](${row.source_url})`
      }
      await supabase.from('annotations').insert({ entity_id: ent.id, content_md: md })
    }

    // Link to story
    if (storyId) {
      await supabase.from('story_entities').insert({
        story_id:    storyId,
        entity_id:   ent.id,
        entity_type: ent.entity_type,
        notes:       `Sourced via data request. Confidence: ${row.confidence}`,
      })
    }

    await supabase.from('staged_imports').update({ review_status: 'approved' }).eq('id', row.id)
    setRows(r => r.map(x => x.id === row.id ? { ...x, review_status: 'approved' } : x))
    setProcessing(p => ({ ...p, [row.id]: null }))
  }

  const reject = async (row) => {
    if (!supabase) return
    setProcessing(p => ({ ...p, [row.id]: 'rejecting' }))
    await supabase.from('staged_imports').update({ review_status: 'rejected' }).eq('id', row.id)
    setRows(r => r.map(x => x.id === row.id ? { ...x, review_status: 'rejected' } : x))
    setProcessing(p => ({ ...p, [row.id]: null }))
  }

  const markDone = async () => {
    await supabase.from('data_requests').update({ status: 'done' }).eq('id', requestId)
    onDone?.()
    onClose()
  }

  const pendingRows   = (rows ?? []).filter(r => r.review_status === 'pending')
  const approvedCount = (rows ?? []).filter(r => r.review_status === 'approved').length
  const rejectedCount = (rows ?? []).filter(r => r.review_status === 'rejected').length
  const allReviewed   = rows?.length > 0 && pendingRows.length === 0

  return (
    <div className="admin-staging-panel">
      <div className="admin-staging-panel__header">
        <span className="admin-staging-panel__title">
          Review staged data — {rows?.length ?? '…'} rows
        </span>
        <button className="admin-add-form__close" onClick={onClose}>✕</button>
      </div>

      <div className="admin-staging-panel__tally">
        <span>{pendingRows.length} pending</span>
        {approvedCount > 0 && <span className="admin-staging-tally--good">{approvedCount} approved</span>}
        {rejectedCount > 0 && <span className="admin-staging-tally--bad">{rejectedCount} rejected</span>}
      </div>

      {rows === null && <div className="admin-record__loading"><div className="admin-spinner" /></div>}

      {rows?.map(row => (
        <div key={row.id} className={`admin-staging-row admin-staging-row--${row.review_status}`}>
          <div className="admin-staging-row__meta">
            <span
              className="admin-staging-row__conf"
              style={{ '--conf-color': CONF_COLOR[row.confidence] ?? '#6b7494' }}
            >
              {row.confidence}
            </span>
            <TypeBadge type={row.entity_type} />
            {(row.date_start || row.date_end) && (
              <span className="admin-story-time-range">
                {row.date_start ?? '?'}
                {row.date_end && row.date_end !== row.date_start ? `–${row.date_end}` : ''}
              </span>
            )}
          </div>
          <div className="admin-staging-row__name">{row.name}</div>
          {row.description && (
            <div className="admin-staging-row__desc">{row.description}</div>
          )}
          {row.source_url && (
            <div className="admin-staging-row__source">
              Source: <span>{row.source_label || row.source_url}</span>
            </div>
          )}

          {row.review_status === 'pending' && (
            <div className="admin-staging-row__actions">
              <button
                className="admin-staging-btn admin-staging-btn--approve"
                onClick={() => approve(row)}
                disabled={!!processing[row.id]}
              >
                {processing[row.id] === 'approving' ? '…' : 'Approve'}
              </button>
              <button
                className="admin-staging-btn admin-staging-btn--reject"
                onClick={() => reject(row)}
                disabled={!!processing[row.id]}
              >
                {processing[row.id] === 'rejecting' ? '…' : 'Reject'}
              </button>
            </div>
          )}
          {row.review_status !== 'pending' && (
            <div className={`admin-staging-row__verdict admin-staging-row__verdict--${row.review_status}`}>
              {row.review_status === 'approved' ? '✓ Approved — entity created' : '✗ Rejected'}
            </div>
          )}
        </div>
      ))}

      {allReviewed && (
        <div className="admin-staging-panel__done-bar">
          <span>{approvedCount} {approvedCount === 1 ? 'entity' : 'entities'} added to story.</span>
          <button className="admin-save-btn admin-save-btn--sm" onClick={markDone}>
            Mark request done
          </button>
        </div>
      )}
    </div>
  )
}

// ── Data request panel ────────────────────────────────────────────────────────
function DataRequestPanel({ storyId }) {
  const [requests, setRequests]     = useState(null)
  const [prompt, setPrompt]         = useState('')
  const [urlHints, setUrlHints]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [reviewingId, setReviewingId] = useState(null)
  const [err, setErr]               = useState(null)

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('data_requests')
      .select('id, prompt, status, result_summary, created_at')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
    setRequests(data ?? [])
  }, [storyId])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    const p = prompt.trim()
    if (!p || !supabase) return
    setSubmitting(true); setErr(null)
    const hints = urlHints.split('\n').map(s => s.trim()).filter(Boolean)
    const { error } = await supabase.from('data_requests').insert({
      story_id:  storyId,
      prompt:    p,
      url_hints: hints.length ? hints : null,
      status:    'pending',
    })
    setSubmitting(false)
    if (error) { setErr(error.message); return }
    setPrompt(''); setUrlHints(''); setShowForm(false)
    load()
  }

  const STATUS_COLOR = {
    pending:    '#d97706',
    processing: '#2563eb',
    review:     '#7c3aed',
    done:       '#059669',
    failed:     '#dc2626',
  }

  const activeCount = (requests ?? []).filter(r => !['done', 'failed'].includes(r.status)).length

  return (
    <Section
      title="Data Requests"
      count={activeCount || undefined}
      action={!showForm
        ? <button className="admin-section-edit-btn" onClick={() => setShowForm(true)}>+ Request</button>
        : null}
    >
      {showForm && (
        <div className="admin-add-form">
          <div className="admin-add-form__header">
            <span className="admin-add-form__title">Request data from Claude</span>
            <button className="admin-add-form__close" onClick={() => { setShowForm(false); setErr(null) }}>✕</button>
          </div>
          <p className="admin-import-hint">
            Describe the data you need. Run <code>python3 scripts/source_data.py</code> to have
            Claude search for it, then come back here to review the staged results.
          </p>
          <div className="admin-form-row">
            <label className="admin-label">What data do you need?</label>
            <textarea
              className="admin-input admin-annotation-input"
              rows={4}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Government import/export data from Nicaragua 2000–2020, from INEC or World Bank"
              autoFocus
            />
          </div>
          <div className="admin-form-row">
            <label className="admin-label">Source URLs (optional, one per line)</label>
            <textarea
              className="admin-input admin-annotation-input"
              rows={2}
              value={urlHints}
              onChange={e => setUrlHints(e.target.value)}
              placeholder="https://…"
            />
          </div>
          {err && <div className="admin-error">{err}</div>}
          <div className="admin-edit-actions">
            <button className="admin-save-btn admin-save-btn--sm" onClick={submit}
              disabled={submitting || !prompt.trim()}>
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
            <button className="admin-cancel-btn" onClick={() => { setShowForm(false); setErr(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {requests === null && <div className="admin-record__loading"><div className="admin-spinner" /></div>}
      {requests?.length === 0 && !showForm && (
        <div className="admin-empty-state">
          No requests yet. Click + Request to ask Claude to source data for this story.
        </div>
      )}
      {requests?.map(r => (
        <div key={r.id} className="admin-data-request">
          <div className="admin-data-request__header">
            <span className="admin-data-request__status"
              style={{ '--status-color': STATUS_COLOR[r.status] ?? '#9098b8' }}>
              {r.status}
            </span>
            {r.status === 'review' && reviewingId !== r.id && (
              <button
                className="admin-staging-trigger"
                onClick={() => setReviewingId(r.id)}
              >
                Review staged data
              </button>
            )}
            {r.status === 'pending' && (
              <span className="admin-data-request__hint">
                Run <code>python3 scripts/source_data.py</code> to process
              </span>
            )}
          </div>
          <div className="admin-data-request__prompt">{r.prompt}</div>
          {r.result_summary && (
            <div className="admin-data-request__result">{r.result_summary}</div>
          )}
          {reviewingId === r.id && (
            <StagingReviewPanel
              requestId={r.id}
              storyId={storyId}
              onClose={() => setReviewingId(null)}
              onDone={() => { setReviewingId(null); load() }}
            />
          )}
        </div>
      ))}
    </Section>
  )
}

// ── CSV parser (browser-side, no deps) ───────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  function parseRow(line) {
    const fields = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (ch === ',' && !inQ) { fields.push(cur); cur = '' }
      else cur += ch
    }
    fields.push(cur)
    return fields
  }

  const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).map(l => {
    const vals = parseRow(l)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').replace(/^"|"$/g, '').trim() })
    return obj
  }).filter(r => Object.values(r).some(v => v))

  return { headers, rows }
}

const FIELD_OPTIONS = [
  { value: '_skip',        label: '— skip —' },
  { value: 'name',         label: 'Name' },
  { value: 'entity_type',  label: 'Entity type' },
  { value: 'date_start',   label: 'Date / year start' },
  { value: 'date_end',     label: 'Date / year end' },
  { value: 'description',  label: 'Description / notes' },
]

// ── CSV importer ──────────────────────────────────────────────────────────────
function CSVImporter({ storyId, onDone, onCancel }) {
  const [step, setStep]             = useState('upload')  // upload|map|preview|importing|done
  const [parsed, setParsed]         = useState(null)      // { headers, rows }
  const [mapping, setMapping]       = useState({})        // { colHeader: fieldKey }
  const [defaultType, setDefaultType] = useState('place')
  const [progress, setProgress]     = useState(null)      // { done, total }
  const [results, setResults]       = useState(null)      // { created, linked, failed, errors }
  const [err, setErr]               = useState(null)
  const fileRef = useRef(null)

  // ── Step 1: read file ──────────────────────────────────────────────────────
  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const { headers, rows } = parseCSV(ev.target.result)
      if (!headers.length) { setErr('Could not parse CSV — check the file format.'); return }
      setParsed({ headers, rows })
      // Auto-detect obvious columns
      const auto = {}
      headers.forEach(h => {
        const lc = h.toLowerCase()
        if (/^name$/i.test(lc) || lc === 'title')            auto[h] = 'name'
        else if (/type/i.test(lc))                            auto[h] = 'entity_type'
        else if (/start|begin|from|year_start|date_start/i.test(lc)) auto[h] = 'date_start'
        else if (/end|to|year_end|date_end/i.test(lc))        auto[h] = 'date_end'
        else if (/desc|note|summary/i.test(lc))               auto[h] = 'description'
        else                                                   auto[h] = '_skip'
      })
      setMapping(auto)
      setStep('map')
      setErr(null)
    }
    reader.readAsText(file)
  }

  // ── Step 3: import ─────────────────────────────────────────────────────────
  const runImport = async () => {
    if (!supabase || !parsed) return
    const nameCol = Object.entries(mapping).find(([, v]) => v === 'name')?.[0]
    if (!nameCol) { setErr('You must map a column to Name.'); return }

    const typeCol  = Object.entries(mapping).find(([, v]) => v === 'entity_type')?.[0]
    const ds_col   = Object.entries(mapping).find(([, v]) => v === 'date_start')?.[0]
    const de_col   = Object.entries(mapping).find(([, v]) => v === 'date_end')?.[0]
    const desc_col = Object.entries(mapping).find(([, v]) => v === 'description')?.[0]

    setStep('importing')
    setProgress({ done: 0, total: parsed.rows.length })
    const res = { created: 0, linked: 0, failed: 0, errors: [] }

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i]
      const name = row[nameCol]?.trim()
      if (!name) { res.failed++; setProgress({ done: i + 1, total: parsed.rows.length }); continue }

      const etype = (typeCol && row[typeCol]?.trim()) || defaultType
      const notes = desc_col ? row[desc_col]?.trim() || null : null

      // Create entity
      const { data: ent, error: entErr } = await supabase
        .from('entities')
        .insert({ name, entity_type: etype })
        .select('id, entity_type')
        .single()

      if (entErr) { res.failed++; res.errors.push(`${name}: ${entErr.message}`); setProgress({ done: i + 1, total: parsed.rows.length }); continue }
      res.created++

      // Extension record (dates)
      const extTable = EXT_TABLES[ent.entity_type]
      if (extTable && (ds_col || de_col)) {
        const extRow = { entity_id: ent.id }
        if (ds_col && row[ds_col]) { const n = parseInt(row[ds_col], 10); if (!isNaN(n)) extRow.date_start = n }
        if (de_col && row[de_col]) { const n = parseInt(row[de_col], 10); if (!isNaN(n)) extRow.date_end   = n }
        await supabase.from(extTable).insert(extRow)
      }

      // Annotation for notes/description
      if (notes) {
        await supabase.from('annotations').insert({ entity_id: ent.id, content_md: notes })
      }

      // Link to story
      if (storyId) {
        const { error: linkErr } = await supabase.from('story_entities').insert({
          story_id: storyId, entity_id: ent.id, entity_type: ent.entity_type,
        })
        if (!linkErr) res.linked++
      }

      setProgress({ done: i + 1, total: parsed.rows.length })
    }

    setResults(res)
    setStep('done')
  }

  const nameIsMapped = Object.values(mapping).includes('name')

  if (step === 'upload') {
    return (
      <div className="admin-add-form">
        <div className="admin-add-form__header">
          <span className="admin-add-form__title">Import CSV</span>
          <button className="admin-add-form__close" onClick={onCancel}>✕</button>
        </div>
        <p className="admin-import-hint">
          Upload a CSV file. You'll map columns to entity fields on the next step.
          Entities are created and linked to this story automatically.
        </p>
        {err && <div className="admin-error">{err}</div>}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={onFile}
        />
        <button className="admin-import-upload-btn" onClick={() => fileRef.current?.click()}>
          Choose CSV file
        </button>
      </div>
    )
  }

  if (step === 'map') {
    const preview = parsed.rows.slice(0, 3)
    return (
      <div className="admin-add-form admin-import-form">
        <div className="admin-add-form__header">
          <span className="admin-add-form__title">Map columns — {parsed.rows.length} rows detected</span>
          <button className="admin-add-form__close" onClick={onCancel}>✕</button>
        </div>

        <div className="admin-import-mapper">
          <div className="admin-import-mapper__head">
            <span>Column</span><span>Maps to</span><span>Sample values</span>
          </div>
          {parsed.headers.map(h => (
            <div key={h} className="admin-import-mapper__row">
              <span className="admin-import-mapper__col">{h}</span>
              <select
                className="admin-select admin-input--compact"
                value={mapping[h] ?? '_skip'}
                onChange={e => setMapping(p => ({ ...p, [h]: e.target.value }))}
              >
                {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="admin-import-mapper__sample">
                {preview.map(r => r[h]).filter(Boolean).slice(0, 2).join(', ') || '—'}
              </span>
            </div>
          ))}
        </div>

        <div className="admin-import-type-row">
          <label className="admin-label">Default entity type (when not in CSV):</label>
          <select className="admin-select" value={defaultType} onChange={e => setDefaultType(e.target.value)}>
            {Object.keys(EXT_TABLES).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {!nameIsMapped && (
          <div className="admin-error" style={{ marginTop: 8 }}>Map at least one column to "Name" to continue.</div>
        )}

        <div className="admin-edit-actions" style={{ marginTop: 12 }}>
          <button className="admin-save-btn admin-save-btn--sm" onClick={runImport} disabled={!nameIsMapped}>
            Import {parsed.rows.length} rows
          </button>
          <button className="admin-cancel-btn" onClick={() => setStep('upload')}>Back</button>
        </div>
      </div>
    )
  }

  if (step === 'importing') {
    const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <div className="admin-add-form">
        <div className="admin-add-form__title" style={{ marginBottom: 14 }}>Importing…</div>
        <div className="admin-import-progress-track">
          <div className="admin-import-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="admin-import-progress-label">
          {progress?.done ?? 0} / {progress?.total ?? 0} rows
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="admin-add-form">
        <div className="admin-add-form__title" style={{ marginBottom: 14 }}>Import complete</div>
        <div className="admin-import-results">
          <div className="admin-import-result admin-import-result--good">
            <span className="admin-import-result__n">{results.created}</span>
            <span>entities created</span>
          </div>
          <div className="admin-import-result admin-import-result--good">
            <span className="admin-import-result__n">{results.linked}</span>
            <span>linked to story</span>
          </div>
          {results.failed > 0 && (
            <div className="admin-import-result admin-import-result--warn">
              <span className="admin-import-result__n">{results.failed}</span>
              <span>rows skipped</span>
            </div>
          )}
        </div>
        {results.errors.length > 0 && (
          <div className="admin-import-errors">
            {results.errors.slice(0, 5).map((e, i) => (
              <div key={i} className="admin-error" style={{ marginBottom: 2 }}>{e}</div>
            ))}
            {results.errors.length > 5 && (
              <div className="admin-error">…and {results.errors.length - 5} more</div>
            )}
          </div>
        )}
        <button className="admin-save-btn admin-save-btn--sm" style={{ marginTop: 14 }} onClick={onDone}>
          Done
        </button>
      </div>
    )
  }

  return null
}

// ── Story detail ──────────────────────────────────────────────────────────────
function StoryDetail({ story: initialStory, onUpdated, onDelete }) {
  const [story, setStory]           = useState(initialStory)
  const [showImporter, setShowImporter] = useState(false)
  const [entityListKey, setEntityListKey] = useState(0)

  const handleDelete = async () => {
    if (!supabase || !window.confirm(`Delete story "${story.title}"? This cannot be undone.`)) return
    await supabase.from('stories').delete().eq('id', story.id)
    onDelete?.()
  }

  return (
    <div className="admin-record">
      <StoryMeta story={story} onSaved={updated => { setStory(updated); onUpdated?.(updated) }} />
      <StoryEntityList key={entityListKey} storyId={story.id} />

      {/* CSV import */}
      <div className="admin-record__section">
        <div className="admin-section-header">
          <span className="admin-section-title">Import CSV</span>
          {!showImporter && (
            <button
              className="admin-section-edit-btn"
              onClick={() => setShowImporter(true)}
            >
              Import CSV
            </button>
          )}
        </div>
        {showImporter && (
          <CSVImporter
            storyId={story.id}
            onDone={() => { setShowImporter(false); setEntityListKey(k => k + 1) }}
            onCancel={() => setShowImporter(false)}
          />
        )}
        {!showImporter && (
          <p className="admin-story-description" style={{ marginTop: 4 }}>
            Upload a CSV to bulk-create entities and link them to this story.
          </p>
        )}
      </div>

      <StoryExportPanel storyId={story.id} storyTitle={story.title} />
      <DataRequestPanel storyId={story.id} />
      <div className="admin-record__section" style={{ background: '#fff8f8' }}>
        <button
          className="admin-section-edit-btn"
          onClick={handleDelete}
          style={{ color: '#dc2626', borderColor: 'rgba(220,38,38,0.3)' }}
        >
          Delete story
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
// ── Data Explorer ─────────────────────────────────────────────────────────────

const FIELD_DEFS = {
  person: [
    { key: 'entity_id',    label: 'Entity ID',      type: 'id' },
    { key: 'name',         label: 'Name',            type: 'text' },
    { key: 'person_type',  label: 'Person type',     type: 'text', groupable: true },
    { key: 'birth_year',   label: 'Birth year',      type: 'number' },
    { key: 'death_year',   label: 'Death year',      type: 'number' },
    { key: 'floruit_start',label: 'Floruit start',   type: 'number' },
    { key: 'floruit_end',  label: 'Floruit end',     type: 'number' },
    { key: 'date_label',   label: 'Date label',      type: 'text' },
    { key: 'date_precision',label:'Date precision',  type: 'text', groupable: true },
  ],
  event: [
    { key: 'entity_id',      label: 'Entity ID',     type: 'id' },
    { key: 'name',           label: 'Name',          type: 'text' },
    { key: 'event_type',     label: 'Event type',    type: 'text', groupable: true },
    { key: 'event_subtype',  label: 'Event subtype', type: 'text', groupable: true },
    { key: 'date_year_start',label: 'Year start',    type: 'number' },
    { key: 'date_year_end',  label: 'Year end',      type: 'number' },
    { key: 'date_label',     label: 'Date label',    type: 'text' },
    { key: 'fatalities',     label: 'Fatalities',    type: 'number' },
    { key: 'actor_name',     label: 'Actor',         type: 'text', groupable: true },
    { key: 'notes',          label: 'Notes',         type: 'text' },
    { key: 'lon',            label: 'Longitude',     type: 'number', geom: true },
    { key: 'lat',            label: 'Latitude',      type: 'number', geom: true },
  ],
  place: [
    { key: 'entity_id',   label: 'Entity ID',     type: 'id' },
    { key: 'name',        label: 'Name',           type: 'text' },
    { key: 'place_type',  label: 'Place type',     type: 'text', groupable: true },
    { key: 'date_start',  label: 'Date start',     type: 'number' },
    { key: 'date_end',    label: 'Date end',       type: 'number' },
    { key: 'date_label',  label: 'Date label',     type: 'text' },
    { key: 'elevation_m', label: 'Elevation (m)',  type: 'number' },
    { key: 'lon',         label: 'Longitude',      type: 'number', geom: true },
    { key: 'lat',         label: 'Latitude',       type: 'number', geom: true },
  ],
  geo_feature: [
    { key: 'entity_id',    label: 'Entity ID',     type: 'id' },
    { key: 'name',         label: 'Name',           type: 'text' },
    { key: 'feature_type', label: 'Feature type',   type: 'text', groupable: true },
    { key: 'subtype',      label: 'Subtype',        type: 'text', groupable: true },
    { key: 'date_start',   label: 'Date start',     type: 'number' },
    { key: 'date_end',     label: 'Date end',       type: 'number' },
    { key: 'lon',          label: 'Centroid lon',   type: 'number', geom: true },
    { key: 'lat',          label: 'Centroid lat',   type: 'number', geom: true },
  ],
  territory: [
    { key: 'entity_id',      label: 'Entity ID',      type: 'id' },
    { key: 'name',           label: 'Name',            type: 'text' },
    { key: 'territory_type', label: 'Territory type',  type: 'text', groupable: true },
    { key: 'date_start',     label: 'Date start',      type: 'number' },
    { key: 'date_end',       label: 'Date end',        type: 'number' },
    { key: 'date_label',     label: 'Date label',      type: 'text' },
    { key: 'lon',            label: 'Centroid lon',    type: 'number', geom: true },
    { key: 'lat',            label: 'Centroid lat',    type: 'number', geom: true },
  ],
  admin_boundary: [
    { key: 'entity_id',   label: 'Entity ID',    type: 'id' },
    { key: 'name',        label: 'Name',          type: 'text' },
    { key: 'admin_level', label: 'Admin level',   type: 'number', groupable: true },
    { key: 'iso_code',    label: 'ISO code',      type: 'text',   groupable: true },
    { key: 'lon',         label: 'Centroid lon',  type: 'number', geom: true },
    { key: 'lat',         label: 'Centroid lat',  type: 'number', geom: true },
  ],
}

const EXPLORER_DEFAULTS = {
  person:         ['name', 'person_type', 'birth_year', 'death_year'],
  event:          ['name', 'event_type', 'event_subtype', 'date_year_start', 'date_year_end', 'fatalities'],
  place:          ['name', 'place_type', 'date_start', 'date_end', 'lon', 'lat'],
  geo_feature:    ['name', 'feature_type', 'subtype', 'lon', 'lat'],
  territory:      ['name', 'territory_type', 'date_start', 'date_end'],
  admin_boundary: ['name', 'admin_level', 'iso_code'],
}

function DataExplorer() {
  const [mode, setMode]               = useState('export')
  const [entityType, setEntityType]   = useState('event')
  const [selectedFields, setSelectedFields] = useState(new Set(EXPLORER_DEFAULTS.event))
  const [previewData, setPreviewData] = useState(null)
  const [loading, setLoading]         = useState(false)
  const [exporting, setExporting]     = useState(false)
  const [err, setErr]                 = useState(null)
  const [typeCounts, setTypeCounts]   = useState(null)
  const [summaryField, setSummaryField] = useState('')
  const [summaryData, setSummaryData] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Reset fields when entity type changes
  useEffect(() => {
    setSelectedFields(new Set(EXPLORER_DEFAULTS[entityType] ?? ['name']))
    setPreviewData(null); setErr(null)
    setSummaryField(''); setSummaryData(null)
  }, [entityType])

  // Load type counts when switching to summarize
  useEffect(() => {
    if (mode !== 'summarize' || typeCounts || !supabase) return
    supabase.rpc('entity_type_counts').then(({ data, error }) => {
      if (!error) setTypeCounts(data ?? [])
    })
  }, [mode, typeCounts])

  const toggleField = (key) =>
    setSelectedFields(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const defs = FIELD_DEFS[entityType] ?? []

  const unwrap = (data) => (data ?? []).map(r => r.row_data ?? r)

  const buildCSV = (rows, fields) => {
    const esc = v => {
      const s = String(v ?? '')
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s
    }
    return [fields.join(','), ...rows.map(r => fields.map(f => esc(r[f])).join(','))].join('\n')
  }

  const computeCompleteness = (rows, fields) => {
    const out = {}
    fields.forEach(key => {
      const nonNull = rows.filter(r => r[key] != null && r[key] !== '').length
      out[key] = { nonNull, total: rows.length, pct: rows.length ? Math.round(nonNull / rows.length * 100) : 0 }
    })
    return out
  }

  const runPreview = async () => {
    if (!supabase) return
    setLoading(true); setPreviewData(null); setErr(null)
    const { data, error } = await supabase.rpc('export_entity_type', { p_type: entityType, p_limit: 100 })
    if (error) { setErr(error.message); setLoading(false); return }
    const rows = unwrap(data)
    const fields = [...selectedFields]
    setPreviewData({
      rows: rows.slice(0, 50),
      completeness: computeCompleteness(rows, fields),
      total: rows.length,
    })
    setLoading(false)
  }

  const runExport = async () => {
    if (!supabase) return
    setExporting(true); setErr(null)
    const { data, error } = await supabase.rpc('export_entity_type', { p_type: entityType, p_limit: 5000 })
    if (error) { setErr(error.message); setExporting(false); return }
    const rows = unwrap(data)
    const fields = [...selectedFields]
    downloadBlob(new Blob([buildCSV(rows, fields)], { type: 'text/csv' }), `${entityType}_export.csv`)
    setExporting(false)
  }

  const runSummary = async () => {
    if (!supabase || !summaryField) return
    setSummaryLoading(true); setSummaryData(null)
    const { data, error } = await supabase.rpc('entity_field_counts', { p_type: entityType, p_field: summaryField })
    if (!error) setSummaryData(data ?? [])
    else setErr(error.message)
    setSummaryLoading(false)
  }

  const groupableFields = defs.filter(f => f.groupable)
  const fieldList = [...selectedFields]

  return (
    <div className="admin-record">

      {/* Mode tabs */}
      <div className="admin-explorer-tabs">
        {['export', 'summarize'].map(m => (
          <button
            key={m}
            className={`admin-explorer-tab${mode === m ? ' admin-explorer-tab--active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'export' ? 'Export' : 'Summarize'}
          </button>
        ))}
      </div>

      {/* Entity type selector */}
      <div className="admin-record__section">
        <div className="admin-section-header">
          <span className="admin-section-title">Entity type</span>
        </div>
        <div className="admin-explorer-type-pills">
          {Object.keys(FIELD_DEFS).map(t => (
            <button
              key={t}
              className={`admin-explorer-type-pill${entityType === t ? ' admin-explorer-type-pill--active' : ''}`}
              onClick={() => setEntityType(t)}
            >
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* ── Export mode ─────────────────────────────────────────────────────── */}
      {mode === 'export' && (
        <>
          <div className="admin-record__section">
            <div className="admin-section-header">
              <span className="admin-section-title">Fields</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="admin-section-edit-btn" onClick={() => setSelectedFields(new Set(defs.map(f => f.key)))}>All</button>
                <button className="admin-section-edit-btn" onClick={() => setSelectedFields(new Set(['name']))}>None</button>
              </div>
            </div>
            <div className="admin-explorer-field-grid">
              {defs.map(f => (
                <label key={f.key} className={`admin-explorer-field${f.geom ? ' admin-explorer-field--geom' : ''}`}>
                  <input type="checkbox" checked={selectedFields.has(f.key)} onChange={() => toggleField(f.key)} />
                  <span>{f.label}</span>
                  {f.type === 'number' && !f.geom && <span className="admin-explorer-field-tag">num</span>}
                  {f.geom && <span className="admin-explorer-field-tag admin-explorer-field-tag--geom">geom</span>}
                </label>
              ))}
            </div>
          </div>

          {err && <div className="admin-error" style={{ margin: '0 16px 8px' }}>{err}</div>}

          <div className="admin-record__section">
            <div className="admin-edit-actions">
              <button
                className="admin-save-btn admin-save-btn--sm"
                onClick={runPreview}
                disabled={loading || fieldList.length === 0}
              >
                {loading ? 'Loading…' : `Preview (${fieldList.length} field${fieldList.length !== 1 ? 's' : ''})`}
              </button>
              <button
                className="admin-save-btn admin-save-btn--sm admin-save-btn--export"
                onClick={runExport}
                disabled={exporting || fieldList.length === 0 || !previewData}
                title={!previewData ? 'Preview first to enable export' : ''}
              >
                {exporting ? 'Exporting…' : 'Export CSV (up to 5,000 rows)'}
              </button>
            </div>
            {!previewData && !loading && (
              <p className="admin-import-hint" style={{ marginTop: 8 }}>
                Preview loads 100 rows to check completeness. Export downloads the full dataset.
              </p>
            )}
          </div>

          {previewData && (
            <div className="admin-record__section">
              {/* Completeness */}
              <div className="admin-section-header" style={{ marginBottom: 10 }}>
                <span className="admin-section-title">
                  Completeness — {previewData.rows.length} of {previewData.total} rows previewed
                </span>
              </div>
              <div className="admin-explorer-completeness">
                {fieldList.map(key => {
                  const c = previewData.completeness[key]
                  const def = defs.find(f => f.key === key)
                  if (!c) return null
                  const color = c.pct >= 90 ? '#059669' : c.pct >= 50 ? '#d97706' : '#dc2626'
                  return (
                    <div key={key} className="admin-explorer-comp-row">
                      <span className="admin-explorer-comp-label">{def?.label ?? key}</span>
                      <div className="admin-explorer-comp-track">
                        <div className="admin-explorer-comp-fill" style={{ width: `${c.pct}%`, background: color }} />
                      </div>
                      <span className="admin-explorer-comp-stat" style={{ color }}>
                        {c.nonNull}/{c.total}
                        {c.pct < 100 && (
                          <span className="admin-explorer-comp-missing"> ({c.total - c.nonNull} missing)</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Preview table */}
              <div className="admin-explorer-table-wrap">
                <table className="admin-explorer-table">
                  <thead>
                    <tr>
                      {fieldList.map(k => {
                        const def = defs.find(f => f.key === k)
                        return <th key={k}>{def?.label ?? k}</th>
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, i) => (
                      <tr key={i}>
                        {fieldList.map(k => (
                          <td key={k} className={row[k] == null ? 'admin-explorer-td--null' : ''}>
                            {row[k] != null ? String(row[k]).slice(0, 100) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Summarize mode ───────────────────────────────────────────────────── */}
      {mode === 'summarize' && (
        <>
          {/* Database-wide counts */}
          <div className="admin-record__section">
            <div className="admin-section-header">
              <span className="admin-section-title">Database totals</span>
            </div>
            {!typeCounts && <div className="admin-record__loading"><div className="admin-spinner" /></div>}
            {typeCounts && (() => {
              const maxN = Math.max(...typeCounts.map(r => Number(r.entity_count)))
              return (
                <div className="admin-explorer-counts">
                  {typeCounts.map(r => (
                    <div key={r.entity_type} className="admin-explorer-count-row">
                      <span className="admin-explorer-count-label">{r.entity_type.replace(/_/g, ' ')}</span>
                      <div className="admin-explorer-comp-track" style={{ flex: 1 }}>
                        <div
                          className="admin-explorer-comp-fill"
                          style={{ width: `${Math.round(Number(r.entity_count) / maxN * 100)}%`, background: '#2d6ee0' }}
                        />
                      </div>
                      <span className="admin-explorer-count-n">{Number(r.entity_count).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* Field group-by */}
          {groupableFields.length > 0 && (
            <div className="admin-record__section">
              <div className="admin-section-header">
                <span className="admin-section-title">
                  Count {entityType.replace(/_/g, ' ')} by field
                </span>
              </div>
              <div className="admin-import-type-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <select
                  className="admin-select"
                  value={summaryField}
                  onChange={e => { setSummaryField(e.target.value); setSummaryData(null) }}
                >
                  <option value="">— choose a field —</option>
                  {groupableFields.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
                <button
                  className="admin-save-btn admin-save-btn--sm"
                  onClick={runSummary}
                  disabled={!summaryField || summaryLoading}
                >
                  {summaryLoading ? 'Loading…' : 'Count'}
                </button>
                {summaryData && (
                  <button
                    className="admin-section-edit-btn"
                    onClick={() => {
                      const csv = 'value,count\n' + summaryData.map(r => `${r.field_value},${r.entity_count}`).join('\n')
                      downloadBlob(new Blob([csv], { type: 'text/csv' }), `${entityType}_by_${summaryField}.csv`)
                    }}
                  >
                    Export CSV
                  </button>
                )}
              </div>

              {err && <div className="admin-error" style={{ marginTop: 8 }}>{err}</div>}

              {summaryData && (() => {
                const maxN = Math.max(...summaryData.map(r => Number(r.entity_count)))
                return (
                  <div className="admin-explorer-counts" style={{ marginTop: 12 }}>
                    {summaryData.map((r, i) => (
                      <div key={i} className="admin-explorer-count-row">
                        <span className="admin-explorer-count-label">{r.field_value}</span>
                        <div className="admin-explorer-comp-track" style={{ flex: 1 }}>
                          <div
                            className="admin-explorer-comp-fill"
                            style={{ width: `${Math.round(Number(r.entity_count) / maxN * 100)}%`, background: '#7c3aed' }}
                          />
                        </div>
                        <span className="admin-explorer-count-n">{Number(r.entity_count).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function AdminPage() {
  const [query, setQuery]         = useState('')
  const [selected, setSelected]   = useState(null)
  const [history, setHistory]     = useState([])
  const [showNew, setShowNew]     = useState(false)
  const [browseType, setBrowseType]       = useState(null)
  const [browseResults, setBrowseResults] = useState([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [storiesMode, setStoriesMode]     = useState(false)
  const [selectedStory, setSelectedStory] = useState(null)
  const [storyListKey, setStoryListKey]   = useState(0)
  const [explorerMode, setExplorerMode]   = useState(false)

  const { results, loading: searching } = useEntitySearch(query)

  useEffect(() => {
    if (!browseType || !supabase) { setBrowseResults([]); return }
    setBrowseLoading(true)
    supabase.from('entities')
      .select('id, name, entity_type')
      .eq('entity_type', browseType)
      .order('name')
      .limit(100)
      .then(({ data }) => { setBrowseResults(data ?? []); setBrowseLoading(false) })
  }, [browseType])

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
    setSelected(entity); setHistory([]); setShowNew(false)
  }

  const handleCreated = (entity) => {
    setShowNew(false); setQuery(entity.name); selectFromSidebar(entity)
  }

  const handleBrowseType = (type) => {
    setBrowseType(prev => prev === type ? null : type)
    setQuery(''); setShowNew(false)
  }

  const enterStoriesMode = () => {
    setStoriesMode(true); setExplorerMode(false)
    setBrowseType(null); setQuery('')
    setSelected(null); setHistory([]); setShowNew(false)
  }

  const exitStoriesMode = () => {
    setStoriesMode(false); setSelectedStory(null)
  }

  const enterExplorerMode = () => {
    setExplorerMode(true); setStoriesMode(false)
    setBrowseType(null); setQuery('')
    setSelected(null); setHistory([]); setShowNew(false)
  }

  const exitExplorerMode = () => setExplorerMode(false)

  const displayList = query.length >= 2 ? results : browseResults

  return (
    <div className="admin-page">

      {/* Sidebar */}
      <div className="admin-sidebar">
        {explorerMode ? (
          <div className="admin-sidebar__header">
            <button className="admin-stories-back-btn" onClick={exitExplorerMode}>← Entity browser</button>
            <div className="admin-sidebar__title" style={{ marginTop: 12 }}>Data Explorer</div>
            <p className="admin-import-hint" style={{ marginTop: 8 }}>
              Build a dataset from any entity type, check field completeness, and export to CSV for R or Python.
            </p>
          </div>
        ) : storiesMode ? (
          <StoriesListPanel
            selectedId={selectedStory?.id}
            onSelect={setSelectedStory}
            onExit={exitStoriesMode}
            refreshKey={storyListKey}
          />
        ) : (
          <>
            <div className="admin-sidebar__header">
              <div className="admin-sidebar__header-row">
                <div className="admin-sidebar__title">Entity Browser</div>
                <button className="admin-new-btn" onClick={() => setShowNew(v => !v)} title="Create a new entity">
                  {showNew ? '✕' : '+ New'}
                </button>
              </div>

              {!showNew && (
                <div className="admin-type-pills">
                  {TYPE_INFO.map(t => (
                    <button
                      key={t.type}
                      className={`admin-type-pill${browseType === t.type ? ' admin-type-pill--active' : ''}`}
                      style={{ '--type-color': TYPE_COLORS[t.type] }}
                      onClick={() => handleBrowseType(t.type)}
                      title={`Browse ${t.label}`}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              )}

              {showNew ? (
                <NewEntityPanel onCreated={handleCreated} onCancel={() => setShowNew(false)} />
              ) : (
                <>
                  <input
                    className="admin-search-input"
                    placeholder={browseType
                      ? `Search in ${TYPE_INFO.find(t => t.type === browseType)?.label ?? browseType}…`
                      : 'Search all entities…'}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  <div className="admin-mode-toggles">
                    <button className="admin-stories-toggle" onClick={enterStoriesMode}>Stories</button>
                    <button className="admin-stories-toggle" onClick={enterExplorerMode}>Data Explorer</button>
                  </div>
                </>
              )}
            </div>

            {!showNew && (
              <ul className="admin-entity-list">
                {browseLoading && query.length < 2 && <li className="admin-hint">Loading…</li>}
                {displayList.map(e => (
                  <li
                    key={e.id}
                    className={`admin-entity-item${selected?.id === e.id ? ' admin-entity-item--active' : ''}`}
                    onClick={() => selectFromSidebar(e)}
                  >
                    <span className="admin-entity-name">{e.name}</span>
                    <TypeBadge type={e.entity_type} />
                  </li>
                ))}
                {!searching && !browseLoading && !displayList.length && query.length >= 2 && (
                  <li className="admin-empty">No entities found.</li>
                )}
                {query.length < 2 && !browseType && !showNew && (
                  <li className="admin-hint">Select a type above or type to search</li>
                )}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Main area */}
      <div className="admin-main">
        {explorerMode ? (
          <DataExplorer />
        ) : storiesMode ? (
          selectedStory ? (
            <StoryDetail
              key={selectedStory.id}
              story={selectedStory}
              onUpdated={updated => setSelectedStory(updated)}
              onDelete={() => { setSelectedStory(null); setStoryListKey(k => k + 1) }}
            />
          ) : (
            <StoriesLanding />
          )
        ) : (
          <>
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
              <AdminDashboard onSelectEntity={selectFromSidebar} onBrowseType={handleBrowseType} />
            ) : (
              <EntityRecord key={selected.id} entity={selected} onNavigate={navigate} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
