'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  money, num, compact, pct,
  cplBand, caseBand, bandClass,
  StatusPill, type AlertLevel,
  Overlay, EmptyState,
  IconChevron, IconClose, IconArrow,
} from './dash'

/* ═══════════════════════════════════════════════════════════════════════════
   The creative table, shared by the Ops dashboard and a firm invoice's
   Creatives section.

   Both pages previously carried their own copy of this 24-column table with
   subtly different colouring, thresholds and (in one case) a footer that had
   more cells than the header. One implementation now serves both.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Pipeline stages ────────────────────────────────────────────────────── */

export type StageDef = {
  key: string
  label: string
  short: string
  countKey: string
  listKey: string
  klass: 'open' | 'won' | 'lost'
  tone: string
}

export const STAGES: StageDef[] = [
  { key: 'new_lead',      label: 'New Lead',      short: 'New',      countKey: 'newLeadCount',      listKey: 'newLeadLeads',      klass: 'open', tone: 'var(--mx-ink-2)' },
  { key: 'nr',            label: 'No Response',   short: 'NR',       countKey: 'nrCount',           listKey: 'nrLeads',           klass: 'open', tone: 'var(--mx-muted)' },
  { key: 'fu',            label: 'Follow Up',     short: 'F/U',      countKey: 'fuCount',           listKey: 'fuLeads',           klass: 'open', tone: 'var(--mx-accent-ink)' },
  { key: 'chase',         label: 'Chase',         short: 'Chase',    countKey: 'chaseCount',        listKey: 'chaseLeads',        klass: 'open', tone: 'var(--mx-accent-ink)' },
  { key: 'appointment',   label: 'Appointment',   short: 'Appt',     countKey: 'appointmentCount',  listKey: 'appointmentLeads',  klass: 'open', tone: 'var(--mx-ink)' },
  { key: 'contract_sent', label: 'Contract Sent', short: 'Contract', countKey: 'contractSentCount', listKey: 'contractSentLeads', klass: 'open', tone: 'var(--mx-ink)' },
  { key: 'pending_send',  label: 'Pending Send',  short: 'Pending',  countKey: 'pendingSendCount',  listKey: 'pendingSendLeads',  klass: 'open', tone: 'var(--mx-ink)' },
  { key: 'qualified',     label: 'Qualified',     short: 'Qual',     countKey: 'qualifiedCount',    listKey: 'qualifiedLeads',    klass: 'open', tone: 'var(--mx-good)' },
  { key: 'closed',        label: 'Closed',        short: 'Closed',   countKey: 'closedCount',       listKey: 'closedLeads',       klass: 'won',  tone: 'var(--mx-good)' },
  { key: 'nq',            label: 'Not Qualified', short: 'NQ',       countKey: 'nqCount',           listKey: 'nqLeads',           klass: 'lost', tone: 'var(--mx-crit)' },
  { key: 'mia',           label: 'MIA',           short: 'MIA',      countKey: 'miaCount',          listKey: 'miaLeads',          klass: 'lost', tone: 'var(--mx-muted)' },
]

export const STAGE_BY_KEY: Record<string, StageDef> = Object.fromEntries(STAGES.map(s => [s.key, s]))

/* ── Alerting ───────────────────────────────────────────────────────────────
   Thresholds unchanged from the original ops logic, now returning the reason
   alongside the level so a queue can say *why*.

   Phase 1 (under $600 spent): protect a new angle — only kill if CPL is
   already over $300.  Phase 2 ($600+): read and decide.  Phase 3 (8+ leads,
   2+ signed, healthy CPL and CPA): scale.                                    */

