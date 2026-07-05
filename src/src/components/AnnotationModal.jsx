import { useState } from 'react'

export default function AnnotationModal({ onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [pairs, setPairs] = useState([{ key: '', value: '' }])

  const updatePair = (i, field, val) =>
    setPairs(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))

  const handleSave = () => {
    const props = { name: name.trim() || 'Untitled', description }
    pairs.forEach(({ key, value }) => {
      if (key.trim()) props[key.trim()] = value.trim()
    })
    onConfirm(props)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal__title">Annotate Shape</div>

        <div className="modal__field">
          <label className="modal__label">Name</label>
          <input
            className="modal__input"
            type="text"
            placeholder="e.g. Region 22a"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="modal__field">
          <label className="modal__label">Description</label>
          <textarea
            className="modal__input"
            rows={2}
            placeholder="e.g. Western Soke (Zoque)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="modal__field">
          <label className="modal__label">Custom Fields</label>
          {pairs.map((pair, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input
                className="modal__input"
                style={{ flex: '0 0 110px' }}
                placeholder="field name"
                value={pair.key}
                onChange={e => updatePair(i, 'key', e.target.value)}
              />
              <input
                className="modal__input"
                style={{ flex: 1 }}
                placeholder="value"
                value={pair.value}
                onChange={e => updatePair(i, 'value', e.target.value)}
              />
              <button
                onClick={() => setPairs(p => p.filter((_, idx) => idx !== i))}
                style={{ background: 'none', border: 'none', color: '#606888',
                         cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => setPairs(p => [...p, { key: '', value: '' }])}
            className="modal__add-field-btn"
          >
            + Add field
          </button>
        </div>

        <div className="modal__actions">
          <button className="modal__btn modal__btn--secondary" onClick={onCancel}>Discard</button>
          <button className="modal__btn modal__btn--primary" onClick={handleSave}>Save Shape</button>
        </div>
      </div>
    </div>
  )
}
