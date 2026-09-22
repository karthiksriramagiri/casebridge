'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MetricsHeader } from '@/app/_metrics/chrome'
import { money, num, pct, EmptyState, DashboardSkeleton, IconWarn } from '@/app/_metrics/dash'
import {
  BENCH, TREND, bandUp, bandDown, bandUp2,
  type Band,
} from '@/app/_metrics/benchmarks'
import { FIRMS, UNKNOWN_FIRM } from '@/app/_metrics/firms'
import { useSite } from '@/app/_metrics/site'
import { adCodes } from '@/app/_metrics/hooks'
import './center.css'

/* ═══════════════════════════════════════════════════════════════════════════
   Creative analysis — two views, two questions.

   Daily Creative Health asks "should we keep running this ad?" and answers
   KEEP / WATCH / KILL from spend efficiency and, crucially, from the
   direction each metric is moving.

   Creative Analysis asks "why did this win or lose, and what do we make
   next?" and answers DOUBLE DOWN / IMPROVE / NEW CONCEPT from the funnel the
   creative itself controls: hook → hold → click → convert.

   Same rows, same numbers, different columns and a different verdict. The
   thresholds behind both live in _metrics/benchmarks.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

const DATE_PRESETS = [
  { label: 'Today', value: 'today' },
  { label: '7d',    value: 'last_7d' },
  { label: '14d',   value: 'last_14d' },
  { label: '30d',   value: 'last_30d' },
]

/* Three views, three routes. They answer different questions — "should we
   keep running this ad?" versus "why did it win, and what do we make next?"
   — and the spec they came from is explicit that mixing them muddies both.
   Each gets its own URL so the header nav can carry them as real tabs and a
   verdict stays linkable. */
const LEVELS = [
  { key: 'ad',       label: 'Ad' },
  { key: 'adset',    label: 'Ad set' },
  { key: 'campaign', label: 'Campaign' },
] as const

type Ad = any
type Level = typeof LEVELS[number]['key']
export type View = 'health' | 'creative' | 'winners'

export default function CreativeCenter({ view }: { view: View }) {
  /* Daily Health is pinned to a 7-day window. Its whole question is "what is
     happening now", and the verdicts behind it always compare the last 3 days
     against the 7 before them regardless of any picker — a 30-day toggle over
     that would move the columns while leaving the verdict alone, which reads
     as a bug. The other two views are genuinely range-scoped. */
  const [preset, setPreset] = useState('last_7d')
  const effectivePreset = view === 'health' ? 'last_7d' : preset

  /* Ad / ad set / campaign. The verdict engines read a funnel that exists at
     every level, so the same columns are meaningful for all three — but hooks
     and thumbnails are properties of a creative, so the winner cards and the
     brief stay ad-level only. */
  const [level, setLevel] = useState<Level>('ad')

  /* $0 spent today means Meta is not delivering it — paused, out of budget,
     or killed. Those rows still carry a week of history and read as alive in
     every column, so they are dropped outright rather than ranked. */
  const [ads, setAds] = useState<Ad[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [openAd, setOpenAd] = useState<Ad | null>(null)
  const [firm, setFirm] = useState<string>('all')
  /* Which creative the analysis rail is showing. Lifted to the page so
     "Create variations" in the health table can load it three sections down. */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const router = useRouter()
  const base = useSite().base

  /* Create variations is asked in Daily Health but answered in Creative
     Analysis, which is now its own route — carry the creative across in the
     URL and let that page open it. Read from window rather than
     useSearchParams: the latter forces the whole page into a Suspense
     boundary at build time for no gain here. */
  function showVariationsFor(a: Ad) {
    router.push(`${base}/analysis?ad=${encodeURIComponent(a.id)}`)
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('ad')
    if (id) setSelectedId(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/creative/insights?date_preset=${effectivePreset}&level=${level}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setAds(d.ads || [])
        setErr(d.error || null)
        setLoading(false)
      })
      .catch(e => { if (!cancelled) { setErr(String(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [effectivePreset, level, nonce])

  /* Firms that actually delivered in this range. A firm with no spend is not
     shown at all rather than as an empty tab — the account rarely runs all
     five at once, and five dead tabs read as broken. */
  const live = useMemo(() => ads.filter(a => a.spendToday > 0), [ads])

  const firmCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of live) c[a.firm] = (c[a.firm] || 0) + 1
    return c
  }, [live])

  const firmTabs = useMemo(() => {
    const known = FIRMS.filter(f => firmCounts[f.code]).map(f => ({ code: f.code, label: f.label, n: firmCounts[f.code] }))
    if (firmCounts[UNKNOWN_FIRM]) known.push({ code: UNKNOWN_FIRM, label: 'Unmatched', n: firmCounts[UNKNOWN_FIRM] })
    return known
  }, [firmCounts])

  const shown = useMemo(
    () => (firm === 'all' ? live : live.filter(a => a.firm === firm)),
    [live, firm])


  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of shown) c[a.health.level] = (c[a.health.level] || 0) + 1
    return c
  }, [shown])

  const urgent = (counts.kill || 0) + (counts.watch || 0)

  return (
    <>
      <MetricsHeader
        onRefresh={() => setNonce(n => n + 1)}
        badges={{ '/health': urgent }}
        actions={view === 'health' ? null : (
          <div className="mx-seg" role="group" aria-label="Date range">
            {DATE_PRESETS.map(p => (
              <button key={p.value} className="mx-seg-btn" aria-pressed={preset === p.value}
                onClick={() => setPreset(p.value)}>{p.label}</button>
            ))}
          </div>
        )}
      />

      <main className="mx-main">
        <div className="mx-section-head" style={{ marginBottom: 14 }}>
          <div>
            <h1 className="mx-page-title">
              {view === 'health'   ? <>Daily creative <i>health</i></>
             : view === 'winners' ? <>Winner <i>analysis</i></>
             :                      <>Creative <i>analysis</i></>}
            </h1>
            <p className="mx-page-sub">
              {view === 'health'
                ? 'Should we keep running this ad? Verdicts read the trend, not just the level.'
                : view === 'winners'
                  ? 'Every creative that produced a lead, ranked — and the traits they share.'
                  : 'Why did this creative win or lose, and what should we make next?'}
            </p>
          </div>

        </div>

        <div className="ca-controls">
          <div className="mx-seg" role="tablist" aria-label="Level">
            {LEVELS.map(l => (
              <button key={l.key} className="mx-seg-btn" role="tab"
                aria-pressed={level === l.key}
                onClick={() => setLevel(l.key)}>{l.label}</button>
            ))}
          </div>

        </div>

        {firmTabs.length > 1 && (
          <div className="ca-firms" role="group" aria-label="Firm">
            <button className={`ca-firm${firm === 'all' ? ' is-on' : ''}`} onClick={() => setFirm('all')}>
              All firms<span className="ca-firm-n">{live.length}</span>
            </button>
            {firmTabs.map(f => (
              <button key={f.code} className={`ca-firm${firm === f.code ? ' is-on' : ''}`}
                onClick={() => setFirm(f.code)}>
                {f.label}<span className="ca-firm-n">{f.n}</span>
              </button>
            ))}
          </div>
        )}

        {err && (
          <div className="mx-card ca-error">
            <IconWarn style={{ color: 'var(--mx-crit)', flexShrink: 0 }} />
            <span>{err}</span>
          </div>
        )}

        {loading ? <DashboardSkeleton /> : shown.length === 0 ? (
          <div className="mx-card">
            {ads.length > 0 ? (
              <EmptyState title="Nothing is delivering today"
                text={`${ads.length} had spend in this range but none today — everything is paused or out of budget.`} />
            ) : (
              <EmptyState title="No delivery in this range"
                text="Meta returned no data for the selected dates." />
            )}
          </div>
        ) : view === 'health' ? (
          <HealthView ads={shown} counts={counts} onOpen={setOpenAd} preset={effectivePreset}
            onVariations={showVariationsFor} level={level} />
        ) : view === 'winners' ? (
          <WinnersView ads={shown} onOpen={setOpenAd} level={level} />
        ) : (
          <CreativeView ads={shown} onOpen={setOpenAd} level={level}
            selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </main>

      {openAd && <AdDetail ad={openAd} onClose={() => setOpenAd(null)} />}
    </>
  )
}

/* ── Shared cells ───────────────────────────────────────────────────────── */

/** "17 Aug" — a launch date, not a timestamp. */
function fmtDay(iso: string | null) {
  if (!iso) return '—'
  // Parse as local midnight: new Date('2026-08-17') is UTC and can slip a day.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function BandCell({ value, band, format }: { value: number | null; band: Band; format: (v: number) => string }) {
  if (value == null) return <td className="ca-num"><span className="mx-dim">—</span></td>
  return <td className={`ca-num is-${band ?? 'none'}`}>{format(value)}</td>
}

/** A percentage change, coloured by whether the direction is good for us. */
function Delta({ v, goodWhen }: { v: number | null; goodWhen: 'up' | 'down' }) {
  if (v == null || !isFinite(v)) return null
  const rounded = Math.round(v)
  if (Math.abs(rounded) < 5) return <span className="ca-delta is-flat">flat</span>
  const good = goodWhen === 'up' ? rounded > 0 : rounded < 0
  return (
    <span className={`ca-delta ${good ? 'is-good' : 'is-bad'}`}>
      {rounded > 0 ? '↑' : '↓'}{Math.abs(rounded)}%
    </span>
  )
}

function Verdict({ level, why }: { level: string; why: string }) {
  return (
    <span className={`ca-verdict is-${level}`} title={why}>
      {level === 'learning' ? 'learning' : level}
    </span>
  )
}

/* ── Charts ─────────────────────────────────────────────────────────────────
   Hand-rolled SVG rather than a chart library: these are seven points each,
   drawn a few dozen times on the page, and a charting dependency would cost
   more than it explains.                                                    */

function Sparkline({ values, goodWhen, width = 64, height = 22 }: {
  values: (number | null)[]; goodWhen: 'up' | 'down'; width?: number; height?: number
}) {
  const pts = values.filter((v): v is number => v != null && isFinite(v))
  if (pts.length < 2) return <span className="mx-dim">—</span>

  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const step = width / (pts.length - 1)
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`).join(' ')

  /* Direction is first-half mean against second-half mean — comparing only
     the endpoints makes a single spiky day look like a trend. */
  const half = Math.floor(pts.length / 2)
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  const rise = mean(pts.slice(half)) - mean(pts.slice(0, half))
  const flat = Math.abs(rise) / (Math.abs(mean(pts)) || 1) < 0.05
  const good = goodWhen === 'up' ? rise > 0 : rise < 0
  const tone = flat ? 'is-flat' : good ? 'is-good' : 'is-bad'

  return (
    <svg className={`ca-spark ${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      role="img" aria-label={`Trend ${flat ? 'flat' : good ? 'improving' : 'worsening'}`}>
      <path d={d} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={height - ((pts[pts.length - 1] - min) / span) * height} r="1.8" />
    </svg>
  )
}

function MiniBars({ values, width = 108, height = 30 }: { values: number[]; width?: number; height?: number }) {
  if (!values.length) return null
  const max = Math.max(...values) || 1
  const gap = 2
  const bw = (width - gap * (values.length - 1)) / values.length
  return (
    <svg className="ca-minibars" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max((v / max) * height, 1)
        return <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx="1"
          className={i === values.length - 1 ? 'is-last' : undefined} />
      })}
    </svg>
  )
}

