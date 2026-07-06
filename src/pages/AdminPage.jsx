import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const REL_TYPES = ['RULED', 'FOUNDED', 'TRADED_WITH', 'ALLIED_WITH', 'DEFEATED', 'SUCCEEDED', 'LOCATED_IN']

function formatYear(y) {
  if (y == null) return ''
  return y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`
}

function useEntitySearch(query) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('entities')
        .select('id, name, entity_type')
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(20)
      if (!cancelled) { setResults(data ?? []); setLoading(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  return { results, loading }
}

function EntitySearch({ label, value, onChange }) {
  const [q, setQ] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const { results } = useEntitySearch(q)

  const pick = (e) => { onChange(e); setQ(e.name); setOpen(false) }

  return (
    <div className="admin-ent-search">
      <label className="admin-label">{label}</label>
      <input
        className="admin-input"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); if (!e.target.value) onChange(null) }}
        onFocus={() => setOpen(true)}
        placeholder="Type to search…"
      />
      {open && results.length > 0 && (
        <ul className="admin-ent-dropdown">
          {results.map(e => (
            <li key={e.id} className="admin-ent-option" onMouseDown={() => pick(e)}>
              <span className="admin-ent-name">{e.name}</span>
              <span className="admin-ent-type">{e.entity_type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RelationshipList({ entityId, onDelete }) {
  const [rels, setRels] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    const [outRes, inRes] = await Promise.all([
      supabase.from('relationships')
        .select('id, relation_type, valid_from, valid_to, to_entity:to_entity_id(id, name, entity_type)')
        .eq('from_entity_id', entityId),
      supabase.from('relationships')
        .select('id, relation_type, valid_from, valid_to, from_entity:from_entity_id(id, name, entity_type)')
        .eq('to_entity_id', entityId),
    ])
    const out = (outRes.data ?? []).map(r => ({ ...r, direction: 'out', other: r.to_entity }))
    const inc = (inRes.data ?? []).map(r => ({ ...r, direction: 'in', other: r.from_entity }))
    setRels([...out, ...inc])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  const del = async (id) => {
    await supabase.from('relationships').delete().eq('id', id)
    setRels(prev => prev.filter(r => r.id !== id))
    onDelete?.()
  }

  if (loading) return <div className="admin-loading">Loading…</div>
  if (!rels.length) return <div className="admin-empty">No relationships.</div>

  return (
    <ul className="admin-rel-list">
      {rels.map(r => (
        <li key={r.id} className="admin-rel-row">
          <span className="admin-rel-verb">{r.direction === 'out' ? '→' : '←'}</span>
          <span className="admin-rel-type">{r.relation_type}</span>
          <span className="admin-rel-other">{r.other?.name}</span>
          {(r.valid_from || r.valid_to) && (
            <span className="admin-rel-dates">
              {formatYear(r.valid_from)} – {formatYear(r.valid_to)}
            </span>
          )}
          <button className="admin-rel-del" onClick={() => del(r.id)} title="Delete">✕</button>
        </li>
      ))}
    </ul>
  )
}

function AddRelForm({ selectedEntity, onAdded }) {
  const [relType, setRelType] = useState('RULED')
  const [otherEntity, setOtherEntity] = useState(null)
  const [direction, setDirection] = useState('out')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const save = async () => {
    if (!selectedEntity || !otherEntity) return
    setSaving(true); setErr(null)
    const row = {
      from_entity_id: direction === 'out' ? selectedEntity.id : otherEntity.id,
      to_entity_id:   direction === 'out' ? otherEntity.id    : selectedEntity.id,
      relation_type:  relType,
      valid_from: validFrom ? parseInt(validFrom, 10) : null,
      valid_to:   validTo   ? parseInt(validTo, 10)   : null,
    }
    const { error } = await supabase.from('relationships').insert(row)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setOtherEntity(null); setValidFrom(''); setValidTo('')
    onAdded?.()
  }

  return (
    <div className="admin-add-form">
      <div className="admin-add-form__title">Add relationship</div>
      <div className="admin-form-row">
        <label className="admin-label">Direction</label>
        <select className="admin-select" value={direction} onChange={e => setDirection(e.target.value)}>
          <option value="out">{selectedEntity?.name} → other</option>
          <option value="in">other → {selectedEntity?.name}</option>
        </select>
      </div>
      <div className="admin-form-row">
        <label className="admin-label">Type</label>
        <select className="admin-select" value={relType} onChange={e => setRelType(e.target.value)}>
          {REL_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <EntitySearch label="Other entity" value={otherEntity} onChange={setOtherEntity} />
      <div className="admin-form-row admin-form-row--dates">
        <div>
          <label className="admin-label">From (year, negative = BCE)</label>
          <input className="admin-input" type="number" value={validFrom} onChange={e => setValidFrom(e.target.value)} placeholder="e.g. 615" />
        </div>
        <div>
          <label className="admin-label">To</label>
          <input className="admin-input" type="number" value={validTo} onChange={e => setValidTo(e.target.value)} placeholder="e.g. 683" />
        </div>
      </div>
      {err && <div className="admin-error">{err}</div>}
      <button
        className="admin-save-btn"
        onClick={save}
        disabled={saving || !otherEntity}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

export default function AdminPage() {
  const [query, setQuery]           = useState('')
  const [selected, setSelected]     = useState(null)
  const [relKey, setRelKey]         = useState(0)
  const { results, loading: searching } = useEntitySearch(query)

  return (
    <div className="admin-page">
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
              onClick={() => setSelected(e)}
            >
              <span className="admin-entity-name">{e.name}</span>
              <span className="admin-entity-type">{e.entity_type}</span>
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

      <div className="admin-main">
        {!selected ? (
          <div className="admin-placeholder">Select an entity to view its relationships</div>
        ) : (
          <>
            <div className="admin-entity-header">
              <div className="admin-entity-header__name">{selected.name}</div>
              <span className="admin-entity-header__type">{selected.entity_type}</span>
            </div>
            <RelationshipList key={relKey} entityId={selected.id} onDelete={() => setRelKey(k => k + 1)} />
            <AddRelForm selectedEntity={selected} onAdded={() => setRelKey(k => k + 1)} />
          </>
        )}
      </div>
    </div>
  )
}
