'use client'

/* ═══════════════════════════════════════════════════════════════════════════
   Shared primitives for the metrics dashboard.
   Styling lives in app/metrics/metrics.css — these components only carry
   structure, geometry and data-driven values.
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/* ── Formatters ─────────────────────────────────────────────────────────── */

export function money(n: number | null | undefined, opts: { cents?: boolean } = {}) {
  if (n == null || Number.isNaN(n)) return '—'
  const d = opts.cents ? 2 : 0
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function num(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US')
}

export function compact(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
  return n.toLocaleString('en-US')
}

export function pct(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toFixed(digits) + '%'
}

export function shortDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ── Threshold bands ────────────────────────────────────────────────────────
   The operating targets already encoded in the original alerting logic:
   cost per lead is healthy under $220, and cost per signed/qualified case is
   healthy under $1,200. Kept in one place so the table, the KPI rail and the
   attention queue can never disagree with each other.                        */

export type Band = 'good' | 'warn' | 'crit' | null

export function cplBand(v: number | null | undefined): Band {
  if (v == null) return null
  if (v > 300) return 'crit'
  if (v > 220) return 'warn'
  return 'good'
}

export function caseBand(v: number | null | undefined): Band {
  if (v == null) return null
  if (v > 2000) return 'crit'
  if (v > 1200) return 'warn'
  return 'good'
}

export const bandClass = (b: Band, prefix = 'mx-v') => (b ? `${prefix}-${b}` : '')

/* ── Icons — Phosphor-style strokes drawn inline, one 1.6 stroke weight ──── */

type IconProps = { size?: number; className?: string; style?: React.CSSProperties }
const svg = (p: IconProps, size: number, children: React.ReactNode) => (
  <svg width={p.size ?? size} height={p.size ?? size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
    className={p.className} style={p.style} aria-hidden="true">
    {children}
  </svg>
)

export const IconChevron = (p: IconProps) => svg(p, 14, <path d="M9 5l7 7-7 7" />)
export const IconArrow = (p: IconProps) => svg(p, 15, <><path d="M5 12h13" /><path d="M13 6l6 6-6 6" /></>)
export const IconClose = (p: IconProps) => svg(p, 18, <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>)
export const IconRefresh = (p: IconProps) => svg(p, 15, <><path d="M20 11a8 8 0 0 0-14.3-4.9L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 14.3 4.9L21 15" /><path d="M21 20v-5h-5" /></>)
export const IconExit = (p: IconProps) => svg(p, 15, <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" /></>)
export const IconPlus = (p: IconProps) => svg(p, 14, <><path d="M12 6v12" /><path d="M6 12h12" /></>)
export const IconSpark = (p: IconProps) => svg(p, 16, <path d="M12 3l2.1 5.6L20 10l-5.2 2.1L12 18l-2.1-5.9L5 10l5.2-1.4L12 3z" />)
export const IconWarn = (p: IconProps) => svg(p, 14, <><path d="M12 8.5v4" /><path d="M12 16.2h.01" /><path d="M10.3 3.9 2.6 17.1A1.9 1.9 0 0 0 4.3 20h15.4a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0z" /></>)
export const IconEmpty = (p: IconProps) => svg(p, 20, <><path d="M4 7h16" /><path d="M4 12h10" /><path d="M4 17h6" /></>)
export const IconCalendar = (p: IconProps) => svg(p, 14, <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>)

/* ── Status pill ────────────────────────────────────────────────────────── */

export type AlertLevel = 'kill' | 'watch' | 'floor' | 'read_decide' | 'scale' | null

const PILL: Record<string, { cls: string; label: string }> = {
  kill:        { cls: 't-kill',  label: 'Kill' },
  watch:       { cls: 't-watch', label: 'Watch' },
  floor:       { cls: 't-floor', label: 'Warm-up' },
  read_decide: { cls: 't-read',  label: 'Decide' },
  scale:       { cls: 't-scale', label: 'Scale' },
  ok:          { cls: 't-ok',    label: 'On track' },
}

export function StatusPill({ level, showOk = false }: { level: AlertLevel; showOk?: boolean }) {
  const key = level ?? (showOk ? 'ok' : null)
  if (!key) return null
  const c = PILL[key]
  return (
    <span className={`mx-pill ${c.cls}`}>
      <span className="mx-pill-dot" />
      {c.label}
    </span>
  )
}

/* ── Sparkline ──────────────────────────────────────────────────────────────
   A single series, so no legend and no categorical palette — the label above
   it names the measure. Used as supporting texture inside a KPI cell.        */

export function Sparkline({ values, tone = 'accent', height = 26 }: {
  values: number[]
  tone?: 'accent' | 'ink'
  height?: number
}) {
  const pts = values.filter(v => Number.isFinite(v))
  if (pts.length < 2) return null

  const W = 100
  const max = Math.max(...pts, 0)
  const min = Math.min(...pts, 0)
  const span = max - min || 1
  const x = (i: number) => (i / (pts.length - 1)) * W
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4)

  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const area = `${line} L${W},${height} L0,${height} Z`
  const color = tone === 'ink' ? 'var(--mx-ink-2)' : 'var(--mx-accent)'
  const gid = `spark-${tone}`

  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height}
      style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* ── Trend small multiples ──────────────────────────────────────────────────
   Three measures on wildly different scales (dollars, counts, dollars-per-
   count). Never a dual axis: each gets its own panel, and the panels share one
   x-axis and one hover index so they read as a single instrument.            */

export type TrendSeries = {
  key: string
  title: string
  values: (number | null)[]
  format: (v: number | null) => string
  tone: 'accent' | 'ink' | 'good'
  kind: 'area' | 'bar'
}

export function TrendPanels({ dates, series, height }: { dates: string[]; series: TrendSeries[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const n = dates.length

  if (n === 0) {
    return (
      <EmptyState compact
        title="No daily breakdown"
        text="Meta returns day-by-day figures only for multi-day ranges."
      />
    )
  }

  return (
    <div className="mx-trend" onMouseLeave={() => setHover(null)}>
      {series.map(s => (
        <TrendPanel key={s.key} s={s} dates={dates} hover={hover} onHover={setHover} height={height} />
      ))}
    </div>
  )
}

function TrendPanel({ s, dates, hover, onHover, height }: {
  s: TrendSeries
  dates: string[]
  hover: number | null
  onHover: (i: number | null) => void
  height?: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [w, setW] = useState(280)
  const H = height ?? 76

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const cw = entries[0]?.contentRect.width
      if (cw && cw > 0) setW(cw)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const vals = s.values
  const finite = vals.filter((v): v is number => v != null && Number.isFinite(v))
  const max = finite.length ? Math.max(...finite) : 0
  const top = max > 0 ? max * 1.12 : 1
  const n = vals.length

  const xAt = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w)
  const yAt = (v: number) => H - (v / top) * (H - 4)

  const color = s.tone === 'good' ? 'var(--mx-good)' : s.tone === 'ink' ? 'var(--mx-ink-2)' : 'var(--mx-accent)'
  const gid = `trend-${s.key}`

  // Latest non-null reading is the headline for the panel
  let latestIdx = -1
  for (let i = n - 1; i >= 0; i--) if (vals[i] != null) { latestIdx = i; break }
  const shownIdx = hover != null && vals[hover] != null ? hover : latestIdx
  const shown = shownIdx >= 0 ? vals[shownIdx] : null

  const pathPts: string[] = []
  vals.forEach((v, i) => {
    if (v == null) return
    pathPts.push(`${pathPts.length === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`)
  })
  const line = pathPts.join(' ')
  const area = line ? `${line} L${xAt(n - 1).toFixed(2)},${H} L${xAt(0).toFixed(2)},${H} Z` : ''

  const barW = n > 0 ? Math.max(2, Math.min(18, (w / n) - 2)) : 4

  function pick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = (e.clientX - rect.left) / (rect.width || 1)
    onHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))))
  }

  return (
    <div className="mx-trend-panel">
      <div className="mx-trend-head">
        <span className="mx-trend-title">{s.title}</span>
        <span className="mx-trend-read" style={{ color: shown == null ? 'var(--mx-faint)' : color }}>
          {s.format(shown)}
        </span>
      </div>

      <div ref={ref}>
        <svg className="mx-trend-svg" width={w} height={H} style={{ height: H }} viewBox={`0 0 ${w} ${H}`}
          onMouseMove={pick} onMouseLeave={() => onHover(null)}
          role="img"
          aria-label={`${s.title} by day. Latest ${s.format(shown)}.`}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          <line x1="0" y1={H} x2={w} y2={H} stroke="var(--mx-line)" strokeWidth={1} />

          {/* One data point has no line to draw, so mark it */}
          {s.kind === 'area' && pathPts.length === 1 && shownIdx >= 0 && (
            <circle cx={xAt(shownIdx)} cy={yAt(vals[shownIdx] as number)} r={4.5} fill={color} />
          )}

          {s.kind === 'bar'
            ? vals.map((v, i) => {
                if (v == null) return null
                const h = Math.max(1.5, H - yAt(v))
                return (
                  <rect key={i} x={xAt(i) - barW / 2} y={H - h} width={barW} height={h} rx={2.5}
                    fill={color} fillOpacity={hover == null || hover === i ? 0.85 : 0.3} />
                )
              })
            : (
              <>
                {area && <path d={area} fill={`url(#${gid})`} />}
                {line && <path d={line} fill="none" stroke={color} strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round" />}
              </>
            )}

          {hover != null && vals[hover] != null && (
            <>
              <line x1={xAt(hover)} y1={0} x2={xAt(hover)} y2={H}
                stroke="var(--mx-ink)" strokeWidth={1} strokeDasharray="3 3" opacity={0.35} />
              <circle cx={xAt(hover)} cy={yAt(vals[hover] as number)} r={4}
                fill={color} stroke="var(--mx-surface)" strokeWidth={2} />
            </>
          )}
        </svg>
      </div>

      <div className="mx-trend-axis">
        <span>{shortDate(dates[0])}</span>
        <span style={{ color: hover != null ? 'var(--mx-ink)' : undefined, fontWeight: hover != null ? 600 : 400 }}>
          {hover != null ? shortDate(dates[hover]) : ''}
        </span>
        <span>{shortDate(dates[dates.length - 1])}</span>
      </div>
    </div>
  )
}