/* ── Account daily series ───────────────────────────────────────────────────
   Every ad carries its own 14-day series; the account view is those summed by
   date. Ratios are recomputed from the sums, never averaged — a mean of daily
   CPLs would weight a $40 day the same as a $4,000 one.                     */

interface DayRow { date: string; spend: number; leads: number; impressions: number; linkClicks: number }

function accountDays(ads: Ad[]): DayRow[] {
  const by: Record<string, DayRow> = {}
  for (const a of ads) {
    for (const d of a.daily || []) {
      const row = (by[d.date] ??= { date: d.date, spend: 0, leads: 0, impressions: 0, linkClicks: 0 })
      row.spend += d.spend || 0
      row.leads += d.leads || 0
      row.impressions += d.impressions || 0
      // daily carries link CTR, not the click count it came from.
      if (d.linkCtr != null && d.impressions) row.linkClicks += (d.linkCtr / 100) * d.impressions
    }
  }
  return Object.values(by).sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** The last 7 days of one ad's CPL, for the row sparklines. */
function adSeries(ad: Ad, key: 'cpl' | 'leads' | 'linkCtr'): (number | null)[] {
  return (ad.daily || []).slice(-7).map((d: any) => d[key] ?? null)
}

/* ── View 1 — Daily health ──────────────────────────────────────────────── */

function HealthView({ ads, counts, onOpen, preset, onVariations, level }: {
  ads: Ad[]; counts: Record<string, number>; onOpen: (a: Ad) => void
  preset: string; onVariations: (a: Ad) => void; level: Level
}) {
  const isAd = level === 'ad'
  const [filter, setFilter] = useState<string | null>(null)
  /* Which row the chart is showing. Null charts the account. */
  const [chartId, setChartId] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, any>>({})
  const [needsMigration, setNeedsMigration] = useState(false)

  useEffect(() => {
    fetch('/api/creative/decisions')
      .then(r => r.json())
      .then(d => { setDecisions(d.decisions || {}); setNeedsMigration(!!d.needsMigration) })
      .catch(() => {})
  }, [])

  async function decide(ad: Ad, decision: 'keep' | 'watch' | 'kill') {
    // Optimistic: the row re-colours immediately, and reverts if the write fails.
    const prev = decisions[ad.id]
    setDecisions(d => ({ ...d, [ad.id]: { decision, created_at: new Date().toISOString() } }))
    const res = await fetch('/api/creative/decisions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adId: ad.id, adName: ad.name, decision,
        cpl: ad.cpl, spend: ad.spend, verdict: ad.health.level,
      }),
    })
    if (!res.ok) {
      setDecisions(d => ({ ...d, [ad.id]: prev }))
      if (res.status === 503) setNeedsMigration(true)
    }
  }

  const days = useMemo(() => accountDays(ads), [ads])
  const totals = useMemo(() => {
    const spend = ads.reduce((s, a) => s + (a.spend || 0), 0)
    const leads = ads.reduce((s, a) => s + (a.leads || 0), 0)
    const impressions = ads.reduce((s, a) => s + (a.impressions || 0), 0)
    const clicks = ads.reduce((s, a) => s + (a.linkClicks || 0), 0)
    return {
      spend, leads, impressions,
      cpl: leads > 0 ? spend / leads : null,
      linkCtr: impressions > 0 ? (clicks / impressions) * 100 : null,
    }
  }, [ads])

  /* Needs attention is a spend-weighted list: a killed creative burning $2k
     matters more this morning than one burning $40, whatever the verdict. */
  const attention = useMemo(() => {
    const rows = ads.filter(a => a.health.level === 'kill' || a.health.level === 'watch')
    return rows.sort((x, y) => {
      if (x.health.level !== y.health.level) return x.health.level === 'kill' ? -1 : 1
      return (y.spend || 0) - (x.spend || 0)
    })
  }, [ads])

  const performers = useMemo(
    () => ads.filter(a => a.health.level === 'keep')
      .sort((x, y) => (x.cpl ?? Infinity) - (y.cpl ?? Infinity)),
    [ads])

  const charted = useMemo(() => ads.find(a => a.id === chartId) ?? null, [ads, chartId])
  const doubleDown = ads.filter(a => a.creative.action === 'double_down').length
  const weekBars = days.slice(-7).map(d => d.spend)

  return (
    <>
      <div className="ca-health-top">
        <div className="ca-summary">
          {(['kill', 'watch', 'keep'] as const).map(level => (
            <button key={level}
              className={`ca-sum-cell is-${level}${filter === level ? ' is-on' : ''}`}
              onClick={() => setFilter(filter === level ? null : level)}>
              <span className="ca-sum-n">{counts[level] || 0}</span>
              <span className="ca-sum-l">{level}</span>
              <span className="ca-sum-note-s">
                {level === 'kill' ? 'Underperforming — take action'
                  : level === 'watch' ? 'Deteriorating — monitor closely'
                  : 'Performing well — keep running'}
              </span>
            </button>
          ))}
          <div className="ca-sum-cell is-static">
            <span className="ca-sum-n is-dd">{doubleDown}</span>
            <span className="ca-sum-l">double down</span>
            <span className="ca-sum-note-s">Top performers — create variations</span>
          </div>
        </div>

        <div className="ca-spend">
          <div className="ca-spend-main">
            <span className="ca-spend-n">{money(totals.spend)}</span>
            <span className="ca-sum-l">spend this range</span>
            <MiniBars values={weekBars} />
          </div>
          <div className="ca-spend-side">
            <div><span className="ca-spend-k">{num(totals.leads)}</span><span className="ca-spend-v">Leads</span></div>
            <div><span className="ca-spend-k">{totals.cpl != null ? money(totals.cpl) : '—'}</span><span className="ca-spend-v">Avg CPL</span></div>
            <div><span className="ca-spend-k">{totals.linkCtr != null ? `${totals.linkCtr.toFixed(2)}%` : '—'}</span><span className="ca-spend-v">Link CTR</span></div>
          </div>
        </div>
      </div>

      <AiInsights preset={preset} />

      {/* ── Needs attention ─────────────────────────────────────────────── */}
      <section className="mx-card ca-block ca-attention">
        <header className="ca-block-head">
          <div>
            <h2 className="ca-block-title">Needs attention <span className="ca-count">{attention.length}</span></h2>
            <p className="ca-block-sub">
              Killing and watching, worst spend first — all {attention.length} of them, scroll the
              table. The explanation is the rule that fired; verdicts compare the last 3 days
              against the 7 before them.
            </p>
          </div>
        </header>

        {needsMigration && (
          <p className="ca-migrate">
            Decisions are not being recorded yet — run <code>supabase/migration_creative_decisions.sql</code>.
            The buttons stay inert until then.
          </p>
        )}

        {attention.length === 0 ? (
          <p className="ca-none">Nothing is deteriorating. Every creative is either healthy or still learning.</p>
        ) : (
          <div className="ca-wrap">
            <table className="ca-table ca-attn-table">
              <thead>
                <tr>
                  <th className="ca-name">Creative</th>
                  <th>Status</th>
                  <th className="ca-num">Spend</th>
                  <th className="ca-num">Leads</th>
                  <th className="ca-num">CPL</th>
                  <th className="ca-num">Impr.</th>
                  <th className="ca-num">Freq.</th>
                  <th className="ca-num">CPM</th>
                  <th className="ca-num">Link CTR</th>
                  <th className="ca-num">Link CPC</th>
                  <th className="ca-num">7d CPL</th>
                  <th>Why</th>
                  <th>Call</th>
                </tr>
              </thead>
              <tbody>
                {attention.map(a => (
                  <tr key={a.id}
                    className={`ca-row is-tall is-pick${chartId === a.id ? ' is-charted' : ''}`}
                    onClick={() => setChartId(id => id === a.id ? null : a.id)}
                    title="Chart this creative below">
                    <td className="ca-name">
                      <div className="ca-cell-creative">
                        {isAd && <Thumb ad={a} className="is-row" />}
                        <div>
                          <span className="ca-name-text">{rowName(a)}</span>
                          <Tags ad={a} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <Verdict level={a.health.level} why={a.health.why} />
                      {a.health.fatigue && <span className="ca-fatigue" title="Frequency up, CTR down, CPC and CPL up">fatigue</span>}
                    </td>
                    <td className="ca-num">{money(a.spend)}</td>
                    <td className="ca-num">{num(a.leads)}</td>
                    <td className="ca-num-wrap">
                      <BandCellInline value={a.cpl} band={bandDown(a.cpl, BENCH.cpl)} format={v => money(v)} />
                      <Delta v={a.delta.cpl} goodWhen="down" />
                    </td>
                    <td className="ca-num">{num(a.impressions)}</td>
                    <td className="ca-num-wrap">
                      <BandCellInline value={a.frequency} band={bandDown(a.frequency, BENCH.frequency)} format={v => v.toFixed(2)} />
                      <Delta v={a.delta.frequency} goodWhen="down" />
                    </td>
                    <td className="ca-num">{a.cpm != null ? money(a.cpm, { cents: true }) : <span className="mx-dim">—</span>}</td>
                    <td className="ca-num-wrap">
                      <BandCellInline value={a.linkCtr} band={bandUp2(a.linkCtr, BENCH.linkCtr)} format={v => `${v.toFixed(2)}%`} />
                      <Delta v={a.delta.linkCtr} goodWhen="up" />
                    </td>
                    <td className="ca-num-wrap">
                      <BandCellInline value={a.linkCpc} band={bandDown(a.linkCpc, BENCH.linkCpc)} format={v => money(v, { cents: true })} />
                      <Delta v={a.delta.linkCpc} goodWhen="down" />
                    </td>
                    <td className="ca-num"><Sparkline values={adSeries(a, 'cpl')} goodWhen="down" /></td>
                    <td className="ca-insight">{a.health.why}</td>
                    <td>
                      <DecisionButtons ad={a} current={decisions[a.id]?.decision} disabled={needsMigration}
                        onDecide={decide} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Top performers + overview ───────────────────────────────────── */}
      <div className="ca-health-split">
        <section className="mx-card ca-block">
          <header className="ca-block-head">
            <div>
              <h2 className="ca-block-title">Performing well <span className="ca-count">{performers.length}</span></h2>
              <p className="ca-block-sub">Cheapest leads first — all {performers.length}, scroll the table.</p>
            </div>
          </header>
          {performers.length === 0 ? (
            <p className="ca-none">Nothing has cleared the keep threshold in this range.</p>
          ) : (
            <div className="ca-wrap">
              <table className="ca-table">
                <thead>
                  <tr>
                    <th className="ca-name">Creative</th>
                    <th className="ca-num">CPL</th>
                    <th className="ca-num">Hook</th>
                    <th className="ca-num">Link CTR</th>
                    <th className="ca-num">Lead CVR</th>
                    <th className="ca-num">7d leads</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {performers.slice(0, 6).map(a => (
                    <tr key={a.id} className="ca-row is-tall">
                      <td className="ca-name" onClick={() => onOpen(a)}>
                        <div className="ca-cell-creative">
                          {isAd && <Thumb ad={a} className="is-row" />}
                          <div>
                            <span className="ca-name-text">{adCodes(a.name).shortName}</span>
                            <Tags ad={a} />
                          </div>
                        </div>
                      </td>
                      <td className="ca-num-wrap">
                        <BandCellInline value={a.cpl} band={bandDown(a.cpl, BENCH.cpl)} format={v => money(v)} />
                        <Delta v={a.delta.cpl} goodWhen="down" />
                      </td>
                      <td className="ca-num">{a.hookRate != null ? `${a.hookRate.toFixed(0)}%` : <span className="mx-dim">—</span>}</td>
                      <td className="ca-num">{a.linkCtr != null ? `${a.linkCtr.toFixed(2)}%` : <span className="mx-dim">—</span>}</td>
                      <td className="ca-num">{a.clickToLead != null ? `${a.clickToLead.toFixed(1)}%` : <span className="mx-dim">—</span>}</td>
                      <td className="ca-num"><Sparkline values={adSeries(a, 'leads')} goodWhen="up" /></td>
                      <td>
                        <button className="mx-btn ca-btn-sm"
                          onClick={e => { e.stopPropagation(); onVariations(a) }}>Create variations</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <PerformanceOverview days={days} ad={charted} onOpen={onOpen} level={level} />
      </div>

      <ProTip ads={ads} />

      <Legend rows={[
        ['Frequency', `under ${BENCH.frequency.healthy}`, `${BENCH.frequency.healthy}–${BENCH.frequency.watch}`, `${BENCH.frequency.watch}+ with decline`],
        ['Link CTR', `over ${BENCH.linkCtr.healthy}%`, `${BENCH.linkCtr.watch}–${BENCH.linkCtr.healthy}%`, `under ${BENCH.linkCtr.watch}%`],
        ['Link CPC', `under ${money(BENCH.linkCpc.healthy)}`, `${money(BENCH.linkCpc.healthy)}–${money(BENCH.linkCpc.watch)}`, `over ${money(BENCH.linkCpc.watch)}`],
        ['CPL', `under ${money(BENCH.cpl.healthy)}`, `${money(BENCH.cpl.healthy)}–${money(BENCH.cpl.watch)}`, `over ${money(BENCH.cpl.watch)}`],
      ]} heads={['Metric', 'Healthy', 'Watch', 'Problem']} />
    </>
  )
}

/* ── Keep / Watch / Kill ────────────────────────────────────────────────── */

function DecisionButtons({ ad, current, disabled, onDecide }: {
  ad: Ad; current?: string; disabled?: boolean
  onDecide: (a: Ad, d: 'keep' | 'watch' | 'kill') => void
}) {
  return (
    <div className="ca-decide" title={disabled ? 'Run the decisions migration to enable' : 'Records the call — it does not pause the ad in Meta'}>
      {(['keep', 'watch', 'kill'] as const).map(d => (
        <button key={d} disabled={disabled}
          className={`ca-decide-btn is-${d}${current === d ? ' is-on' : ''}`}
          onClick={e => { e.stopPropagation(); onDecide(ad, d) }}>
          {d}
        </button>
      ))}
    </div>
  )
}

/* ── Correlation chart ──────────────────────────────────────────────────────
   Every metric on one canvas so the fatigue pattern is visible as a shape
   rather than inferred across four separate charts: frequency climbing while
   CTR falls and CPC and CPL rise is the signature the verdicts look for, and
   it only reads as a pattern when the lines share an axis.

   They cannot share a *value* axis — dollars, percentages and a ratio have no
   common scale — so each series is normalised to its own range across the
   window and the true numbers are read off the crosshair. The caption says so
   plainly; a reader who thinks the y-axis is dollars would draw wrong
   conclusions from it.                                                      */

const SERIES = [
  { key: 'cpl',      label: 'CPL',      fmt: (v: number) => money(v),               goodWhen: 'down' as const },
  { key: 'linkCpc',  label: 'Link CPC', fmt: (v: number) => money(v, { cents: true }), goodWhen: 'down' as const },
  { key: 'hookRate', label: 'Hook rate',fmt: (v: number) => `${v.toFixed(0)}%`,      goodWhen: 'up'   as const },
  { key: 'linkCtr',  label: 'Link CTR', fmt: (v: number) => `${v.toFixed(2)}%`,     goodWhen: 'up'   as const },
  { key: 'leadCvr',  label: 'Lead CVR', fmt: (v: number) => `${v.toFixed(1)}%`,     goodWhen: 'up'   as const },
  { key: 'frequency',label: 'Frequency',fmt: (v: number) => v.toFixed(2),           goodWhen: 'down' as const },
  { key: 'spend',    label: 'Spend',    fmt: (v: number) => money(v),               goodWhen: 'up'   as const },
] as const

type SeriesKey = typeof SERIES[number]['key']

const DEFAULT_ON: SeriesKey[] = ['cpl', 'hookRate', 'linkCtr', 'frequency']

interface Point {
  date: string
  cpl: number | null; linkCpc: number | null; hookRate: number | null
  linkCtr: number | null; leadCvr: number | null
  frequency: number | null; spend: number | null
}

/** Daily points for one creative, or for the account when nothing is picked. */
function pointsFor(ad: Ad | null, days: DayRow[]): Point[] {
  if (ad) {
    return (ad.daily || []).map((d: any) => {
      const clicks = d.linkCtr != null && d.impressions ? (d.linkCtr / 100) * d.impressions : 0
      return {
        date: d.date,
        cpl: d.cpl ?? null,
        linkCpc: d.linkCpc ?? null,
        hookRate: d.hookRate ?? null,
        linkCtr: d.linkCtr ?? null,
        leadCvr: clicks > 0 ? ((d.leads || 0) / clicks) * 100 : null,
        frequency: d.frequency ?? null,
        spend: d.spend ?? null,
      }
    })
  }
  return days.map(d => ({
    date: d.date,
    cpl: d.leads > 0 ? d.spend / d.leads : null,
    linkCpc: d.linkClicks > 0 ? d.spend / d.linkClicks : null,
    /* Hook rate is 3-second views over impressions. Summed across a mix of
       video and static creative the denominator includes ads that can never
       contribute a play, so the account-level number would understate every
       video — it is offered per creative only. */
    hookRate: null,
    linkCtr: d.impressions > 0 ? (d.linkClicks / d.impressions) * 100 : null,
    leadCvr: d.linkClicks > 0 ? (d.leads / d.linkClicks) * 100 : null,
    // Frequency cannot be summed across ads — impressions/reach de-duplicates
    // per ad, so there is no honest account-level daily frequency here.
    frequency: null,
    spend: d.spend,
  }))
}

/** Pearson r over the days where both series have a value. */
function correlate(pts: Point[], a: SeriesKey, b: SeriesKey): number | null {
  const pairs = pts
    .map(p => [p[a], p[b]] as [number | null, number | null])
    .filter((x): x is [number, number] => x[0] != null && x[1] != null && isFinite(x[0]) && isFinite(x[1]))
  if (pairs.length < 4) return null

  const n = pairs.length
  const mx = pairs.reduce((s, [x]) => s + x, 0) / n
  const my = pairs.reduce((s, [, y]) => s + y, 0) / n
  let num = 0, dx = 0, dy = 0
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my)
    dx  += (x - mx) ** 2
    dy  += (y - my) ** 2
  }
  const den = Math.sqrt(dx * dy)
  return den === 0 ? null : num / den
}

function strength(r: number) {
  const a = Math.abs(r)
  return a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : 'weak'
}

function PerformanceOverview({ days, ad, onOpen, level }: {
  days: DayRow[]; ad: Ad | null; onOpen?: (a: Ad) => void; level: Level
}) {
  const [on, setOn] = useState<SeriesKey[]>(DEFAULT_ON)
  const [hover, setHover] = useState<number | null>(null)

  /* Lifetime history for the picked row, fetched on demand. The table's own
     series is a fixed 14 days — the window the verdicts compare — which is
     too short to read a fatigue curve or to trust a correlation against. */
  const [life, setLife] = useState<{ id: string; days: any[]; launchedAt: string | null } | null>(null)
  const [loadingLife, setLoadingLife] = useState(false)

  useEffect(() => {
    if (!ad) { setLife(null); return }
    let cancelled = false
    setLoadingLife(true)
    fetch(`/api/creative/series?id=${ad.id}&level=${level}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setLife({ id: ad.id, days: d.days || [], launchedAt: d.launchedAt ?? null })
        setLoadingLife(false)
      })
      .catch(() => { if (!cancelled) setLoadingLife(false) })
    return () => { cancelled = true }
  }, [ad, level])

  const pts = useMemo(() => {
    const full = ad && life && life.id === ad.id && life.days.length ? life.days : null
    if (full) {
      return full.map((d: any) => ({
        date: d.date,
        cpl: d.cpl ?? null,
        linkCpc: d.linkCpc ?? null,
        hookRate: d.hookRate ?? null,
        linkCtr: d.linkCtr ?? null,
        leadCvr: d.leadCvr ?? null,
        frequency: d.frequency ?? null,
        spend: d.spend ?? null,
      })) as Point[]
    }
    return pointsFor(ad, days)
  }, [ad, life, days])

  /* A series is offered only where it has data — account level has no honest
     daily frequency, and a static image has no CPC worth plotting. */
  const available = useMemo(
    () => SERIES.filter(sr => pts.filter(p => p[sr.key] != null).length >= 2),
    [pts])

  const active = on.filter(k => available.some(a => a.key === k))

  /* The viewBox is sized near the real render width and scaled with `meet`,
     not `none`: stretching the canvas to fit would distort the tick text and
     turn the crosshair dots into ellipses. Side padding leaves room for the
     first and last date labels to sit under their points without clipping. */
  const W = 900, H = 250, L = 26, R = 26, T = 12, B = 26

  const ranges = useMemo(() => {
    const out: Partial<Record<SeriesKey, { min: number; max: number }>> = {}
    for (const sr of SERIES) {
      const vals = pts.map(p => p[sr.key]).filter((v): v is number => v != null && isFinite(v))
      if (vals.length) out[sr.key] = { min: Math.min(...vals), max: Math.max(...vals) }
    }
    return out
  }, [pts])

  if (pts.length < 2) {
    return (
      <section className="mx-card ca-block">
        <h2 className="ca-block-title">Performance overview</h2>
        <p className="ca-none">Not enough days with delivery to draw a trend.</p>
      </section>
    )
  }

  const xs = (i: number) => L + (i / (pts.length - 1)) * (W - L - R)
  /* Normalised: each line spans the plot height across its own range, so the
     shapes are comparable even though the units are not. */
  const ys = (k: SeriesKey, v: number) => {
    const r = ranges[k]
    if (!r) return H - B
    const span = r.max - r.min || 1
    return H - B - ((v - r.min) / span) * (H - B - T)
  }

  /* Gaps break the line rather than bridging it. A creative with no leads on
     a day has no CPL — drawing straight through would invent a value on the
     exact days the reader is trying to explain. Every real point gets a dot
     so an isolated day is still visible. */
  const pathFor = (k: SeriesKey) => {
    let d = ''
    let pen = false
    pts.forEach((p, i) => {
      const v = p[k]
      if (v == null || !isFinite(v)) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(k, v).toFixed(1)} `
      pen = true
    })
    return d
  }

  const dotsFor = (k: SeriesKey) =>
    pts.map((p, i) => ({ i, v: p[k] }))
       .filter((x): x is { i: number; v: number } => x.v != null && isFinite(x.v))

  /* Pairwise correlation across whatever is switched on. Reported, never acted
     on: fourteen points is enough to notice a relationship and nowhere near
     enough to prove one. */
  const pairs = useMemo(() => {
    const out: { a: SeriesKey; b: SeriesKey; r: number }[] = []
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const r = correlate(pts, active[i], active[j])
        if (r != null) out.push({ a: active[i], b: active[j], r })
      }
    }
    return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r))
  }, [pts, active])

  const labelOf = (k: SeriesKey) => SERIES.find(s => s.key === k)!.label
  const idx = hover != null ? Math.max(0, Math.min(pts.length - 1, hover)) : null

  return (
    <section className="mx-card ca-block">
      <header className="ca-block-head">
        <div>
          <h2 className="ca-block-title">Performance overview</h2>
          <p className="ca-block-sub">
            {ad
              ? <>
                  <strong>{rowName(ad)}</strong>
                  {life?.launchedAt
                    ? <> · every day since it launched {fmtDay(life.launchedAt)} ({pts.length} days)</>
                    : loadingLife ? <> · loading full history…</> : <> · last {pts.length} days</>}
                  {' — pick another row to swap it.'}
                </>
              : <>Account totals by day. Click any row above to chart that creative since launch.</>}
          </p>
        </div>
        {ad && onOpen && (
          <button className="mx-btn ca-btn-sm" onClick={() => onOpen(ad)}>Day by day →</button>
        )}
      </header>

      <div className="ca-legend-row">
        {available.map(sr => {
          const isOn = active.includes(sr.key)
          const r = ranges[sr.key]
          return (
            <button key={sr.key}
              className={`ca-skey is-${sr.key}${isOn ? ' is-on' : ''}`}
              title={r ? `${sr.fmt(r.min)} – ${sr.fmt(r.max)} over this window` : undefined}
              onClick={() => setOn(o => o.includes(sr.key) ? o.filter(k => k !== sr.key) : [...o, sr.key])}>
              <span className="ca-skey-dot" />
              {sr.label}
              {idx != null && pts[idx][sr.key] != null && (
                <span className="ca-skey-v">{sr.fmt(pts[idx][sr.key] as number)}</span>
              )}
            </button>
          )
        })}
      </div>

      <svg className="ca-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        role="img" aria-label="Daily metrics, each normalised to its own range"
        onMouseMove={e => {
          const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const rel = ((e.clientX - box.left) / box.width) * W
          setHover(Math.round(((rel - L) / (W - L - R)) * (pts.length - 1)))
        }}
        onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map(t => (
          <line key={t} className="ca-chart-grid" x1={L} x2={W - R}
            y1={T + t * (H - B - T)} y2={T + t * (H - B - T)} />
        ))}

        {idx != null && (
          <line className="ca-chart-cross" x1={xs(idx)} x2={xs(idx)} y1={T} y2={H - B} />
        )}

        {active.map(k => (
          <g key={k} className={`ca-sline is-${k}`}>
            <path d={pathFor(k)} fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            {dotsFor(k).map(({ i, v }) => (
              <circle key={i} className="ca-sdot" cx={xs(i)} cy={ys(k, v)} r="1.9" />
            ))}
            {idx != null && pts[idx][k] != null && (
              <circle cx={xs(idx)} cy={ys(k, pts[idx][k] as number)} r="3.4" />
            )}
          </g>
        ))}

        {pts.map((p, i) =>
          i % Math.ceil(pts.length / 7) === 0 || i === pts.length - 1
            ? <text key={p.date} className="ca-chart-tick" x={xs(i)} y={H - 7} textAnchor="middle">{p.date.slice(5)}</text>
            : null)}
      </svg>

      <p className="ca-chart-note">
        {idx != null
          ? <strong>{pts[idx].date}</strong>
          : <>Each line is scaled to its own high and low across these {pts.length} days — the shapes
             are comparable, the heights are not. Gaps are days the metric had no value.
             Hover for the real numbers.</>}
      </p>

      {pairs.length > 0 && (
        <div className="ca-corr">
          <p className="mx-eyebrow">How they move together</p>
          {pairs.slice(0, 4).map(({ a, b, r }) => (
            <div className="ca-corr-row" key={`${a}-${b}`}>
              <span className="ca-corr-p">{labelOf(a)} &amp; {labelOf(b)}</span>
              <span className="ca-corr-bar">
                <span className={`ca-corr-fill ${r < 0 ? 'is-neg' : 'is-pos'}`}
                  style={{ width: `${Math.abs(r) * 100}%` }} />
              </span>
              <span className={`ca-corr-r ${Math.abs(r) >= 0.7 ? 'is-strong' : ''}`}>
                {r > 0 ? '+' : '−'}{Math.abs(r).toFixed(2)}
              </span>
              <span className="ca-corr-w">
                {strength(r)} {r < 0 ? 'inverse' : 'together'}
              </span>
            </div>
          ))}
          <p className="ca-corr-note">
            Pearson r over {pts.length} days. A relationship here is worth looking at, not acting on —
            {pts.length} days cannot separate cause from a shared third driver.
          </p>
        </div>
      )}
    </section>
  )
}

/* ── Pro tip ────────────────────────────────────────────────────────────────
   The one in the brief was a fixed sentence. A fixed sentence about this
   account's own thresholds is either luck or a lie, so it is measured
   instead: split the creatives on the benchmark and compare median CPL.    */

function ProTip({ ads }: { ads: Ad[] }) {
  const tip = useMemo(() => {
    const scored = ads.filter(a => a.cpl != null && a.hookRate != null && a.linkCtr != null)
    if (scored.length < 8) return null

    const strong = scored.filter(a => a.hookRate! >= BENCH.hookRate.good && a.linkCtr! >= BENCH.ctrCreative.good)
    const rest   = scored.filter(a => !(a.hookRate! >= BENCH.hookRate.good && a.linkCtr! >= BENCH.ctrCreative.good))
    if (strong.length < 2 || rest.length < 2) return null

    const med = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b)
      const m = Math.floor(s.length / 2)
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
    }
    const a = med(strong.map(x => x.cpl!))
    const b = med(rest.map(x => x.cpl!))
    if (!a || !b) return null

    return {
      strongN: strong.length, restN: rest.length,
      strongCpl: a, restCpl: b,
      ratio: b / a,
    }
  }, [ads])

  if (!tip) return null

  return (
    <section className="ca-protip">
      <span className="ca-protip-k">From this account</span>
      <p>
        The {tip.strongN} creatives clearing both benchmarks — hook rate over {BENCH.hookRate.good}% and
        link CTR over {BENCH.ctrCreative.good}% — run at a median {money(tip.strongCpl)} CPL.
        The other {tip.restN} run at {money(tip.restCpl)}.
        {tip.ratio >= 1.15
          ? <> That is <strong>{tip.ratio.toFixed(1)}× cheaper</strong>, which is the case for briefing against those two numbers.</>
          : <> The gap is small here, so the two benchmarks are not currently separating winners from losers on cost.</>}
      </p>
    </section>
  )
}

