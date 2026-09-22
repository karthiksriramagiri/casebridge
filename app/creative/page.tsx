'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  money, num, pct, shortDate,
  cplBand, caseBand, type Band,
  StatusPill,
  Sparkline, TrendPanels, type TrendSeries,
  PipelineBars, type StageRow,
  EmptyState, DashboardSkeleton,
  IconChevron, IconWarn, IconCalendar,
} from '@/app/_metrics/dash'
import {
  STAGES, STAGE_BY_KEY, alertFor, ALERT_RANK, groupPhase,
  CreativeTable, LeadsSheet, type Ctx,
} from '@/app/_metrics/creatives'
import { MetricsHeader } from '@/app/_metrics/chrome'

/* ═══════════════════════════════════════════════════════════════════════════
   Creative Center — Overview

   The default page of creatives.case-bridge.com. Reading order, top to
   bottom: what did we spend and what did it cost → what needs a decision
   today → where every lead currently sits → how the period is trending →
   the per-creative detail.
   ═══════════════════════════════════════════════════════════════════════════ */

const DATE_PRESETS = [
  { label: 'Today',   full: 'Today',        value: 'today' },
  { label: 'Yest.',   full: 'Yesterday',    value: 'yesterday' },
  { label: '7d',      full: 'Last 7 days',  value: 'last_7d' },
  { label: '14d',     full: 'Last 14 days', value: 'last_14d' },
  { label: '30d',     full: 'Last 30 days', value: 'last_30d' },
  { label: 'Custom',  full: 'Custom range', value: 'custom' },
]

