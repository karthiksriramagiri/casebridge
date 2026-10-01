'use client'

import { useEffect, useMemo, useState } from 'react'
import { money, num } from '@/app/_metrics/dash'
import { BENCH, bandUp, bandDown, type Band } from '@/app/_metrics/benchmarks'
import { statusOf, SUGGEST, type Suggestion } from '@/app/_metrics/suggest'

/* ═══════════════════════════════════════════════════════════════════════════
   Creative Analysis — the list, and one creative in full.

   The table is organised as the funnel, left to right: Exposure → Attention →
   Engagement → Conversion → Outcome. A row read straight across is the story
   of where that creative gains or loses people, which is what makes a wide
   table worth its width — the column groups are the analysis, not decoration.

   Clicking a row opens the same funnel vertically for one creative, against
   the account's own averages rather than fixed thresholds.
   ═══════════════════════════════════════════════════════════════════════════ */

type Ad = any

const TABS = [
  { key: 'all',    label: 'All Creatives' },
  { key: 'top',    label: 'Top Performers' },
  { key: 'under',  label: 'Underperformers' },
  { key: 'new',    label: 'New Creatives' },
] as const

/* The five funnel stages and the columns that belong to each. Declared as
   data so the header groups, the colgroups and the body cells cannot drift
   out of alignment — which is exactly how a 20-column table rots. */
const GROUPS = [
  { key: 'exposure',   label: 'Exposure',   cols: ['spend', 'impressions', 'cpm'] },
  { key: 'attention',  label: 'Attention',  cols: ['hookRate', 'p25', 'p50', 'p100'] },
  { key: 'engagement', label: 'Engagement', cols: ['linkCtr', 'linkCpc', 'linkClicks'] },
  { key: 'conversion', label: 'Conversion', cols: ['leads', 'leadCvr', 'cpl'] },
  { key: 'outcome',    label: 'Outcome',    cols: ['cpq', 'cpa'] },
]

const COL_LABEL: Record<string, string> = {
  spend: 'Spend', impressions: 'Impressions', cpm: 'CPM',
  hookRate: 'Hook Rate', p25: '25% View', p50: '50% View', p100: '100% View',
  linkCtr: 'Link CTR', linkCpc: 'CPC', linkClicks: 'Link Clicks',
  leads: 'Leads', leadCvr: 'Lead CVR', cpl: 'CPL',
  cpq: 'CPQ', cpa: 'CPA',
}

/* Sorting a verdict alphabetically ("CUT, KEEP, WATCH") tells you nothing.
   Both verdict columns rank best → worst instead, so descending puts winners
   on top exactly like the numeric columns, and ascending surfaces the
   problems — and, for Decision, the rows nobody has called yet. */
/* Best → worst, so descending puts winners on top. KEEP sits above TEST: a
   lead yesterday is weak evidence, but it is evidence. */
const SUGGESTED_RANK: Record<string, number> = {
  winner: 5, keep: 4, test: 3, learning: 2, watch: 1, cut: 0,
}
const DECISION_RANK: Record<string, number> = {
  keep: 3, watch: 2, learning: 1, kill: 0,
}
const UNDECIDED_RANK = -1

const pctOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null)

function quartile(ad: Ad, key: 'p25' | 'p50' | 'p100'): number | null {
  const plays = ad.videoPlays || 0
  if (!plays) return null
  return pctOf(ad[key] || 0, plays)
}

function cellValue(ad: Ad, col: string): number | null {
  switch (col) {
    case 'p25': case 'p50': case 'p100': return quartile(ad, col as any)
    case 'leadCvr': return ad.leadCvr ?? ad.clickToLead ?? null
    default: return ad[col] ?? null
  }
}

function fmtCell(col: string, v: number | null): string {
  if (v == null) return '—'
  switch (col) {
    case 'spend': case 'cpl': case 'cpq': case 'cpa': return money(v)
    case 'cpm': case 'linkCpc': return money(v, { cents: true })
    case 'impressions': case 'linkClicks': case 'leads': return num(v)
    case 'hookRate': case 'p25': case 'p50': case 'p100': return `${Math.round(v)}%`
    case 'linkCtr': return `${v.toFixed(2)}%`
    case 'leadCvr': return `${v.toFixed(1)}%`
    default: return String(v)
  }
}

/** Only the columns a band is actually defined for get coloured. */
function bandFor(col: string, v: number | null): Band {
  switch (col) {
    case 'hookRate': return bandUp(v, BENCH.hookRate)
    case 'linkCtr':  return bandUp(v, BENCH.ctrCreative)
    case 'leadCvr':  return bandUp(v, BENCH.clickToLead)
    case 'cpl':      return bandDown(v, BENCH.cpl)
    case 'linkCpc':  return bandDown(v, BENCH.linkCpc)
    default: return null
  }
}

/* Deltas the API already computes, mapped to the columns that have one. A
   column without a delta shows none rather than a fabricated 0%. */
const DELTA_KEY: Record<string, string> = {
  cpl: 'cpl', linkCtr: 'linkCtr', linkCpc: 'linkCpc',
}
const LOWER_IS_BETTER = new Set(['cpm', 'linkCpc', 'cpl', 'cpq', 'cpa'])