function BandCellInline({ value, band, format }: { value: number | null; band: Band; format: (v: number) => string }) {
  if (value == null) return <span className="mx-dim">—</span>
  return <span className={`ca-val is-${band ?? 'none'}`}>{format(value)}</span>
}

/* ── Winners — shared derivation ────────────────────────────────────────────
   Both the Creative Analysis and Winner Analysis views rank the same way:
   lead volume first, cost per lead as the tiebreaker. Volume alone promotes
   whatever got the most budget; efficiency alone promotes a creative with one
   cheap lead. Ordering by one and breaking ties with the other is the closest
   honest reading of "what is actually working".                             */

function rankWinners(ads: Ad[]): Ad[] {
  return [...ads]
    .filter(a => a.leads > 0)
    .sort((a, b) =>
      b.leads !== a.leads
        ? b.leads - a.leads
        : (a.cpl ?? Infinity) - (b.cpl ?? Infinity))
}

/** Account-wide comparison points. Medians, not means — one runaway ad should
    not move the line every other creative is judged against. */
function medianOf(ads: Ad[], key: keyof Ad): number | null {
  const vals = ads.map(a => a[key] as number).filter(v => typeof v === 'number' && isFinite(v)).sort((x, y) => x - y)
  if (!vals.length) return null
  const mid = Math.floor(vals.length / 2)
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
}

