import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

// Era definitions — eStart/eEnd are historical boundaries; dMin/dMax are the axis display range
const ERAS = [
  { key: 'all',         label: 'All Eras',    dMin: -800, dMax: 1600, color: null },
  { key: 'preclassic',  label: 'Preclassic',  dMin: -900, dMax:  350, color: '#2d9a6b', eStart: -800, eEnd:  250 },
  { key: 'classic',     label: 'Classic',      dMin:  150, dMax: 1000, color: '#d97706', eStart:  250, eEnd:  900 },
  { key: 'postclassic', label: 'Postclassic', dMin:  800, dMax: 1600, color: '#dc4a26', eStart:  900, eEnd: 1521 },
  { key: 'colonial',    label: 'Colonial',    dMin: 1450, dMax: 1625, color: '#6366f1', eStart: 1521, eEnd: 1600 },
]

const ENTITY_TYPES = [
  { type: 'person',         label: 'Persons',          icon: '👤', color: '#7c3aed' },
  { type: 'event',          label: 'Events',            icon: '⚡', color: '#dc2626' },
  { type: 'place',          label: 'Places',            icon: '📍', color: '#059669' },
  { type: 'territory',      label: 'Territories',       icon: '🗺', color: '#d97706' },
  { type: 'admin_boundary', label: 'Admin Boundaries',  icon: '🔲', color: '#9333ea' },
]

// Layout
const ROW_H       = 26
const SECTION_H   = 32
const GROUP_H     = 22
const LABEL_W     = 204
const AXIS_H      = 54
const ERA_STRIP_H = 16
const TICK_Y      = ERA_STRIP_H + 6
const PAD         = 16

function yearToX(year, width, dMin, dMax) {
  return LABEL_W + ((year - dMin) / (dMax - dMin)) * (width - LABEL_W - PAD)
}

