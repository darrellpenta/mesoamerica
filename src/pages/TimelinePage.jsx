import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

const CITY_COLORS = {
  'Palenque':       '#5b8ff9',
  'Copán':          '#61d4a4',
  'Calakmul':       '#f6bd16',
  'Piedras Negras': '#e86452',
  'Yaxchilan':      '#c05bff',
  'Tenochtitlan':   '#ff9d4d',
}
const DEFAULT_COLOR = '#8890b0'

const YEAR_MIN = -800
const YEAR_MAX = 1600
const RANGE    = YEAR_MAX - YEAR_MIN

const ROW_H    = 28
const LABEL_W  = 180
const AXIS_H   = 40
const PADDING  = 16

function yearToX(year, width) {
  return LABEL_W + ((year - YEAR_MIN) / RANGE) * (width - LABEL_W - PADDING)
}

function formatYear(y) {
  if (y == null) return '?'
  return y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`
}

function AxisTicks({ width }) {
  const ticks = []
  for (let y = -800; y <= 1600; y += 200) {
    const x = yearToX(y, width)
    ticks.push({ x, label: y === 0 ? '0' : (y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`) })
  }
  return (
    <g>
      <line x1={LABEL_W} y1={AXIS_H - 10} x2={width - PADDING} y2={AXIS_H - 10} stroke="#3a3e58" strokeWidth={1} />
      {ticks.map(t => (
        <g key={t.label}>
          <line x1={t.x} y1={AXIS_H - 14} x2={t.x} y2={AXIS_H - 6} stroke="#3a3e58" strokeWidth={1} />
          <text x={t.x} y={AXIS_H - 18} textAnchor="middle" fontSize={10} fill="#606888">{t.label}</text>
        </g>
      ))}
      {/* CE/BCE boundary */}
      <line x1={yearToX(0, width)} y1={AXIS_H - 10} x2={yearToX(0, width)} y2={999} stroke="#4a4e6a" strokeWidth={1} strokeDasharray="4 4" />
    </g>
  )
}