interface Medians { cpl: number | null; hookRate: number | null; linkCtr: number | null; clickToLead: number | null }

function mediansOf(ads: Ad[]): Medians {
  return {
    cpl:         medianOf(ads, 'cpl'),
    hookRate:    medianOf(ads, 'hookRate'),
    linkCtr:     medianOf(ads, 'linkCtr'),
    clickToLead: medianOf(ads, 'clickToLead'),
  }
}

/** Account CPL for the last 3 days against the 7 before them — the same
    window the per-ad verdicts use, so the headline agrees with the rows. */
function accountCplTrend(ads: Ad[]): { cpl: number | null; delta: number | null } {
  const byDate: Record<string, { spend: number; leads: number }> = {}
  for (const a of ads) {
    for (const d of a.daily || []) {
      const slot = (byDate[d.date] ??= { spend: 0, leads: 0 })
      slot.spend += d.spend || 0
      slot.leads += d.leads || 0
    }
  }
  const dates = Object.keys(byDate).sort()
  const cplOf = (ds: string[]) => {
    const spend = ds.reduce((s, d) => s + byDate[d].spend, 0)
    const leads = ds.reduce((s, d) => s + byDate[d].leads, 0)
    return leads > 0 ? spend / leads : null
  }
  const recent = cplOf(dates.slice(-3))
  const base   = cplOf(dates.slice(-10, -3))
  return {
    cpl: recent,
    delta: recent != null && base != null && base > 0 ? ((recent - base) / base) * 100 : null,
  }
}

