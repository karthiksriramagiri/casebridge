'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { invoiceCodeFromRouteSegment } from '@/app/metrics/firms/_lib/invoice-routes'
import { fmt$ } from '@/app/metrics/firms/_components/firm-metrics-shared'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TIMEFRAMES = [
  { key: 'invoice',  label: 'Invoice' },
  { key: 'today',    label: 'Today' },
  { key: 'yesterday',label: 'Yesterday' },
  { key: 'last_7d',  label: '7d' },
  { key: 'last_14d', label: '14d' },
  { key: 'last_30d', label: '30d' },
  { key: 'maximum',  label: 'All Time' },
] as const
type TF = typeof TIMEFRAMES[number]['key']

const METRIC_CFG: Record<string, {
  label: string
  fmt: (v: number) => string
  color: string
  killAbove?: number
  killBelow?: number
  warnAbove?: number
  warnBelow?: number
}> = {
  spend:         { label: 'Spend',       fmt: fmt$,                      color: '#3b82f6' },
  cpl:           { label: 'CPL',         fmt: fmt$,                      color: '#f97316', killAbove: 250, warnAbove: 200 },
  cpc:           { label: 'CPC',         fmt: fmt$,                      color: '#8b5cf6' },
  ctr:           { label: 'CTR',         fmt: v => v.toFixed(2) + '%',   color: '#06b6d4', warnAbove: 10 },
  clickToLeadPct:{ label: 'Click→Lead',  fmt: v => v.toFixed(2) + '%',   color: '#10b981', killBelow: 0.5 },
  lpvToLeadPct:  { label: 'LPV→Lead',   fmt: v => v.toFixed(2) + '%',   color: '#a78bfa' },
  cpa:           { label: 'CPA',         fmt: fmt$,                      color: '#22c55e', killAbove: 2000, warnAbove: 1200 },
  cpq:           { label: 'CPQ',         fmt: fmt$,                      color: '#14b8a6' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function convPct(signed: number, leads: number) {
  if (!leads) return '—'
  return (signed / leads * 100).toFixed(1) + '%'
}

// Phase 1/2/3 kill decision logic
// Phase 1 (< $600): floor — protect new angles; only kill if CPL already > $300
// Phase 2 ($600+, 5-10 leads): read & decide; kill if CPL > $300 AND CPA > $1200 AND 0 signed
// Phase 3 (8+ leads, 2+ signed, healthy CPL/CPA): scale to CBO
function alertLevel(ad: any): 'kill' | 'watch' | 'floor' | 'read_decide' | 'scale' | null {
  const spend = ad.spend ?? 0
  const leads = ad.metaLeads ?? 0
  const cpl   = ad.cpl   ?? null
  const cpa   = ad.cpa   ?? null
  const signed = ad.signedCases ?? 0

  // Phase 1 — floor protection: < $600 spent
  if (spend < 600) {
    // Exception: CPL already > $300 even before floor — kill
    if (cpl != null && cpl > 300) return 'kill'
    return 'floor'
  }

  // Phase 1 kill — $600 spent with zero leads
  if (leads === 0) return 'kill'

  // Phase 3 — scale: 8+ leads, 2+ signed, healthy metrics
  if (leads >= 8 && signed >= 2 && (cpl == null || cpl <= 300) && (cpa == null || cpa <= 1200)) {
    return 'scale'
  }

  // Phase 2 — hard kill: CPL > $300 AND CPA > $1200 AND no signed cases
  if (cpl != null && cpl > 300 && cpa != null && cpa > 1200 && signed === 0) return 'kill'

  // Phase 2 — watch: CPL > $300 but CPA still ok (keep until CPA goes up)
  if (cpl != null && cpl > 300) return 'watch'

  // Phase 2 — read & decide: 5+ leads, CPL $220-$300
  if (leads >= 5 && cpl != null && cpl > 220) return 'read_decide'

  // Watch: CPA > $1200
  if (cpa != null && cpa > 1200) return 'watch'

  // Watch: CPL $220-$300
  if (cpl != null && cpl > 220) return 'watch'

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Line Chart
// ─────────────────────────────────────────────────────────────────────────────
interface TrendPoint {
  label: string
  spend: number | null
  leads: number | null
  impressions: number
  cpl: number | null
  cpc: number | null
  ctr: number | null
  clickToLeadPct: number | null
  lpvToLeadPct: number | null
}

function SVGLineChart({ data, metric }: { data: TrendPoint[]; metric: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const cfg = METRIC_CFG[metric]

  const W = 560, H = 180
  const PAD = { top: 20, right: 16, bottom: 36, left: 52 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const values = data.map(d => (d as any)[metric] as number | null)
  const nonNull = values.filter((v): v is number => v != null)
  if (nonNull.length === 0) {
    return <p className="text-gray-600 text-xs text-center py-10">No data for this metric in the selected period.</p>
  }

  const maxV = Math.max(...nonNull) * 1.15 || 1
  const xPos = (i: number) => data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2
  const yPos = (v: number) => chartH - (v / maxV) * chartH

  // Treat null as 0 so the line stays continuous
  const continuousValues = values.map(v => v ?? 0)

  let pathD = ''
  continuousValues.forEach((v, i) => {
    const x = xPos(i), y = yPos(v)
    pathD += i === 0 ? `M ${x} ${y} ` : `L ${x} ${y} `
  })

  // Area fill under line
  let areaD = ''
  if (continuousValues.length > 0) {
    areaD = `M ${xPos(0)} ${chartH} L ${xPos(0)} ${yPos(continuousValues[0])} `
    continuousValues.forEach((v, i) => { if (i > 0) areaD += `L ${xPos(i)} ${yPos(v)} ` })
    areaD += `L ${xPos(continuousValues.length - 1)} ${chartH} Z`
  }

  // Y ticks (4 lines)
  const yTicks = [0, 0.33, 0.67, 1].map(t => ({ v: maxV * t, y: chartH - t * chartH }))

  // X labels: max 8, space evenly
  const step = Math.max(1, Math.ceil(data.length / 8))
  const xLabels = data.reduce<Array<{ label: string; i: number }>>((acc, d, i) => {
    if (i % step === 0 || i === data.length - 1) acc.push({ label: d.label, i })
    return acc
  }, [])

  const hoverV = hoverIdx != null ? continuousValues[hoverIdx] : null
  const hoverX = hoverIdx != null ? xPos(hoverIdx) : 0
  const hoverY = hoverV != null ? yPos(hoverV) : null

  // Threshold reference lines
  const killAboveY = cfg.killAbove != null && cfg.killAbove <= maxV ? yPos(cfg.killAbove) : null
  const killBelowY = cfg.killBelow != null ? yPos(cfg.killBelow) : null
  const warnAboveY = cfg.warnAbove != null && cfg.warnAbove <= maxV ? yPos(cfg.warnAbove) : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ overflow: 'visible' }}
      onMouseLeave={() => setHoverIdx(null)}>
      <defs>
        <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={cfg.color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {/* Grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={0} y1={t.y} x2={chartW} y2={t.y} stroke="#1f2937" strokeWidth={1} />
            <text x={-8} y={t.y + 4} textAnchor="end" fontSize={9} fill="#4b5563">
              {t.v === 0 ? '0' : cfg.fmt(t.v)}
            </text>
          </g>
        ))}
        {/* X axis */}
        <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#1f2937" strokeWidth={1} />
        {/* X labels */}
        {xLabels.map(({ label, i }) => (
          <text key={i} x={xPos(i)} y={chartH + 14} textAnchor="middle" fontSize={9} fill="#4b5563">{label}</text>
        ))}
        {/* Threshold lines */}
        {killAboveY != null && <line x1={0} y1={killAboveY} x2={chartW} y2={killAboveY} stroke="#ef4444" strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />}
        {killBelowY != null && <line x1={0} y1={killBelowY} x2={chartW} y2={killBelowY} stroke="#ef4444" strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />}
        {warnAboveY != null && <line x1={0} y1={warnAboveY} x2={chartW} y2={warnAboveY} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />}
        {/* Area */}
        <path d={areaD} fill={`url(#grad-${metric})`} />
        {/* Line */}
        <path d={pathD} fill="none" stroke={cfg.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots */}
        {continuousValues.map((v, i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(v)} r={hoverIdx === i ? 4.5 : 2.5}
            fill={cfg.color} stroke={hoverIdx === i ? '#111827' : 'none'} strokeWidth={1.5} />
        ))}
        {/* Hover zones */}
        {data.map((_, i) => {
          const zoneW = chartW / Math.max(data.length, 1)
          return (
            <rect key={i} x={xPos(i) - zoneW / 2} y={0} width={zoneW} height={chartH}
              fill="transparent" className="cursor-crosshair"
              onMouseEnter={() => setHoverIdx(i)} />
          )
        })}
        {/* Hover crosshair + tooltip */}
        {hoverIdx != null && hoverV != null && hoverY != null && (
          <g>
            <line x1={hoverX} y1={0} x2={hoverX} y2={chartH} stroke="#374151" strokeWidth={1} />
            <rect x={hoverX - 40} y={hoverY - 30} width={80} height={24} rx={5}
              fill="#111827" stroke="#374151" strokeWidth={1} />
            <text x={hoverX} y={hoverY - 14} textAnchor="middle" fontSize={11} fill="#f3f4f6" fontWeight="600">
              {cfg.fmt(hoverV)}
            </text>
            <text x={hoverX} y={hoverY - 36} textAnchor="middle" fontSize={9} fill="#6b7280">
              {data[hoverIdx].label}
            </text>
          </g>
        )}
      </g>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend Modal
// ─────────────────────────────────────────────────────────────────────────────
function CreativeTrendModal({ ad, initialMetric, timeframe, invoiceCode, slug, onClose }: {
  ad: any; initialMetric: string; timeframe: TF; invoiceCode: string; slug: string; onClose: () => void
}) {
  const [metric, setMetric] = useState(initialMetric)
  const [trendData, setTrendData] = useState<TrendPoint[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [adName, setAdName] = useState<string>(ad.adName || ad.adId)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ firm: slug, ad_id: ad.adId, timeframe })
    if (timeframe === 'invoice') qs.set('invoice', invoiceCode)
    fetch(`/api/metrics/creative-trend?${qs}`)
      .then(r => r.json())
      .then(d => {
        setTrendData(d.data || [])
        if (d.adName) setAdName(d.adName)
        setLoading(false)
      })
      .catch(() => { setTrendData([]); setLoading(false) })
  }, [ad.adId, timeframe, invoiceCode, slug])

  // Summary stats (avg of non-null values per metric)
  const summaryStats = trendData ? Object.entries(METRIC_CFG).map(([key, cfg]) => {
    const vals = trendData.map(d => (d as any)[key] as number | null).filter((v): v is number => v != null)
    if (vals.length === 0) return null
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    const last = vals[vals.length - 1]
    return { key, cfg, avg, last }
  }).filter(Boolean) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-gray-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-1">Creative Trend · {TIMEFRAMES.find(t => t.key === timeframe)?.label}</p>
            <p className="text-sm font-semibold text-white leading-snug line-clamp-2" title={adName}>{adName}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Metric tabs */}
        <div className="px-5 py-3 border-b border-gray-800 flex gap-1.5 flex-wrap shrink-0">
          {Object.entries(METRIC_CFG).map(([key, cfg]) => (
            <button key={key} onClick={() => setMetric(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${metric === key ? 'text-white' : 'text-gray-500 hover:text-gray-300 bg-gray-800'}`}
              style={metric === key ? { backgroundColor: cfg.color + '33', color: cfg.color, border: `1px solid ${cfg.color}44` } : {}}>
              {cfg.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-10">Loading trend data...</p>
          ) : !trendData || trendData.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-10">No trend data available for this period.</p>
          ) : (
            <SVGLineChart data={trendData} metric={metric} />
          )}

          {/* Summary row */}
          {summaryStats.length > 0 && !loading && (
            <div className="mt-5 pt-4 border-t border-gray-800 grid grid-cols-3 sm:grid-cols-5 gap-3">
              {summaryStats.map(s => s && (
                <div key={s.key}
                  onClick={() => setMetric(s.key)} role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setMetric(s.key)}
                  className={`rounded-lg p-3 cursor-pointer transition ${metric === s.key ? 'ring-1' : 'bg-gray-800 hover:bg-gray-700/80'}`}
                  style={metric === s.key ? { backgroundColor: s.cfg.color + '22', ringColor: s.cfg.color + '66' } as React.CSSProperties : undefined}>
                  <p className="text-[10px] text-gray-400 mb-1">{s.cfg.label}</p>
                  <p className="text-sm font-semibold" style={{ color: s.cfg.color }}>{s.cfg.fmt(s.avg)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">avg · last {s.cfg.fmt(s.last)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricBar (clickable)
// ─────────────────────────────────────────────────────────────────────────────
function MetricBar({ label, value, max, killBelow, killAbove, warnBelow, warnAbove, fmt, color, onClick }: {
  label: string; value: number | null; max: number
  killBelow?: number; killAbove?: number; warnBelow?: number; warnAbove?: number
  fmt: (v: number) => string; color?: string; onClick?: () => void
}) {
  if (value == null || max === 0) {
    return (
      <div className={`flex items-center gap-2 ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
        <p className="text-[10px] text-gray-500 w-16 shrink-0">{label}</p>
        <span className="text-gray-700 text-xs">—</span>
      </div>
    )
  }
  const pctFill = Math.min(100, (value / max) * 100)
  const isKill = (killBelow != null && value < killBelow) || (killAbove != null && value > killAbove)
  const isWarn = !isKill && ((warnBelow != null && value < warnBelow) || (warnAbove != null && value > warnAbove))
  const barStyle = isKill ? undefined : isWarn ? undefined : (color ? { backgroundColor: color } : undefined)
  const barClass = isKill ? 'bg-red-500' : isWarn ? 'bg-yellow-500' : (color ? '' : 'bg-blue-500')
  const textStyle = isKill ? undefined : isWarn ? undefined : (color ? { color } : undefined)
  const textClass = isKill ? 'text-red-400' : isWarn ? 'text-yellow-400' : (color ? '' : 'text-gray-300')

  return (
    <div className={`flex items-center gap-2 rounded px-1 -mx-1 py-0.5 transition ${onClick ? 'cursor-pointer hover:bg-gray-800/60 group' : ''}`}
      onClick={onClick}>
      <p className="text-[10px] text-gray-500 w-16 shrink-0 group-hover:text-gray-400 transition">{label}</p>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barClass} transition-all`} style={{ width: `${pctFill}%`, ...barStyle }} />
      </div>
      <span className={`text-xs w-14 text-right tabular-nums ${textClass}`} style={textStyle}>{fmt(value)}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Creative chart card
// ─────────────────────────────────────────────────────────────────────────────
function AlertBadge({ level }: { level: ReturnType<typeof alertLevel> }) {
  if (!level) return null
  const cfg = {
    kill:        { cls: 'bg-red-900/40 text-red-400 border-red-700/40',         label: 'KILL' },
    watch:       { cls: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40', label: 'WATCH' },
    floor:       { cls: 'bg-gray-800 text-gray-400 border-gray-700',             label: 'FLOOR' },
    read_decide: { cls: 'bg-orange-900/40 text-orange-400 border-orange-700/40', label: 'READ & DECIDE' },
    scale:       { cls: 'bg-green-900/40 text-green-400 border-green-700/40',    label: 'SCALE ↑' },
  }[level]
  return (
    <span className={`text-[10px] border px-1.5 py-0.5 rounded font-semibold ${cfg.cls}`}>{cfg.label}</span>
  )
}

function PipelineBreakdown({ ad, onClickStage }: {
  ad: any; onClickStage: (stage: string) => void
}) {
  const items = ([
    { label: 'New',      stage: 'new_lead',      count: (ad.newLeadCount      ?? 0) as number, color: 'text-sky-400' },
    { label: 'NR',       stage: 'nr',            count: (ad.nrCount           ?? 0) as number, color: 'text-gray-400' },
    { label: 'F/U',      stage: 'fu',            count: (ad.fuCount           ?? 0) as number, color: 'text-blue-400' },
    { label: 'Chase',    stage: 'chase',         count: (ad.chaseCount        ?? 0) as number, color: 'text-orange-400' },
    { label: 'Appt',     stage: 'appointment',   count: (ad.appointmentCount  ?? 0) as number, color: 'text-violet-400' },
    { label: 'Contract', stage: 'contract_sent', count: (ad.contractSentCount ?? 0) as number, color: 'text-cyan-400' },
    { label: 'Pending',  stage: 'pending_send',  count: (ad.pendingSendCount  ?? 0) as number, color: 'text-cyan-600' },
    { label: 'NQ',       stage: 'nq',            count: (ad.nqCount           ?? 0) as number, color: 'text-red-400' },
    { label: 'MIA',      stage: 'mia',           count: (ad.miaCount          ?? 0) as number, color: 'text-gray-500' },
    { label: 'Qualified',stage: 'qualified',     count: (ad.qualifiedCount    ?? 0) as number, color: 'text-emerald-400' },
    { label: 'Closed',   stage: 'closed',        count: (ad.closedCount       ?? 0) as number, color: 'text-gray-400' },
  ]).filter(i => i.count > 0)

  if (!items.length) return null
  return (
    <div className="flex gap-2 flex-wrap pt-1">
      {items.map(i => (
        <button key={i.label} onClick={() => onClickStage(i.stage)}
          className={`text-[10px] ${i.color} tabular-nums hover:underline underline-offset-2 transition`}>
          {i.count} {i.label}
        </button>
      ))}
    </div>
  )
}

function CreativeChartCard({ ad, maxes, isActive, onClickMetric, onClickCases, onClickStage, onClickLeads }: {
  ad: any; maxes: Record<string, number>; isActive: boolean
  onClickMetric: (metric: string) => void; onClickCases: () => void
  onClickStage: (stage: string) => void; onClickLeads: () => void
}) {
  const level = alertLevel(ad)
  const border =
    level === 'kill'        ? 'border-red-500/40' :
    level === 'watch'       ? 'border-yellow-500/30' :
    level === 'scale'       ? 'border-green-500/30' :
    level === 'read_decide' ? 'border-orange-500/30' :
    isActive ? 'border-blue-500/20' : 'border-gray-800'

  return (
    <div className={`bg-gray-900 border ${border} rounded-xl p-4 space-y-3 ${!isActive ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 min-h-[2.5rem]">
        <div className="min-w-0">
          <p className="text-xs text-gray-200 leading-snug font-medium line-clamp-2" title={ad.adName}>{ad.adName || '—'}</p>
          {isActive && <span className="inline-block mt-1 text-[9px] bg-blue-900/40 text-blue-400 px-1.5 py-0.5 rounded font-medium">ACTIVE</span>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <AlertBadge level={level} />
        </div>
      </div>

      {/* Metric bars — each clickable to open trend */}
      <div className="space-y-1.5">
        <MetricBar label="Spend" value={ad.spend} max={maxes.spend} fmt={fmt$} color={METRIC_CFG.spend.color} onClick={() => onClickMetric('spend')} />
        <MetricBar label="CPL" value={ad.cpl} max={maxes.cpl} warnAbove={220} killAbove={300} fmt={fmt$} color={METRIC_CFG.cpl.color} onClick={() => onClickMetric('cpl')} />
        <MetricBar label="CPA" value={ad.cpa} max={Math.max(maxes.cpa, 1200)} warnAbove={1200} killAbove={2000} fmt={fmt$} color={METRIC_CFG.cpa.color} />
        <MetricBar label="CPQ" value={ad.cpq} max={Math.max(maxes.cpq, 1200)} fmt={fmt$} color={METRIC_CFG.cpq.color} />
        <MetricBar label="CPC" value={ad.cpc || null} max={maxes.cpc} fmt={fmt$} color={METRIC_CFG.cpc.color} onClick={() => onClickMetric('cpc')} />
        <MetricBar label="CTR" value={ad.ctr || null} max={maxes.ctr} warnAbove={10} fmt={v => v.toFixed(2) + '%'} color={METRIC_CFG.ctr.color} onClick={() => onClickMetric('ctr')} />
        <MetricBar label="Click→Lead" value={ad.clickToLeadPct} max={Math.max(maxes.clickToLeadPct, 5)} killBelow={0.5} fmt={v => v.toFixed(2) + '%'} color={METRIC_CFG.clickToLeadPct.color} onClick={() => onClickMetric('clickToLeadPct')} />
        <MetricBar label="LPV→Lead" value={ad.lpvToLeadPct} max={Math.max(maxes.lpvToLeadPct, 5)} fmt={v => v.toFixed(2) + '%'} color={METRIC_CFG.lpvToLeadPct.color} onClick={() => onClickMetric('lpvToLeadPct')} />
      </div>

      {/* Pipeline breakdown */}
      <PipelineBreakdown ad={ad} onClickStage={onClickStage} />

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-800/60 text-xs text-gray-500">
        <button onClick={() => onClickLeads()} className="hover:text-gray-300 transition tabular-nums">{ad.metaLeads ?? 0} leads</button>
        <span>· {(ad.impressions ?? 0).toLocaleString()} impr</span>
        {ad.signedCases > 0 ? (
          <button onClick={onClickCases} className="text-green-400 hover:text-green-300 transition underline underline-offset-2">
            {ad.signedCases} signed
          </button>
        ) : <span>0 signed</span>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip (table view)
// ─────────────────────────────────────────────────────────────────────────────
function Tooltip({ text }: { text: string }) {
  return (
    <div className="absolute z-50 left-0 top-full mt-1.5 w-max max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 shadow-xl pointer-events-none">
      {text}
    </div>
  )
}

function CreativeCell({ adName, adId }: { adName: string; adId?: string }) {
  const [show, setShow] = useState(false)
  return (
    <td className="py-3 px-4 max-w-[180px]">
      <div className="relative inline-block w-full"
        onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
        <p className="text-gray-200 truncate cursor-default">{adName || '—'}</p>
        {show && adName && <Tooltip text={adName} />}
      </div>
      {adId && <p className="text-[10px] text-gray-600 font-mono mt-0.5">{adId}</p>}
    </td>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// All Leads Modal — aggregates NR + NQ + F/U + Signed for a creative
// ─────────────────────────────────────────────────────────────────────────────
const STAGE_CFG: Record<string, { label: string; cls: string }> = {
  signed:        { label: 'Signed',          cls: 'bg-green-900/40 text-green-400' },
  fu:            { label: 'Follow Up',       cls: 'bg-blue-900/40 text-blue-400' },
  nr:            { label: 'No Response',     cls: 'bg-gray-800 text-gray-400' },
  nq:            { label: 'Not Qualified',   cls: 'bg-red-900/40 text-red-400' },
  chase:         { label: 'Chase',           cls: 'bg-orange-900/40 text-orange-400' },
  new_lead:      { label: 'New Lead',        cls: 'bg-sky-900/40 text-sky-400' },
  appointment:   { label: 'Appointment',     cls: 'bg-violet-900/40 text-violet-400' },
  contract_sent: { label: 'Contract Sent',   cls: 'bg-cyan-900/40 text-cyan-400' },
  pending_send:  { label: 'Pending Send',    cls: 'bg-cyan-900/40 text-cyan-600' },
  mia:           { label: 'MIA',             cls: 'bg-gray-800 text-gray-500' },
  qualified:     { label: 'Qualified',       cls: 'bg-emerald-900/40 text-emerald-400' },
  closed:        { label: 'Closed',          cls: 'bg-gray-800 text-gray-400' },
}

function AllLeadsModal({ ad, onClose }: { ad: any; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const all = [
    ...(ad.newLeadLeads      || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'new_lead' })),
    ...(ad.nrLeads           || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'nr' })),
    ...(ad.fuLeads           || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'fu' })),
    ...(ad.chaseLeads        || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'chase' })),
    ...(ad.appointmentLeads  || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'appointment' })),
    ...(ad.contractSentLeads || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'contract_sent' })),
    ...(ad.pendingSendLeads  || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'pending_send' })),
    ...(ad.nqLeads           || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'nq' })),
    ...(ad.miaLeads          || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'mia' })),
    ...(ad.qualifiedLeads    || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'qualified' })),
    ...(ad.closedLeads       || []).map((l: any) => ({ ...l, date: l.createdAt, stage: 'closed' })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const stageSummary = [
    { key: 'new_lead',      label: 'New Lead',       count: (ad.newLeadLeads      || []).length, cls: 'bg-sky-900/40 text-sky-400' },
    { key: 'nr',            label: 'No Response',    count: (ad.nrLeads           || []).length, cls: 'bg-gray-800 text-gray-400' },
    { key: 'fu',            label: 'Follow Up',      count: (ad.fuLeads           || []).length, cls: 'bg-blue-900/40 text-blue-400' },
    { key: 'chase',         label: 'Chase',          count: (ad.chaseLeads        || []).length, cls: 'bg-orange-900/40 text-orange-400' },
    { key: 'appointment',   label: 'Appointment',    count: (ad.appointmentLeads  || []).length, cls: 'bg-violet-900/40 text-violet-400' },
    { key: 'contract_sent', label: 'Contract Sent',  count: (ad.contractSentLeads || []).length, cls: 'bg-cyan-900/40 text-cyan-400' },
    { key: 'pending_send',  label: 'Pending Send',   count: (ad.pendingSendLeads  || []).length, cls: 'bg-cyan-900/40 text-cyan-600' },
    { key: 'nq',            label: 'Not Qualified',  count: (ad.nqLeads           || []).length, cls: 'bg-red-900/40 text-red-400' },
    { key: 'mia',           label: 'MIA',            count: (ad.miaLeads          || []).length, cls: 'bg-gray-800 text-gray-500' },
    { key: 'qualified',     label: 'Qualified',      count: (ad.qualifiedLeads    || []).length, cls: 'bg-emerald-900/40 text-emerald-400' },
    { key: 'closed',        label: 'Closed',         count: (ad.closedLeads       || []).length, cls: 'bg-gray-800 text-gray-400' },
  ].filter(s => s.count > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="p-5 border-b border-gray-800 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 mb-1">GHL Pipeline Leads — Creative</p>
            <p className="text-sm font-semibold text-white leading-snug">{ad.adName || '—'}</p>
            {stageSummary.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {stageSummary.map(s => (
                  <span key={s.key} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>
                    {s.count} {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {all.length === 0
            ? <p className="text-gray-500 text-sm p-6 text-center">No GHL pipeline leads matched to this creative.</p>
            : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-800">
                  {['Contact', 'Phone', 'Status', 'Date'].map(h => (
                    <th key={h} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {all.map((lead, i) => {
                  const cfg = STAGE_CFG[lead.stage]
                  return (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                      <td className="py-3 px-4 text-gray-200">{lead.name || '—'}</td>
                      <td className="py-3 px-4 text-gray-400 text-xs">{lead.phone || '—'}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg?.cls}`}>{cfg?.label}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">
                        {lead.date ? new Date(lead.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-600">
          {all.length} lead{all.length !== 1 ? 's' : ''} in GHL pipeline · {ad.metaLeads ?? 0} Meta leads total
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Leads Modal (NR / NQ / F/U)
// ─────────────────────────────────────────────────────────────────────────────
const PIPELINE_LABEL: Record<string, { label: string; color: string }> = {
  nr:            { label: 'No Response',        color: 'text-gray-400' },
  nq:            { label: 'Not Qualified',      color: 'text-red-400' },
  fu:            { label: 'Follow Up Required', color: 'text-blue-400' },
  chase:         { label: 'Chase',              color: 'text-orange-400' },
  new_lead:      { label: 'New Lead',           color: 'text-sky-400' },
  appointment:   { label: 'Appointment',        color: 'text-violet-400' },
  contract_sent: { label: 'Contract Sent',      color: 'text-cyan-400' },
  pending_send:  { label: 'Pending Send',       color: 'text-cyan-600' },
  mia:           { label: 'MIA',               color: 'text-gray-500' },
  qualified:     { label: 'Qualified',          color: 'text-emerald-400' },
  closed:        { label: 'Closed',             color: 'text-gray-400' },
}

const STAGE_FIELD: Record<string, string> = {
  nr:            'nrLeads',
  nq:            'nqLeads',
  fu:            'fuLeads',
  chase:         'chaseLeads',
  new_lead:      'newLeadLeads',
  appointment:   'appointmentLeads',
  contract_sent: 'contractSentLeads',
  pending_send:  'pendingSendLeads',
  mia:           'miaLeads',
  qualified:     'qualifiedLeads',
  closed:        'closedLeads',
}

function PipelineLeadsModal({ ad, stage, onClose }: {
  ad: any; stage: string; onClose: () => void
}) {
  const leads: any[] = ad[STAGE_FIELD[stage] || `${stage}Leads`] || []
  const cfg = PIPELINE_LABEL[stage]

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="p-5 border-b border-gray-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-xs font-semibold mb-1 ${cfg.color}`}>{cfg.label}</p>
            <p className="text-sm font-semibold text-white leading-snug">{ad.adName || '—'}</p>
            {ad.adId && <p className="text-[10px] text-gray-600 font-mono mt-1">{ad.adId}</p>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {leads.length === 0
            ? <p className="text-gray-500 text-sm p-6 text-center">No contacts in this stage for this creative.</p>
            : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-800">
                  {['Contact', 'Phone', 'Email', 'Date'].map(h => (
                    <th key={h} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead: any, i: number) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                    <td className="py-3 px-4 text-gray-200">{lead.name || '—'}</td>
                    <td className="py-3 px-4 text-gray-400 text-xs">{lead.phone || '—'}</td>
                    <td className="py-3 px-4 text-gray-400 text-xs">{lead.email || '—'}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">
                      {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-600">
          {leads.length} contact{leads.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Cases Modal
// ─────────────────────────────────────────────────────────────────────────────
function CasesModal({ ad, pcs, onClose, onDelete, onUpdateCloser, onUpdateSecondCloser, onToggleOt }: {
  ad: any; pcs: any[]; onClose: () => void
  onDelete: (pc: any) => Promise<void>
  onUpdateCloser: (pcId: string, closer: string) => Promise<void>
  onUpdateSecondCloser: (pcId: string, secondCloser: string) => Promise<void>
  onToggleOt: (pcId: string, isOtClose: boolean) => Promise<void>
}) {
  const cases = pcs.filter(p => {
    const hasRealAdId = p.adId && !p.adId.includes('{{')
    if (hasRealAdId) return p.adId === ad.adId
    return p.adName && ad.adName && p.adName === ad.adName
  })
  const ref = useRef<HTMLDivElement>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingCloser, setEditingCloser] = useState<{ id: string; value: string } | null>(null)
  const [editingSecondCloser, setEditingSecondCloser] = useState<{ id: string; value: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleDelete(pc: any) {
    if (confirmDeleteId !== pc.id) { setConfirmDeleteId(pc.id); return }
    setBusy(true)
    try { await onDelete(pc) } finally { setBusy(false); setConfirmDeleteId(null) }
  }

  async function handleSaveCloser(pcId: string) {
    if (!editingCloser) return
    setBusy(true)
    try { await onUpdateCloser(pcId, editingCloser.value); setEditingCloser(null) }
    finally { setBusy(false) }
  }

  async function handleSaveSecondCloser(pcId: string) {
    if (!editingSecondCloser) return
    setBusy(true)
    try { await onUpdateSecondCloser(pcId, editingSecondCloser.value); setEditingSecondCloser(null) }
    finally { setBusy(false) }
  }

  async function handleToggleOt(pc: any) {
    setBusy(true)
    try { await onToggleOt(pc.id, !pc.isOtClose) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="p-5 border-b border-gray-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-1">Signed Cases — Creative</p>
            <p className="text-sm font-semibold text-white leading-snug">{ad.adName || '—'}</p>
            {ad.adId && <p className="text-[10px] text-gray-600 font-mono mt-1">{ad.adId}</p>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {cases.length === 0
            ? <p className="text-gray-500 text-sm p-6 text-center">No signed cases matched to this creative.</p>
            : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-800">
                  {['Contact', 'Signed', 'Invoice', 'Status', 'Closer', '2nd Rep', 'OT', ''].map((h, i) => (
                    <th key={i} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map((pc: any) => (
                  <tr key={pc.id} className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${confirmDeleteId === pc.id ? 'bg-red-950/20' : ''}`}>
                    <td className="py-3 px-4">
                      <p className="text-gray-200">{pc.contactName || '—'}</p>
                      {pc.contactPhone && <p className="text-[11px] text-gray-500 mt-0.5">{pc.contactPhone}</p>}
                    </td>
                    <td className="py-3 px-4 text-gray-400 whitespace-nowrap text-xs">
                      {pc.qualifiedAt ? new Date(pc.qualifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{pc.invoiceCode || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        (pc.caseStatus || '').toLowerCase() === 'closed' ? 'bg-gray-800 text-gray-400' :
                        (pc.caseStatus || '').toLowerCase() === 'replacement' ? 'bg-yellow-900/40 text-yellow-400' :
                        'bg-green-900/30 text-green-400'
                      }`}>{pc.caseStatus || 'e_signed'}</span>
                    </td>
                    {/* Closer — inline editable */}
                    <td className="py-3 px-4 text-xs">
                      {editingCloser?.id === pc.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 text-xs w-28 outline-none focus:border-blue-500"
                            value={editingCloser?.value ?? ''}
                            onChange={e => setEditingCloser({ id: pc.id, value: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveCloser(pc.id)
                              if (e.key === 'Escape') setEditingCloser(null)
                            }}
                          />
                          <button onClick={() => handleSaveCloser(pc.id)} disabled={busy}
                            className="text-green-400 hover:text-green-300 disabled:opacity-40 text-[10px] font-semibold">Save</button>
                          <button onClick={() => setEditingCloser(null)}
                            className="text-gray-500 hover:text-gray-300 text-[10px]">×</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingCloser({ id: pc.id, value: pc.workerName || pc.closer || '' })}
                          className="group flex items-center gap-1 text-gray-400 hover:text-gray-200 transition"
                        >
                          <span>{pc.workerName || pc.closer || <span className="text-gray-600 italic">Add closer</span>}</span>
                          <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-2.828 0L9 13z" />
                          </svg>
                        </button>
                      )}
                    </td>
                    {/* 2nd Rep — inline editable */}
                    <td className="py-3 px-4 text-xs">
                      {editingSecondCloser?.id === pc.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 text-xs w-28 outline-none focus:border-blue-500"
                            value={editingSecondCloser?.value ?? ''}
                            onChange={e => setEditingSecondCloser({ id: pc.id, value: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveSecondCloser(pc.id)
                              if (e.key === 'Escape') setEditingSecondCloser(null)
                            }}
                          />
                          <button onClick={() => handleSaveSecondCloser(pc.id)} disabled={busy}
                            className="text-green-400 hover:text-green-300 disabled:opacity-40 text-[10px] font-semibold">Save</button>
                          <button onClick={() => setEditingSecondCloser(null)}
                            className="text-gray-500 hover:text-gray-300 text-[10px]">×</button>
                        </div>
                      ) : pc.secondWorkerName || pc.secondCloser ? (
                        <button
                          onClick={() => setEditingSecondCloser({ id: pc.id, value: pc.secondWorkerName || pc.secondCloser || '' })}
                          className="group flex items-center gap-1 text-gray-400 hover:text-gray-200 transition"
                        >
                          <span>{pc.secondWorkerName || pc.secondCloser}</span>
                          <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-2.828 0L9 13z" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingSecondCloser({ id: pc.id, value: '' })}
                          className="text-gray-700 hover:text-gray-400 text-[10px] flex items-center gap-0.5 transition"
                          title="Add a second rep — close credit splits 50/50"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          Rep
                        </button>
                      )}
                    </td>
                    {/* OT close toggle */}
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggleOt(pc)}
                        disabled={busy}
                        title={pc.isOtClose ? 'OT Close ($50) — click to remove' : 'Mark as OT Close ($50 commission)'}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition disabled:opacity-40 ${
                          pc.isOtClose
                            ? 'bg-amber-900/40 text-amber-400 border-amber-700/40'
                            : 'text-gray-700 border-gray-700 hover:text-amber-400 hover:border-amber-700/40'
                        }`}
                      >
                        OT
                      </button>
                    </td>
                    {/* Delete */}
                    <td className="py-3 px-3 text-right">
                      {confirmDeleteId === pc.id ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="text-[10px] text-red-400">Delete?</span>
                          <button onClick={() => handleDelete(pc)} disabled={busy}
                            className="text-[10px] font-semibold text-red-400 hover:text-red-300 disabled:opacity-40">Yes</button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="text-[10px] text-gray-500 hover:text-gray-300">No</button>
                        </div>
                      ) : (
                        <button onClick={() => handleDelete(pc)}
                          className="text-gray-700 hover:text-red-400 transition p-1 rounded"
                          title="Delete case">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-600">
          {cases.length} case{cases.length !== 1 ? 's' : ''} matched · Split closes count 0.5 each · OT closes pay $50
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function MarketingPage() {
  const params = useParams()
  const slug = params.slug as string
  const invoiceCode = invoiceCodeFromRouteSegment(params.invoice as string)

  const [kpi, setKpi] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeAdIds, setActiveAdIds] = useState<Set<string>>(new Set())
  const [view, setView] = useState<'creatives' | 'adsets' | 'campaigns'>('creatives')
  const [chartMode, setChartMode] = useState(false)
  const [timeframe, setTimeframe] = useState<TF>('invoice')
  const [selectedAd, setSelectedAd] = useState<any | null>(null)
  const [trendState, setTrendState] = useState<{ ad: any; metric: string } | null>(null)
  const [pipelineModal, setPipelineModal] = useState<{ ad: any; stage: string } | null>(null)
  const [leadsModal, setLeadsModal] = useState<any | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Delete a signed case — removes from DB, then refetches KPI data
  async function handleDeleteCase(pc: any) {
    const res = await fetch(`/api/metrics/case?id=${encodeURIComponent(pc.id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Delete failed')
    setRefreshKey(k => k + 1)
  }

  // Update closer — optimistic update of pcs only
  async function handleUpdateCloser(pcId: string, closer: string) {
    const res = await fetch('/api/metrics/case', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pcId, closer }),
    })
    if (!res.ok) throw new Error('Update failed')
    setKpi((prev: any) => ({
      ...prev,
      pcs: (prev.pcs || []).map((p: any) =>
        p.id === pcId ? { ...p, closer, workerName: closer || p.workerName } : p
      ),
    }))
  }

  // Update second closer — optimistic update
  async function handleUpdateSecondCloser(pcId: string, secondCloser: string) {
    const res = await fetch('/api/metrics/case', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pcId, second_closer: secondCloser }),
    })
    if (!res.ok) throw new Error('Update failed')
    setKpi((prev: any) => ({
      ...prev,
      pcs: (prev.pcs || []).map((p: any) =>
        p.id === pcId ? { ...p, secondCloser, secondWorkerName: secondCloser || null } : p
      ),
    }))
  }

  // Toggle OT close — optimistic update
  async function handleToggleOt(pcId: string, isOtClose: boolean) {
    const res = await fetch('/api/metrics/case', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pcId, is_ot_close: isOtClose }),
    })
    if (!res.ok) throw new Error('Update failed')
    setKpi((prev: any) => ({
      ...prev,
      pcs: (prev.pcs || []).map((p: any) =>
        p.id === pcId ? { ...p, isOtClose } : p
      ),
    }))
  }

  // Main data fetch
  useEffect(() => {
    setLoading(true)
    const qs = timeframe === 'invoice'
      ? `firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(invoiceCode)}`
      : `firm=${encodeURIComponent(slug)}&date_preset=${timeframe}`
    fetch(`/api/metrics/kpi?${qs}`)
      .then(r => r.json())
      .then(d => { setKpi(d); setLoading(false) })
  }, [slug, invoiceCode, timeframe, refreshKey])

  // Secondary fetch: today's active ad IDs (always, for sorting)
  useEffect(() => {
    if (timeframe === 'today') {
      setActiveAdIds(new Set()) // will be derived from main data
      return
    }
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&date_preset=today`)
      .then(r => r.json())
      .then(d => {
        const ids = new Set<string>(
          (d.adBreakdown || []).filter((a: any) => a.spend > 0).map((a: any) => a.adId as string)
        )
        setActiveAdIds(ids)
      })
      .catch(() => {})
  }, [slug, timeframe])

  const rawAds: any[] = kpi?.adBreakdown || []
  const pcs: any[] = kpi?.pcs || []

  // When viewing today, active = any with spend > 0
  const resolvedActiveIds = timeframe === 'today'
    ? new Set(rawAds.filter(a => a.spend > 0).map(a => a.adId as string))
    : activeAdIds

  // Sort: active first, then by spend desc
  const ads = [...rawAds].sort((a, b) => {
    const aA = resolvedActiveIds.has(a.adId) ? 1 : 0
    const bA = resolvedActiveIds.has(b.adId) ? 1 : 0
    if (aA !== bA) return bA - aA
    return b.spend - a.spend
  })

  // Normalization maxes for chart cards
  const maxes = {
    spend: Math.max(...ads.map(a => a.spend ?? 0), 1),
    cpl: Math.max(...ads.map(a => a.cpl ?? 0), 1),
    cpc: Math.max(...ads.map(a => a.cpc ?? 0), 1),
    ctr: Math.max(...ads.map(a => a.ctr ?? 0), 1),
    clickToLeadPct: Math.max(...ads.map(a => a.clickToLeadPct ?? 0), 1),
    lpvToLeadPct: Math.max(...ads.map(a => a.lpvToLeadPct ?? 0), 1),
    cpa: Math.max(...ads.map(a => a.cpa ?? 0), 1),
    cpq: Math.max(...ads.map(a => a.cpq ?? 0), 1),
  }

  // Adset aggregation
  const adsetMap: Record<string, any> = {}
  for (const a of rawAds) {
    const key = a.adsetId || a.adsetName || '—'
    if (!adsetMap[key]) adsetMap[key] = { id: a.adsetId, name: a.adsetName || '—', spend: 0, metaLeads: 0, signedCases: 0, impressions: 0, chaseCount: 0, adCount: 0 }
    adsetMap[key].spend += a.spend
    adsetMap[key].metaLeads += a.metaLeads
    adsetMap[key].signedCases += a.signedCases
    adsetMap[key].impressions += a.impressions
    adsetMap[key].chaseCount += (a.chaseCount ?? 0)
    adsetMap[key].adCount += 1
  }
  const adsets = Object.values(adsetMap).sort((a, b) => b.spend - a.spend)

  // Campaign aggregation
  const campMap: Record<string, any> = {}
  for (const a of rawAds) {
    const key = a.campaignId || a.campaignName || '—'
    if (!campMap[key]) campMap[key] = { id: a.campaignId, name: a.campaignName || '—', spend: 0, metaLeads: 0, signedCases: 0, impressions: 0, chaseCount: 0, adCount: 0 }
    campMap[key].spend += a.spend
    campMap[key].metaLeads += a.metaLeads
    campMap[key].signedCases += a.signedCases
    campMap[key].impressions += a.impressions
    campMap[key].chaseCount += (a.chaseCount ?? 0)
    campMap[key].adCount += 1
  }
  const campaigns = Object.values(campMap).sort((a, b) => b.spend - a.spend)

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>

  const metaError = kpi?.meta?.error
  const activeAds       = ads.filter(a => resolvedActiveIds.has(a.adId))
  const killCount       = activeAds.filter(a => alertLevel(a) === 'kill').length
  const watchCount      = activeAds.filter(a => alertLevel(a) === 'watch').length
  const scaleCount      = activeAds.filter(a => alertLevel(a) === 'scale').length
  const readDecideCount = activeAds.filter(a => alertLevel(a) === 'read_decide').length
  const activeCount     = activeAds.length

  return (
    <div className="p-6 space-y-5">
      {metaError && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          Meta API: {metaError}
        </div>
      )}


      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Spend', value: fmt$(kpi?.meta?.spend) },
          { label: 'Impressions', value: (kpi?.meta?.impressions ?? 0).toLocaleString() },
          { label: 'Meta Leads', value: kpi?.meta?.leads ?? 0 },
          { label: 'CPL', value: kpi?.meta?.cpl != null ? fmt$(kpi.meta.cpl) : '—' },
        ].map(c => (
          <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className="text-lg font-bold text-white">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Funnel */}
      {kpi?.pipelineTotals && (() => {
        const pt = kpi.pipelineTotals
        const stages = [
          { key: 'new_lead',      label: 'New Lead',  count: pt.newLeadCount,      color: 'text-sky-400',     bgHover: 'hover:bg-sky-900/30' },
          { key: 'nr',            label: 'NR',        count: pt.nrCount,           color: 'text-gray-400',    bgHover: 'hover:bg-gray-800/30' },
          { key: 'fu',            label: 'F/U',       count: pt.fuCount,           color: 'text-blue-400',    bgHover: 'hover:bg-blue-900/30' },
          { key: 'chase',         label: 'Chase',     count: pt.chaseCount,        color: 'text-orange-400',  bgHover: 'hover:bg-orange-900/30' },
          { key: 'appointment',   label: 'Appt',      count: pt.appointmentCount,  color: 'text-violet-400',  bgHover: 'hover:bg-violet-900/30' },
          { key: 'contract_sent', label: 'Contract',  count: pt.contractSentCount, color: 'text-cyan-400',    bgHover: 'hover:bg-cyan-900/30' },
          { key: 'pending_send',  label: 'Pending',   count: pt.pendingSendCount,  color: 'text-cyan-600',    bgHover: 'hover:bg-cyan-900/30' },
          { key: 'nq',            label: 'NQ',        count: pt.nqCount,           color: 'text-red-400',     bgHover: 'hover:bg-red-900/30' },
          { key: 'mia',           label: 'MIA',       count: pt.miaCount,          color: 'text-gray-500',    bgHover: 'hover:bg-gray-800/30' },
        ]
        const hasAny = stages.some(s => s.count > 0)
        if (!hasAny) return null
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">Lead Pipeline</p>
            <div className="flex flex-wrap gap-2">
              {stages.map(s => s.count > 0 && (
                <button key={s.key}
                  onClick={() => setPipelineModal({ ad: pt, stage: s.key })}
                  className={`flex items-center gap-1.5 rounded-lg border border-gray-800 px-3 py-2 text-sm transition ${s.bgHover}`}>
                  <span className={`font-bold ${s.color}`}>{s.count}</span>
                  <span className="text-gray-500">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Timeframe */}
      <div className="flex gap-1 flex-wrap">
        {TIMEFRAMES.map(tf => (
          <button key={tf.key} onClick={() => setTimeframe(tf.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${timeframe === tf.key ? 'bg-blue-700 text-white' : 'text-gray-500 hover:text-gray-300 bg-gray-900 border border-gray-800'}`}>
            {tf.label}
          </button>
        ))}
      </div>

      {/* View toggle + chart/table toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['creatives', 'adsets', 'campaigns'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize transition ${view === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {v}
            </button>
          ))}
        </div>
        {view === 'creatives' && (
          <div className="flex items-center gap-3">
            {activeCount > 0 && timeframe !== 'today' && (
              <span className="text-xs text-blue-400">{activeCount} active today</span>
            )}
            <div className="flex gap-1">
              {(['Table', 'Charts'] as const).map(m => (
                <button key={m} onClick={() => setChartMode(m === 'Charts')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition ${chartMode === (m === 'Charts') ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Creatives ── */}
      {view === 'creatives' && (
        ads.length === 0
          ? <p className="text-gray-500 text-sm text-center py-8">No ad data for this period.</p>
          : chartMode ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {ads.map((a, i) => (
                <CreativeChartCard
                  key={i}
                  ad={a}
                  maxes={maxes}
                  isActive={resolvedActiveIds.has(a.adId)}
                  onClickMetric={metric => setTrendState({ ad: a, metric })}
                  onClickCases={() => setSelectedAd(a)}
                  onClickStage={(stage) => setPipelineModal({ ad: a, stage })}
                  onClickLeads={() => setLeadsModal(a)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-300">Creatives</p>
                <span className="text-xs text-gray-600">{ads.length} ads</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['', 'Creative', 'Ad Set', 'Spend', 'Leads', 'CPL', 'CPC', 'CTR', 'Click→Lead', 'LPV→Lead', 'New Lead', 'NR', 'F/U', 'Chase', 'Appt', 'Contract', 'Pending', 'NQ', 'MIA', 'Qualified', 'Closed', 'Signed', 'CPA', 'CPQ'].map(c => (
                        <th key={c} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ads.map((a, i) => {
                      const level = alertLevel(a)
                      const isActive = resolvedActiveIds.has(a.adId)
                      return (
                        <tr key={i} className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${!isActive ? 'opacity-60' : ''}`}>
                          <td className="py-3 px-3 w-6">
                            {isActive && <span className="block w-1.5 h-1.5 rounded-full bg-blue-400" title="Active today" />}
                          </td>
                          <CreativeCell adName={a.adName} adId={a.adId} />
                          <td className="py-3 px-4 max-w-[160px]">
                            <p className="text-gray-400 text-xs truncate" title={a.adsetName}>{a.adsetName || '—'}</p>
                          </td>
                          <td className="py-3 px-4 text-gray-200 whitespace-nowrap">{fmt$(a.spend)}</td>
                          <td className="py-3 px-4">
                            {(() => {
                              const total = (a.newLeadCount ?? 0) + (a.nrCount ?? 0) + (a.fuCount ?? 0) + (a.chaseCount ?? 0) + (a.appointmentCount ?? 0) + (a.contractSentCount ?? 0) + (a.pendingSendCount ?? 0) + (a.nqCount ?? 0) + (a.miaCount ?? 0) + (a.qualifiedCount ?? 0) + (a.closedCount ?? 0)
                              return total > 0
                                ? <button onClick={() => setLeadsModal(a)} className="text-gray-300 hover:text-white hover:underline underline-offset-2 transition">{total}</button>
                                : <span className="text-gray-600">0</span>
                            })()}
                          </td>
                          <td className="py-3 px-4 cursor-pointer hover:underline underline-offset-2" onClick={() => setTrendState({ ad: a, metric: 'cpl' })}>
                            <span className={a.cpl == null ? 'text-gray-600' : a.cpl > 300 ? 'text-red-400 font-semibold' : a.cpl > 220 ? 'text-yellow-400' : 'text-gray-300'}>
                              {a.cpl ? fmt$(a.cpl) : '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-400 cursor-pointer hover:underline underline-offset-2" onClick={() => setTrendState({ ad: a, metric: 'cpc' })}>
                            {a.cpc ? fmt$(a.cpc) : '—'}
                          </td>
                          <td className="py-3 px-4 cursor-pointer hover:underline underline-offset-2" onClick={() => setTrendState({ ad: a, metric: 'ctr' })}>
                            <span className={a.ctr > 10 ? 'text-yellow-400' : 'text-gray-400'}>{a.ctr ? a.ctr.toFixed(2) + '%' : '—'}</span>
                          </td>
                          <td className="py-3 px-4 cursor-pointer hover:underline underline-offset-2" onClick={() => setTrendState({ ad: a, metric: 'clickToLeadPct' })}>
                            <span className={a.clickToLeadPct != null && a.clickToLeadPct < 0.5 ? 'text-red-400 font-semibold' : 'text-gray-400'}>
                              {a.clickToLeadPct != null ? a.clickToLeadPct.toFixed(2) + '%' : '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-400">
                            {a.lpvToLeadPct != null ? a.lpvToLeadPct.toFixed(2) + '%' : '—'}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.newLeadCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'new_lead' })} className="text-sky-400 hover:underline underline-offset-2 transition">{a.newLeadCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.nrCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'nr' })} className="text-gray-400 hover:underline underline-offset-2 transition">{a.nrCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.fuCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'fu' })} className="text-blue-400 hover:underline underline-offset-2 transition">{a.fuCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.chaseCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'chase' })} className="text-orange-400 hover:underline underline-offset-2 transition">{a.chaseCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.appointmentCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'appointment' })} className="text-violet-400 hover:underline underline-offset-2 transition">{a.appointmentCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.contractSentCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'contract_sent' })} className="text-cyan-400 hover:underline underline-offset-2 transition">{a.contractSentCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.pendingSendCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'pending_send' })} className="text-cyan-600 hover:underline underline-offset-2 transition">{a.pendingSendCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.nqCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'nq' })} className="text-red-400 font-semibold hover:underline underline-offset-2 transition">{a.nqCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.miaCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'mia' })} className="text-gray-500 hover:underline underline-offset-2 transition">{a.miaCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.qualifiedCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'qualified' })} className="text-emerald-400 hover:underline underline-offset-2 transition">{a.qualifiedCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {(a.closedCount ?? 0) > 0
                              ? <button onClick={() => setPipelineModal({ ad: a, stage: 'closed' })} className="text-gray-400 hover:underline underline-offset-2 transition">{a.closedCount}</button>
                              : <span className="text-gray-700">—</span>}
                          </td>
                          <td className="py-3 px-4">
                            {a.signedCases > 0
                              ? <button onClick={() => setSelectedAd(a)} className="text-green-400 font-semibold hover:text-green-300 hover:underline underline-offset-2 transition">{a.signedCases}</button>
                              : <span className="text-gray-600">0</span>}
                          </td>
                          <td className="py-3 px-4">
                            {a.cpa != null
                              ? <span className={a.cpa <= 1200 ? 'text-green-400 font-semibold' : a.cpa > 2000 ? 'text-red-400 font-semibold' : 'text-yellow-400 font-semibold'}>{fmt$(a.cpa)}</span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="py-3 px-4">
                            {a.cpq != null
                              ? <span className="text-teal-400 font-semibold">{fmt$(a.cpq)}</span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
      )}

      {/* ── Adsets ── */}
      {view === 'adsets' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-800"><p className="text-sm font-medium text-gray-300">Ad Sets</p></div>
          {adsets.length === 0
            ? <p className="text-gray-500 text-sm p-6 text-center">No ad set data for this period.</p>
            : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Ad Set', 'Spend', 'Impressions', 'Leads', 'Signed', 'Conv %', 'CPA', 'CPQ', 'Ads'].map(c => (
                      <th key={c} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {adsets.map((a, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                      <td className="py-3 px-4 max-w-[240px]">
                        <p className="text-gray-200 truncate" title={a.name}>{a.name}</p>
                        {a.id && <p className="text-[10px] text-gray-600 font-mono mt-0.5">{a.id}</p>}
                      </td>
                      <td className="py-3 px-4 text-gray-200 whitespace-nowrap">{fmt$(a.spend)}</td>
                      <td className="py-3 px-4 text-gray-400">{a.impressions?.toLocaleString()}</td>
                      <td className="py-3 px-4 text-gray-300">{a.metaLeads}</td>
                      <td className="py-3 px-4 font-semibold text-green-400">{a.signedCases}</td>
                      <td className="py-3 px-4 text-gray-400">{convPct(a.signedCases, a.metaLeads)}</td>
                      <td className="py-3 px-4">
                        {a.signedCases > 0
                          ? (() => { const cpa = a.spend / a.signedCases; return <span className={cpa <= 1200 ? 'text-green-400 font-semibold' : cpa > 2000 ? 'text-red-400 font-semibold' : 'text-yellow-400 font-semibold'}>{fmt$(cpa)}</span> })()
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        {(() => { const qual = (a.chaseCount ?? 0) + a.signedCases; return qual > 0
                          ? <span className="text-teal-400 font-semibold">{fmt$(a.spend / qual)}</span>
                          : <span className="text-gray-600">—</span> })()}
                      </td>
                      <td className="py-3 px-4 text-gray-500">{a.adCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Campaigns ── */}
      {view === 'campaigns' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-800"><p className="text-sm font-medium text-gray-300">Campaigns</p></div>
          {campaigns.length === 0
            ? <p className="text-gray-500 text-sm p-6 text-center">No campaign data.</p>
            : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Campaign', 'Spend', 'Impressions', 'Leads', 'Signed', 'Conv %', 'CPA', 'CPQ', 'Ads'].map(c => (
                      <th key={c} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                      <td className="py-3 px-4 max-w-[240px]">
                        <p className="text-gray-200 truncate" title={c.name}>{c.name}</p>
                        {c.id && <p className="text-[10px] text-gray-600 font-mono mt-0.5">{c.id}</p>}
                      </td>
                      <td className="py-3 px-4 text-gray-200 whitespace-nowrap">{fmt$(c.spend)}</td>
                      <td className="py-3 px-4 text-gray-400">{c.impressions?.toLocaleString()}</td>
                      <td className="py-3 px-4 text-gray-300">{c.metaLeads}</td>
                      <td className="py-3 px-4 font-semibold text-green-400">{c.signedCases}</td>
                      <td className="py-3 px-4 text-gray-400">{convPct(c.signedCases, c.metaLeads)}</td>
                      <td className="py-3 px-4">
                        {c.signedCases > 0
                          ? (() => { const cpa = c.spend / c.signedCases; return <span className={cpa <= 1200 ? 'text-green-400 font-semibold' : cpa > 2000 ? 'text-red-400 font-semibold' : 'text-yellow-400 font-semibold'}>{fmt$(cpa)}</span> })()
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        {(() => { const qual = (c.chaseCount ?? 0) + c.signedCases; return qual > 0
                          ? <span className="text-teal-400 font-semibold">{fmt$(c.spend / qual)}</span>
                          : <span className="text-gray-600">—</span> })()}
                      </td>
                      <td className="py-3 px-4 text-gray-500">{c.adCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {leadsModal && (
        <AllLeadsModal ad={leadsModal} onClose={() => setLeadsModal(null)} />
      )}
      {pipelineModal && (
        <PipelineLeadsModal
          ad={pipelineModal.ad}
          stage={pipelineModal.stage}
          onClose={() => setPipelineModal(null)}
        />
      )}
      {selectedAd && (
        <CasesModal
          ad={selectedAd}
          pcs={pcs}
          onClose={() => setSelectedAd(null)}
          onDelete={handleDeleteCase}
          onUpdateCloser={handleUpdateCloser}
          onUpdateSecondCloser={handleUpdateSecondCloser}
          onToggleOt={handleToggleOt}
        />
      )}
      {trendState && (
        <CreativeTrendModal
          ad={trendState.ad}
          initialMetric={trendState.metric}
          timeframe={timeframe}
          invoiceCode={invoiceCode}
          slug={slug}
          onClose={() => setTrendState(null)}
        />
      )}
    </div>
  )
}