function fmtYear(y) {
  if (y == null) return '?'
  return y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`
}

// Colored era reference strip shown at the top of the SVG at all times
function EraStrip({ width, dMin, dMax }) {
  return (
    <g>
      <rect x={LABEL_W} y={0} width={width - LABEL_W - PAD} height={ERA_STRIP_H} fill="#eef0f8" rx={3} />
      {ERAS.filter(e => e.color).map(era => {
        const sx = yearToX(Math.max(era.eStart, dMin), width, dMin, dMax)
        const ex = yearToX(Math.min(era.eEnd,   dMax), width, dMin, dMax)
        const rx = Math.max(sx, LABEL_W)
        const w  = Math.max(0, Math.min(ex, width - PAD) - rx)
        if (w < 2) return null
        return (
          <g key={era.key}>
            <rect x={rx} y={1} width={w} height={ERA_STRIP_H - 2} fill={era.color} opacity={0.82} />
            {w > 44 && (
              <text x={rx + w / 2} y={ERA_STRIP_H - 4} textAnchor="middle" fontSize={8.5} fontWeight="700" fill="white" letterSpacing="0.07em">
                {era.label.toUpperCase()}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

// Axis ticks, baseline, era background bands, and period divider lines
function Axis({ width, dMin, dMax, svgH }) {
  const range = dMax - dMin
  const step  = range <= 200 ? 25 : range <= 500 ? 50 : range <= 1000 ? 100 : 200

  const ticks = []
  for (let y = Math.ceil(dMin / step) * step; y <= dMax; y += step) {
    ticks.push({
      x:     yearToX(y, width, dMin, dMax),
      label: y === 0 ? '0' : y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`,
    })
  }

  return (
    <g>
      {/* Subtle era background bands, visible behind all row content */}
      {ERAS.filter(e => e.color).map(era => {
        const sx = Math.max(yearToX(Math.max(era.eStart, dMin), width, dMin, dMax), LABEL_W)
        const ex = Math.min(yearToX(Math.min(era.eEnd,   dMax), width, dMin, dMax), width - PAD)
        if (ex <= sx) return null
        return <rect key={era.key} x={sx} y={AXIS_H} width={ex - sx} height={svgH - AXIS_H} fill={era.color} opacity={0.04} />
      })}

      {/* Axis baseline */}
      <line x1={LABEL_W} y1={TICK_Y + 18} x2={width - PAD} y2={TICK_Y + 18} stroke="#d8dce8" strokeWidth={1} />

      {ticks.map(t => (
        <g key={t.label}>
          <line x1={t.x} y1={TICK_Y + 14} x2={t.x} y2={TICK_Y + 22} stroke="#d8dce8" strokeWidth={1} />
          <text x={t.x} y={TICK_Y + 11} textAnchor="middle" fontSize={9} fill="#9098b8">{t.label}</text>
        </g>
      ))}

      {/* 0 CE divider */}
      {dMin < 0 && dMax > 0 && (
        <line
          x1={yearToX(0, width, dMin, dMax)} y1={ERA_STRIP_H}
          x2={yearToX(0, width, dMin, dMax)} y2={svgH}
          stroke="#b8c0d4" strokeWidth={1} strokeDasharray="4 3"
        />
      )}

      {/* Era period boundary lines */}
      {[250, 900, 1521].filter(y => y > dMin && y < dMax).map(y => (
        <line
          key={y}
          x1={yearToX(y, width, dMin, dMax)} y1={ERA_STRIP_H}
          x2={yearToX(y, width, dMin, dMax)} y2={svgH}
          stroke="#d8dce8" strokeWidth={1} strokeDasharray="3 5"
        />
      ))}
    </g>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function TimelinePage() {
  const [allRows, setAllRows]   = useState({})
  const [loading, setLoading]   = useState(true)
  const [eraKey, setEraKey]     = useState('all')
  const [visTypes, setVisTypes] = useState(() => new Set(ENTITY_TYPES.map(t => t.type)))
  const [hovered, setHovered]   = useState(null)
  const [tooltip, setTooltip]   = useState(null)
  const [svgWidth, setSvgWidth] = useState(1000)
  const containerRef            = useRef(null)

  useEffect(() => {
    const obs = new ResizeObserver(es => setSvgWidth(es[0].contentRect.width || 1000))
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return }
      setLoading(true)

      const [
        { data: pD }, { data: eD }, { data: plD }, { data: tD }, { data: abD }, { data: rD },
      ] = await Promise.all([
        supabase.from('persons').select('entity_id, birth_year, death_year, floruit_start, floruit_end, date_label, person_type, entity:entity_id(name)'),
        supabase.from('events').select('entity_id, date_year_start, date_year_end, date_label, event_type, entity:entity_id(name)'),
        supabase.from('places').select('entity_id, date_start, date_end, date_label, place_type, entity:entity_id(name)'),
        supabase.from('territories').select('entity_id, date_start, date_end, date_label, territory_type, entity:entity_id(name)'),
        supabase.from('admin_boundaries').select('entity_id, date_start, date_end, date_label, boundary_type, entity:entity_id(name)'),
        supabase.from('relationships').select('from_entity_id, valid_from, valid_to, to_entity:to_entity_id(name)').eq('relation_type', 'RULED'),
      ])

      // Polity lookup (RULED relationships) for person sub-grouping
      const polityMap = {}
      for (const r of (rD ?? [])) {
        if (!polityMap[r.from_entity_id]) polityMap[r.from_entity_id] = []
        polityMap[r.from_entity_id].push(r)
      }

      // Normalize persons with polity group
      const persons = (pD ?? []).flatMap(p => {
        const rels   = polityMap[p.entity_id] ?? []
        const polity = rels[0]?.to_entity?.name ?? null

        let s = p.birth_year ?? p.floruit_start ?? null
        let e = p.death_year ?? p.floruit_end   ?? null

        if (s == null && rels.length) {
          const m = Math.min(...rels.filter(r => r.valid_from != null).map(r => r.valid_from))
          s = isFinite(m) ? m : null
        }
        if (e == null && rels.length) {
          const m = Math.max(...rels.filter(r => r.valid_to != null).map(r => r.valid_to))
          e = isFinite(m) ? m : null
        }

        if (s == null && e == null) return []
        return [{ id: p.entity_id, name: p.entity?.name ?? '(unknown)', entityType: 'person', startYear: s, endYear: e, dateLabel: p.date_label, subtype: p.person_type, group: polity ?? 'Unaffiliated' }]
      })

      // Generic normalizer for the other entity types
      const normalize = (data, etype, getS, getE, getSub) =>
        (data ?? []).flatMap(r => {
          const s = getS(r), e = getE(r)
          if (s == null && e == null) return []
          return [{ id: r.entity_id, name: r.entity?.name ?? '(unknown)', entityType: etype, startYear: s, endYear: e, dateLabel: r.date_label, subtype: getSub(r), group: null }]
        })

      const events      = normalize(eD,  'event',          r => r.date_year_start, r => r.date_year_end, r => r.event_type)
      const places      = normalize(plD, 'place',           r => r.date_start,      r => r.date_end,      r => r.place_type)
      const territories = normalize(tD,  'territory',       r => r.date_start,      r => r.date_end,      r => r.territory_type)
      const adminBounds = normalize(abD, 'admin_boundary',  r => r.date_start,      r => r.date_end,      r => r.boundary_type)

      const byStart = (a, b) => (a.startYear ?? 0) - (b.startYear ?? 0)
      persons.sort((a, b) => {
        const gc = (a.group ?? '').localeCompare(b.group ?? '')
        return gc !== 0 ? gc : (a.startYear ?? 0) - (b.startYear ?? 0)
      })
      events.sort(byStart); places.sort(byStart); territories.sort(byStart); adminBounds.sort(byStart)

      setAllRows({ person: persons, event: events, place: places, territory: territories, admin_boundary: adminBounds })
      setLoading(false)
    }
    load()
  }, [])

  // Derived: axis display range for selected era
  const eraObj = ERAS.find(e => e.key === eraKey)
  const dMin   = eraObj.dMin
  const dMax   = eraObj.dMax

  function overlapsDisplay(row) {
    if (eraKey === 'all') return true
    const s = row.startYear ?? row.endYear
    const e = row.endYear   ?? row.startYear
    return s < dMax && e > dMin
  }

  function toggleType(type) {
    setVisTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        if (next.size === 1) return prev   // always keep at least one
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  // Build positioned render items and count visible entities
  const renderItems = []
  let yOffset      = AXIS_H
  let totalVisible = 0
  const countsByType = {}

  for (const et of ENTITY_TYPES) {
    const typeRows = (allRows[et.type] ?? []).filter(overlapsDisplay)
    countsByType[et.type] = typeRows.length

    if (!visTypes.has(et.type) || typeRows.length === 0) continue
    totalVisible += typeRows.length

    renderItems.push({ kind: 'section', et, count: typeRows.length, y: yOffset })
    yOffset += SECTION_H

    if (et.type === 'person') {
      let curGroup = null
      for (const row of typeRows) {
        if (row.group !== curGroup) {
          curGroup = row.group
          renderItems.push({ kind: 'group', label: row.group, color: et.color, y: yOffset })
          yOffset += GROUP_H
        }
        renderItems.push({ kind: 'row', row, color: et.color, y: yOffset })
        yOffset += ROW_H
      }
    } else {
      for (const row of typeRows) {
        renderItems.push({ kind: 'row', row, color: et.color, y: yOffset })
        yOffset += ROW_H
      }
    }
  }

  const svgH = yOffset + 16

  return (
    <div className="timeline-page">
      <div className="timeline-toolbar">
        {/* Row 1: Era filter (primary exploration axis) */}
        <div className="timeline-toolbar__row">
          <span className="timeline-toolbar__label">Era</span>
          {ERAS.map(era => (
            <button
              key={era.key}
              className={`timeline-filter-btn${eraKey === era.key ? ' timeline-filter-btn--active' : ''}`}
              style={era.color ? { '--city-color': era.color } : {}}
              onClick={() => setEraKey(era.key)}
            >
              {era.label}
            </button>
          ))}
        </div>

        {/* Row 2: Entity type toggles */}
        <div className="timeline-toolbar__row">
          <span className="timeline-toolbar__label">Show</span>
          {ENTITY_TYPES.map(et => (
            <button
              key={et.type}
              className={`timeline-type-btn${visTypes.has(et.type) ? ' timeline-type-btn--active' : ''}`}
              style={{ '--type-color': et.color }}
              onClick={() => toggleType(et.type)}
              title={`${countsByType[et.type] ?? 0} entries in current view`}
            >
              <span>{et.icon}</span>
              <span>{et.label}</span>
              {(countsByType[et.type] ?? 0) > 0 && (
                <span className="timeline-type-btn__count">{countsByType[et.type]}</span>
              )}
            </button>
          ))}
          {!loading && (
            <span className="timeline-toolbar__summary">{totalVisible} entries</span>
          )}
        </div>
      </div>

      <div className="timeline-scroll" ref={containerRef}>
        {loading ? (
          <div className="timeline-loading">Loading…</div>
        ) : totalVisible === 0 ? (
          <div className="timeline-loading">No timed data for this selection.</div>
        ) : (
          <svg width="100%" height={svgH} className="timeline-svg">
            <EraStrip width={svgWidth} dMin={dMin} dMax={dMax} />
            <Axis width={svgWidth} dMin={dMin} dMax={dMax} svgH={svgH} />

            {renderItems.map((item, i) => {
              if (item.kind === 'section') {
                const { et, count, y } = item
                return (
                  <g key={`section-${et.type}`}>
                    <rect x={0} y={y} width={svgWidth} height={SECTION_H} fill={`${et.color}10`} />
                    <text x={10} y={y + SECTION_H * 0.68} fontSize={11} fontWeight="700" fill={et.color} letterSpacing="0.06em">
                      {et.icon} {et.label.toUpperCase()}
                    </text>
                    <text x={svgWidth - PAD} y={y + SECTION_H * 0.68} textAnchor="end" fontSize={10} fill={`${et.color}88`}>
                      {count}
                    </text>
                  </g>
                )
              }

              if (item.kind === 'group') {
                const { label, color, y } = item
                return (
                  <g key={`group-${label}-${y}`}>
                    <text
                      x={LABEL_W - 10} y={y + GROUP_H * 0.72}
                      textAnchor="end" fontSize={10} fontWeight="600"
                      fill={color} opacity={0.65} letterSpacing="0.04em"
                    >
                      {label}
                    </text>
                    <line
                      x1={LABEL_W} y1={y + GROUP_H * 0.5}
                      x2={svgWidth - PAD} y2={y + GROUP_H * 0.5}
                      stroke={`${color}18`} strokeWidth={1}
                    />
                  </g>
                )
              }

              // Data row
              const { row, color, y } = item
              const isHov = hovered === row.id

              const rx1 = row.startYear != null ? yearToX(Math.max(row.startYear, dMin), svgWidth, dMin, dMax) : null
              const rx2 = row.endYear   != null ? yearToX(Math.min(row.endYear,   dMax), svgWidth, dMin, dMax) : null
              const barX = rx1 ?? rx2 ?? yearToX(dMin, svgWidth, dMin, dMax)
              const barW = rx1 != null && rx2 != null ? Math.max(4, rx2 - rx1) : 6
              const barY = y + 6
              const barH = ROW_H - 12

              return (
                <g
                  key={row.id}
                  className="timeline-row"
                  onMouseEnter={e => { setHovered(row.id); setTooltip({ x: e.clientX, y: e.clientY, row }) }}
                  onMouseMove={e => setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                  onMouseLeave={() => { setHovered(null); setTooltip(null) }}
                  style={{ cursor: 'pointer' }}
                >
                  {isHov && <rect x={0} y={y} width={svgWidth} height={ROW_H} fill={`${color}0a`} />}
                  <text
                    x={LABEL_W - 10} y={y + ROW_H * 0.64}
                    textAnchor="end" fontSize={11}
                    fill={isHov ? '#1a1d2e' : '#485072'}
                    fontWeight={isHov ? '600' : '400'}
                  >
                    {row.name}
                  </text>
                  <rect
                    x={barX} y={barY} width={barW} height={barH}
                    rx={2}
                    fill={isHov ? color : `${color}bb`}
                    stroke={isHov ? color : 'none'}
                    strokeWidth={1}
                  />
                </g>
              )
            })}
          </svg>
        )}
      </div>

      {tooltip && (
        <div className="timeline-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 8 }}>
          <div className="timeline-tooltip__name">{tooltip.row.name}</div>
          {tooltip.row.subtype && <div className="timeline-tooltip__city">{tooltip.row.subtype}</div>}
          {tooltip.row.group && tooltip.row.group !== 'Unaffiliated' && (
            <div className="timeline-tooltip__city">{tooltip.row.group}</div>
          )}
          <div className="timeline-tooltip__dates">
            {tooltip.row.dateLabel || (
              (tooltip.row.startYear != null || tooltip.row.endYear != null)
                ? `${fmtYear(tooltip.row.startYear)} – ${fmtYear(tooltip.row.endYear)}`
                : null
            )}
          </div>
        </div>
      )}
    </div>
  )
}
