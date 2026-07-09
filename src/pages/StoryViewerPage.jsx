import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'

const supabase = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return url && key ? createClient(url, key) : null
})()

const TYPE_COLORS = {
  person:         '#8b5cf6',
  event:          '#ef4444',
  place:          '#10b981',
  territory:      '#3b82f6',
  geo_feature:    '#f59e0b',
  admin_boundary: '#6b7280',
}

function TypeBadge({ type }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.03em',
      background: `${TYPE_COLORS[type] ?? '#7a82a8'}22`,
      color: TYPE_COLORS[type] ?? '#7a82a8',
      textTransform: 'uppercase',
    }}>
      {type?.replace(/_/g, ' ')}
    </span>
  )
}

function formatYear(y) {
  if (y == null) return null
  return y < 0 ? `${Math.abs(y)} BCE` : String(y)
}

export default function StoryViewerPage() {
  const { id } = useParams()
  const [story, setStory]     = useState(null)
  const [entities, setEntities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!supabase || !id) return
    let active = true
    ;(async () => {
      const { data: s, error: sErr } = await supabase
        .from('stories')
        .select('*')
        .eq('id', id)
        .single()

      if (!active) return
      if (sErr || !s) { setError('Story not found.'); setLoading(false); return }
      setStory(s)

      const { data: links } = await supabase
        .from('story_entities')
        .select('entity_id, entity_type, role_in_story, notes, entity:entity_id(name)')
        .eq('story_id', id)
        .order('entity_type')

      if (active) {
        setEntities(links ?? [])
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [id])

  if (loading) return <div style={{ padding: 48, textAlign: 'center', opacity: 0.5 }}>Loading…</div>
  if (error)   return <div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>{error}</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      {/* Back link */}
      <div style={{ marginBottom: 24 }}>
        <Link to="/" style={{ fontSize: 13, color: '#7a82a8', textDecoration: 'none' }}>
          ← Back to Map
        </Link>
      </div>

      {/* Story header */}
      <div style={{ marginBottom: 24 }}>
        {story.theme && (
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a82a8', marginBottom: 6 }}>
            {story.theme}
          </div>
        )}
        <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
          {story.title}
        </h1>
        {(story.time_start != null || story.time_end != null) && (
          <div style={{ fontSize: 13, color: '#7a82a8', marginBottom: 8 }}>
            {formatYear(story.time_start)} {story.time_end != null ? `– ${formatYear(story.time_end)}` : ''}
          </div>
        )}
        {story.description && (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'inherit', opacity: 0.85 }}>
            {story.description}
          </p>
        )}
      </div>

      {/* Entity list */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a82a8', marginBottom: 12 }}>
          {entities.length} {entities.length === 1 ? 'Entity' : 'Entities'}
        </div>
        {entities.map(link => (
          <div
            key={link.entity_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderBottom: '1px solid rgba(0,0,0,0.07)',
            }}
          >
            <TypeBadge type={link.entity_type} />
            <span style={{ flex: 1, fontWeight: 500 }}>{link.entity?.name ?? '(unnamed)'}</span>
            {link.role_in_story && (
              <span style={{ fontSize: 12, color: '#7a82a8' }}>{link.role_in_story}</span>
            )}
          </div>
        ))}
        {!entities.length && (
          <p style={{ color: '#7a82a8', fontSize: 14 }}>No entities added to this story yet.</p>
        )}
      </div>
    </div>
  )
}