export default function TimelinePage() {
  const [rows, setRows]       = useState([])
  const [filter, setFilter]   = useState('all')
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const containerRef          = useRef(null)
  const [svgWidth, setSvgWidth] = useState(1000)

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      setSvgWidth(entries[0].contentRect.width || 1000)
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    async function load() {
      if (!supabase) { setLoading(false); return }
      setLoading(true)

      // 1. Persons + their entity names
      const { data: personRows } = await supabase
        .from('entities')
        .select('id, name, persons(birth_year, death_year, floruit_start, floruit_end, date_label, person_type)')
        .eq('entity_type', 'person')

      // 2. RULED relationships to get city grouping and reign dates
      const { data: ruled } = await supabase
        .from('relationships')
        .select('from_entity_id, valid_from, valid_to, to_entity:to_entity_id(name)')
        .eq('relation_type', 'RULED')

      const ruledByPerson = {}
      for (const r of (ruled ?? [])) {
        if (!ruledByPerson[r.from_entity_id]) ruledByPerson[r.from_entity_id] = []
        ruledByPerson[r.from_entity_id].push(r)
      }

      const built = (personRows ?? []).map(e => {
        const p = e.persons?.[0] ?? {}
        const rels = ruledByPerson[e.id] ?? []
        const city = rels[0]?.to_entity?.name ?? 'Unknown'

        let startYear = p.birth_year ?? p.floruit_start
        let endYear   = p.death_year ?? p.floruit_end

        if (startYear == null && rels.length) {
          startYear = Math.min(...rels.filter(r => r.valid_from != null).map(r => r.valid_from))
          if (!isFinite(startYear)) startYear = null
        }
        if (endYear == null && rels.length) {
          endYear = Math.max(...rels.filter(r => r.valid_to != null).map(r => r.valid_to))
          if (!isFinite(endYear)) endYear = null
        }

        return { id: e.id, name: e.name, city, startYear, endYear, dateLabel: p.date_label, personType: p.person_type }
      }).filter(r => r.startYear != null || r.endYear != null)

      // Sort: group by city, then by startYear
      built.sort((a, b) => {
        const ca = a.city.localeCompare(b.city)
        if (ca !== 0) return ca
        return (a.startYear ?? 0) - (b.startYear ?? 0)
      })

      setRows(built)
      setLoading(false)
    }
    load()
  }, [])

  const cities = [...new Set(rows.map(r => r.city))].sort()
  const filtered = filter === 'all' ? rows : rows.filter(r => r.city === filter)

  let currentCity = null
  const renderRows = []
  for (const r of filtered) {
    if (r.city !== currentCity) {
      currentCity = r.city
      renderRows.push({ type: 'group', city: r.city })
    }
    renderRows.push({ type: 'row', data: r })
  }

  const svgHeight = AXIS_H + renderRows.length * ROW_H + 20

  return (
    <div className="timeline-page">
      <div className="timeline-toolbar">
        <span className="timeline-toolbar__label">Filter by city:</span>
        <button
          className={`timeline-filter-btn${filter === 'all' ? ' timeline-filter-btn--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({rows.length})
        </button>
        {cities.map(c => (
          <button
            key={c}
            className={`timeline-filter-btn${filter === c ? ' timeline-filter-btn--active' : ''}`}
            style={{ '--city-color': CITY_COLORS[c] ?? DEFAULT_COLOR }}
            onClick={() => setFilter(c)}
          >
            {c} ({rows.filter(r => r.city === c).length})
          </button>
        ))}
      </div>

      <div className="timeline-scroll" ref={containerRef}>
        {loading ? (
          <div className="timeline-loading">Loading…</div>
        ) : (
          <svg width="100%" height={svgHeight} className="timeline-svg">
            <AxisTicks width={svgWidth} />

            {renderRows.map((item, i) => {
              const y = AXIS_H + i * ROW_H

              if (item.type === 'group') {
                const color = CITY_COLORS[item.city] ?? DEFAULT_COLOR
                return (
                  <g key={`g-${item.city}`}>
                    <rect x={0} y={y} width={svgWidth} height={ROW_H} fill={`${color}18`} />
                    <text x={8} y={y + ROW_H * 0.65} fontSize={11} fontWeight="700" fill={color} letterSpacing="0.05em" textTransform="uppercase">
                      {item.city.toUpperCase()}
                    </text>
                  </g>
                )
              }

              const { data: r } = item
              const color = CITY_COLORS[r.city] ?? DEFAULT_COLOR
              const isHov = hovered === r.id

              const x1 = r.startYear != null ? yearToX(r.startYear, svgWidth) : null
              const x2 = r.endYear   != null ? yearToX(r.endYear,   svgWidth) : null
              const barX = x1 ?? x2 ?? yearToX(0, svgWidth)
              const barW = (x1 != null && x2 != null) ? Math.max(4, x2 - x1) : 8
              const barY = y + 6
              const barH = ROW_H - 12

              return (
                <g
                  key={r.id}
                  className="timeline-row"
                  onMouseEnter={e => { setHovered(r.id); setTooltip({ x: e.clientX, y: e.clientY, r }) }}
                  onMouseMove={e => setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                  onMouseLeave={() => { setHovered(null); setTooltip(null) }}
                  style={{ cursor: 'pointer' }}
                >
                  {/* name label */}
                  <text
                    x={LABEL_W - 6}
                    y={y + ROW_H * 0.65}
                    textAnchor="end"
                    fontSize={11}
                    fill={isHov ? '#e8e8e8' : '#a0a8c8'}
                  >
                    {r.name}
                  </text>

                  {/* bar */}
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
        <div
          className="timeline-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <div className="timeline-tooltip__name">{tooltip.r.name}</div>
          <div className="timeline-tooltip__city">{tooltip.r.city}</div>
          {tooltip.r.dateLabel && (
            <div className="timeline-tooltip__dates">{tooltip.r.dateLabel}</div>
          )}
          {!tooltip.r.dateLabel && (tooltip.r.startYear != null || tooltip.r.endYear != null) && (
            <div className="timeline-tooltip__dates">
              {formatYear(tooltip.r.startYear)} – {formatYear(tooltip.r.endYear)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
