'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { invoiceCodeFromRouteSegment } from '@/app/finance/firms/_lib/invoice-routes'
import { StatusBadge } from '@/app/finance/firms/_components/firm-metrics-shared'
import {
  money, num, compact, pct,
  cplBand, caseBand, bandClass,
  StatusPill, TrendPanels, type TrendSeries,
  PipelineBars, type StageRow,
  Overlay, EmptyState, Banner, DashboardSkeleton, InlineEdit, ConfirmAction,
  IconClose, IconTrash, IconWarn, IconChevron,
} from '@/app/_metrics/dash'
import {
  STAGES, STAGE_BY_KEY, alertFor, ALERT_RANK,
  CreativeTable, LeadsSheet, type Ctx,
} from '@/app/_metrics/creatives'

/* ═══════════════════════════════════════════════════════════════════════════
   Creatives — a firm invoice's ad-level view.

   Same table the Ops dashboard uses, plus what only makes sense here: the
   timeframe can step outside the invoice window, creatives roll up to ad sets
   and campaigns, and each creative opens a day-by-day trend and its signed
   cases.
   ═══════════════════════════════════════════════════════════════════════════ */

const TIMEFRAMES = [
  { key: 'invoice',   label: 'Invoice' },
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_7d',   label: '7d' },
  { key: 'last_14d',  label: '14d' },
  { key: 'last_30d',  label: '30d' },
  { key: 'maximum',   label: 'All time' },
] as const
type TF = typeof TIMEFRAMES[number]['key']

/* Metrics the per-creative trend can plot. Each is a single series on its own
   chart — never two scales on one pair of axes. */
const TREND_METRICS: { key: string; label: string; tone: 'accent' | 'ink' | 'good'; fmt: (v: number | null) => string }[] = [
  { key: 'spend',          label: 'Spend',      tone: 'accent', fmt: v => money(v) },
  { key: 'leads',          label: 'Leads',      tone: 'ink',    fmt: v => (v == null ? '—' : num(v)) },
  { key: 'cpl',            label: 'CPL',        tone: 'good',   fmt: v => money(v) },
  { key: 'cpc',            label: 'CPC',        tone: 'ink',    fmt: v => money(v, { cents: true }) },
  { key: 'ctr',            label: 'CTR',        tone: 'accent', fmt: v => (v == null ? '—' : pct(v)) },
  { key: 'clickToLeadPct', label: 'Click→Lead', tone: 'good',   fmt: v => (v == null ? '—' : pct(v)) },
  { key: 'lpvToLeadPct',   label: 'LPV→Lead',   tone: 'ink',    fmt: v => (v == null ? '—' : pct(v)) },
  { key: 'impressions',    label: 'Impressions', tone: 'accent', fmt: v => (v == null ? '—' : compact(v)) },
]