export function alertFor(ad: any): { level: AlertLevel; why: string } {
  const spend = ad.spend ?? 0
  const leads = ad.metaLeads ?? ad.leads ?? 0
  const cpl = ad.cpl ?? null
  const cpa = ad.cpa != null ? parseFloat(String(ad.cpa)) : null
  const signed = ad.signedCases ?? 0

  if (spend < 600) {
    if (cpl != null && cpl > 300) return { level: 'kill', why: `${money(cpl)} per lead before reaching test spend` }
    return { level: 'floor', why: `${money(spend)} of the ${money(600)} test budget spent` }
  }
  if (leads === 0) return { level: 'kill', why: `${money(spend)} spent, zero leads` }
  if (leads >= 8 && signed >= 2 && (cpl == null || cpl <= 300) && (cpa == null || cpa <= 1200))
    return { level: 'scale', why: `${signed} signed at ${money(cpa)} per case` }
  if (cpl != null && cpl > 300 && cpa != null && cpa > 1200 && signed === 0)
    return { level: 'kill', why: `${money(cpl)} per lead and nothing signed` }
  if (cpl != null && cpl > 300) return { level: 'watch', why: `${money(cpl)} per lead, over the ${money(300)} ceiling` }
  if (leads >= 5 && cpl != null && cpl > 220) return { level: 'read_decide', why: `${leads} leads at ${money(cpl)} — enough to call it` }
  if (cpa != null && cpa > 1200) return { level: 'watch', why: `${money(cpa)} per signed case` }
  if (cpl != null && cpl > 220) return { level: 'watch', why: `${money(cpl)} per lead, above the ${money(220)} target` }
  return { level: null, why: '' }
}

export const ALERT_RANK: Record<string, number> = { kill: 0, read_decide: 1, watch: 2, scale: 3, floor: 4 }

export function groupPhase(ads: any[]): AlertLevel {
  const levels = ads.map(a => alertFor(a).level)
  if (levels.includes('scale')) return 'scale'
  if (levels.includes('read_decide')) return 'read_decide'
  if (levels.includes('watch')) return 'watch'
  if (levels.includes('kill')) return 'kill'
  if (levels.includes('floor')) return 'floor'
  return null
}

/* ── Column model ───────────────────────────────────────────────────────────
   Columns are data, so sorting, the density modes and the totals row all
   derive from one list and cannot drift out of alignment.                    */

export type Ctx = {
  openLeads: (ad: any, stage?: string) => void
  openCases?: (ad: any) => void
  openTrend?: (ad: any, metric: string) => void
}

export type Col = {
  key: string
  label: string
  hint?: string
  set: 'perf' | 'pipe' | 'both'
  num?: boolean
  sort?: (ad: any) => number
  cell: (ad: any, ctx: Ctx) => React.ReactNode
  foot?: (ads: any[]) => React.ReactNode
}

const sum = (ads: any[], k: string) => ads.reduce((s, a) => s + (Number(a[k]) || 0), 0)
const leadsOf = (a: any) => a.metaLeads ?? a.leads ?? 0
const dash = <span className="mx-dim">—</span>

function stageCol(s: StageDef): Col {
  return {
    key: s.key,
    label: s.short,
    hint: s.label,
    set: 'pipe',
    num: true,
    sort: ad => Number(ad[s.countKey]) || 0,
    cell: (ad, ctx) => {
      const n = Number(ad[s.countKey]) || 0
      if (!n) return dash
      return (
        <button className="mx-drill" style={{ color: s.tone }}
          onClick={() => ctx.openLeads(ad, s.key)}
          title={`Show the ${n} ${s.label} ${n === 1 ? 'contact' : 'contacts'} for this creative`}>
          {n}
        </button>
      )
    },
    foot: ads => {
      const t = sum(ads, s.countKey)
      return t ? <span style={{ color: s.tone }}>{t}</span> : dash
    },
  }
}

