import { useState, useCallback } from 'react'

const MAX_HISTORY = 50

/**
 * Wraps a state value with undo/redo history.
 * Usage: const { value, set, undo, redo, canUndo, canRedo } = useUndoable([])
 */
export function useUndoable(initial) {
  const [state, setState] = useState(() => ({
    past: [],
    present: initial,
    future: [],
  }))

  const set = useCallback((newVal) => {
    setState(s => {
      const next = typeof newVal === 'function' ? newVal(s.present) : newVal
      return {
        past: [...s.past.slice(-(MAX_HISTORY - 1)), s.present],
        present: next,
        future: [],
      }
    })
  }, [])

  const undo = useCallback(() => {
    setState(s => {
      if (s.past.length === 0) return s
      return {
        past: s.past.slice(0, -1),
        present: s.past[s.past.length - 1],
        future: [s.present, ...s.future.slice(0, MAX_HISTORY - 1)],
      }
    })
  }, [])

  const redo = useCallback(() => {
    setState(s => {
      if (s.future.length === 0) return s
      return {
        past: [...s.past.slice(-(MAX_HISTORY - 1)), s.present],
        present: s.future[0],
        future: s.future.slice(1),
      }
    })
  }, [])

  return {
    value: state.present,
    set,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    historySize: state.past.length,
  }
}