export default function InvoiceCreatives() {
  const params = useParams()
  const slug = params.slug as string
  const invoiceCode = invoiceCodeFromRouteSegment(params.invoice as string)

  const [kpi, setKpi] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<TF>('invoice')
  const [view, setView] = useState<'creatives' | 'adsets' | 'campaigns'>('creatives')
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
  const [nonce, setNonce] = useState(0)

  const [leadsSheet, setLeadsSheet] = useState<{ ad: any; stage?: string } | null>(null)
  const [casesSheet, setCasesSheet] = useState<any | null>(null)
  const [trendSheet, setTrendSheet] = useState<{ ad: any; metric: string } | null>(null)

  /* ── Data ──────────────────────────────────────────────────────────────── */

  useEffect(() => {
    setLoading(true)
    const qs = timeframe === 'invoice'
      ? `firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(invoiceCode)}`
      : `firm=${encodeURIComponent(slug)}&date_preset=${timeframe}`
    fetch(`/api/metrics/kpi?${qs}`)
      .then(r => r.json())
      .then(d => { setKpi(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [slug, invoiceCode, timeframe, nonce])

  /* Which creatives are spending today, regardless of the chosen timeframe —
     this is what makes "is this still running?" answerable at a glance. */
  useEffect(() => {
    if (timeframe === 'today') return
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&date_preset=today`)
      .then(r => r.json())
      .then(d => setActiveIds(new Set<string>(
        (d.adBreakdown || []).filter((a: any) => a.spend > 0).map((a: any) => a.adId as string)
      )))
      .catch(() => {})
  }, [slug, timeframe])

  const ads: any[] = useMemo(() => kpi?.adBreakdown || [], [kpi])
  const pcs: any[] = useMemo(() => kpi?.pcs || [], [kpi])

  const live = timeframe === 'today'
    ? new Set<string>(ads.filter(a => a.spend > 0).map(a => a.adId))
    : activeIds

  /* ── Case mutations, shared with the cases sheet ───────────────────────── */

  const patchCase = useCallback(async (id: string, body: any, apply: (p: any) => any) => {
    const res = await fetch('/api/metrics/case', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    })
    if (!res.ok) return
    setKpi((prev: any) => ({ ...prev, pcs: (prev?.pcs || []).map((p: any) => (p.id === id ? apply(p) : p)) }))
  }, [])

  const deleteCase = useCallback(async (id: string) => {
    const res = await fetch(`/api/metrics/case?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) setNonce(n => n + 1)
  }, [])

  /* ── Roll-ups ──────────────────────────────────────────────────────────── */

  const rollup = useCallback((keyOf: (a: any) => string, nameOf: (a: any) => string) => {
    const m: Record<string, any> = {}
    for (const a of ads) {
      const key = keyOf(a) || '—'
      const g = (m[key] ||= {
        id: key, name: nameOf(a) || '—',
        spend: 0, metaLeads: 0, signedCases: 0, impressions: 0, clicks: 0, chaseCount: 0, adCount: 0,
      })
      g.spend += a.spend || 0
      g.metaLeads += a.metaLeads || 0
      g.signedCases += a.signedCases || 0
      g.impressions += a.impressions || 0
      g.clicks += a.clicks || 0
      g.chaseCount += a.chaseCount || 0
      g.adCount += 1
    }
    return Object.values(m).sort((a: any, b: any) => b.spend - a.spend)
  }, [ads])

  const adsets = useMemo(() => rollup(a => a.adsetId || a.adsetName, a => a.adsetName), [rollup])
  const campaigns = useMemo(() => rollup(a => a.campaignId || a.campaignName, a => a.campaignName), [rollup])

  const attention = useMemo(() => {
    return ads
      .filter(a => live.has(a.adId))
      .map(a => ({ ad: a, ...alertFor(a) }))
      .filter(x => x.level && x.level !== 'floor')
      .sort((a, b) => (ALERT_RANK[a.level!] ?? 9) - (ALERT_RANK[b.level!] ?? 9) || (b.ad.spend || 0) - (a.ad.spend || 0))
  }, [ads, live])

  const stageRows: StageRow[] = useMemo(() => {
    const pt = kpi?.pipelineTotals
    if (!pt) return []
    const rows: StageRow[] = STAGES.map(s => ({
      key: s.key, label: s.label, klass: s.klass, count: Number(pt[s.countKey]) || 0,
    }))
    const closedAt = rows.findIndex(r => r.key === 'closed')
    rows.splice(closedAt + 1, 0, {
      key: 'signed', label: 'Signed', klass: 'won',
      count: ads.reduce((t, a) => t + (a.signedCases || 0), 0),
    })
    return rows
  }, [kpi, ads])

  const ctx: Ctx = {
    openLeads: (ad, stage) => setLeadsSheet({ ad, stage }),
    openCases: ad => setCasesSheet(ad),
    openTrend: (ad, metric) => setTrendSheet({ ad, metric }),
  }

  if (loading) return <DashboardSkeleton />

  const meta = kpi?.meta
  const totalSpend = ads.reduce((t, a) => t + (a.spend || 0), 0)
  const totalLeads = ads.reduce((t, a) => t + (a.metaLeads || 0), 0)
  const totalSigned = ads.reduce((t, a) => t + (a.signedCases || 0), 0)
  const totalChase = ads.reduce((t, a) => t + (a.chaseCount || 0), 0)
  const qualified = totalChase + totalSigned
  const cpl = totalLeads > 0 ? totalSpend / totalLeads : null
  const cpa = totalSigned > 0 ? totalSpend / totalSigned : null
  const cpq = qualified > 0 ? totalSpend / qualified : null
  const tfLabel = TIMEFRAMES.find(t => t.key === timeframe)?.label ?? timeframe

  return (
    <div style={{ display: 'grid', gap: 26 }}>

      {/* ── Header + timeframe ──────────────────────────────────────────── */}
      <section>
        <div className="mx-section-head">
          <div>
            <h1 className="mx-page-title" style={{ fontSize: 28 }}>Creative <i>performance</i></h1>
            <p className="mx-page-sub">
              {timeframe === 'invoice'
                ? `Everything that delivered inside ${invoiceCode}.`
                : `${tfLabel} across this firm's account — wider than the ${invoiceCode} window.`}
              {live.size > 0 && ` ${live.size} ${live.size === 1 ? 'creative is' : 'creatives are'} spending today.`}
            </p>
          </div>
          <div className="mx-seg" role="group" aria-label="Timeframe">
            {TIMEFRAMES.map(tf => (
              <button key={tf.key} className="mx-seg-btn" aria-pressed={timeframe === tf.key}
                onClick={() => setTimeframe(tf.key)}>
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {meta?.error && (
          <div style={{ marginBottom: 12 }}>
            <Banner tone="crit" title="Meta returned an error">{meta.error}</Banner>
          </div>
        )}

        <div className="mx-hero">
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Spend</span>
            <span className="mx-hero-value">{money(totalSpend)}</span>
            <span className="mx-hero-foot">{ads.length} {ads.length === 1 ? 'creative' : 'creatives'}</span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Cost per lead</span>
            <span className={`mx-hero-value ${cpl == null ? 'is-empty' : `is-${cplBand(cpl)}`}`}>{money(cpl)}</span>
            <span className="mx-hero-foot">{num(totalLeads)} leads · target under {money(220)}</span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Cost per qualified</span>
            <span className={`mx-hero-value ${cpq == null ? 'is-empty' : `is-${caseBand(cpq)}`}`}>{money(cpq)}</span>
            <span className="mx-hero-foot">{qualified} in chase or signed</span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Cost per signed case</span>
            <span className={`mx-hero-value ${cpa == null ? 'is-empty' : `is-${caseBand(cpa)}`}`}>{money(cpa)}</span>
            <span className="mx-hero-foot">target under {money(1200)}</span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Signed via these ads</span>
            <span className={`mx-hero-value ${totalSigned ? 'is-good' : 'is-empty'}`}>{totalSigned}</span>
            <span className="mx-hero-foot">
              {totalLeads > 0 ? `${((totalSigned / totalLeads) * 100).toFixed(1)}% of leads` : 'no leads yet'}
              {' · '}cases without ad attribution are not counted here
            </span>
          </div>
        </div>

        <div className="mx-strip">
          <Cell label="Impressions" value={compact(ads.reduce((t, a) => t + (a.impressions || 0), 0))} />
          <Cell label="Clicks" value={num(ads.reduce((t, a) => t + (a.clicks || 0), 0))} />
          <Cell label="CTR" value={meta?.ctrPct != null ? pct(meta.ctrPct) : '—'} />
          <Cell label="Landing page views" value={num(ads.reduce((t, a) => t + (a.landingPageViews || 0), 0))} />
          <Cell label="In chase" value={String(totalChase)} />
          <Cell label="Spending today" value={String(live.size)} />
        </div>
      </section>

      {/* ── Decision queue ──────────────────────────────────────────────── */}
      {attention.length > 0 && (
        <section>
          <div className="mx-section-head">
            <p className="mx-eyebrow">Needs a decision today</p>
            <p className="mx-section-note">Only creatives currently spending</p>
          </div>
          <div className="mx-card">
            <div className="mx-attn">
              {attention.slice(0, 6).map(({ ad, level, why }) => (
                <button key={ad.adId} className="mx-attn-row"
                  onClick={() => {
                    const el = document.getElementById(`ad-${ad.adId}`)
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}>
                  <StatusPill level={level} />
                  <span className="mx-attn-body">
                    <span className="mx-attn-name">{ad.adName || 'Unnamed creative'}</span>
                    <span className="mx-attn-why" style={{ display: 'block' }}>{why}</span>
                  </span>
                  <span className="mx-attn-fig">
                    {money(ad.spend)}
                    <IconChevron size={12} style={{ color: 'var(--mx-faint)' }} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Pipeline ────────────────────────────────────────────────────── */}
      {stageRows.length > 0 && (
        <section>
          <div className="mx-section-head">
            <p className="mx-eyebrow">Lead pipeline</p>
            <p className="mx-section-note">One stage per contact · click a stage to see who is in it</p>
          </div>
          <div className="mx-card">
            <PipelineBars rows={stageRows} onPick={key => {
              const def = STAGE_BY_KEY[key]
              if (!def) return
              const hit = ads.find(a => (Number(a[def.countKey]) || 0) > 0)
              if (hit) setLeadsSheet({ ad: hit, stage: key })
            }} />
          </div>
        </section>
      )}

      {/* ── Breakdown ───────────────────────────────────────────────────── */}
      <section>
        <div className="mx-section-head">
          <p className="mx-eyebrow">Breakdown</p>
          <div className="mx-seg" role="group" aria-label="Grouping">
            {([['creatives', 'Creatives'], ['adsets', 'Ad sets'], ['campaigns', 'Campaigns']] as const).map(([k, label]) => (
              <button key={k} className="mx-seg-btn" aria-pressed={view === k} onClick={() => setView(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-card" style={{ overflow: 'hidden' }}>
          {view === 'creatives' && (
            <CreativeTable
              ads={ads}
              ctx={ctx}
              activeIds={live}
              toolbarNote={`${ads.length} ${ads.length === 1 ? 'creative' : 'creatives'} · spending today listed first`}
            />
          )}

          {view !== 'creatives' && (
            <RollupTable
              rows={view === 'adsets' ? adsets : campaigns}
              label={view === 'adsets' ? 'Ad set' : 'Campaign'}
            />
          )}
        </div>
      </section>

      {/* ── Sheets ──────────────────────────────────────────────────────── */}
      {leadsSheet && (
        <LeadsSheet ad={leadsSheet.ad} stage={leadsSheet.stage}
          onClose={() => setLeadsSheet(null)}
          onStage={st => setLeadsSheet(prev => (prev ? { ...prev, stage: st } : prev))} />
      )}

      {casesSheet && (
        <CasesSheet
          ad={casesSheet}
          pcs={pcs.filter(p => p.adId === casesSheet.adId)}
          onClose={() => setCasesSheet(null)}
          onPatch={patchCase}
          onDelete={deleteCase}
        />
      )}

      {trendSheet && (
        <TrendSheet
          ad={trendSheet.ad}
          initialMetric={trendSheet.metric}
          timeframe={timeframe}
          timeframeLabel={tfLabel}
          invoiceCode={invoiceCode}
          slug={slug}
          onClose={() => setTrendSheet(null)}
        />
      )}
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="mx-strip-cell">
      <div className="mx-strip-label">{label}</div>
      <div className={`mx-strip-value ${value === '—' ? 'is-empty' : ''}`}>{value}</div>
    </div>
  )
}

/* ── Ad set / campaign roll-up ──────────────────────────────────────────── */

function RollupTable({ rows, label }: { rows: any[]; label: string }) {
  const [sortKey, setSortKey] = useState('spend')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const getters: Record<string, (r: any) => number> = {
    spend: r => r.spend,
    impressions: r => r.impressions,
    clicks: r => r.clicks,
    metaLeads: r => r.metaLeads,
    signedCases: r => r.signedCases,
    conv: r => (r.metaLeads > 0 ? r.signedCases / r.metaLeads : -1),
    cpl: r => (r.metaLeads > 0 ? r.spend / r.metaLeads : Infinity),
    cpa: r => (r.signedCases > 0 ? r.spend / r.signedCases : Infinity),
    cpq: r => { const q = r.chaseCount + r.signedCases; return q > 0 ? r.spend / q : Infinity },
    adCount: r => r.adCount,
  }

  const sorted = useMemo(() => {
    const g = getters[sortKey]
    if (!g) return rows
    const m = dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = g(a), bv = g(b)
      if (!Number.isFinite(av)) return 1
      if (!Number.isFinite(bv)) return -1
      return (av - bv) * m
    })
  }, [rows, sortKey, dir])

  if (rows.length === 0) {
    return <EmptyState title={`No ${label.toLowerCase()} data`} text="Nothing delivered in this range." />
  }

  const cols: [string, string, boolean][] = [
    ['spend', 'Spend', true],
    ['impressions', 'Impressions', true],
    ['clicks', 'Clicks', true],
    ['metaLeads', 'Leads', true],
    ['cpl', 'CPL', true],
    ['signedCases', 'Signed', true],
    ['conv', 'Lead→Signed', true],
    ['cpa', 'CPA', true],
    ['cpq', 'CPQ', true],
    ['adCount', 'Creatives', true],
  ]

  function sort(k: string) {
    if (sortKey === k) setDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(k); setDir('desc') }
  }

  const totals = rows.reduce((t, r) => ({
    spend: t.spend + r.spend, impressions: t.impressions + r.impressions, clicks: t.clicks + r.clicks,
    metaLeads: t.metaLeads + r.metaLeads, signedCases: t.signedCases + r.signedCases,
    chaseCount: t.chaseCount + r.chaseCount, adCount: t.adCount + r.adCount,
  }), { spend: 0, impressions: 0, clicks: 0, metaLeads: 0, signedCases: 0, chaseCount: 0, adCount: 0 })
  const tQual = totals.chaseCount + totals.signedCases

  return (
    <div className="mx-tw">
      <table className="mx-table">
        <thead>
          <tr>
            <th>{label}</th>
            {cols.map(([k, lbl]) => (
              <th key={k} className="sortable num" onClick={() => sort(k)}
                aria-sort={sortKey === k ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {lbl}<span className="sort-caret">{sortKey === k && dir === 'asc' ? '↑' : '↓'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => {
            const cpl = r.metaLeads > 0 ? r.spend / r.metaLeads : null
            const cpa = r.signedCases > 0 ? r.spend / r.signedCases : null
            const q = r.chaseCount + r.signedCases
            const cpq = q > 0 ? r.spend / q : null
            return (
              <tr className="row" key={r.id}>
                <td style={{ maxWidth: 260 }}>
                  <span style={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>
                    {r.name}
                  </span>
                  <span className="mx-creative-id">{r.id}</span>
                </td>
                <td className="num" style={{ fontWeight: 650 }}>{money(r.spend)}</td>
                <td className="num" style={{ color: 'var(--mx-muted)' }}>{compact(r.impressions)}</td>
                <td className="num" style={{ color: 'var(--mx-muted)' }}>{num(r.clicks)}</td>
                <td className="num">{r.metaLeads || <span className="mx-dim">—</span>}</td>
                <td className="num"><span className={bandClass(cplBand(cpl))}>{money(cpl)}</span></td>
                <td className="num">
                  {r.signedCases ? <strong style={{ color: 'var(--mx-good)' }}>{r.signedCases}</strong> : <span className="mx-dim">—</span>}
                </td>
                <td className="num" style={{ color: 'var(--mx-muted)' }}>
                  {r.metaLeads > 0 ? pct((r.signedCases / r.metaLeads) * 100, 1) : <span className="mx-dim">—</span>}
                </td>
                <td className="num"><span className={bandClass(caseBand(cpa))}>{money(cpa)}</span></td>
                <td className="num"><span className={bandClass(caseBand(cpq))}>{money(cpq)}</span></td>
                <td className="num" style={{ color: 'var(--mx-muted)' }}>{r.adCount}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="lbl">Total</td>
            <td className="num">{money(totals.spend)}</td>
            <td className="num">{compact(totals.impressions)}</td>
            <td className="num">{num(totals.clicks)}</td>
            <td className="num">{totals.metaLeads || '—'}</td>
            <td className="num">{totals.metaLeads ? money(totals.spend / totals.metaLeads) : '—'}</td>
            <td className="num">{totals.signedCases || '—'}</td>
            <td className="num">{totals.metaLeads ? pct((totals.signedCases / totals.metaLeads) * 100, 1) : '—'}</td>
            <td className="num">{totals.signedCases ? money(totals.spend / totals.signedCases) : '—'}</td>
            <td className="num">{tQual ? money(totals.spend / tQual) : '—'}</td>
            <td className="num">{totals.adCount}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/* ── Per-creative trend ─────────────────────────────────────────────────── */

function TrendSheet({ ad, initialMetric, timeframe, timeframeLabel, invoiceCode, slug, onClose }: {
  ad: any
  initialMetric: string
  timeframe: TF
  timeframeLabel: string
  invoiceCode: string
  slug: string
  onClose: () => void
}) {
  const [metric, setMetric] = useState(initialMetric)
  const [data, setData] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [adName, setAdName] = useState<string>(ad.adName || ad.adId)

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ firm: slug, ad_id: ad.adId, timeframe })
    if (timeframe === 'invoice') qs.set('invoice', invoiceCode)
    fetch(`/api/metrics/creative-trend?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d.data || []); if (d.adName) setAdName(d.adName); setLoading(false) })
      .catch(() => { setData([]); setLoading(false) })
  }, [ad.adId, timeframe, invoiceCode, slug])

  const cfg = TREND_METRICS.find(m => m.key === metric) ?? TREND_METRICS[0]

  const series: TrendSeries[] = data
    ? [{
        key: cfg.key,
        title: cfg.label,
        tone: cfg.tone,
        kind: cfg.key === 'leads' || cfg.key === 'impressions' ? 'bar' : 'area',
        values: data.map(d => {
          const v = d[cfg.key]
          return v == null || Number.isNaN(v) ? null : Number(v)
        }),
        format: cfg.fmt,
      }]
    : []

  /* Average and latest per metric, so switching tabs is informed rather than
     exploratory. */
  const stats = useMemo(() => {
    if (!data) return []
    return TREND_METRICS.map(m => {
      const vals = data.map(d => d[m.key]).filter((v: any): v is number => v != null && Number.isFinite(v))
      if (!vals.length) return null
      return {
        ...m,
        avg: vals.reduce((a: number, b: number) => a + b, 0) / vals.length,
        last: vals[vals.length - 1],
      }
    }).filter(Boolean) as any[]
  }, [data])

  return (
    <Overlay onClose={onClose} variant="sheet" labelledBy="trend-title">
      <div className="mx-sheet-head">
        <div style={{ minWidth: 0 }}>
          <p className="mx-eyebrow" style={{ marginBottom: 5 }}>Day by day · {timeframeLabel}</p>
          <h2 id="trend-title" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.3, margin: 0 }}>
            {adName}
          </h2>
          <p className="mx-creative-id" style={{ marginTop: 4 }}>{ad.adId}</p>
        </div>
        <button className="mx-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
      </div>

      <div style={{ padding: '11px 22px', borderBottom: '1px solid var(--mx-line-2)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TREND_METRICS.map(m => (
          <button key={m.key} className="mx-seg-btn" aria-pressed={metric === m.key}
            onClick={() => setMetric(m.key)}
            style={{ background: metric === m.key ? 'var(--mx-surface-3)' : undefined }}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="mx-sheet-body">
        {loading ? (
          <div style={{ padding: 22 }}><div className="mx-skel" style={{ height: 190 }} /></div>
        ) : !data || data.length === 0 ? (
          <EmptyState title="No daily data" text="This creative has no day-by-day breakdown in the selected timeframe." />
        ) : (
          <>
            <TrendPanels dates={data.map(d => d.label)} series={series} height={190} />

            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--mx-line-2)' }}>
              <p className="mx-eyebrow" style={{ marginBottom: 10 }}>Every metric over this period</p>
              <div className="mx-detail-grid">
                {stats.map(st => (
                  <button key={st.key} className="mx-stage-btn" onClick={() => setMetric(st.key)}
                    style={metric === st.key ? { borderColor: 'var(--mx-accent)', background: 'var(--mx-accent-soft)' } : undefined}>
                    <span className="mx-stage-btn-label">{st.label}</span>
                    <span className="mx-stage-btn-val" style={{ fontSize: 15 }}>{st.fmt(st.avg)}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--mx-muted)' }}>avg · last {st.fmt(st.last)}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Overlay>
  )
}

/* ── Signed cases for one creative ──────────────────────────────────────── */

function CasesSheet({ ad, pcs, onClose, onPatch, onDelete }: {
  ad: any
  pcs: any[]
  onClose: () => void
  onPatch: (id: string, body: any, apply: (p: any) => any) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <Overlay onClose={onClose} variant="sheet" labelledBy="cases-title">
      <div className="mx-sheet-head">
        <div style={{ minWidth: 0 }}>
          <p className="mx-eyebrow" style={{ marginBottom: 5 }}>
            Signed cases · {ad.signedCases ?? pcs.length}
          </p>
          <h2 id="cases-title" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.3, margin: 0 }}>
            {ad.adName || 'Unnamed creative'}
          </h2>
          <p className="mx-creative-id" style={{ marginTop: 4 }}>{ad.adId}</p>
        </div>
        <button className="mx-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
      </div>

      <div className="mx-sheet-body">
        {pcs.length === 0 ? (
          <EmptyState
            title="No cases matched to this creative"
            text="Meta credits signed cases to this ad, but no CRM case carries its ad ID. The attribution runs on the UTM captured at lead time."
          />
        ) : (
          <table className="mx-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Signed</th>
                <th>Closer</th>
                <th>2nd rep</th>
                <th>OT</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {pcs.map(pc => (
                <tr className="row" key={pc.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{pc.contactName || 'Unnamed contact'}</div>
                    <div style={{ fontSize: 11, color: 'var(--mx-muted)' }}>{pc.contactPhone || pc.contactEmail || ''}</div>
                  </td>
                  <td><StatusBadge status={pc.caseStatus} /></td>
                  <td style={{ color: 'var(--mx-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {pc.qualifiedAt ? String(pc.qualifiedAt).split('T')[0] : '—'}
                  </td>
                  <td>
                    <InlineEdit value={pc.workerName || pc.closer || ''} placeholder="Add closer"
                      onSave={v => onPatch(pc.id, { closer: v }, p => ({ ...p, closer: v, workerName: v || p.workerName }))} />
                  </td>
                  <td>
                    <InlineEdit value={pc.secondWorkerName || pc.secondCloser || ''} placeholder="Add rep"
                      onSave={v => onPatch(pc.id, { second_closer: v }, p => ({ ...p, secondCloser: v, secondWorkerName: v || null }))} />
                  </td>
                  <td>
                    <button className="mx-toggle" aria-pressed={!!pc.isOtClose}
                      onClick={() => onPatch(pc.id, { is_ot_close: !pc.isOtClose }, p => ({ ...p, isOtClose: !pc.isOtClose }))}
                      title={pc.isOtClose ? 'Overtime close — click to clear' : 'Mark as an overtime close'}>
                      OT
                    </button>
                  </td>
                  <td>
                    <ConfirmAction
                      armed={confirmDelete === pc.id}
                      label="Delete"
                      title="Delete this case"
                      onArm={() => setConfirmDelete(pc.id)}
                      onCancel={() => setConfirmDelete(null)}
                      onConfirm={() => { onDelete(pc.id); setConfirmDelete(null); onClose() }}>
                      <IconTrash />
                    </ConfirmAction>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mx-sheet-foot" style={{ fontSize: 11.5, color: 'var(--mx-muted)', gap: 18 }}>
        <span><b style={{ color: 'var(--mx-ink)' }}>{pcs.length}</b> matched in the CRM</span>
        <span><b style={{ color: 'var(--mx-ink)' }}>{ad.signedCases ?? 0}</b> credited by attribution</span>
        {pcs.length !== (ad.signedCases ?? 0) && (
          <span style={{ marginLeft: 'auto', color: 'var(--mx-warn)' }}>
            <IconWarn size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
            {Math.abs((ad.signedCases ?? 0) - pcs.length)} unmatched
          </span>
        )}
      </div>
    </Overlay>
  )
}
