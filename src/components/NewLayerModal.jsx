import { useState } from 'react'

const PRESETS = [
  '#e85d04', '#0077b6', '#2e7d32', '#7b2d8b',
  '#c2185b', '#00838f', '#f9c74f', '#4527a0',
]

export default function NewLayerModal({ onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#e85d04')

  const submit = () => name.trim() && onConfirm(name.trim(), color)

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal__title">New Layer</div>

        <div className="modal__field">
          <label className="modal__label">Layer Name</label>
          <input
            className="modal__input"
            type="text"
            placeholder="e.g. Dialect Regions"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            autoFocus
          />
        </div>

        <div className="modal__field">
          <label className="modal__label">Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {PRESETS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 26, height: 26, borderRadius: '50%', background: c,
                  border: color === c ? '3px solid #fff' : '2px solid transparent',
                  cursor: 'pointer', padding: 0, outline: 'none',
                }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              title="Custom color"
              style={{ width: 30, height: 30, padding: 2, border: 'none',
                       borderRadius: 4, cursor: 'pointer', background: 'none' }}
            />
          </div>
        </div>

        <div className="modal__actions">
          <button className="modal__btn modal__btn--secondary" onClick={onCancel}>Cancel</button>
          <button
            className="modal__btn modal__btn--primary"
            onClick={submit}
            disabled={!name.trim()}
          >
            Create Layer
          </button>
        </div>
      </div>
    </div>
  )
}