/* ── Small pieces ───────────────────────────────────────────────────────── */

function Thumb({ ad, className = '' }: { ad: Ad; className?: string }) {
  const [failed, setFailed] = useState(false)
  /* Served through our own route rather than Meta's URL directly: half the
     creatives answer with a cross-origin 302 that an <img> will not follow.
     See app/api/creative/thumb. */
  const src = ad.hasThumb ? `/api/creative/thumb?id=${ad.id}` : null
  if (!src || failed) {
    return (
      <div className={`ca-thumb is-empty ${className}`} aria-hidden="true">
        <span>{(ad.name || '?').replace(/^\d+\s*\|\s*/, '').slice(0, 2).toUpperCase()}</span>
      </div>
    )
  }
  return (
    <div className={`ca-thumb ${className}`}>
      {/* Meta's CDN is not in next.config images — a plain img keeps it simple
          and these are already 400px stills. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      {ad.isVideo && <span className="ca-thumb-play" aria-hidden="true">▶</span>}
    </div>
  )
}

/** Firm, format and hook codes — everything after the ad's own identity.
    Ad set and campaign names are not built to the same convention, so their
    whole name is the identity and there is nothing left to tag. */
function Tags({ ad }: { ad: Ad }) {
  if (ad.level && ad.level !== 'ad') return null
  const { tags } = adCodes(ad.name)
  if (!tags.length) return null
  return <p className="ca-tags">{tags.join(' | ')}</p>
}

/** What to print as the row's name at this level. */
function rowName(ad: Ad) {
  return ad.level && ad.level !== 'ad' ? ad.name : adCodes(ad.name).shortName
}

function Stat({ label, value, delta, goodWhen, sub }: {
  label: string; value: string; delta?: number | null; goodWhen?: 'up' | 'down'; sub?: string
}) {
  return (
    <div className="ca-stat">
      <span className="ca-stat-l">{label}</span>
      <span className="ca-stat-v">{value}</span>
      {delta != null && goodWhen && <Delta v={delta} goodWhen={goodWhen} />}
      {sub && <span className="ca-stat-sub">{sub}</span>}
    </div>
  )
}

/** "1.7× the account median" — the comparison the mock shows as "vs account avg". */
function vsMedian(v: number | null, median: number | null, goodWhen: 'up' | 'down'): string | undefined {
  if (v == null || median == null || median === 0) return undefined
  const ratio = v / median
  if (ratio > 0.95 && ratio < 1.05) return 'at account median'
  const better = goodWhen === 'up' ? ratio > 1 : ratio < 1
  const mult = ratio > 1 ? ratio : 1 / ratio
  return `${mult.toFixed(1)}× ${better ? 'better than' : 'worse than'} median`
}

/* ── View 2 — Creative analysis ─────────────────────────────────────────── */

function CreativeView({ ads, onOpen, selectedId, onSelect, level }: {
  ads: Ad[]; onOpen: (a: Ad) => void; level: Level
  selectedId: string | null; onSelect: (id: string) => void
}) {
  const isAd = level === 'ad'
  const [showAll, setShowAll] = useState(false)
  const winners = useMemo(() => rankWinners(ads), [ads])
  const medians = useMemo(() => mediansOf(ads), [ads])
  const trend   = useMemo(() => accountCplTrend(ads), [ads])
  const top = winners.slice(0, 3)
  const selected = useMemo(
    () => winners.find(a => a.id === selectedId) ?? top[0] ?? null,
    [winners, selectedId, top])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of ads) c[a.creative.action] = (c[a.creative.action] || 0) + 1
    return c
  }, [ads])

  const improve = (counts.improve_body || 0) + (counts.new_hook || 0) + (counts.fatigue || 0)
  const selIdx = selected ? winners.findIndex(a => a.id === selected.id) : -1
  const step = (by: number) => {
    const next = winners[selIdx + by]
    if (next) onSelect(next.id)
  }

  return (
    <>
      <div className="ca-kpis">
        <div className="ca-kpi">
          <span className="ca-kpi-n is-good">{counts.double_down || 0}</span>
          <span className="ca-kpi-t">Double down candidates</span>
          <span className="ca-kpi-s">Performing on every axis — ready to scale</span>
        </div>
        <div className="ca-kpi">
          <span className="ca-kpi-n is-warn">{improve}</span>
          <span className="ca-kpi-t">Improve</span>
          <span className="ca-kpi-s">One stage of the funnel is losing people</span>
        </div>
        <div className="ca-kpi">
          <span className="ca-kpi-n">{counts.new_concept || 0}</span>
          <span className="ca-kpi-t">New concepts needed</span>
          <span className="ca-kpi-s">Nothing in the current cut is worth keeping</span>
        </div>
        <div className="ca-kpi">
          <span className="ca-kpi-n">{trend.cpl != null ? money(trend.cpl) : '—'}</span>
          <span className="ca-kpi-t">Account CPL · last 3 days</span>
          <span className="ca-kpi-s">
            {trend.delta != null
              ? <>vs the 7 days before <Delta v={trend.delta} goodWhen="down" /></>
              : 'No prior week to compare against'}
          </span>
        </div>
      </div>

      <div className="ca-split">
        <div className="ca-split-main">
          <section className="mx-card ca-block">
            <header className="ca-block-head">
              <div>
                <h2 className="ca-block-title">Top performers</h2>
                <p className="ca-block-sub">By lead volume, then cost per lead. Click a creative to load it on the right.</p>
              </div>
              <button className="mx-btn" onClick={() => setShowAll(s => !s)}>
                {showAll ? 'Hide full table' : `View all ${winners.length}`}
              </button>
            </header>

            {top.length === 0 ? (
              <p className="ca-none">No creative produced a lead in this range.</p>
            ) : (
              <div className="ca-winners">
                {top.map((a, i) => (
                  <WinnerCard key={a.id} ad={a} rank={i + 1} medians={medians}
                    isSelected={selected?.id === a.id}
                    onSelect={() => onSelect(a.id)} />
                ))}
              </div>
            )}
          </section>

          {selected && <FunnelBlock ad={selected} />}

          <PatternsBlock winners={winners} level={level} />
        </div>

        <aside className="ca-rail">
          {selected
            ? <SelectedCreative ad={selected} medians={medians}
                onPrev={selIdx > 0 ? () => step(-1) : undefined}
                onNext={selIdx >= 0 && selIdx < winners.length - 1 ? () => step(1) : undefined}
                onOpen={() => onOpen(selected)} />
            : <div className="mx-card ca-block"><p className="ca-none">Nothing to analyse yet.</p></div>}
        </aside>
      </div>

      {showAll && <AllCreativesTable ads={ads} onOpen={onOpen} />}
    </>
  )
}

/* ── Winner card ────────────────────────────────────────────────────────── */