export function CreativeAnalysisView({ ads, benchmarks, summary, selectedId, onSelect, level, outcomesLoading }: {
  ads: Ad[]
  benchmarks: any
  summary: any
  selectedId: string | null
  onSelect: (id: string | null) => void
  level: string
  outcomesLoading?: boolean
}) {
  const [tab, setTab] = useState<string>('all')
  const [q, setQ] = useState('')
  const [format, setFormat] = useState('all')
  const [language, setLanguage] = useState('all')
  const [state, setState] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'spend', dir: 'desc' })

  /* The human call, kept apart from the suggestion. The Suggested column is
     what the thresholds infer; Decision is what someone actually decided, and
     only the second one is a commitment. Recorded, never acted on — nothing
     here pauses an ad in Meta. */
  const [review, setReview] = useState<ReviewKey | null>(null)
  const [decision, setDecision] = useState('all')
  const [decisions, setDecisions] = useState<Record<string, string>>({})
  const [decisionsLocked, setDecisionsLocked] = useState(false)
  const [decisionErr, setDecisionErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/creative/decisions')
      .then(r => r.json())
      .then(d => {
        setDecisionsLocked(!!d.needsMigration)
        const map: Record<string, string> = {}
        for (const [id, row] of Object.entries<any>(d.decisions || {})) map[id] = row.decision
        setDecisions(map)
      })
      .catch(() => {})
  }, [])

  async function decide(ad: Ad, decision: string) {
    const prev = decisions[ad.id]
    // Optimistic: the select reflects the choice at once and reverts if the
    // write fails, so a dropped request never silently looks recorded.
    setDecisions(d => ({ ...d, [ad.id]: decision }))
    const res = await fetch('/api/creative/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adId: ad.id, adName: ad.name, decision,
        cpl: ad.cpl, spend: ad.spend, verdict: statusOf(ad).key,
      }),
    })
    if (!res.ok) {
      setDecisions(d => { const n = { ...d }; if (prev) n[ad.id] = prev; else delete n[ad.id]; return n })
      if (res.status === 503) setDecisionsLocked(true)
      /* Reverting the dropdown without saying why looks like the click missed.
         The constraint message in particular is actionable — it means the
         migration needs re-running to accept 'learning'. */
      const body = await res.json().catch(() => ({}))
      setDecisionErr(
        /check constraint/i.test(body.error || '')
          ? 'This value is not accepted yet — re-run supabase/migration_creative_decisions.sql.'
          : body.error || 'Could not save that decision.')
      setTimeout(() => setDecisionErr(null), 6000)
    } else {
      setDecisionErr(null)
    }
  }

  const selected = useMemo(() => ads.find(a => a.id === selectedId) ?? null, [ads, selectedId])

  /* ── Filtering ────────────────────────────────────────────────────────── */

  const options = useMemo(() => ({
    formats: [...new Set(ads.map(a => a.format).filter(Boolean))].sort(),
    languages: [...new Set(ads.map(a => a.language).filter(Boolean))].sort(),
    states: [...new Set(ads.map(a => a.state).filter(Boolean))].sort(),
  }), [ads])

  const rows = useMemo(() => {
    let out = ads
    if (tab === 'top') out = out.filter(a => statusOf(a).key === 'winner')
    if (tab === 'under') out = out.filter(a => ['cut', 'watch'].includes(statusOf(a).key))
    if (tab === 'new') out = out.filter(a => statusOf(a).key === 'learning')
    if (format !== 'all') out = out.filter(a => a.format === format)
    if (language !== 'all') out = out.filter(a => a.language === language)
    if (state !== 'all') out = out.filter(a => a.state === state)
    if (status !== 'all') out = out.filter(a => statusOf(a).key === status)
    if (review) out = out.filter(a => matchesReview(a, review))
    if (decision !== 'all') {
      out = decision === 'none'
        ? out.filter(a => !decisions[a.id])
        : out.filter(a => decisions[a.id] === decision)
    }
    if (q.trim()) {
      const needle = q.toLowerCase()
      out = out.filter(a => (a.name || '').toLowerCase().includes(needle)
        || (a.angle || '').toLowerCase().includes(needle))
    }
    /* Verdicts are ordinal, not numeric, so they rank rather than measure —
       but both paths return a number, which keeps one comparator. */
    const rankOf = (ad: Ad): number | null => {
      if (sort.col === 'suggested') return SUGGESTED_RANK[statusOf(ad).key] ?? UNDECIDED_RANK
      if (sort.col === 'decision')  return DECISION_RANK[decisions[ad.id] ?? ''] ?? UNDECIDED_RANK
      return cellValue(ad, sort.col)
    }

    const dir = sort.dir === 'desc' ? -1 : 1
    return [...out].sort((x, y) => {
      const a = rankOf(x), b = rankOf(y)
      if (a == null) return 1
      if (b == null) return -1
      // Ties keep the heavier spender first so the order stays stable and the
      // rows that matter most sit at the top of each group.
      if (a === b) return (y.spend ?? 0) - (x.spend ?? 0)
      return (a - b) * dir
    })
  }, [ads, tab, format, language, state, status, review, decision, decisions, q, sort])

  const reviewCounts = useMemo(() => ({
    noLeads:     ads.filter(a => matchesReview(a, 'noLeads')).length,
    highCpl:     ads.filter(a => matchesReview(a, 'highCpl')).length,
    underPacing: ads.filter(a => matchesReview(a, 'underPacing')).length,
  }), [ads])

  /* CPQ and CPA collapse into one number whenever the Chase stage is empty.
     Two identical columns read as a bug, so the reason is stated rather than
     left for someone to discover. */
  /* Signed and qualified totals are summed here rather than served with the
     rest of the summary, because they land on a later request. */
  const outcomeTotals = useMemo(() => ({
    qualified: ads.reduce((t, a) => t + (a.qualified || 0), 0),
    signed: ads.reduce((t, a) => t + (a.signed || 0), 0),
    hasAny: ads.some(a => a.qualified != null),
  }), [ads])

  const cpqCollapsed = useMemo(() => {
    const withBoth = ads.filter(a => a.cpq != null && a.cpa != null)
    return withBoth.length > 0 && withBoth.every(a => Math.abs(a.cpq - a.cpa) < 0.01)
  }, [ads])

  const tabCount = (k: string) => {
    if (k === 'all') return ads.length
    if (k === 'top') return ads.filter(a => statusOf(a).key === 'winner').length
    if (k === 'under') return ads.filter(a => ['cut', 'watch'].includes(statusOf(a).key)).length
    return ads.filter(a => statusOf(a).key === 'learning').length
  }

  function toggleSort(col: string) {
    setSort(s => s.col === col ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })
  }

  if (selected) {
    return <CreativeDetail ad={selected} benchmarks={benchmarks} onBack={() => onSelect(null)} />
  }

  return (
    <>
      {/* ── KPI strip ──────────────────────────────────────────────────── */}
      <div className="ka-kpis">
        <Kpi label="Total Creatives" value={num(summary?.creatives ?? ads.length)} tone="ink" />
        <Kpi label="Total Spend"     value={money(summary?.spend ?? 0)} tone="ink" />
        <Kpi label="Total Leads"     value={num(summary?.leads ?? 0)} tone="ink" />
        <Kpi label="Avg. CPL"        value={summary?.cpl != null ? money(summary.cpl) : '—'}
             tone={bandDown(summary?.cpl ?? null, BENCH.cpl) === 'good' ? 'good' : 'warn'} />
        <Kpi label="Qualified Leads"
          value={outcomeTotals.hasAny ? num(outcomeTotals.qualified) : '…'} tone="ink" />
        <Kpi label="Signed Cases"
          value={outcomeTotals.hasAny ? num(outcomeTotals.signed) : '…'} tone="good" />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="ka-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key}
            className={`ka-tab${tab === t.key ? ' is-on' : ''}`}
            onClick={() => setTab(t.key)}>
            {t.label} <span className="ka-tab-n">({tabCount(t.key)})</span>
          </button>
        ))}
        <input className="ka-search" placeholder="Search creatives, angles, keywords…"
          value={q} onChange={e => setQ(e.target.value)} aria-label="Search creatives" />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="ka-filters">
        <Select label="Format"   value={format}   onChange={setFormat}   options={options.formats} />
        <Select label="Language" value={language} onChange={setLanguage} options={options.languages} />
        <Select label="State"    value={state}    onChange={setState}    options={options.states} />
        <Select label="Suggested" value={status}  onChange={setStatus}
          options={['winner', 'keep', 'test', 'watch', 'cut', 'learning']} />
        <Select label="Decision" value={decision} onChange={setDecision}
          options={['keep', 'watch', 'kill', 'learning', 'none']} />
        {(format !== 'all' || language !== 'all' || state !== 'all' || status !== 'all'
          || decision !== 'all' || review || q) && (
          <button className="ka-clear" onClick={() => {
            setFormat('all'); setLanguage('all'); setState('all'); setStatus('all')
            setDecision('all'); setReview(null); setQ('')
          }}>Clear</button>
        )}
        <span className="ka-count">{rows.length} of {ads.length}</span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="mx-card ka-wrap">
        <table className="ka-table">
          <thead>
            <tr className="ka-group-row">
              <th className="ka-creative-col" />
              {GROUPS.map(g => (
                <th key={g.key} colSpan={g.cols.length} className={`ka-group is-${g.key}`}>{g.label}</th>
              ))}
              <th /><th />
            </tr>
            <tr>
              <th className="ka-creative-col">Creative</th>
              {GROUPS.flatMap(g => g.cols).map(col => (
                <th key={col} className={`ka-num ka-sortable${sort.col === col ? ' is-sorted' : ''}`}
                  onClick={() => toggleSort(col)}
                  title={`Sort by ${COL_LABEL[col]}`}>
                  {COL_LABEL[col]}
                  <span className="ka-sort-mark">{sort.col === col ? (sort.dir === 'desc' ? '↓' : '↑') : ''}</span>
                </th>
              ))}
              {(['suggested', 'decision'] as const).map(col => (
                <th key={col} className={`ka-sortable${sort.col === col ? ' is-sorted' : ''}`}
                  onClick={() => toggleSort(col)}
                  title={col === 'decision'
                    ? 'Sort by decision — ascending brings undecided rows to the top'
                    : 'Sort by suggestion'}>
                  {col === 'suggested' ? 'Suggested' : 'Decision'}
                  <span className="ka-sort-mark">{sort.col === col ? (sort.dir === 'desc' ? '↓' : '↑') : ''}</span>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(ad => {
              const st = statusOf(ad)
              return (
                <tr key={ad.id} className="ka-row" onClick={() => onSelect(ad.id)}>
                  <td className="ka-creative-col">
                    <div className="ka-creative">
                      <Thumb ad={ad} />
                      <div className="ka-creative-text">
                        <span className="ka-name">{ad.creativeId || shortName(ad.name)}</span>
                        <span className="ka-meta">
                          {[ad.format, ad.language, ad.state].filter(Boolean).join(' | ')}
                          {ad.angle ? ` · ${ad.angle}` : ''}
                        </span>
                      </div>
                    </div>
                  </td>

                  {GROUPS.flatMap(g => g.cols).map(col => {
                    const v = cellValue(ad, col)
                    const band = bandFor(col, v)
                    const dk = DELTA_KEY[col]
                    const dv = dk ? ad.delta?.[dk] : null
                    return (
                      <td key={col} className={`ka-num${band ? ` is-${band}` : ''}`}>
                        <span className="ka-v">
                          {v == null && outcomesLoading && (col === 'cpq' || col === 'cpa')
                            ? <span className="ka-pending" title="Pipeline data still loading">···</span>
                            : fmtCell(col, v)}
                        </span>
                        {dv != null && isFinite(dv) && Math.abs(Math.round(dv)) >= 5 && (
                          <span className={`ka-d ${deltaGood(col, dv) ? 'is-good' : 'is-bad'}`}>
                            {dv > 0 ? '↑' : '↓'}{Math.abs(Math.round(dv))}%
                          </span>
                        )}
                      </td>
                    )
                  })}

                  <td><SuggestBadge s={st} /></td>
                  <td onClick={e => e.stopPropagation()}>
                    <DecisionSelect value={decisions[ad.id]} disabled={decisionsLocked}
                      onChange={v => decide(ad, v)} />
                  </td>
                  <td>
                    <button className="ka-view" onClick={e => { e.stopPropagation(); onSelect(ad.id) }}>
                      View
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="ka-empty">No creatives match these filters.</p>}
      </div>

      {decisionErr && <p className="ka-decision-err">{decisionErr}</p>}

      {/* ── Creatives to review ───────────────────────────────────────── */}
      <section className="ka-review">
        <div className="ka-review-head">
          <div>
            <h3 className="ka-review-title">Creatives to review</h3>
            <p className="ka-review-sub">Items that need attention. Click a card to filter the table.</p>
          </div>
          {review && (
            <button className="ka-clear" onClick={() => setReview(null)}>Show all</button>
          )}
        </div>
        <div className="ka-review-cards">
          {REVIEW_CARDS.map(c => {
            const n = reviewCounts[c.key]
            const on = review === c.key
            return (
              <button key={c.key}
                className={`ka-review-card is-${c.tone}${on ? ' is-on' : ''}`}
                aria-pressed={on}
                disabled={n === 0 && !on}
                onClick={() => setReview(on ? null : c.key)}>
                <span className="ka-review-n">{n}</span>
                <span className="ka-review-text">
                  <span className="ka-review-t">{c.title}</span>
                  <span className="ka-review-s">{c.sub}</span>
                </span>
                <span className="ka-review-arrow" aria-hidden="true">›</span>
              </button>
            )
          })}
        </div>
      </section>

      <p className="ka-foot">
        Columns read left to right as the funnel. Quartiles are a share of video plays;
        static creative has no hook rate or retention and shows a dash.
        {level !== 'ad' && ' Outcome figures are only attributable at ad level.'}
        {outcomesLoading && <> <strong>Outcome columns are still loading</strong> — they come from the
          lead pipeline, which answers more slowly than Meta.</>}
        {cpqCollapsed && (
          <> <strong>CPQ currently equals CPA</strong> on every creative because no leads are
          sitting in Chase — qualified is counted as “reached chase or beyond”, so with that stage
          empty the two measure the same thing. They separate again as soon as the pipeline holds
          chase-stage leads.</>
        )}
      </p>
    </>
  )
}

function deltaGood(col: string, v: number) {
  return LOWER_IS_BETTER.has(col) ? v < 0 : v > 0
}

function shortName(name: string | null) {
  if (!name) return 'Untitled'
  const parts = String(name).split('|').map(s => s.trim())
  return parts[1] || parts[0]
}

/* ── Small pieces ───────────────────────────────────────────────────────── */

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="ka-kpi">
      <span className="ka-kpi-label">{label}</span>
      <span className={`ka-kpi-value is-${tone}`}>{value}</span>
    </div>
  )
}

/* "none" is a real filter value, not an absent one — it selects the rows
   nobody has called yet, which is the list someone works through. It needs a
   word, not a raw key. */
const OPTION_LABEL: Record<string, string> = { none: 'Undecided' }

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  if (options.length === 0) return null
  return (
    <label className="ka-select">
      <span className="ka-select-label">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="all">All</option>
        {options.map(o => (
          <option key={o} value={o}>{OPTION_LABEL[o] ?? o.toUpperCase()}</option>
        ))}
      </select>
    </label>
  )
}