/* ── Pipeline distribution ──────────────────────────────────────────────────
   Every contact sits in exactly one stage, so this is a distribution and not a
   drop-off funnel — drawing it as a tapering funnel would imply progression
   that the data does not describe. Bars share one scale set by the largest
   stage; outcome class is carried by color AND by the grouping label.        */

export type StageRow = {
  key: string
  label: string
  count: number
  klass: 'open' | 'won' | 'lost'
}

export function PipelineBars({ rows, onPick }: {
  rows: StageRow[]
  onPick?: (key: string) => void
}) {
  const max = Math.max(1, ...rows.map(r => r.count))
  const total = rows.reduce((s, r) => s + r.count, 0)

  if (total === 0) {
    return (
      <EmptyState compact
        title="Nothing in the pipeline"
        text="No CRM contacts are attributed to ads in this range yet."
      />
    )
  }

  return (
    <div className="mx-funnel">
      {rows.map(r => {
        const w = (r.count / max) * 100
        const share = total > 0 ? (r.count / total) * 100 : 0
        const cls = r.klass === 'won' ? 'done' : r.klass === 'lost' ? 'leak' : ''
        const clickable = !!onPick && r.count > 0
        return (
          <button
            key={r.key}
            className="mx-funnel-row"
            disabled={!clickable}
            onClick={() => clickable && onPick!(r.key)}
            title={clickable ? `Show the ${r.count} contacts in ${r.label}` : undefined}
          >
            <span className="mx-funnel-stage">{r.label}</span>
            <span className="mx-funnel-track">
              {r.count > 0 && (
                <span className={`mx-funnel-bar ${cls}`} style={{ width: `${Math.max(w, 1.5)}%` }} />
              )}
            </span>
            <span className="mx-funnel-meta">
              {r.count.toLocaleString()}
              <span>{share >= 0.5 ? `${share.toFixed(0)}%` : ''}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Overlay shell — closes on Escape and on backdrop click, restores focus ─ */

export function Overlay({ children, onClose, variant = 'sheet', labelledBy }: {
  children: React.ReactNode
  onClose: () => void
  variant?: 'sheet' | 'dialog'
  labelledBy?: string
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    boxRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      restore?.focus?.()
    }
  }, [onClose])

  const onBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  return (
    <div className="mx-overlay" onMouseDown={onBackdrop}>
      <div
        ref={boxRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={variant === 'sheet' ? 'mx-sheet' : 'mx-dialog'}
        style={{ outline: 'none' }}
      >
        {children}
      </div>
    </div>
  )
}

/* ── Empty state ────────────────────────────────────────────────────────── */

export function EmptyState({ title, text, action, compact: isCompact }: {
  title: string; text: string; action?: React.ReactNode; compact?: boolean
}) {
  return (
    <div className={`mx-empty${isCompact ? ' compact' : ''}`}>
      <div className="mx-empty-icon"><IconEmpty /></div>
      <div>
        <p className="mx-empty-title">{title}</p>
        <p className="mx-empty-text">{text}</p>
      </div>
      {action && <div style={{ marginTop: isCompact ? 0 : 10, marginLeft: isCompact ? 'auto' : undefined }}>{action}</div>}
    </div>
  )
}

/* ── Skeletons — shaped like the content they stand in for ──────────────── */

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Loading dashboard
      </span>
      <div className="mx-skel" style={{ height: 40, width: "min(280px, 70%)", marginBottom: 10 }} />
      <div className="mx-skel" style={{ height: 15, width: "min(420px, 92%)", marginBottom: 26 }} />
      <div className="mx-hero" style={{ boxShadow: 'none' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="mx-hero-cell" key={i}>
            <div className="mx-skel" style={{ height: 9, width: '52%' }} />
            <div className="mx-skel" style={{ height: 28, width: '72%' }} />
            <div className="mx-skel" style={{ height: 10, width: '44%' }} />
          </div>
        ))}
      </div>
      <div className="mx-strip">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="mx-strip-cell" key={i}>
            <div className="mx-skel" style={{ height: 8, width: '58%', marginBottom: 7 }} />
            <div className="mx-skel" style={{ height: 15, width: '44%' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 14, marginTop: 34 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div className="mx-card" key={i} style={{ padding: 16 }}>
            <div className="mx-skel" style={{ height: 13, width: "min(220px, 60%)", marginBottom: 16 }} />
            {Array.from({ length: 4 }).map((__, j) => (
              <div className="mx-skel" key={j} style={{ height: 11, width: `${94 - j * 12}%`, marginBottom: 11 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Additional icons ───────────────────────────────────────────────────── */

export const IconPencil = (p: IconProps) => svg(p, 13, <><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M13.5 6.5l4 4" /></>)
export const IconTrash = (p: IconProps) => svg(p, 14, <><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M10 11v6" /><path d="M14 11v6" /></>)
export const IconLink = (p: IconProps) => svg(p, 14, <><path d="M10.6 13.4a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1.7 1.7" /><path d="M13.4 10.6a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1.7-1.7" /></>)
export const IconCopy = (p: IconProps) => svg(p, 13, <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>)
export const IconCheck = (p: IconProps) => svg(p, 13, <path d="M4.5 12.5l5 5 10-11" />)
export const IconRoute = (p: IconProps) => svg(p, 14, <><path d="M6 20V8" /><path d="M2.5 11.5L6 8l3.5 3.5" /><path d="M18 4v12" /><path d="M21.5 12.5L18 16l-3.5-3.5" /></>)
export const IconCaret = (p: IconProps) => svg(p, 14, <path d="M6 9l6 6 6-6" />)
export const IconSearch = (p: IconProps) => svg(p, 14, <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>)
export const IconInfo = (p: IconProps) => svg(p, 14, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.8h.01" /></>)
export const IconBack = (p: IconProps) => svg(p, 14, <><path d="M19 12H6" /><path d="M11 6l-6 6 6 6" /></>)

/* ── Target vs actual ───────────────────────────────────────────────────────
   Progress toward a modelled target. `higherBetter` flips which side of the
   target counts as good, so cost metrics and volume metrics can sit in the
   same row without either being scored backwards.                            */

export function TargetMeter({ label, actual, target, format, higherBetter, status }: {
  label: string
  actual: number | null | undefined
  target: number | null | undefined
  format: (v: number) => string
  higherBetter: boolean
  status?: string | null
}) {
  const has = actual != null && Number.isFinite(actual)
  const ratio = has && target ? actual! / target : null

  // Fill shows attainment: for a cost metric, being under target is full.
  const fillPct = ratio == null ? 0
    : higherBetter ? Math.min(100, ratio * 100)
    : Math.min(100, (1 / Math.max(ratio, 0.0001)) * 100)

  const tone = !has ? 'none'
    : status === 'on_track' ? 'ok'
    : status === 'far_behind' ? 'bad'
    : status ? 'mid'
    : fillPct >= 95 ? 'ok' : fillPct >= 70 ? 'mid' : 'bad'

  const valColor = tone === 'ok' ? 'var(--mx-good)' : tone === 'bad' ? 'var(--mx-crit)'
    : tone === 'mid' ? 'var(--mx-warn)' : 'var(--mx-faint)'

  // Delta is expressed in the direction that is good for this metric
  const delta = ratio == null ? null : higherBetter ? (ratio - 1) * 100 : (1 - ratio) * 100

  return (
    <div className="mx-target">
      <div className="mx-target-label">{label}</div>
      <div className="mx-target-val" style={{ color: valColor }}>{has ? format(actual!) : '—'}</div>
      <div className="mx-target-track">
        <div className={`mx-target-fill ${tone}`} style={{ width: `${Math.max(fillPct, has ? 2 : 0)}%` }} />
      </div>
      <div className="mx-target-foot">
        <span>Target {target != null ? format(target) : '—'}</span>
        {delta != null && (
          <span className="mx-target-delta" style={{ color: delta >= 0 ? 'var(--mx-good)' : 'var(--mx-crit)' }}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Leaderboard ────────────────────────────────────────────────────────── */

export function Leaderboard({ rows, unit }: {
  rows: { name: string; value: number; sub?: string }[]
  unit: string
}) {
  if (rows.length === 0) return null
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="mx-board">
      {rows.map((r, i) => (
        <div className="mx-board-row" key={r.name}>
          <span className="mx-board-rank">{i + 1}</span>
          <span className="mx-board-name" title={r.name}>
            {r.name}
            {r.sub && <span style={{ color: 'var(--mx-muted)', fontWeight: 400, marginLeft: 7, fontSize: 11.5 }}>{r.sub}</span>}
          </span>
          <span className="mx-board-track">
            <span className="mx-board-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="mx-board-val">{r.value}<span style={{ color: 'var(--mx-faint)', fontWeight: 500, fontSize: 10, marginLeft: 3 }}>{unit}</span></span>
        </div>
      ))}
    </div>
  )
}

/* ── Cost composition ───────────────────────────────────────────────────────
   Parts of one whole, so a single stacked bar rather than a pie. Segments get
   a 2px surface gap and every segment is direct-labeled in the key below —
   color never carries the identity alone.                                    */

export const COST_TONES = [
  'var(--mx-accent)',
  'var(--mx-ink-2)',
  'var(--mx-warn)',
  'var(--mx-muted)',
  'var(--mx-accent-ink)',
  'var(--mx-faint)',
]

export function CostBar({ parts, format }: {
  parts: { label: string; value: number }[]
  format: (v: number) => string
}) {
  const shown = parts.filter(p => p.value > 0)
  const total = shown.reduce((s, p) => s + p.value, 0)
  if (total <= 0) {
    return <p style={{ fontSize: 12.5, color: 'var(--mx-muted)' }}>No costs recorded for this window.</p>
  }
  return (
    <div>
      <div className="mx-comp">
        {shown.map((p, i) => (
          <div key={p.label} className="mx-comp-seg"
            style={{ width: `${(p.value / total) * 100}%`, background: COST_TONES[i % COST_TONES.length] }}
            title={`${p.label} — ${format(p.value)} (${((p.value / total) * 100).toFixed(0)}%)`} />
        ))}
      </div>
      <div className="mx-comp-key">
        {shown.map((p, i) => (
          <span className="mx-comp-key-item" key={p.label}>
            <span className="mx-comp-swatch" style={{ background: COST_TONES[i % COST_TONES.length] }} />
            {p.label} <b>{format(p.value)}</b>
            <span style={{ color: 'var(--mx-faint)' }}>{((p.value / total) * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Inline editable text ───────────────────────────────────────────────── */

export function InlineEdit({ value, placeholder, onSave, disabled, width, variant }: {
  value: string
  placeholder: string
  onSave: (v: string) => void | Promise<void>
  disabled?: boolean
  width?: number
  variant?: 'title'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  async function commit() {
    if (draft === value) { setEditing(false); return }
    setBusy(true)
    try { await onSave(draft) } finally { setBusy(false); setEditing(false) }
  }

  if (editing) {
    return (
      <span className={`mx-inline-edit${variant ? ` ${variant}` : ''}`}>
        <input
          autoFocus
          value={draft}
          style={width ? { width } : undefined}
          disabled={busy}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          }}
        />
      </span>
    )
  }

  return (
    <button className={`mx-inline${value ? '' : ' empty'}${variant ? ` ${variant}` : ''}`} disabled={disabled}
      onClick={() => !disabled && setEditing(true)}
      title={disabled ? undefined : 'Click to edit'}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || placeholder}</span>
      {!disabled && <IconPencil className="pencil" />}
    </button>
  )
}

/* ── Two-step destructive confirm ───────────────────────────────────────── */

export function ConfirmAction({ armed, label, onArm, onConfirm, onCancel, children, title, bordered }: {
  armed: boolean
  label: string
  onArm: () => void
  onConfirm: () => void
  onCancel: () => void
  children: React.ReactNode
  title?: string
  /** Set when the child is a text label rather than an icon. */
  bordered?: boolean
}) {
  if (armed) {
    return (
      <span className="mx-confirm">
        <span>{label}?</span>
        <button className="yes" onClick={onConfirm}>Yes</button>
        <button className="no" onClick={onCancel}>No</button>
      </span>
    )
  }
  return (
    <button className={`mx-rowact danger${bordered ? ' bordered' : ''}`} onClick={onArm} title={title ?? label}>
      {children}
    </button>
  )
}

/* ── Banner ─────────────────────────────────────────────────────────────── */

export function Banner({ tone = 'info', title, children }: {
  tone?: 'info' | 'warn' | 'crit'
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className={`mx-banner${tone === 'info' ? '' : ` ${tone}`}`}>
      {tone !== 'info' && <IconWarn size={15} />}
      {tone === 'info' && <IconInfo size={15} />}
      <div style={{ minWidth: 0 }}>
        {title && <b>{title}</b>}
        {children}
      </div>
    </div>
  )
}
