const TOOLS = [
  { id:'draw_polygon',     label:'Polygon',  icon:'⬡', title:'Click vertices; double-click to close' },
  { id:'freehand_polygon', label:'Freehand', icon:'✏', title:'Click and drag to draw a freehand shape' },
  { id:'draw_line_string', label:'Line',     icon:'╱', title:'Click to place segments; double-click to finish' },
  { id:'draw_point',       label:'Point',    icon:'●', title:'Click to place a point' },
  { id:'simple_select',    label:'Select',   icon:'↖', title:'Select and move shapes; double-click to edit vertices' },
]

export default function DrawToolbar({
  activeTool, activeLayerLabel, onToolChange, onDoneDrawing,
  canUndo, canRedo, onUndo, onRedo,
  snapLayerLabel,
  pendingReEdit, onCommitReEdit, onCancelReEdit,
  regionBuildMode, selectedCellCount, onCommitRegion, onCancelRegion,
}) {
  // ── Region-build mode ──────────────────────────────────────────────────────
  if (regionBuildMode) {
    return (
      <div className="draw-toolbar">
        <span className="draw-toolbar__layer-name" style={{color:'#64b5f6'}}>&#8862; Region Builder</span>
        <div className="draw-toolbar__sep" />
        {selectedCellCount > 0
          ? <span style={{fontSize:11,color:'#a5d6a7',padding:'0 6px',whiteSpace:'nowrap'}}>{selectedCellCount} polygon{selectedCellCount!==1?'s':''} selected</span>
          : <span style={{fontSize:11,color:'#606888',padding:'0 6px',whiteSpace:'nowrap'}}>Click map polygons to select</span>
        }
        <div className="draw-toolbar__sep" />
        <button
          className="draw-tool-btn draw-tool-btn--done"
          onClick={onCommitRegion}
          disabled={!selectedCellCount}
          title="Union selected polygons and save to active layer"
        >&#10003; Merge &amp; Create</button>
        <button className="draw-tool-btn draw-tool-btn--danger" onClick={onCancelRegion}>&#10005; Cancel</button>
      </div>
    )
  }

  // ── Re-edit mode: minimal toolbar ─────────────────────────────────────
  if (pendingReEdit) {
    return (
      <div className="draw-toolbar">
        <span className="draw-toolbar__layer-name" style={{color:'#64b5f6'}}>
          ✎ Re-editing: {pendingReEdit.properties?.name || 'shape'}
        </span>
        <div className="draw-toolbar__sep" />
        <span style={{fontSize:11,color:'#606888',padding:'0 4px',whiteSpace:'nowrap'}}>
          Click polygon to add / remove / drag a point
        </span>
        <div className="draw-toolbar__sep" />
        <button className="draw-tool-btn draw-tool-btn--done" onClick={onCommitReEdit} title="Save changes">
          ✓ Commit
        </button>
        <button className="draw-tool-btn draw-tool-btn--danger" onClick={onCancelReEdit} title="Discard changes">
          ✕ Cancel
        </button>
      </div>
    )
  }

  // ── Normal draw toolbar ────────────────────────────────────────────────
  return (
    <div className="draw-toolbar">
      <span className="draw-toolbar__layer-name" title={activeLayerLabel}>
        {activeLayerLabel}
      </span>

      <div className="draw-toolbar__sep" />

      {TOOLS.map(tool => (
        <button
          key={tool.id}
          className={`draw-tool-btn${activeTool === tool.id ? ' draw-tool-btn--active' : ''}`}
          onClick={() => onToolChange(tool.id)}
          title={tool.title}
        >
          <span className="draw-tool-btn__icon">{tool.icon}</span>
          <span>{tool.label}</span>
        </button>
      ))}

      <div className="draw-toolbar__sep" />

      {/* Undo / Redo */}
      <button
        className="draw-tool-btn"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo last action (Ctrl+Z)"
      >
        ↩ Undo
      </button>
      <button
        className="draw-tool-btn"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
      >
        ↪ Redo
      </button>

      {snapLayerLabel && (
        <>
          <div className="draw-toolbar__sep" />
          <span className="draw-toolbar__snap-badge" title="Snap to boundary is active">
            ⊕ {snapLayerLabel}
          </span>
        </>
      )}

      <div className="draw-toolbar__sep" />

      <button className="draw-tool-btn draw-tool-btn--done" onClick={onDoneDrawing} title="Finish editing this layer">
        ✓ Done
      </button>
    </div>
  )
}