function Thumb({ ad, large }: { ad: Ad; large?: boolean }) {
  const src = ad.hasThumb
    ? `/api/creative/thumb?id=${ad.id}${ad.account ? `&account=${ad.account}` : ''}`
    : null
  return (
    <div className={`ka-thumb${large ? ' is-large' : ''}`}>
      {src
        ? <img src={src} alt="" loading="lazy" />
        : <span className="ka-thumb-fallback">{ad.format || '—'}</span>}
      {ad.isVideo && <span className="ka-thumb-play" aria-hidden="true">▶</span>}
    </div>
  )
}

/* ── Detail ─────────────────────────────────────────────────────────────── */

function CreativeDetail({ ad, benchmarks, onBack }: {
  ad: Ad; benchmarks: any; onBack: () => void
}) {
  const st = statusOf(ad)
  const days: any[] = ad.daily || []
  const [metric, setMetric] = useState<'leads' | 'cpl' | 'linkCtr'>('leads')
  const [people, setPeople] = useState<'leads' | 'signed' | null>(null)

  const reasons = useMemo(() => buildReasons(ad, benchmarks), [ad, benchmarks])

  return (
    <div className="ka-detail">
      <button className="ka-back" onClick={onBack}>← Back to list</button>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div className="ka-hero">
        <div className="mx-card ka-hero-card">
          <Thumb ad={ad} large />
          <div className="ka-hero-info">
            <div className="ka-hero-head">
              <h2 className="ka-hero-title">{ad.creativeId || shortName(ad.name)}</h2>
              <span className={`ka-status is-${st.key}`}>{st.label}</span>
            </div>
            <div className="ka-chips">
              {[ad.format, ad.language, ad.state].filter(Boolean).map((t: string) => (
                <span key={t} className="ka-chip">{t}</span>
              ))}
            </div>
            <dl className="ka-facts">
              <Fact k="Firm" v={ad.firmName || ad.firm} />
              <Fact k="Angle" v={ad.angle} />
              <Fact k="Campaign" v={ad.campaignName} />
              <Fact k="Ad set" v={ad.adsetName} />
              <Fact k="Full name" v={ad.name} wrap />
            </dl>
          </div>
        </div>

        {people === 'leads' && (
          <PeoplePanel
            title="Leads from this creative"
            note="grouped by where they sit now"
            people={ad.leadPeople ?? []}
            onClose={() => setPeople(null)} />
        )}
        {people === 'signed' && (
          <PeoplePanel
            title="Signed cases from this creative"
            people={ad.signedPeople ?? []}
            onClose={() => setPeople(null)} />
        )}

        <div className="ka-hero-kpis">
          <DetailKpi label="Spend" value={money(ad.spend)} delta={null} />
          <DetailKpi label="Total Leads" value={num(ad.leads)} delta={null}
            onOpen={(ad.leadPeople?.length ?? 0) > 0 ? () => setPeople('leads') : undefined}
            openHint={`${ad.leadPeople?.length ?? 0} in the pipeline`} />
          <DetailKpi label="Avg. CPL" value={ad.cpl != null ? money(ad.cpl) : '—'}
            delta={ad.delta?.cpl} goodWhen="down" />
          <DetailKpi label="Qualified" value={ad.qualified != null ? num(ad.qualified) : '—'} delta={null} />
          <DetailKpi label="CPQ" value={ad.cpq != null ? money(ad.cpq) : '—'} delta={null} />
          <DetailKpi label="Signed Cases" value={ad.signed != null ? num(ad.signed) : '—'} delta={null}
            onOpen={(ad.signedPeople?.length ?? 0) > 0 ? () => setPeople('signed') : undefined}
            openHint="See who signed" />
        </div>
      </div>

      {/* ── Funnel ─────────────────────────────────────────────────────── */}
      <section className="mx-card ka-funnel">
        <div className="ka-block-head">
          <div>
            <p className="ka-block-title">Performance Funnel</p>
            <p className="ka-block-sub">Exposure through to outcome, for this creative.</p>
          </div>
        </div>
        <div className="ka-funnel-row">
          {GROUPS.map(g => (
            <div key={g.key} className={`ka-stage is-${g.key}`}>
              <p className="ka-stage-label">{g.label}</p>
              <div className="ka-stage-cells">
                {g.cols.map(col => {
                  const v = cellValue(ad, col)
                  const band = bandFor(col, v)
                  return (
                    <div key={col} className="ka-stage-cell">
                      <span className={`ka-stage-v${band ? ` is-${band}` : ''}`}>{fmtCell(col, v)}</span>
                      <span className="ka-stage-k">{COL_LABEL[col]}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="ka-detail-grid">
        {/* ── Daily ──────────────────────────────────────────────────── */}
        <section className="mx-card ka-panel">
          <div className="ka-block-head">
            <p className="ka-block-title">Daily performance</p>
            <div className="mx-seg">
              {(['leads', 'cpl', 'linkCtr'] as const).map(m => (
                <button key={m} className="mx-seg-btn" aria-pressed={metric === m}
                  onClick={() => setMetric(m)}>
                  {m === 'linkCtr' ? 'Link CTR' : m === 'cpl' ? 'CPL' : 'Leads'}
                </button>
              ))}
            </div>
          </div>
          <DailyChart days={days} metric={metric} />
        </section>

        {/* ── Why ────────────────────────────────────────────────────── */}
        <section className="mx-card ka-panel">
          <div className="ka-block-head">
            <p className="ka-block-title">
              {st.key === 'winner' ? 'Why it’s winning' : st.key === 'cut' ? 'Why it’s failing' : 'What the numbers say'}
            </p>
            <p className="ka-block-sub">Measured against this account, not a fixed target.</p>
          </div>
          <div className="ka-reasons">
            {reasons.length === 0 && <p className="ka-none">Not enough delivery to judge yet.</p>}
            {reasons.map((r, i) => (
              <div key={i} className={`ka-reason is-${r.tone}`}>
                <span className="ka-reason-mark" aria-hidden="true">{r.tone === 'good' ? '✓' : r.tone === 'bad' ? '!' : '·'}</span>
                <div>
                  <p className="ka-reason-t">{r.title}</p>
                  <p className="ka-reason-s">{r.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Additional + verdict ───────────────────────────────────────── */}
      <div className="ka-detail-grid">
        <section className="mx-card ka-panel">
          <div className="ka-block-head">
            <p className="ka-block-title">Additional metrics</p>
          </div>
          <div className="ka-extras">
            <Extra k="Reach" v={ad.reach ? num(ad.reach) : '—'} />
            <Extra k="Frequency" v={ad.frequency != null ? ad.frequency.toFixed(2) : '—'} />
            <Extra k="Landing page views" v={ad.landingPageViews ? num(ad.landingPageViews) : '—'} />
            <Extra k="LP view rate" v={ad.lpViewRate != null ? `${ad.lpViewRate.toFixed(0)}%` : '—'} />
            <Extra k="Cost per LP view" v={ad.costPerLpView != null ? money(ad.costPerLpView, { cents: true }) : '—'} />
            <Extra k="Video plays" v={ad.videoPlays ? num(ad.videoPlays) : '—'} />
          </div>
          {benchmarks && (
            <p className="ka-bench">
              Account average — hook {benchmarks.hookRate != null ? `${Math.round(benchmarks.hookRate)}%` : '—'} ·
              {' '}link CTR {benchmarks.linkCtr != null ? `${benchmarks.linkCtr.toFixed(2)}%` : '—'} ·
              {' '}lead CVR {benchmarks.leadCvr != null ? `${benchmarks.leadCvr.toFixed(1)}%` : '—'} ·
              {' '}CPL {benchmarks.cpl != null ? money(benchmarks.cpl) : '—'}
            </p>
          )}
        </section>

        <section className={`mx-card ka-panel ka-verdict is-${ad.creative?.action}`}>
          <div className="ka-block-head">
            <p className="ka-block-title">Analysis verdict</p>
          </div>
          <p className="ka-verdict-label">{ad.creative?.label}</p>
          <p className="ka-verdict-why">{ad.creative?.why}</p>
          <div className="ka-verdict-health">
            <span className={`ka-health is-${ad.health?.level}`}>{ad.health?.level}</span>
            <span className="ka-verdict-why">{ad.health?.why}</span>
          </div>
        </section>
      </div>
    </div>
  )
}

function Fact({ k, v, wrap }: { k: string; v: any; wrap?: boolean }) {
  if (!v) return null
  return (
    <div className="ka-fact">
      <dt>{k}</dt>
      <dd className={wrap ? 'is-wrap' : undefined}>{v}</dd>
    </div>
  )
}

function Extra({ k, v }: { k: string; v: string }) {
  return (
    <div className="ka-extra">
      <span className="ka-extra-v">{v}</span>
      <span className="ka-extra-k">{k}</span>
    </div>
  )
}

function DetailKpi({ label, value, delta, goodWhen = 'up', onOpen, openHint }: {
  label: string; value: string; delta?: number | null; goodWhen?: 'up' | 'down'
  /** Given only when there are names behind the number worth opening. */
  onOpen?: () => void
  openHint?: string
}) {
  const show = delta != null && isFinite(delta) && Math.abs(Math.round(delta)) >= 5
  const good = show ? (goodWhen === 'down' ? delta! < 0 : delta! > 0) : false
  const body = (
    <>
      <span className="ka-dkpi-v">{value}</span>
      <span className="ka-dkpi-l">{label}</span>
      {show && (
        <span className={`ka-d ${good ? 'is-good' : 'is-bad'}`}>
          {delta! > 0 ? '↑' : '↓'}{Math.abs(Math.round(delta!))}%
        </span>
      )}
      {onOpen && <span className="ka-dkpi-open">{openHint ?? 'See names'} →</span>}
    </>
  )
  // A button only when there is something to open — a dead click target on the
  // tiles that have no names behind them would be worse than no affordance.
  return onOpen
    ? <button className="mx-card ka-dkpi is-open" onClick={onOpen}>{body}</button>
    : <div className="mx-card ka-dkpi">{body}</div>
}

/* Reasons are derived, not written by a model: each one names the number, the
   account average it beat or missed, and by how much. */
function buildReasons(ad: Ad, b: any) {
  const out: { tone: 'good' | 'bad' | 'flat'; title: string; detail: string }[] = []
  const rel = (v: number | null, avg: number | null) =>
    v == null || avg == null || avg === 0 ? null : Math.round(((v - avg) / avg) * 100)

  const add = (label: string, v: number | null, avg: number | null, fmt: (n: number) => string, higherBetter: boolean) => {
    const d = rel(v, avg)
    if (v == null || avg == null || d == null) return
    const better = higherBetter ? d > 0 : d < 0
    if (Math.abs(d) < 8) {
      out.push({ tone: 'flat', title: `${label} is at the account average`, detail: `${fmt(v)} vs ${fmt(avg)}.` })
      return
    }
    /* The direction word describes the NUMBER, the colour describes whether
       that is good. Deriving both from `better` produced "CPL below account
       average … +75%", which contradicts itself: a higher CPL is above the
       average and bad at the same time. */
    out.push({
      tone: better ? 'good' : 'bad',
      title: `${label} ${d > 0 ? 'above' : 'below'} account average`,
      detail: `${fmt(v)} vs ${fmt(avg)} (${d > 0 ? '+' : ''}${d}%)${better ? '' : ' — worse'}.`,
    })
  }

  const pct = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}%`
  add('Hook rate', ad.hookRate, b?.hookRate, pct, true)
  add('Link CTR', ad.linkCtr, b?.linkCtr, (n) => `${n.toFixed(2)}%`, true)
  add('Lead CVR', ad.leadCvr ?? ad.clickToLead, b?.leadCvr, pct, true)
  add('CPL', ad.cpl, b?.cpl, (n) => money(n), false)
  if (ad.signed) {
    add('CPA', ad.cpa, b?.cpa, (n) => money(n), false)
  }
  return out
}

/* ── Daily chart ────────────────────────────────────────────────────────── */

function DailyChart({ days, metric }: { days: any[]; metric: 'leads' | 'cpl' | 'linkCtr' }) {
  if (!days.length) return <p className="ka-none">No daily delivery recorded.</p>

  const W = 760, H = 180, PAD = 28
  const vals = days.map(d => d[metric] ?? null)
  const nums = vals.filter((v): v is number => v != null)
  if (!nums.length) return <p className="ka-none">No {metric} recorded in this range.</p>

  const max = Math.max(...nums, 0)
  const min = Math.min(...nums, 0)
  const span = max - min || 1
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, days.length - 1)
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)

  const spendMax = Math.max(...days.map(d => d.spend ?? 0), 1)

  const line = vals.map((v, i) => v == null ? null : `${x(i)},${y(v)}`)
    .filter(Boolean).join(' ')

  return (
    <div className="ka-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily ${metric}`} preserveAspectRatio="none">
        {/* Spend as bars behind the metric line — the two together show whether
            a change in results came with a change in budget. */}
        {days.map((d, i) => {
          const h = ((d.spend ?? 0) / spendMax) * (H - PAD * 2)
          const bw = Math.max(2, (W - PAD * 2) / days.length - 3)
          return <rect key={i} x={x(i) - bw / 2} y={H - PAD - h} width={bw} height={h}
            className="ka-chart-bar" />
        })}
        <polyline className="ka-chart-line" points={line} fill="none" />
        {vals.map((v, i) => v == null ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r="2.5" className="ka-chart-dot" />
        ))}
      </svg>
      <div className="ka-chart-axis">
        <span>{days[0]?.date?.slice(5)}</span>
        <span className="ka-chart-legend">bars: spend · line: {metric === 'linkCtr' ? 'link CTR' : metric}</span>
        <span>{days[days.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  )
}

/* ── Creatives to review ────────────────────────────────────────────────────
   Three questions worth asking every morning, each answerable from the row
   itself. They are filters, not verdicts: clicking one narrows the table so
   the diagnosis starts from the shortlist instead of the whole account.

   Pacing is defined against the creative's own recent average rather than a
   budget, because Meta's insights carry delivery, not intent — there is no
   "expected spend" to compare to without the budget, and inventing one would
   make the card confidently wrong. */

type ReviewKey = 'noLeads' | 'highCpl' | 'underPacing'

function recentDailyMean(ad: Ad, days: number): number | null {
  const d = (ad.daily || []).slice(-days)
  if (d.length < 2) return null
  return d.reduce((s: number, x: any) => s + (x.spend || 0), 0) / d.length
}

function leadsInLastDays(ad: Ad, days: number): number {
  return (ad.daily || []).slice(-days).reduce((s: number, d: any) => s + (d.leads || 0), 0)
}

function matchesReview(ad: Ad, key: ReviewKey): boolean {
  switch (key) {
    case 'noLeads': {
      // Only meaningful for something still being paid for.
      const spent3 = (ad.daily || []).slice(-3).reduce((s: number, d: any) => s + (d.spend || 0), 0)
      return spent3 > 0 && leadsInLastDays(ad, 3) === 0
    }
    case 'highCpl':
      return ad.cpl != null && ad.cpl > BENCH.cpl.watch
    case 'underPacing': {
      const mean = recentDailyMean(ad, 7)
      if (!mean || mean <= 0) return false
      return (ad.spendToday ?? 0) < mean * 0.7
    }
  }
}

const REVIEW_CARDS: { key: ReviewKey; title: string; sub: string; tone: string }[] = [
  { key: 'noLeads',     title: 'No leads in 3+ days', sub: "Still spending, nothing to show for it", tone: 'crit' },
  { key: 'highCpl',     title: 'CPL above target',    sub: `Over ${'$'}${BENCH.cpl.watch} per lead`, tone: 'warn' },
  { key: 'underPacing', title: 'Under pacing',        sub: 'Today under 70% of its 7-day average', tone: 'info' },
]

/* ── Who is behind a number ─────────────────────────────────────────────────
   Counts people argue with are counts they cannot open. Leads are grouped by
   where they actually sit in the pipeline, because "40 leads" means something
   very different if thirty of them are No Response. */

function PeoplePanel({ title, note, people, onClose }: {
  title: string
  note?: string
  people: { name: string | null; phone: string | null; email: string | null; createdAt: string | null; stage?: string }[]
  onClose: () => void
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  /* Grouped by stage, biggest group first — the shape of the pipeline is the
     point, not the alphabet. */
  const groups = useMemo(() => {
    const m = new Map<string, typeof people>()
    for (const p of people) {
      const k = p.stage || 'Unknown'
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [people])

  const day = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return isNaN(+d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="ka-scrim" onClick={onClose}>
      <aside className="ka-people" onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="ka-people-head">
          <div>
            <p className="ka-people-title">{title}</p>
            <p className="ka-people-sub">{people.length} {people.length === 1 ? 'person' : 'people'}{note ? ` · ${note}` : ''}</p>
          </div>
          <button className="mx-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="ka-people-body">
          {groups.length === 0 && <p className="ka-none">Nobody attributed to this creative yet.</p>}
          {groups.map(([stage, list]) => (
            <section className="ka-people-group" key={stage}>
              <p className="ka-people-stage">
                {stage}<span className="ka-people-n">{list.length}</span>
              </p>
              <ul className="ka-people-list">
                {list.map((p, i) => (
                  <li key={`${p.phone ?? p.email ?? p.name ?? i}-${i}`}>
                    <span className="ka-people-name">{p.name || 'Unnamed'}</span>
                    <span className="ka-people-meta">
                      {[p.phone, p.email].filter(Boolean).join(' · ')}
                    </span>
                    {p.createdAt && <span className="ka-people-day">{day(p.createdAt)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>
    </div>
  )
}

/* ── Suggested badge ────────────────────────────────────────────────────────
   Hovering explains the verdict: what fired, the threshold behind it, and the
   numbers it was tested against. A native title= would do the first of those
   after a second's delay and nothing else — and the whole point of a suggestion
   is that someone can disagree with it, which needs the rule visible.

   CSS-only on hover and focus, so it costs no state per row across a table
   that can run to a few hundred. */

function SuggestBadge({ s }: { s: Suggestion }) {
  return (
    <span className="ka-suggest" tabIndex={0}>
      <span className={`ka-status is-${s.key}`}>{s.label}</span>
      {(s.why || s.rule) && (
        <span className="ka-tip" role="tooltip">
          <span className="ka-tip-head">
            <span className={`ka-status is-${s.key}`}>{s.label}</span>
          </span>
          {s.why && <span className="ka-tip-why">{s.why}</span>}
          {s.rule && (
            <span className="ka-tip-rule"><em>Rule</em>{s.rule}</span>
          )}
          {!!s.facts?.length && (
            <span className="ka-tip-facts">
              {s.facts.map(f => (
                <span className="ka-tip-fact" key={f.label}>
                  <span>{f.label}</span><strong>{f.value}</strong>
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  )
}

/* ── Decision ───────────────────────────────────────────────────────────────
   The suggestion beside it is derived from thresholds; this is the call a
   person made. A blank option is kept at the top so a row can be returned to
   "undecided" rather than being stuck on whatever was clicked first. */

const DECISIONS = [
  { value: 'keep',     label: 'KEEP' },
  { value: 'watch',    label: 'WATCH' },
  { value: 'kill',     label: 'KILL' },
  { value: 'learning', label: 'LEARNING' },
] as const

function DecisionSelect({ value, disabled, onChange }: {
  value?: string; disabled?: boolean; onChange: (v: string) => void
}) {
  return (
    <select
      className={`ka-decision${value ? ` is-${value}` : ''}`}
      value={value ?? ''}
      disabled={disabled}
      title={disabled
        ? 'Run supabase/migration_creative_decisions.sql to record decisions'
        : 'Records the call — it does not pause the ad in Meta'}
      onChange={e => e.target.value && onChange(e.target.value)}
    >
      <option value="">—</option>
      {DECISIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
    </select>
  )
}