export default function CreativeOverviewPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [datePreset, setDatePreset] = useState('today')
  const [customStart, setCustomStart] = useState(today)
  const [customEnd, setCustomEnd] = useState(today)
  const [customApplied, setCustomApplied] = useState({ start: today, end: today })
  const [nonce, setNonce] = useState(0)

  const [metaData, setMetaData] = useState<any>(null)
  const [attribution, setAttribution] = useState<any>(null)
  const [creativeOverview, setCreativeOverview] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [leadsSheet, setLeadsSheet] = useState<{ ad: any; stage?: string } | null>(null)
  const [focusAd, setFocusAd] = useState<string | null>(null)

  const dateParams = datePreset === 'custom'
    ? `start_date=${customApplied.start}&end_date=${customApplied.end}`
    : `date_preset=${datePreset}`

  const rangeLabel = datePreset === 'custom'
    ? `${shortDate(customApplied.start)} – ${shortDate(customApplied.end)}`
    : (DATE_PRESETS.find(p => p.value === datePreset)?.full ?? datePreset)

  /* ── Data ──────────────────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    const meta = fetch(`/api/metrics?${dateParams}`).then(r => r.json())
    const attr = fetch('/api/metrics/attribution').then(r => r.json()).catch(() => ({}))
    const creative = fetch(`/api/metrics/creative-overview?${dateParams}`).then(r => r.json()).catch(() => ({}))

    Promise.allSettled([meta, attr, creative]).then(([m, a, c]) => {
      if (cancelled) return
      if (m.status === 'fulfilled') setMetaData(m.value)
      else setLoadError('Meta Ads data could not be loaded. The figures below may be incomplete.')
      if (a.status === 'fulfilled') setAttribution(a.value)
      if (c.status === 'fulfilled') setCreativeOverview(c.value?.byAdId || {})
      setLoading(false)
      setRefreshing(false)
    })

    return () => { cancelled = true }
  }, [dateParams, nonce])

  /* ── Derived ───────────────────────────────────────────────────────────── */

  const ads = useMemo(() => {
    return (metaData?.ads || []).map((ad: any) => {
      const ov = creativeOverview[ad.id] || {}
      const signedCases = ov.signedCases || 0
      const chaseCount = ov.chaseCount || 0
      const qualifiedForCpq = chaseCount + signedCases
      const stageData: Record<string, any> = {}
      for (const s of STAGES) {
        stageData[s.countKey] = ov[s.countKey] || 0
        stageData[s.listKey] = ov[s.listKey] || []
      }
      return {
        ...ad,
        ...stageData,
        signedCases,
        cpa: signedCases > 0 ? ad.spend / signedCases : null,
        cpq: qualifiedForCpq > 0 ? ad.spend / qualifiedForCpq : null,
        isActive: ad.spend > 0,
        firmSlug: ov.firmSlug || null,
        firmName: ov.firmName || null,
        latestInvoice: ov.latestInvoice || null,
      }
    }).sort((a: any, b: any) => b.spend - a.spend)
  }, [metaData, creativeOverview])

  const spend = parseFloat(metaData?.summary?.spend || 0) || 0
  const totalLeads = metaData?.summary?.leads ?? 0
  const totalImpressions = metaData?.summary?.impressions ?? 0
  const totalClicks = metaData?.summary?.clicks ?? 0
  const totalSigned = ads.reduce((s: number, a: any) => s + (a.signedCases || 0), 0)
  const totalChase = ads.reduce((s: number, a: any) => s + (a.chaseCount || 0), 0)
  const totalQualifiedForCpq = totalChase + totalSigned

  const cpl = totalLeads > 0 ? spend / totalLeads : null
  const cpa = totalSigned > 0 ? spend / totalSigned : null
  const cpq = totalQualifiedForCpq > 0 ? spend / totalQualifiedForCpq : null

  const daily: any[] = metaData?.daily || []
  const dailySpend = daily.map(d => d.spend ?? 0)

  const trendSeries: TrendSeries[] = useMemo(() => ([
    { key: 'spend', title: 'Spend', tone: 'accent', kind: 'area', values: daily.map(d => d.spend ?? 0), format: v => money(v) },
    { key: 'leads', title: 'Leads', tone: 'ink', kind: 'bar', values: daily.map(d => d.leads ?? 0), format: v => (v == null ? '—' : num(v)) },
    {
      key: 'cpl', title: 'Cost per lead', tone: 'good', kind: 'area',
      values: daily.map(d => (d.leads > 0 ? d.spend / d.leads : null)),
      format: v => money(v),
    },
  ]), [daily])

  const stageRows: StageRow[] = useMemo(() => {
    const rows = STAGES.map(s => ({
      key: s.key,
      label: s.label,
      count: ads.reduce((t: number, a: any) => t + (Number(a[s.countKey]) || 0), 0),
      klass: s.klass,
    }))
    rows.splice(rows.findIndex(r => r.key === 'closed') + 1, 0, {
      key: 'signed', label: 'Signed', count: totalSigned, klass: 'won',
    })
    return rows
  }, [ads, totalSigned])

  const attention = useMemo(() => {
    return ads
      .map((ad: any) => ({ ad, ...alertFor(ad) }))
      .filter((x: any) => x.level && x.level !== 'floor')
      .sort((a: any, b: any) => {
        const r = (ALERT_RANK[a.level!] ?? 9) - (ALERT_RANK[b.level!] ?? 9)
        return r !== 0 ? r : (b.ad.spend ?? 0) - (a.ad.spend ?? 0)
      })
  }, [ads])

  const attnCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of attention) c[a.level!] = (c[a.level!] || 0) + 1
    return c
  }, [attention])

  const campaigns = useMemo(() => {
    const groups: Record<string, { name: string; ads: any[] }> = {}
    for (const ad of ads) {
      const key = ad.campaignId || ad.campaignName || '—'
      if (!groups[key]) groups[key] = { name: ad.campaignName || 'Unnamed campaign', ads: [] }
      groups[key].ads.push(ad)
    }
    return Object.values(groups).sort((a, b) =>
      b.ads.reduce((s, x) => s + (x.spend || 0), 0) - a.ads.reduce((s, x) => s + (x.spend || 0), 0))
  }, [ads])

  /* ── Actions ───────────────────────────────────────────────────────────── */

  function refresh() { setRefreshing(true); setNonce(n => n + 1) }

  function jumpToAd(adId: string) {
    setFocusAd(adId)
    const el = document.getElementById(`ad-${adId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => setFocusAd(null), 1800)
  }

  const ctx: Ctx = { openLeads: (ad, stage) => setLeadsSheet({ ad, stage }) }

  const urgent = (attnCounts.kill || 0) + (attnCounts.read_decide || 0)

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <>

      <MetricsHeader
        refreshing={refreshing}
        onRefresh={refresh}
        badges={{ '': urgent }}
        actions={
          <div className="mx-seg" role="group" aria-label="Date range">
            {DATE_PRESETS.map(p => (
              <button key={p.value} className="mx-seg-btn"
                aria-pressed={datePreset === p.value}
                title={p.full}
                onClick={() => setDatePreset(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
        }
        below={datePreset === 'custom' && (
          <div className="mx-header-inner" style={{ minHeight: 0, padding: '0 24px 11px', gap: 8, justifyContent: 'flex-end' }}>
            <IconCalendar className="mx-dim" />
            <input type="date" className="mx-input" value={customStart} max={customEnd}
              onChange={e => setCustomStart(e.target.value)} aria-label="Start date" style={{ width: 150 }} />
            <span style={{ color: 'var(--mx-faint)', fontSize: 12 }}>to</span>
            <input type="date" className="mx-input" value={customEnd} min={customStart}
              onChange={e => setCustomEnd(e.target.value)} aria-label="End date" style={{ width: 150 }} />
            <button className="mx-btn mx-btn-accent"
              disabled={customStart === customApplied.start && customEnd === customApplied.end}
              onClick={() => setCustomApplied({ start: customStart, end: customEnd })}>
              Apply
            </button>
          </div>
        )}
      />

      <main className="mx-main" id="mx-main">
        {loading ? <DashboardSkeleton /> : (
          <Overview
            {...{ spend, totalLeads, totalImpressions, totalClicks, totalSigned, cpl, cpa, cpq,
                  rangeLabel, dailySpend, daily, trendSeries, stageRows, attention, attnCounts,
                  campaigns, ads, attribution, loadError, ctx, jumpToAd, focusAd,
                  totalQualifiedForCpq }}
          />
        )}
      </main>

      {leadsSheet && (
        <LeadsSheet ad={leadsSheet.ad} stage={leadsSheet.stage} onClose={() => setLeadsSheet(null)}
          onStage={s => setLeadsSheet(prev => (prev ? { ...prev, stage: s } : prev))} />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Overview
   ═══════════════════════════════════════════════════════════════════════════ */

function Overview(p: any) {
  const {
    spend, totalLeads, totalImpressions, totalClicks, totalSigned, cpl, cpa, cpq,
    rangeLabel, dailySpend, daily, trendSeries, stageRows, attention, attnCounts,
    campaigns, ads, attribution, loadError, ctx, jumpToAd, focusAd, totalQualifiedForCpq,
  } = p

  const [showAllAttn, setShowAllAttn] = useState(false)
  const visibleAttn = showAllAttn ? attention : attention.slice(0, 5)
  const notQualified = attribution?.totals?.notQualified || 0

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null
  const cpc = totalClicks > 0 ? spend / totalClicks : null
  const leadsPerClick = totalClicks > 0 ? (totalLeads / totalClicks) * 100 : null

  return (
    <>
      <div className="mx-section" style={{ marginBottom: 22 }}>
        <div className="mx-section-head" style={{ marginBottom: 18 }}>
          <div>
            <h1 className="mx-page-title">Creative <i>Overview</i></h1>
            <p className="mx-page-sub">
              {rangeLabel} across {ads.length} {ads.length === 1 ? 'creative' : 'creatives'} in{' '}
              {campaigns.length} {campaigns.length === 1 ? 'campaign' : 'campaigns'}.
            </p>
          </div>
        </div>

        {loadError && (
          <div className="mx-card" style={{ padding: '11px 16px', marginBottom: 14, display: 'flex', gap: 9, alignItems: 'center', borderColor: 'var(--mx-crit)', background: 'var(--mx-crit-soft)' }}>
            <IconWarn style={{ color: 'var(--mx-crit)', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: 'var(--mx-crit)' }}>{loadError}</span>
          </div>
        )}

        {/* The five numbers a spend decision actually turns on */}
        <div className="mx-hero">
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Spend</span>
            <span className="mx-hero-value">{money(spend)}</span>
            <div style={{ marginTop: 2, marginBottom: 2 }}>
              <Sparkline values={dailySpend} />
            </div>
            <span className="mx-hero-foot">
              {daily.length > 1 ? `${money(spend / daily.length)}/day average` : 'Single-day range'}
            </span>
          </div>

          <HeroCell label="Cost per lead" value={cpl} band={cplBand(cpl)}
            foot={`${num(totalLeads)} ${totalLeads === 1 ? 'lead' : 'leads'} · target under ${money(220)}`} />

          <HeroCell label="Cost per qualified" value={cpq} band={caseBand(cpq)}
            foot={`${num(totalQualifiedForCpq)} in chase or signed · target under ${money(1200)}`} />

          <HeroCell label="Cost per signed case" value={cpa} band={caseBand(cpa)}
            foot={`${num(totalSigned)} signed · target under ${money(1200)}`} />

          <div className="mx-hero-cell">
            <span className="mx-hero-label">Signed cases</span>
            <span className={`mx-hero-value ${totalSigned > 0 ? 'is-good' : 'is-empty'}`}>{totalSigned}</span>
            <span className="mx-hero-foot">
              {notQualified > 0 ? `${notQualified} marked not qualified` : 'No disqualifications recorded'}
            </span>
          </div>
        </div>

        {/* Delivery — supporting figures, deliberately quieter */}
        <div className="mx-strip">
          <StripCell label="Impressions" value={num(totalImpressions)} />
          <StripCell label="Clicks" value={num(totalClicks)} />
          <StripCell label="CTR" value={pct(ctr)} />
          <StripCell label="CPC" value={cpc != null ? money(cpc, { cents: true }) : '—'} />
          <StripCell label="Leads" value={num(totalLeads)} />
          <StripCell label="Click→Lead" value={pct(leadsPerClick)} />
        </div>
      </div>

      {/* ── Decision queue ──────────────────────────────────────────────── */}
      <section className="mx-section">
        <div className="mx-section-head">
          <div>
            <p className="mx-eyebrow">Needs a decision</p>
          </div>
          <p className="mx-section-note">
            {attention.length === 0
              ? 'Every creative is inside its targets.'
              : [
                  attnCounts.kill && `${attnCounts.kill} to kill`,
                  attnCounts.read_decide && `${attnCounts.read_decide} to call`,
                  attnCounts.watch && `${attnCounts.watch} to watch`,
                  attnCounts.scale && `${attnCounts.scale} to scale`,
                ].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="mx-card">
          {attention.length === 0 ? (
            <EmptyState compact
              title="Nothing flagged"
              text="No creative is over its cost ceiling, and none has enough signal to scale yet."
            />
          ) : (
            <>
              <div className="mx-attn">
                {visibleAttn.map(({ ad, level, why }: any) => (
                  <button key={ad.id} className="mx-attn-row" onClick={() => jumpToAd(ad.id)}
                    title="Jump to this creative in the table below">
                    <StatusPill level={level} />
                    <span className="mx-attn-body">
                      <span className="mx-attn-name">{ad.name || ad.adName || 'Unnamed creative'}</span>
                      <span className="mx-attn-why" style={{ display: 'block' }}>{why}</span>
                    </span>
                    <span className="mx-attn-fig">
                      {money(ad.spend)}
                      <IconChevron size={12} style={{ color: 'var(--mx-faint)' }} />
                    </span>
                  </button>
                ))}
              </div>
              {attention.length > 5 && (
                <div style={{ padding: '9px 18px', borderTop: '1px solid var(--mx-line-2)' }}>
                  <button className="mx-btn mx-btn-ghost" style={{ padding: '4px 8px' }}
                    onClick={() => setShowAllAttn(v => !v)}>
                    {showAllAttn ? 'Show fewer' : `Show all ${attention.length}`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Pipeline + trend, side by side ──────────────────────────────── */}
      <section className="mx-section">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 4fr)', gap: 14, alignItems: 'start' }}
          className="mx-split">
          <div>
            <div className="mx-section-head">
              <p className="mx-eyebrow">Where every lead sits right now</p>
              <p className="mx-section-note">One stage per contact — this is a snapshot, not a drop-off</p>
            </div>
            <div className="mx-card">
              <PipelineBars rows={stageRows} onPick={key => {
                // Open the first creative that actually holds contacts in this stage
                const def = STAGE_BY_KEY[key]
                if (!def) return
                const hit = ads.find((a: any) => (Number(a[def.countKey]) || 0) > 0)
                if (hit) ctx.openLeads(hit, key)
              }} />
            </div>
          </div>

          <div>
            <div className="mx-section-head">
              <p className="mx-eyebrow">Day by day</p>
              <p className="mx-section-note">{daily.length} {daily.length === 1 ? 'day' : 'days'}</p>
            </div>
            <div className="mx-card">
              <TrendPanels dates={daily.map((d: any) => d.date)} series={trendSeries} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Creatives by campaign ───────────────────────────────────────── */}
      <section className="mx-section">
        <div className="mx-section-head">
          <p className="mx-eyebrow">Creatives by campaign</p>
          <p className="mx-section-note">Sorted by spend · click any count to see the contacts behind it</p>
        </div>

        {campaigns.length === 0 ? (
          <div className="mx-card">
            <EmptyState
              title="No ad data in this range"
              text="Meta returned no delivery for the selected dates. Try a wider range, or check that the ad account is still linked."
            />
          </div>
        ) : (
          campaigns.map((g: any) => (
            <CampaignCard key={g.name} group={g} ctx={ctx} focusAd={focusAd} />
          ))
        )}
      </section>
    </>
  )
}

function HeroCell({ label, value, band, foot }: { label: string; value: number | null; band: Band; foot: string }) {
  const cls = value == null ? 'is-empty' : band ? `is-${band}` : ''
  return (
    <div className="mx-hero-cell">
      <span className="mx-hero-label">{label}</span>
      <span className={`mx-hero-value ${cls}`}>{money(value)}</span>
      <span className="mx-hero-foot">{foot}</span>
    </div>
  )
}

function StripCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="mx-strip-cell">
      <div className="mx-strip-label">{label}</div>
      <div className={`mx-strip-value ${value === '—' ? 'is-empty' : ''}`}>{value}</div>
    </div>
  )
}

/* ── Campaign card ───────────────────────────────────────────────────────────
   Just the campaign header and its totals; the table itself is the shared one
   the firm Creatives section also renders.                                    */

function CampaignCard({ group, ctx, focusAd }: { group: { name: string; ads: any[] }; ctx: Ctx; focusAd: string | null }) {
  const { name, ads } = group
  const [open, setOpen] = useState(true)

  const totalSpend = ads.reduce((s, a) => s + (a.spend || 0), 0)
  const totalLeads = ads.reduce((s, a) => s + (a.metaLeads ?? a.leads ?? 0), 0)
  const totalSigned = ads.reduce((s, a) => s + (a.signedCases || 0), 0)
  const totalChase = ads.reduce((s, a) => s + (a.chaseCount || 0), 0)
  const cCpl = totalLeads > 0 ? totalSpend / totalLeads : null
  const cCpa = totalSigned > 0 ? totalSpend / totalSigned : null
  const cQual = totalChase + totalSigned
  const cCpq = cQual > 0 ? totalSpend / cQual : null

  const link = ads[0]?.firmSlug && ads[0]?.latestInvoice
    ? `/finance/firms/${ads[0].firmSlug}/invoice/${ads[0].latestInvoice}/marketing`
    : null

  return (
    <article className={`mx-card mx-camp ${open ? '' : 'collapsed'}`} style={{ overflow: 'hidden' }}>
      <div className="mx-camp-head">
        <button className="mx-expand" aria-expanded={open} onClick={() => setOpen(v => !v)}
          aria-label={open ? `Collapse ${name}` : `Expand ${name}`}>
          <IconChevron size={13} className={open ? 'open' : undefined} />
        </button>

        {link
          ? <Link href={link} className="mx-camp-name">{name}</Link>
          : <span className="mx-camp-name">{name}</span>}

        <StatusPill level={groupPhase(ads)} showOk />

        <div className="mx-camp-stats">
          <span className="mx-camp-stat"><b>{money(totalSpend)}</b>spend</span>
          <span className="mx-camp-stat"><b>{totalLeads || '—'}</b>leads</span>
          <span className="mx-camp-stat"><b className="accent">{money(cCpl)}</b>CPL</span>
          <span className="mx-camp-stat"><b className="accent">{money(cCpq)}</b>CPQ</span>
          <span className="mx-camp-stat"><b className="accent">{money(cCpa)}</b>CPA</span>
          <span className="mx-camp-stat"><b className={totalSigned ? 'good' : ''}>{totalSigned || '—'}</b>signed</span>
        </div>
      </div>

      {open && (
        <CreativeTable
          ads={ads}
          ctx={ctx}
          focusAd={focusAd}
          invoiceLink={ad => (ad.firmSlug && ad.latestInvoice
            ? `/finance/firms/${ad.firmSlug}/invoice/${ad.latestInvoice}/marketing`
            : null)}
        />
      )}
    </article>
  )
}