export const COLUMNS: Col[] = [
  {
    key: 'spend', label: 'Spend', set: 'both', num: true,
    sort: ad => ad.spend ?? 0,
    cell: ad => <strong style={{ fontWeight: 650 }}>{money(ad.spend)}</strong>,
    foot: ads => money(sum(ads, 'spend')),
  },
  {
    key: 'leads', label: 'Leads', hint: 'Leads reported by Meta', set: 'both', num: true,
    sort: leadsOf,
    cell: (ad, ctx) => {
      const n = leadsOf(ad)
      if (!n) return dash
      return (
        <button className="mx-drill" onClick={() => ctx.openLeads(ad)}
          title="Show every CRM contact matched to this creative">{n}</button>
      )
    },
    foot: ads => ads.reduce((s, a) => s + leadsOf(a), 0) || dash,
  },
  {
    key: 'cpl', label: 'CPL', hint: 'Cost per lead · target under $220', set: 'perf', num: true,
    sort: ad => ad.cpl ?? Infinity,
    cell: ad => {
      const v = ad.cpl != null ? Number(ad.cpl) : null
      return v == null ? dash : <span className={bandClass(cplBand(v))}>{money(v)}</span>
    },
    foot: ads => {
      const sp = sum(ads, 'spend')
      const l = ads.reduce((s, a) => s + leadsOf(a), 0)
      return l > 0 ? <span style={{ color: 'var(--mx-accent-ink)' }}>{money(sp / l)}</span> : dash
    },
  },
  {
    key: 'cpc', label: 'CPC', hint: 'Cost per link click', set: 'perf', num: true,
    sort: ad => ad.cpc ?? Infinity,
    cell: ad => ad.cpc != null ? <span style={{ color: 'var(--mx-muted)' }}>{money(ad.cpc, { cents: true })}</span> : dash,
    foot: ads => {
      const c = sum(ads, 'clicks')
      return c > 0 ? money(sum(ads, 'spend') / c, { cents: true }) : dash
    },
  },
  {
    key: 'ctr', label: 'CTR', hint: 'Click-through rate', set: 'perf', num: true,
    sort: ad => ad.ctr ?? 0,
    cell: ad => ad.ctr ? <span style={{ color: 'var(--mx-muted)' }}>{pct(Number(ad.ctr))}</span> : dash,
    foot: ads => {
      const imp = sum(ads, 'impressions')
      return imp > 0 ? pct((sum(ads, 'clicks') / imp) * 100) : dash
    },
  },
  {
    key: 'impressions', label: 'Impr.', hint: 'Impressions', set: 'perf', num: true,
    sort: ad => ad.impressions ?? 0,
    cell: ad => ad.impressions ? <span style={{ color: 'var(--mx-muted)' }}>{compact(ad.impressions)}</span> : dash,
    foot: ads => compact(sum(ads, 'impressions')),
  },
  {
    key: 'clicks', label: 'Clicks', set: 'perf', num: true,
    sort: ad => ad.clicks ?? 0,
    cell: ad => ad.clicks ? <span style={{ color: 'var(--mx-muted)' }}>{num(ad.clicks)}</span> : dash,
    foot: ads => num(sum(ads, 'clicks')),
  },
  {
    key: 'lpv', label: 'LPVs', hint: 'Landing page views', set: 'perf', num: true,
    sort: ad => ad.landingPageViews ?? 0,
    cell: ad => ad.landingPageViews ? <span style={{ color: 'var(--mx-muted)' }}>{num(ad.landingPageViews)}</span> : dash,
    foot: ads => num(sum(ads, 'landingPageViews')),
  },
  {
    key: 'c2l', label: 'Click→Lead', hint: 'Share of clicks that became a lead · under 0.5% is a landing-page problem', set: 'perf', num: true,
    sort: ad => ad.clickToLeadPct ?? 0,
    cell: ad => {
      const v = ad.clickToLeadPct != null ? Number(ad.clickToLeadPct) : null
      if (v == null) return dash
      return <span className={v < 0.5 ? 'mx-v-crit' : ''} style={{ color: v < 0.5 ? undefined : 'var(--mx-muted)' }}>{pct(v)}</span>
    },
    foot: ads => {
      const c = sum(ads, 'clicks')
      const l = ads.reduce((s, a) => s + leadsOf(a), 0)
      return c > 0 ? pct((l / c) * 100) : dash
    },
  },
  {
    key: 'lpv2l', label: 'LPV→Lead', hint: 'Share of landing page views that became a lead', set: 'perf', num: true,
    sort: ad => ad.lpvToLeadPct ?? 0,
    cell: ad => ad.lpvToLeadPct != null ? <span style={{ color: 'var(--mx-muted)' }}>{pct(Number(ad.lpvToLeadPct))}</span> : dash,
    foot: ads => {
      const v = sum(ads, 'landingPageViews')
      const l = ads.reduce((s, a) => s + leadsOf(a), 0)
      return v > 0 ? pct((l / v) * 100) : dash
    },
  },

  ...STAGES.map(stageCol),

  {
    key: 'signed', label: 'Signed', hint: 'Signed cases attributed to this creative', set: 'both', num: true,
    sort: ad => ad.signedCases ?? 0,
    cell: (ad, ctx) => {
      const n = ad.signedCases ?? 0
      if (!n) return dash
      if (!ctx.openCases) return <strong style={{ color: 'var(--mx-good)', fontWeight: 700 }}>{n}</strong>
      return (
        <button className="mx-drill" style={{ color: 'var(--mx-good)', fontWeight: 700 }}
          onClick={() => ctx.openCases!(ad)} title={`Open the ${n} signed ${n === 1 ? 'case' : 'cases'}`}>
          {n}
        </button>
      )
    },
    foot: ads => {
      const t = sum(ads, 'signedCases')
      return t ? <span style={{ color: 'var(--mx-good)' }}>{t}</span> : dash
    },
  },
  {
    key: 'cpa', label: 'CPA', hint: 'Spend ÷ signed cases · target under $1,200', set: 'both', num: true,
    sort: ad => ad.cpa ?? Infinity,
    cell: ad => {
      const v = ad.cpa != null ? Number(ad.cpa) : null
      return v == null ? dash : <span className={bandClass(caseBand(v))}>{money(v)}</span>
    },
    foot: ads => {
      const s = sum(ads, 'signedCases')
      return s > 0 ? <span style={{ color: 'var(--mx-accent-ink)' }}>{money(sum(ads, 'spend') / s)}</span> : dash
    },
  },
  {
    key: 'cpq', label: 'CPQ', hint: 'Spend ÷ (chase + signed) · target under $1,200', set: 'both', num: true,
    sort: ad => ad.cpq ?? Infinity,
    cell: ad => {
      const v = ad.cpq != null ? Number(ad.cpq) : null
      return v == null ? dash : <span className={bandClass(caseBand(v))}>{money(v)}</span>
    },
    foot: ads => {
      const q = sum(ads, 'chaseCount') + sum(ads, 'signedCases')
      return q > 0 ? <span style={{ color: 'var(--mx-accent-ink)' }}>{money(sum(ads, 'spend') / q)}</span> : dash
    },
  },
]