function WinnerCard({ ad, rank, medians, isSelected, onSelect }: {
  ad: Ad; rank: number; medians: Medians; isSelected: boolean; onSelect: () => void
}) {
  const codes = adCodes(ad.name)
  const plays = ad.videoPlays || 0

  /* What the card claims is "winning" is only ever something measured or
     something the name declares. No inferred taste. */
  const elements: string[] = []
  /* At ad-set and campaign level there is no single hook or format to name —
     the group spans many. Only the measured facts carry over. */
  const named = ad.level === 'ad'
  /* Only hooks the table actually names. An uncatalogued code like "D10" is
     an identifier, not a description — listing it as a winning element says
     nothing to whoever briefs the next version. */
  if (named && codes.verbalKnown) elements.push(`Verbal hook — ${codes.verbalLabel}`)
  if (named && codes.visualKnown) elements.push(`Visual hook — ${codes.visualLabel}`)
  if (named && codes.formatLabel) elements.push(`Format — ${codes.formatLabel}`)
  if (ad.hookRate != null && medians.hookRate && ad.hookRate > medians.hookRate)
    elements.push(`Opening stops ${ad.hookRate.toFixed(0)}% — above the ${medians.hookRate.toFixed(0)}% median`)
  if (plays > 0 && ad.p100 / plays > 0.2)
    elements.push(`${Math.round((ad.p100 / plays) * 100)}% watch it to the end`)
  if (ad.clickToLead != null && medians.clickToLead && ad.clickToLead > medians.clickToLead)
    elements.push(`${ad.clickToLead.toFixed(1)}% of clicks convert`)

  return (
    <article className={`ca-winner${isSelected ? ' is-on' : ''}`}>
      <button className="ca-winner-hit" onClick={onSelect} aria-label={`Select ${ad.name}`}>
        <span className="ca-rank">#{rank}</span>
        {/* Ad sets and campaigns have no single creative to show — a stand-in
            still would misrepresent a group of assets as one. */}
        {ad.level === 'ad' ? <Thumb ad={ad} /> : <span className="ca-winner-nohead" />}
      </button>

      <div className="ca-winner-body">
        <p className="ca-winner-name" title={ad.name}>{rowName(ad)}</p>
        <div className="ca-winner-verdict">
          <span className={`ca-action-pill is-${ad.creative.action}`}>{ad.creative.label}</span>
        </div>
        <Tags ad={ad} />

        <div className="ca-winner-stats">
          <Stat label="Hook" value={ad.hookRate != null ? `${ad.hookRate.toFixed(0)}%` : '—'} />
          <Stat label="Link CTR" value={ad.linkCtr != null ? `${ad.linkCtr.toFixed(2)}%` : '—'} delta={ad.delta.linkCtr} goodWhen="up" />
          <Stat label="Lead CVR" value={ad.clickToLead != null ? `${ad.clickToLead.toFixed(1)}%` : '—'} />
          <Stat label="CPL" value={ad.cpl != null ? money(ad.cpl) : '—'} delta={ad.delta.cpl} goodWhen="down" />
        </div>

        {elements.length > 0 && (
          <>
            <p className="ca-winner-h">{named ? 'What it is made of' : 'What the numbers show'}</p>
            <ul className="ca-elements">
              {elements.slice(0, 4).map(e => <li key={e}>{e}</li>)}
            </ul>
          </>
        )}
      </div>
    </article>
  )
}

/* ── Performance funnel ─────────────────────────────────────────────────── */

function FunnelBlock({ ad }: { ad: Ad }) {
  const plays = ad.videoPlays || 0
  const impressions = ad.impressions || 0

  /* Impressions is the only honest base for the whole funnel: quartiles are a
     share of plays, so a curve drawn off plays alone hides how many people
     never started the video at all. */
  const steps = [
    { label: 'Impressions', v: impressions },
    ...(plays > 0 ? [
      { label: 'Video plays', v: plays },
      { label: '25% view',    v: ad.p25 },
      { label: '50% view',    v: ad.p50 },
      { label: '75% view',    v: ad.p75 },
      { label: 'Completed',   v: ad.p100 },
    ] : []),
    { label: 'Link clicks', v: ad.linkClicks || 0 },
    { label: 'Leads',       v: ad.leads || 0 },
  ].filter(s => s.v != null)

  const base = impressions || steps[0]?.v || 1

  return (
    <section className="mx-card ca-block">
      <header className="ca-block-head">
        <div>
          <h2 className="ca-block-title">Performance funnel</h2>
          <p className="ca-block-sub">{rowName(ad)} — where the audience drops off.</p>
        </div>
      </header>

      <div className="ca-funnel">
        {steps.map((s, i) => {
          const share = base > 0 ? (s.v / base) * 100 : 0
          const prev  = i > 0 ? steps[i - 1].v : null
          const keep  = prev && prev > 0 ? (s.v / prev) * 100 : null
          return (
            <div className="ca-fstep" key={s.label}>
              <span className="ca-fstep-l">{s.label}</span>
              {/* Horizontal, because the ratios here span three orders of
                  magnitude — as columns the last four steps are all the same
                  stub and the shape of the drop-off is unreadable. */}
              <div className="ca-fbar">
                <span style={{ width: `${Math.max(share, 0.4)}%` }} />
              </div>
              <span className="ca-fstep-n">{num(s.v)}</span>
              <span className="ca-fstep-p">
                {share >= 1 ? `${share.toFixed(0)}%` : `${share.toFixed(2)}%`}
                {keep != null && i > 0 && <em> · {keep.toFixed(0)}% kept</em>}
              </span>
            </div>
          )
        })}
      </div>

      <p className="ca-footnote" style={{ marginTop: 10 }}>
        Percentages are of impressions; <em>kept</em> is the share carried from the previous step.
        Bar length is the true share — the cliff after video plays is real, not a scaling artefact.
      </p>

      {plays === 0 && (
        <p className="ca-footnote" style={{ marginTop: 6 }}>
          No video engagement on this creative — it is a static image, so the funnel runs
          straight from impressions to clicks.
        </p>
      )}
    </section>
  )
}

/* ── What is working across winners ─────────────────────────────────────── */

