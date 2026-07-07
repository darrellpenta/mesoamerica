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

// Canonical editable fields per entity type (shown in edit mode even if currently null)
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
    { key: 'event_type',    type: 'text',   label: 'Event Type' },
    { key: 'event_subtype', type: 'text',   label: 'Event Subtype' },
    { key: 'event_date',    type: 'text',   label: 'Event Date' },
    { key: 'fatalities',    type: 'number', label: 'Fatalities' },
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

  // Visible read-only fields: from ext, minus system keys, minus nulls
  const extFields = ext
    ? Object.entries(ext).filter(([k, v]) => !SYSTEM_FIELDS.has(k) && v != null && v !== '')
    : []

  const startEdit = () => {
    // Populate form from current ext data + ensure all KNOWN fields present
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
      {/* Header */}
      <div className="admin-record__header">
        <EditableName
          entity={entity}
          onSaved={(newName) => setEntity(e => ({ ...e, name: newName }))}
        />
        <TypeBadge type={entity.entity_type} />
      </div>

      {/* Person sparkline */}
      {entity.entity_type === 'person' && (
        <PersonSparkline startYear={personStart} endYear={personEnd} />
      )}

      {/* Extension fields — editable */}
      <EditableDetails
        entityType={entity.entity_type}
        entityId={entity.id}
        ext={ext}
        onSaved={load}
      />

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

      {/* Geo connections */}
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

      {/* Suggested connections */}
      <SuggestionsSection
        entity={entity}
        rels={rels ?? []}
        onRelAdded={load}
      />

      {/* Freeform annotations */}
      <AnnotationsSection entityId={entity.id} />
    </div>
  )
}