export type Density = 'perf' | 'pipe' | 'all'

export function colsFor(d: Density) {
  return d === 'all' ? COLUMNS : COLUMNS.filter(c => c.set === 'both' || c.set === d)
}

export const DENSITY_LABEL: Record<Density, string> = {
  perf: 'Delivery', pipe: 'Pipeline', all: 'Everything',
}

/* ── The table ──────────────────────────────────────────────────────────── */

export function CreativeTable({
  ads, ctx, focusAd, activeIds, invoiceLink, toolbarNote,
}: {
  ads: any[]
  ctx: Ctx
  focusAd?: string | null
  /** Ads delivering today — surfaced as a dot and used as the primary sort. */
  activeIds?: Set<string>
  invoiceLink?: (ad: any) => string | null
  toolbarNote?: React.ReactNode
}) {
  const [density, setDensity] = useState<Density>('perf')
  const [sortKey, setSortKey] = useState('spend')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expanded, setExpanded] = useState<string | null>(null)

  const cols = colsFor(density)

  const sorted = useMemo(() => {
    const col = COLUMNS.find(c => c.key === sortKey)
    const dir = sortDir === 'asc' ? 1 : -1
    const byActive = (a: any, b: any) => {
      if (!activeIds) return 0
      const av = activeIds.has(a.adId ?? a.id) ? 1 : 0
      const bv = activeIds.has(b.adId ?? b.id) ? 1 : 0
      return bv - av
    }
    if (!col?.sort) return [...ads].sort(byActive)
    return [...ads].sort((a, b) => {
      const act = byActive(a, b)
      if (act !== 0) return act
      const av = col.sort!(a), bv = col.sort!(b)
      if (av === bv) return (b.spend || 0) - (a.spend || 0)
      // Unmeasurable values sink regardless of direction
      if (!Number.isFinite(av)) return 1
      if (!Number.isFinite(bv)) return -1
      return (av - bv) * dir
    })
  }, [ads, sortKey, sortDir, activeIds])

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  if (ads.length === 0) {
    return (
      <EmptyState
        title="No creatives in this range"
        text="Meta returned no delivery for these dates. Widen the range, or check that the ad account is still linked."
      />
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--mx-line-2)', flexWrap: 'wrap' }}>
        <span className="mx-eyebrow">Columns</span>
        <div className="mx-seg" role="group" aria-label="Column set">
          {(['perf', 'pipe', 'all'] as Density[]).map(d => (
            <button key={d} className="mx-seg-btn" aria-pressed={density === d} onClick={() => setDensity(d)}>
              {DENSITY_LABEL[d]}
            </button>
          ))}
        </div>
        <span className="mx-section-note" style={{ marginLeft: 'auto' }}>
          {toolbarNote ?? `${ads.length} ${ads.length === 1 ? 'creative' : 'creatives'} · expand a row for the full stage breakdown`}
        </span>
      </div>

      <div className="mx-tw">
        <table className="mx-table">
          <thead>
            <tr>
              <th className="mx-sticky mx-sticky-first" style={{ width: 34 }} />
              <th className="mx-sticky mx-sticky-name">Creative</th>
              <th>Status</th>
              {density !== 'pipe' && <th>Ad set</th>}
              {cols.map(c => (
                <th key={c.key}
                  className={`sortable ${c.num ? 'num' : ''}`}
                  title={c.hint}
                  aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  onClick={() => toggleSort(c.key)}>
                  {c.label}
                  <span className="sort-caret">{sortKey === c.key && sortDir === 'asc' ? '↑' : '↓'}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sorted.map((ad, i) => {
              const id = ad.adId ?? ad.id ?? String(i)
              const { level } = alertFor(ad)
              const isOpen = expanded === id
              const flag = level === 'kill' ? 'flagged-kill' : level === 'scale' ? 'flagged-scale' : ''
              const live = activeIds ? activeIds.has(id) : (ad.isActive ?? ad.spend > 0)
              return (
                <CreativeRow key={id}
                  id={id} ad={ad} level={level} live={live} isOpen={isOpen} flag={flag}
                  cols={cols} density={density} ctx={ctx} focusAd={focusAd ?? null}
                  invoiceLink={invoiceLink}
                  onToggle={() => setExpanded(isOpen ? null : id)} />
              )
            })}
          </tbody>

          <tfoot>
            <tr>
              <td className="mx-sticky mx-sticky-first" />
              <td className="mx-sticky mx-sticky-name lbl">Total</td>
              <td />
              {density !== 'pipe' && <td />}
              {cols.map(c => (
                <td key={c.key} className={c.num ? 'num' : ''}>{c.foot ? c.foot(ads) : null}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

function CreativeRow({
  id, ad, level, live, isOpen, flag, cols, density, ctx, focusAd, invoiceLink, onToggle,
}: {
  id: string
  ad: any
  level: AlertLevel
  live: boolean
  isOpen: boolean
  flag: string
  cols: Col[]
  density: Density
  ctx: Ctx
  focusAd: string | null
  invoiceLink?: (ad: any) => string | null
  onToggle: () => void
}) {
  const colSpan = 3 + (density !== 'pipe' ? 1 : 0) + cols.length
  const href = invoiceLink?.(ad) ?? null

  return (
    <>
      <tr id={`ad-${id}`} className={`row ${flag} ${isOpen ? 'is-open' : ''} ${focusAd === id ? 'flash' : ''}`}>
        <td className="mx-sticky mx-sticky-first">
          <button className={`mx-expand ${isOpen ? 'open' : ''}`} onClick={onToggle} aria-expanded={isOpen}
            aria-label={isOpen ? 'Hide stage breakdown' : 'Show stage breakdown'}>
            <IconChevron size={12} />
          </button>
        </td>

        <td className="mx-sticky mx-sticky-name">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`mx-dot ${live ? 'on' : 'off'}`}
              title={live ? 'Delivering today' : 'No delivery today'} />
            <span style={{ minWidth: 0 }}>
              <span className="mx-creative" style={{ display: 'block' }} title={ad.adName || ad.name}>
                {ad.adName || ad.name || 'Unnamed creative'}
              </span>
              <span className="mx-creative-id">{id}</span>
            </span>
          </div>
        </td>

        <td><StatusPill level={level} showOk /></td>

        {density !== 'pipe' && (
          <td style={{ color: 'var(--mx-muted)', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={ad.adsetName}>
            {ad.adsetName || '—'}
          </td>
        )}

        {cols.map(c => (
          <td key={c.key} className={c.num ? 'num' : ''}>{c.cell(ad, ctx)}</td>
        ))}
      </tr>

      {isOpen && (
        <tr className="mx-detail">
          <td colSpan={colSpan} style={{ padding: 0 }}>
            <div className="mx-detail-inner">
              <div>
                <p className="mx-eyebrow" style={{ marginBottom: 8 }}>Every stage for this creative</p>
                <div className="mx-detail-grid">
                  {STAGES.map(s => {
                    const n = Number(ad[s.countKey]) || 0
                    return (
                      <button key={s.key} className="mx-stage-btn" disabled={n === 0}
                        onClick={() => n > 0 && ctx.openLeads(ad, s.key)}>
                        <span className="mx-stage-btn-label">{s.label}</span>
                        <span className="mx-stage-btn-val" style={{ color: n ? s.tone : 'var(--mx-faint)' }}>{n}</span>
                      </button>
                    )
                  })}
                  <button className="mx-stage-btn" disabled={!ad.signedCases || !ctx.openCases}
                    onClick={() => ad.signedCases && ctx.openCases?.(ad)}>
                    <span className="mx-stage-btn-label">Signed</span>
                    <span className="mx-stage-btn-val" style={{ color: ad.signedCases ? 'var(--mx-good)' : 'var(--mx-faint)' }}>
                      {ad.signedCases ?? 0}
                    </span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--mx-muted)', alignItems: 'center' }}>
                <span>Ad set <b style={{ color: 'var(--mx-ink-2)', fontWeight: 600 }}>{ad.adsetName || '—'}</b></span>
                <span>Impressions <b style={{ color: 'var(--mx-ink-2)', fontWeight: 600 }}>{num(ad.impressions)}</b></span>
                <span>Clicks <b style={{ color: 'var(--mx-ink-2)', fontWeight: 600 }}>{num(ad.clicks)}</b></span>
                <span>Landing page views <b style={{ color: 'var(--mx-ink-2)', fontWeight: 600 }}>{num(ad.landingPageViews)}</b></span>
                {ad.reach != null && <span>Reach <b style={{ color: 'var(--mx-ink-2)', fontWeight: 600 }}>{num(ad.reach)}</b></span>}
                {ad.campaignName && <span>Campaign <b style={{ color: 'var(--mx-ink-2)', fontWeight: 600 }}>{ad.campaignName}</b></span>}
                {ad.firmName && <span>Firm <b style={{ color: 'var(--mx-ink-2)', fontWeight: 600 }}>{ad.firmName}</b></span>}

                {ctx.openTrend && (
                  <button className="mx-btn mx-btn-quiet" style={{ padding: '4px 10px' }}
                    onClick={() => ctx.openTrend!(ad, 'cpl')}>
                    Day-by-day trend
                  </button>
                )}

                {href && (
                  <Link href={href} style={{ color: 'var(--mx-accent-ink)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Open firm invoice <IconArrow size={13} />
                  </Link>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/* ── Leads slide-over ───────────────────────────────────────────────────────
   A side sheet rather than a centered modal, so the row you drilled from stays
   in view while you read the contacts behind it.                             */

export function LeadsSheet({ ad, stage, onClose, onStage }: {
  ad: any
  stage?: string
  onClose: () => void
  onStage: (s?: string) => void
}) {
  const all = useMemo(() => {
    const rows: any[] = []
    for (const s of STAGES) for (const lead of (ad[s.listKey] || [])) rows.push({ ...lead, stage: s.key })
    return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  }, [ad])

  const present = STAGES.filter(s => (Number(ad[s.countKey]) || 0) > 0)
  const shown = stage ? all.filter(l => l.stage === stage) : all
  const metaLeads = ad.metaLeads ?? ad.leads ?? 0
  const def = stage ? STAGE_BY_KEY[stage] : null

  return (
    <Overlay onClose={onClose} variant="sheet" labelledBy="leads-title">
      <div className="mx-sheet-head">
        <div style={{ minWidth: 0 }}>
          <p className="mx-eyebrow" style={{ marginBottom: 5 }}>{def ? def.label : 'All matched contacts'}</p>
          <h2 id="leads-title" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.3, margin: 0 }}>
            {ad.adName || ad.name || 'Unnamed creative'}
          </h2>
          {(ad.adId || ad.id) && <p className="mx-creative-id" style={{ marginTop: 4 }}>{ad.adId || ad.id}</p>}
        </div>
        <button className="mx-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
      </div>

      {present.length > 0 && (
        <div style={{ padding: '11px 22px', borderBottom: '1px solid var(--mx-line-2)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="mx-seg-btn" aria-pressed={!stage} onClick={() => onStage(undefined)}
            style={{ background: !stage ? 'var(--mx-surface-3)' : undefined }}>
            All <b style={{ fontVariantNumeric: 'tabular-nums' }}>{all.length}</b>
          </button>
          {present.map(s => (
            <button key={s.key} className="mx-seg-btn" aria-pressed={stage === s.key}
              onClick={() => onStage(s.key)}
              style={{ background: stage === s.key ? 'var(--mx-surface-3)' : undefined, color: stage === s.key ? s.tone : undefined }}>
              {s.label} <b style={{ fontVariantNumeric: 'tabular-nums' }}>{ad[s.countKey]}</b>
            </button>
          ))}
        </div>
      )}

      <div className="mx-sheet-body">
        {shown.length === 0 ? (
          <EmptyState
            title={all.length === 0 ? 'No CRM contacts matched' : `No contacts in ${def?.label ?? 'this stage'}`}
            text={all.length === 0
              ? 'Meta counted leads for this creative but none have been matched back to a CRM contact. Matching runs on the ad ID carried in the lead’s UTM.'
              : 'Pick another stage above to see the contacts that are there.'}
          />
        ) : (
          <table className="mx-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Phone</th>
                <th>Stage</th>
                <th className="num">Created</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((lead, i) => {
                const s = STAGE_BY_KEY[lead.stage]
                return (
                  <tr className="row" key={`${lead.id || lead.phone || i}-${i}`}>
                    <td style={{ fontWeight: 600 }}>{lead.name || 'Unnamed contact'}</td>
                    <td style={{ color: 'var(--mx-muted)', fontSize: 12 }}>{lead.phone || '—'}</td>
                    <td><span className="mx-chip" style={{ color: s?.tone }}>{s?.label ?? lead.stage}</span></td>
                    <td className="num" style={{ color: 'var(--mx-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {lead.createdAt
                        ? new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mx-sheet-foot" style={{ fontSize: 11.5, color: 'var(--mx-muted)', gap: 18 }}>
        <span><b style={{ color: 'var(--mx-ink)' }}>{all.length}</b> matched in the CRM</span>
        <span><b style={{ color: 'var(--mx-ink)' }}>{metaLeads}</b> reported by Meta</span>
        {all.length !== metaLeads && metaLeads > 0 && (
          <span style={{ marginLeft: 'auto', color: 'var(--mx-warn)' }}>
            {Math.abs(metaLeads - all.length)} unmatched
          </span>
        )}
      </div>
    </Overlay>
  )
}