function PatternsBlock({ winners, level }: { winners: Ad[]; level: Level }) {
  /* Formats and hooks are parsed out of ad names. Ad sets and campaigns do
     not carry them, so the block is omitted rather than shown empty. */
  if (level !== 'ad') return null
  const top = winners.slice(0, 15)

  const tally = (pick: (c: ReturnType<typeof adCodes>) => string | null) => {
    const counts: Record<string, { n: number; leads: number; spend: number }> = {}
    for (const a of top) {
      const key = pick(adCodes(a.name))
      if (!key) continue
      const row = (counts[key] ??= { n: 0, leads: 0, spend: 0 })
      row.n++; row.leads += a.leads || 0; row.spend += a.spend || 0
    }
    const total = Object.values(counts).reduce((s, r) => s + r.n, 0)
    return Object.entries(counts)
      .map(([label, r]) => ({
        label,
        share: total > 0 ? (r.n / total) * 100 : 0,
        n: r.n,
        cpl: r.leads > 0 ? r.spend / r.leads : null,
      }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 4)
  }

  const formats = tally(c => c.formatLabel)
  const visuals = tally(c => c.visualLabel)
  const verbals = tally(c => c.verbalLabel)

  if (!formats.length && !visuals.length && !verbals.length) return null

  return (
    <section className="mx-card ca-block">
      <header className="ca-block-head">
        <div>
          <h2 className="ca-block-title">What is working across winners</h2>
          <p className="ca-block-sub">
            Shared traits of the top {top.length} creatives by leads. Share is of those {top.length},
            not of spend — it says what the winners have in common, not what the account runs most.
          </p>
        </div>
      </header>

      <div className="ca-patterns">
        <PatternList title="Formats"      rows={formats} />
        <PatternList title="Visual hooks" rows={visuals} />
        <PatternList title="Verbal hooks" rows={verbals} />
      </div>
    </section>
  )
}

function PatternList({ title, rows }: {
  title: string; rows: { label: string; share: number; n: number; cpl: number | null }[]
}) {
  return (
    <div className="ca-pattern">
      <p className="mx-eyebrow">{title}</p>
      {rows.length === 0 ? <p className="ca-none">Not coded in the ad names.</p> : rows.map(r => (
        <div className="ca-prow" key={r.label} title={`${r.n} of the top creatives${r.cpl ? ` · ${money(r.cpl)} CPL` : ''}`}>
          <span className="ca-prow-l">{r.label}</span>
          <span className="ca-prow-bar"><span style={{ width: `${r.share}%` }} /></span>
          <span className="ca-prow-n">{r.share.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}

/* ── Selected creative rail ─────────────────────────────────────────────── */

function SelectedCreative({ ad, medians, onPrev, onNext, onOpen }: {
  ad: Ad; medians: Medians
  onPrev?: () => void; onNext?: () => void; onOpen: () => void
}) {
  const [tab, setTab] = useState<'perf' | 'ai' | 'brief'>('perf')
  const codes = adCodes(ad.name)

  /* The brief is fetched once per creative and kept, so flipping between tabs
     or stepping back to an earlier winner does not re-bill the model. */
  const [briefs, setBriefs] = useState<Record<string, any>>({})
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const brief = briefs[ad.id]

  async function diagnose() {
    setState('loading'); setMsg('')
    try {
      const res = await fetch('/api/creative/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad, account: medians }),
      })
      const d = await res.json()
      if (d.error) { setMsg(d.error); setState('error'); return }
      setBriefs(b => ({ ...b, [ad.id]: d }))
      setState('idle')
    } catch (e) {
      setMsg(String(e)); setState('error')
    }
  }

  return (
    <div className="mx-card ca-block ca-selected">
      <header className="ca-block-head">
        <h2 className="ca-block-title">Selected creative</h2>
        <div className="ca-step">
          <button className="mx-icon-btn" onClick={onPrev} disabled={!onPrev} aria-label="Previous creative">‹</button>
          <button className="mx-icon-btn" onClick={onNext} disabled={!onNext} aria-label="Next creative">›</button>
        </div>
      </header>

      <div className="ca-sel-head">
        {ad.level === 'ad' && <Thumb ad={ad} className="is-lg" />}
        <div>
          <p className="ca-winner-name" title={ad.name}>{rowName(ad)}</p>
          <span className={`ca-action-pill is-${ad.creative.action}`}>{ad.creative.label}</span>
          <Tags ad={ad} />
          <div className="ca-chips">
            <span className="ca-chip">
              {ad.level === 'adset' ? 'Ad set' : ad.level === 'campaign' ? 'Campaign'
                : ad.isVideo ? 'Video' : 'Static'}
            </span>
            {ad.level === 'ad' && codes.formatLabel && <span className="ca-chip">{codes.formatLabel}</span>}
            {ad.firm !== '—' && <span className="ca-chip">{ad.firm}</span>}
            <span className="ca-chip">{money(ad.spend)} spent</span>
          </div>
        </div>
      </div>

      <div className="ca-subtabs" role="tablist">
        {(ad.level === 'ad'
          ? [['perf', 'Performance'], ['ai', 'AI diagnosis'], ['brief', 'Creative brief']] as const
          : [['perf', 'Performance']] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-pressed={tab === k}
            className={`ca-subtab${tab === k ? ' is-on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'perf' && (
        <>
          <div className="ca-sel-stats">
            <Stat label="Hook rate" value={ad.hookRate != null ? `${ad.hookRate.toFixed(0)}%` : '—'}
              sub={vsMedian(ad.hookRate, medians.hookRate, 'up')} />
            <Stat label="Link CTR" value={ad.linkCtr != null ? `${ad.linkCtr.toFixed(2)}%` : '—'}
              sub={vsMedian(ad.linkCtr, medians.linkCtr, 'up')} />
            <Stat label="Lead CVR" value={ad.clickToLead != null ? `${ad.clickToLead.toFixed(1)}%` : '—'}
              sub={vsMedian(ad.clickToLead, medians.clickToLead, 'up')} />
            <Stat label="CPL" value={ad.cpl != null ? money(ad.cpl) : '—'}
              sub={vsMedian(ad.cpl, medians.cpl, 'down')} />
          </div>
          <p className="ca-why-line">{ad.creative.why}</p>
          <button className="mx-btn" onClick={onOpen}>Day-by-day delivery →</button>
        </>
      )}

      {tab !== 'perf' && !brief && (
        <div className="ca-ai-empty">
          <p className="ca-block-sub">
            Reads this creative's funnel against the account medians and writes the next brief.
            Nothing is assumed about the footage — the model has the numbers, not the video.
          </p>
          <button className="mx-btn mx-btn-accent" onClick={diagnose} disabled={state === 'loading'}>
            {state === 'loading' ? 'Reading…' : 'Analyse this creative'}
          </button>
          {state === 'error' && <p className="ca-ai-err">{msg}</p>}
        </div>
      )}

      {tab === 'ai' && brief && (
        <div className="ca-brief">
          <p className="ca-diagnosis">{brief.diagnosis}</p>
          <p className="ca-confidence">Confidence: <strong>{brief.confidence}</strong></p>
          <button className="mx-btn" onClick={diagnose} disabled={state === 'loading'}>
            {state === 'loading' ? 'Reading…' : 'Re-run'}
          </button>
        </div>
      )}

      {tab === 'brief' && brief && (
        <div className="ca-brief">
          <section className="ca-brief-sec is-keep">
            <p className="ca-brief-h">Keep — what is working</p>
            <ul>
              {(brief.keep || []).map((k: any, i: number) => (
                <li key={i}><strong>{k.label}:</strong> {k.detail}</li>
              ))}
            </ul>
          </section>

          <section className="ca-brief-sec is-test">
            <p className="ca-brief-h">Test next</p>
            <ol>
              {(brief.test_next || []).map((t: any, i: number) => (
                <li key={i}>{t.change}<em>{t.why}</em></li>
              ))}
            </ol>
          </section>

          {brief.deliverable && (
            <section className="ca-brief-sec is-deliver">
              <p className="ca-brief-h">Deliverable</p>
              <p>{brief.deliverable}</p>
            </section>
          )}

          <CreateAssignment ad={ad} brief={brief} />
        </div>
      )}
    </div>
  )
}

/** Pushes the generated brief onto the assignments board as a real card. */
function CreateAssignment({ ad, brief }: { ad: Ad; brief: any }) {
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  async function create() {
    setState('saving')
    const body = {
      title: `${ad.name} — next variations`,
      status: 'assigned',
      language: adCodes(ad.name).segments.some(s => /SP$/i.test(s)) ? 'spanish' : 'english',
      brief: [
        brief.diagnosis,
        '',
        'KEEP',
        ...(brief.keep || []).map((k: any) => `· ${k.label}: ${k.detail}`),
        '',
        'TEST NEXT',
        ...(brief.test_next || []).map((t: any, i: number) => `${i + 1}. ${t.change} — ${t.why}`),
        '',
        brief.deliverable ? `DELIVERABLE: ${brief.deliverable}` : '',
      ].filter(Boolean).join('\n'),
    }
    try {
      const res = await fetch('/api/creative/briefs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.error) { setMsg(d.error); setState('error'); return }
      setState('done')
    } catch (e) { setMsg(String(e)); setState('error') }
  }

  if (state === 'done') {
    return <p className="ca-assign-done">Added to the assignments board.</p>
  }

  return (
    <div className="ca-assign">
      <button className="mx-btn mx-btn-accent" onClick={create} disabled={state === 'saving'}>
        {state === 'saving' ? 'Creating…' : 'Create assignment'}
      </button>
      {state === 'error' && <p className="ca-ai-err">{msg}</p>}
    </div>
  )
}

/* ── The dense table, kept ──────────────────────────────────────────────── */

function AllCreativesTable({ ads, onOpen }: { ads: Ad[]; onOpen: (a: Ad) => void }) {
  const [filter, setFilter] = useState<string | null>(null)

  const actions = useMemo(() => {
    const c: Record<string, { label: string; n: number }> = {}
    for (const a of ads) {
      const k = a.creative.action
      c[k] ??= { label: a.creative.label, n: 0 }
      c[k].n++
    }
    return Object.entries(c).sort((x, y) => y[1].n - x[1].n)
  }, [ads])

  const rows = filter ? ads.filter(a => a.creative.action === filter) : ads

  return (
    <>
      <div className="ca-actions" style={{ marginTop: 14 }}>
        {actions.map(([key, v]) => (
          <button key={key}
            className={`ca-action is-${key}${filter === key ? ' is-on' : ''}`}
            onClick={() => setFilter(filter === key ? null : key)}>
            <span className="ca-action-n">{v.n}</span>
            <span className="ca-action-l">{v.label}</span>
          </button>
        ))}
      </div>

      <div className="mx-card ca-wrap">
        <table className="ca-table">
          <thead>
            <tr>
              <th className="ca-name">Ad</th>
              <th>Verdict</th>
              <th className="ca-num">Spend</th>
              <th className="ca-num">Impr.</th>
              <th className="ca-num">CPM</th>
              <th className="ca-num">Hook</th>
              <th className="ca-num">25%</th>
              <th className="ca-num">50%</th>
              <th className="ca-num">75%</th>
              <th className="ca-num">100%</th>
              <th className="ca-num">Link CTR</th>
              <th className="ca-num">Link CPC</th>
              <th className="ca-num">Leads</th>
              <th className="ca-num">Click→Lead</th>
              <th className="ca-num">CPL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(a => {
              const plays = a.videoPlays || 0
              const q = (v: number) => (plays > 0 ? `${Math.round((v / plays) * 100)}%` : '—')
              return (
                <tr key={a.id} onClick={() => onOpen(a)} className="ca-row">
                  <td className="ca-name">
                    <span className="ca-name-text"><span className="ca-firm-tag">{a.firm}</span>{rowName(a)}</span>
                    <span className="ca-why">{a.creative.why}</span>
                  </td>
                  <td><span className={`ca-action-pill is-${a.creative.action}`}>{a.creative.label}</span></td>
                  <td className="ca-num">{money(a.spend)}</td>
                  <td className="ca-num">{num(a.impressions)}</td>
                  <td className="ca-num">{a.cpm != null ? money(a.cpm, { cents: true }) : <span className="mx-dim">—</span>}</td>
                  <BandCell value={a.hookRate} band={bandUp(a.hookRate, BENCH.hookRate)} format={v => `${v.toFixed(0)}%`} />
                  <td className="ca-num ca-quiet">{a.hookRate == null ? <span className="mx-dim">—</span> : q(a.p25)}</td>
                  <td className="ca-num ca-quiet">{a.hookRate == null ? <span className="mx-dim">—</span> : q(a.p50)}</td>
                  <td className="ca-num ca-quiet">{a.hookRate == null ? <span className="mx-dim">—</span> : q(a.p75)}</td>
                  <td className="ca-num ca-quiet">{a.hookRate == null ? <span className="mx-dim">—</span> : q(a.p100)}</td>
                  <BandCell value={a.linkCtr} band={bandUp(a.linkCtr, BENCH.ctrCreative)} format={v => `${v.toFixed(2)}%`} />
                  <BandCell value={a.linkCpc} band={bandDown(a.linkCpc, BENCH.linkCpc)} format={v => money(v, { cents: true })} />
                  <td className="ca-num">{num(a.leads)}</td>
                  <BandCell value={a.clickToLead} band={bandUp(a.clickToLead, BENCH.clickToLead)} format={v => `${v.toFixed(1)}%`} />
                  <BandCell value={a.cpl} band={bandDown(a.cpl, BENCH.cpl)} format={v => money(v)} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="ca-footnote">
        Hook rate is 3-second video views ÷ impressions; quartiles are a share of video plays,
        so they read as a retention curve. Static creative has no hook rate and is
        judged on link CTR, click-to-lead and CPL alone.
        <strong> Meta exposes 25/50/75/100% quartiles — there is no 95% metric, so the last column is true completions.</strong>
      </p>

      <Legend rows={[
        ['Hook rate', `${BENCH.hookRate.strong}%+`, `${BENCH.hookRate.good}–${BENCH.hookRate.strong}%`, `${BENCH.hookRate.watch}–${BENCH.hookRate.good}%`, `under ${BENCH.hookRate.watch}%`],
        ['Link CTR', `${BENCH.ctrCreative.strong}%+`, `${BENCH.ctrCreative.good}–${BENCH.ctrCreative.strong}%`, `${BENCH.ctrCreative.watch}–${BENCH.ctrCreative.good}%`, `under ${BENCH.ctrCreative.watch}%`],
        ['Click→Lead', `${BENCH.clickToLead.strong}%+`, `${BENCH.clickToLead.good}–${BENCH.clickToLead.strong}%`, `${BENCH.clickToLead.watch}–${BENCH.clickToLead.good}%`, `under ${BENCH.clickToLead.watch}%`],
      ]} heads={['Metric', 'Strong', 'Good', 'Watch', 'Weak']} />
    </>
  )
}

/* ── View 3 — Winner analysis ───────────────────────────────────────────── */

function WinnersView({ ads, onOpen, level }: { ads: Ad[]; onOpen: (a: Ad) => void; level: Level }) {
  const isAd = level === 'ad'
  const [cut, setCut] = useState<'all' | 'format' | 'visual' | 'verbal'>('all')
  useEffect(() => { if (!isAd) setCut('all') }, [isAd])
  const winners = useMemo(() => rankWinners(ads), [ads])
  const medians = useMemo(() => mediansOf(ads), [ads])

  /* Grouping is over winners only. The same code across the whole account is
     what the Angles report answers — here the question is narrower: among the
     creatives that actually produced, which traits recur. */
  const groups = useMemo(() => {
    if (cut === 'all') return null
    const pick = (a: Ad) => {
      const c = adCodes(a.name)
      return cut === 'format' ? c.formatLabel : cut === 'visual' ? c.visualLabel : c.verbalLabel
    }
    const map: Record<string, Ad[]> = {}
    for (const a of winners) {
      const k = pick(a) ?? 'Not coded'
      ;(map[k] ??= []).push(a)
    }
    return Object.entries(map)
      .map(([label, list]) => {
        const spend = list.reduce((s, a) => s + (a.spend || 0), 0)
        const leads = list.reduce((s, a) => s + (a.leads || 0), 0)
        return { label, list, spend, leads, cpl: leads > 0 ? spend / leads : null }
      })
      /* "Not coded" is a residual, not a finding — it sorts last however
         many leads fall into it. */
      .sort((a, b) =>
        (a.label === 'Not coded' ? 1 : 0) - (b.label === 'Not coded' ? 1 : 0)
        || b.leads - a.leads)
  }, [winners, cut])

  if (winners.length === 0) {
    return (
      <div className="mx-card">
        <EmptyState title="No winners in this range"
          text="No creative produced a lead, so there is nothing to rank yet." />
      </div>
    )
  }

  const totalLeads = winners.reduce((s, a) => s + (a.leads || 0), 0)
  const totalSpend = winners.reduce((s, a) => s + (a.spend || 0), 0)

  return (
    <>
      <div className="ca-kpis">
        <div className="ca-kpi">
          <span className="ca-kpi-n">{winners.length}</span>
          <span className="ca-kpi-t">Creatives producing leads</span>
          <span className="ca-kpi-s">Out of {ads.length} that delivered impressions</span>
        </div>
        <div className="ca-kpi">
          <span className="ca-kpi-n">{num(totalLeads)}</span>
          <span className="ca-kpi-t">Leads from winners</span>
          <span className="ca-kpi-s">{money(totalSpend)} spent behind them</span>
        </div>
        <div className="ca-kpi">
          <span className="ca-kpi-n is-good">{totalLeads > 0 ? money(totalSpend / totalLeads) : '—'}</span>
          <span className="ca-kpi-t">Blended CPL across winners</span>
          <span className="ca-kpi-s">Account median is {medians.cpl != null ? money(medians.cpl) : '—'}</span>
        </div>
        <div className="ca-kpi">
          <span className="ca-kpi-n">{winners[0]?.leads ?? 0}</span>
          <span className="ca-kpi-t">Leads from the top creative</span>
          <span className="ca-kpi-s">
            {totalLeads > 0 ? `${Math.round(((winners[0]?.leads ?? 0) / totalLeads) * 100)}% of all winner leads` : '—'}
          </span>
        </div>
      </div>

      <div className="ca-seg-row">
        <div className="mx-seg" role="tablist" aria-label="Group winners by">
          {(isAd
            ? [['all', 'Ranked'], ['format', 'By format'], ['visual', 'By visual hook'], ['verbal', 'By verbal hook']] as const
            : [['all', 'Ranked']] as const
          ).map(([k, l]) => (
            <button key={k} className="mx-seg-btn" role="tab" aria-pressed={cut === k}
              onClick={() => setCut(k as typeof cut)}>{l}</button>
          ))}
        </div>
      </div>

      {cut === 'all' ? (
        <div className="ca-winner-grid">
          {winners.map((a, i) => (
            <WinnerCard key={a.id} ad={a} rank={i + 1} medians={medians}
              isSelected={false} onSelect={() => onOpen(a)} />
          ))}
        </div>
      ) : (
        <div className="ca-groups">
          {groups!.map(g => (
            <section className="mx-card ca-block" key={g.label}>
              <header className="ca-block-head">
                <div>
                  <h2 className="ca-block-title">{g.label}</h2>
                  <p className="ca-block-sub">
                    {g.list.length} creative{g.list.length === 1 ? '' : 's'} · {num(g.leads)} leads ·
                    {' '}{g.cpl != null ? `${money(g.cpl)} CPL` : 'no CPL'}
                  </p>
                </div>
              </header>
              <div className="ca-wrap">
                <table className="ca-table">
                  <thead>
                    <tr>
                      <th className="ca-name">Ad</th>
                      <th className="ca-num">Spend</th>
                      <th className="ca-num">Leads</th>
                      <th className="ca-num">CPL</th>
                      <th className="ca-num">Hook</th>
                      <th className="ca-num">Link CTR</th>
                      <th className="ca-num">Lead CVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.list.map(a => (
                      <tr key={a.id} className="ca-row" onClick={() => onOpen(a)}>
                        <td className="ca-name"><span className="ca-name-text">{rowName(a)}</span></td>
                        <td className="ca-num">{money(a.spend)}</td>
                        <td className="ca-num">{num(a.leads)}</td>
                        <BandCell value={a.cpl} band={bandDown(a.cpl, BENCH.cpl)} format={v => money(v)} />
                        <BandCell value={a.hookRate} band={bandUp(a.hookRate, BENCH.hookRate)} format={v => `${v.toFixed(0)}%`} />
                        <BandCell value={a.linkCtr} band={bandUp(a.linkCtr, BENCH.ctrCreative)} format={v => `${v.toFixed(2)}%`} />
                        <BandCell value={a.clickToLead} band={bandUp(a.clickToLead, BENCH.clickToLead)} format={v => `${v.toFixed(1)}%`} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <PatternsBlock winners={winners} level={level} />
    </>
  )
}

/* ── Benchmark legend ───────────────────────────────────────────────────── */

function Legend({ heads, rows }: { heads: string[]; rows: string[][] }) {
  const toneFor = (i: number, n: number) =>
    n === 4 ? ['', 'good', 'watch', 'weak'][i] : ['', 'strong', 'good', 'watch', 'weak'][i]
  return (
    <details className="ca-legend">
      <summary>Benchmarks — initial operating thresholds</summary>
      <table className="ca-legend-table">
        <thead>
          <tr>{heads.map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r[0]}>
              {r.map((cell, i) => (
                <td key={i} className={i === 0 ? 'ca-legend-metric' : `is-${toneFor(i, heads.length)}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ca-legend-note">
        These are starting points. As the account accumulates history the system should move to
        rolling benchmarks per creative type (IMG, UGC, HYB, BNR…) over 7 and 14 days rather than
        fixed thresholds — the bands live in one file so that swap is a single change.
      </p>
    </details>
  )
}

/* ── AI insights ────────────────────────────────────────────────────────── */

function AiInsights({ preset }: { preset: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [data, setData] = useState<any>(null)
  const [msg, setMsg] = useState('')

  async function run() {
    setState('loading')
    try {
      const res = await fetch('/api/creative/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_preset: preset }),
      })
      const d = await res.json()
      if (d.error) { setMsg(d.error); setState('error'); return }
      setData(d)
      setState('done')
    } catch (e) {
      setMsg(String(e)); setState('error')
    }
  }

  return (
    <section className="ca-ai">
      <div className="ca-ai-head">
        <div>
          <p className="mx-eyebrow">Read the days, not the totals</p>
          <p className="ca-ai-sub">
            Thresholds catch what has already broken. This reads every day of every creative for
            turns that have not crossed a line yet.
          </p>
        </div>
        <button className="mx-btn mx-btn-accent" onClick={run} disabled={state === 'loading'}>
          {state === 'loading' ? 'Reading…' : state === 'done' ? 'Re-run' : 'Analyse trends'}
        </button>
      </div>

      {state === 'error' && <p className="ca-ai-err">{msg}</p>}

      {state === 'done' && data && (
        <div className="ca-ai-body">
          {data.headline && <p className="ca-ai-headline">{data.headline}</p>}
          {(data.findings || []).map((f: any, i: number) => (
            <div key={i} className={`ca-ai-find is-${f.severity || 'info'}`}>
              <p className="ca-ai-find-ad">{f.ad || 'Account-wide'}</p>
              <p className="ca-ai-find-what">{f.finding}</p>
              {f.action && <p className="ca-ai-find-do"><strong>Do:</strong> {f.action}</p>}
            </div>
          ))}
          {(data.findings || []).length === 0 && <p className="ca-none">Nothing turning that the thresholds have not already caught.</p>}
        </div>
      )}
    </section>
  )
}

/* ── Per-ad detail ──────────────────────────────────────────────────────── */

function AdDetail({ ad, onClose }: { ad: Ad; onClose: () => void }) {
  useEffect(() => {
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const days = ad.daily || []

  return (
    <div className="ca-scrim" onClick={onClose}>
      <aside className="ca-panel" onClick={e => e.stopPropagation()} role="dialog" aria-label="Ad detail">
        <header className="ca-panel-head">
          <div>
            <p className="ca-panel-title">{ad.name}</p>
            <p className="ca-panel-sub">{ad.campaignName} · {ad.adsetName}</p>
          </div>
          <button className="mx-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="ca-panel-body">
          <div className="ca-verdicts">
            <div className={`ca-vcard is-${ad.health.level}`}>
              <span className="ca-vcard-k">Daily health</span>
              <span className="ca-vcard-v">{ad.health.level}</span>
              <span className="ca-vcard-w">{ad.health.why}</span>
            </div>
            <div className={`ca-vcard is-${ad.creative.action}`}>
              <span className="ca-vcard-k">Creative</span>
              <span className="ca-vcard-v">{ad.creative.label}</span>
              <span className="ca-vcard-w">{ad.creative.why}</span>
            </div>
          </div>

          <p className="mx-eyebrow" style={{ marginTop: 4 }}>Day by day · last {days.length} days</p>
          {days.length === 0 ? (
            <p className="ca-none">No daily delivery recorded.</p>
          ) : (
            <div className="ca-wrap">
              <table className="ca-table ca-daily">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="ca-num">Spend</th>
                    <th className="ca-num">Leads</th>
                    <th className="ca-num">CPL</th>
                    <th className="ca-num">Link CTR</th>
                    <th className="ca-num">Link CPC</th>
                    <th className="ca-num">Freq.</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d: any) => (
                    <tr key={d.date}>
                      <td>{d.date?.slice(5)}</td>
                      <td className="ca-num">{money(d.spend)}</td>
                      <td className="ca-num">{d.leads || 0}</td>
                      <td className="ca-num">{d.cpl != null ? money(d.cpl) : <span className="mx-dim">—</span>}</td>
                      <td className="ca-num">{d.linkCtr != null ? `${d.linkCtr.toFixed(2)}%` : <span className="mx-dim">—</span>}</td>
                      <td className="ca-num">{d.linkCpc != null ? money(d.linkCpc, { cents: true }) : <span className="mx-dim">—</span>}</td>
                      <td className="ca-num">{d.frequency != null ? d.frequency.toFixed(2) : <span className="mx-dim">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