// ── Annotation value — editable in-place ─────────────────────────────────────
function EditableAnnotationValue({ annotation, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(annotation.value)

  const save = () => {
    const trimmed = value.trim()
    if (!trimmed) { setValue(annotation.value); setEditing(false); return }
    setEditing(false)
    if (trimmed !== annotation.value) onUpdate(trimmed)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
    if (e.key === 'Escape') { setValue(annotation.value); setEditing(false) }
  }

  if (editing) {
    return (
      <textarea
        className="admin-annotation-input"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={onKeyDown}
        autoFocus
        rows={Math.max(2, value.split('\n').length)}
      />
    )
  }

  const { data_type, value: val } = annotation

  let rendered
  if (data_type === 'url') {
    rendered = <a className="admin-annotation-link" href={val} target="_blank" rel="noopener noreferrer">{val}</a>
  } else if (data_type === 'markdown') {
    rendered = <pre className="admin-annotation-pre">{val}</pre>
  } else {
    rendered = <span>{val}</span>
  }

  return (
    <div
      className="admin-annotation-value"
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {rendered}
    </div>
  )
}

// ── Annotations section ───────────────────────────────────────────────────────
const ANNOTATION_TYPES = [
  { value: 'text',     label: 'Text' },
  { value: 'number',   label: 'Number' },
  { value: 'date',     label: 'Date' },
  { value: 'url',      label: 'URL' },
  { value: 'markdown', label: 'Markdown' },
]

function AnnotationsSection({ entityId }) {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [newType, setNewType] = useState('text')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    const { data } = await supabase
      .from('annotations')
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at')
    setItems(data ?? [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!newKey.trim() || !newVal.trim()) return
    setSaving(true); setErr(null)
    const { error } = await supabase.from('annotations').insert({
      entity_id: entityId,
      key:       newKey.trim(),
      value:     newVal.trim(),
      data_type: newType,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setNewKey(''); setNewVal(''); setAdding(false)
    load()
  }

  const del = async (id) => {
    await supabase.from('annotations').delete().eq('id', id)
    setItems(prev => prev.filter(a => a.id !== id))
  }

  const update = async (id, value) => {
    const { error } = await supabase.from('annotations').update({ value }).eq('id', id)
    if (!error) setItems(prev => prev.map(a => a.id === id ? { ...a, value } : a))
  }

  if (loading) return null

  return (
    <Section
      title="Notes & Annotations"
      count={items.length || undefined}
      action={
        !adding
          ? <button className="admin-section-edit-btn" onClick={() => setAdding(true)}>+ Add</button>
          : null
      }
    >
      {/* Existing annotations */}
      {items.length > 0 && (
        <div className="admin-annotation-list">
          {items.map(a => (
            <div key={a.id} className="admin-annotation-card">
              <div className="admin-annotation-card__header">
                <span className="admin-annotation-key">{a.key}</span>
                <span className="admin-annotation-type">{a.data_type}</span>
                <button className="admin-rel-card__del" onClick={() => del(a.id)} title="Delete">✕</button>
              </div>
              <EditableAnnotationValue annotation={a} onUpdate={v => update(a.id, v)} />
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && !adding && (
        <div className="admin-empty-state">No annotations. Click + Add to record freeform notes.</div>
      )}

      {/* Add form */}
      {adding && (
        <div className="admin-annotation-add">
          <div className="admin-annotation-add__row">
            <div>
              <label className="admin-field__label">Key / label</label>
              <input
                className="admin-input admin-input--compact"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="e.g. Wikipedia URL, Notes, Source"
                autoFocus
              />
            </div>
            <div>
              <label className="admin-field__label">Type</label>
              <select className="admin-select admin-input--compact" value={newType} onChange={e => setNewType(e.target.value)}>
                {ANNOTATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="admin-field__label">Value</label>
            <textarea
              className="admin-input admin-annotation-input"
              value={newVal}
              onChange={e => setNewVal(e.target.value)}
              placeholder={newType === 'url' ? 'https://…' : newType === 'markdown' ? 'Markdown supported…' : 'Value…'}
              rows={3}
            />
          </div>
          {err && <div className="admin-error">{err}</div>}
          <div className="admin-edit-actions">
            <button className="admin-save-btn admin-save-btn--sm" onClick={add} disabled={saving || !newKey.trim() || !newVal.trim()}>
              {saving ? 'Saving…' : 'Save annotation'}
            </button>
            <button className="admin-cancel-btn" onClick={() => { setAdding(false); setErr(null) }}>Cancel</button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ── Suggestion loader ─────────────────────────────────────────────────────────
async function buildSuggestions(entity, rels) {
  if (!supabase) return []

  const connectedIds = new Set([entity.id])
  for (const r of rels) { if (r.other?.id) connectedIds.add(r.other.id) }

  const suggestions = []

  // Strategy 1: for persons — find co-rulers at the same city
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

  // Strategy 2: entities with similar name fragments
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

// ── Quick-connect inline form ─────────────────────────────────────────────────
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

// ── Suggestions section ───────────────────────────────────────────────────────
function SuggestionsSection({ entity, rels, onRelAdded }) {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [dismissed, setDismissed] = useState(new Set())
  const [connecting, setConnecting] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    buildSuggestions(entity, rels).then(s => {
      if (!cancelled) { setItems(s); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [entity.id]) // intentionally not tracking rels to avoid re-running on every load

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
  const [name, setName]           = useState('')
  const [entityType, setEntityType] = useState('person')
  const [creating, setCreating]   = useState(false)
  const [err, setErr]             = useState(null)

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

      {/* Duplicate warning */}
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [query, setQuery]         = useState('')
  const [selected, setSelected]   = useState(null)
  const [history, setHistory]     = useState([])
  const [showNew, setShowNew]     = useState(false)

  const { results, loading: searching } = useEntitySearch(query)

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
    setShowNew(false)
  }

  const handleCreated = (entity) => {
    setShowNew(false)
    setQuery(entity.name)
    selectFromSidebar(entity)
  }

  return (
    <div className="admin-page">

      {/* Sidebar */}
      <div className="admin-sidebar">
        <div className="admin-sidebar__header">
          <div className="admin-sidebar__header-row">
            <div className="admin-sidebar__title">Entity Browser</div>
            <button
              className="admin-new-btn"
              onClick={() => setShowNew(v => !v)}
              title="Create a new entity"
            >
              {showNew ? '✕' : '+ New'}
            </button>
          </div>

          {showNew ? (
            <NewEntityPanel
              onCreated={handleCreated}
              onCancel={() => setShowNew(false)}
            />
          ) : (
            <input
              className="admin-search-input"
              placeholder="Search entities…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          )}
        </div>

        {!showNew && (
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
            {query.length < 2 && !showNew && (
              <li className="admin-hint">Type 2+ characters to search</li>
            )}
          </ul>
        )}
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
            <div className="admin-placeholder__text">
              Search for an entity or click + New to create one
            </div>
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
