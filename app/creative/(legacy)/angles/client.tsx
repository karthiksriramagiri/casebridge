'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MetricsHeader, Breadcrumbs } from '@/app/_metrics/chrome'
import {
  money, num, Overlay, EmptyState, Banner, DashboardSkeleton,
  IconClose, IconSpark, IconArrow, IconBack,
} from '@/app/_metrics/dash'

/* ═══════════════════════════════════════════════════════════════════════════
   Creative angles

   Every creative is a Visual hook × Verbal hook pair. This page ranks the
   hooks, and their combinations, by what they actually cost per qualified
   case.

   The six angle families used to each carry their own saturated hue, which
   put a six-colour rainbow on a warm paper palette and encoded nothing the
   label did not already say. Identity now rides on the code range.
   ═══════════════════════════════════════════════════════════════════════════ */

const DATE_PRESETS = [
  { label: 'All time', value: 'maximum' },
  { label: '30d', value: 'last_30d' },
  { label: '14d', value: 'last_14d' },
  { label: '7d', value: 'last_7d' },
]

const ANGLE_TYPES = [
  { id: 'BR-AD',    label: 'BR-AD',    subtitle: 'Branded',  codes: 'A–B', vPfx: 'A', bPfx: 'B' },
  { id: 'HYB-AD',   label: 'HYB-AD',   subtitle: 'Hybrid',   codes: 'C–D', vPfx: 'C', bPfx: 'D' },
  { id: 'AIUGC-AD', label: 'AIUGC-AD', subtitle: 'AI UGC',   codes: 'E–F', vPfx: 'E', bPfx: 'F' },
  { id: 'BNR-AD',   label: 'BNR-AD',   subtitle: 'Banner',   codes: 'G–H', vPfx: 'G', bPfx: 'H' },
  { id: 'ANM-AD',   label: 'ANM-AD',   subtitle: 'Animated', codes: 'I–J', vPfx: 'I', bPfx: 'J' },
  { id: 'IMG-AD',   label: 'IMG-AD',   subtitle: 'Image',    codes: 'K–L', vPfx: 'K', bPfx: 'L' },
]

const FIRMS = [
  { id: 'all', label: 'All firms' },
  { id: 'FL', label: 'Fears Law' },
  { id: 'JLL', label: 'Levine Law' },
]

type PipelineLead = { name: string | null; phone: string | null; email: string | null; createdAt: string | null }

type AngleStat = {
  code: string
  name: string
  spend: number
  leads: number
  signedCases: number
  nrCount: number
  nqCount: number
  fuCount: number
  chaseCount: number
  nrLeads: PipelineLead[]
  nqLeads: PipelineLead[]
  fuLeads: PipelineLead[]
  chaseLeads: PipelineLead[]
  adCount: number
  cpl: number | null
  cpq: number | null
  conversionRate: number | null
}

type ComboStat = AngleStat & { visualCode: string; verbalCode: string }
type Stage = 'nr' | 'nq' | 'fu' | 'chase'
type ModalState = { stat: AngleStat; stage: Stage } | null

type AnglesData = {
  visual: AngleStat[]
  verbal: AngleStat[]
  combos: ComboStat[]
  unparsedAds: number
  unparsedSpend: number
  aiAnalysis: string | null
  analyzedAt: string | null
}

/* Angle-level targets are tighter than the account-level ones on the Ops
   dashboard: a hook is being judged before the pipeline dilutes it. */
function cpqTone(v: number | null) {
  if (v == null) return ''
  if (v <= 600) return 'mx-v-good'
  if (v <= 900) return 'mx-v-warn'
  return 'mx-v-crit'
}
function cplTone(v: number | null) {
  if (v == null) return ''
  if (v <= 120) return 'mx-v-good'
  if (v <= 200) return 'mx-v-warn'
  return 'mx-v-crit'
}

const STAGES: { key: Stage; label: string; tone: string }[] = [
  { key: 'nr', label: 'No Response', tone: 'var(--mx-muted)' },
  { key: 'nq', label: 'Not Qualified', tone: 'var(--mx-crit)' },
  { key: 'fu', label: 'Follow Up', tone: 'var(--mx-accent-ink)' },
  { key: 'chase', label: 'Chase', tone: 'var(--mx-ink)' },
]

const VISUAL_HOOK_NAMES: Record<string, string> = {
  A1: 'Skeleton', A2: 'Animated Surgery', A3: 'Accident', A4: 'Check', A5: 'New Car',
  A6: 'Split View (Half Screen)', A7: 'State Map', A8: 'Check & Talking Head (Bold Guy)',
  A9: 'Check & Talking Head (Working Woman)', A10: 'Animal', A11: 'Attention Hook',
  A12: 'Animated Bone', A13: 'Simulation Crash',
  C1: 'Black 30ish Lady Talking Head', C2: 'Bold Old Guy', C3: 'White Man',
  E1: 'In the Car', E2: 'Gas Station', E3: 'Gym', E4: 'Black AI Avatar', E5: 'Latino AI Avatar',
  G1: 'Accident', G2: 'Car Driving',
}

const VERBAL_HOOK_NAMES: Record<string, string> = {
  B1: 'Insurance Company', B2: "They don't want you to know", B3: 'Never Sue',
  B4: 'New Claim Tool', B5: 'How I got new car', B6: 'Music Only',
  B7: 'Looking for 10 accident victims', B8: 'Understand your options (Educational)',
  B9: 'You may be owed a bigger check', B10: 'Injuries take days to appear',
  B11: 'Miss out on money', B12: 'Do I have to sue to get paid', B13: 'Passenger Angle',
  B14: '3 Mistakes', B15: 'Eligible for a bigger payout', B16: 'Do Not Call Attorney',
  B17: 'Been in car accident and did not go to the hospital',
  B18: "Didn't Go To ER", B19: "Insurance Company doesn't care you go to ER",
  B20: 'This is Viral Hack', B21: "Don't Accept first check from insurance",
  B22: 'Think you are fine after car accident no ER no AMB', B23: 'Never do this 3 things',
  B24: 'Never call insurance yourself', B25: 'Just Now feeling the pain',
  B26: 'Old lady crushed and said I ran green light', B27: 'Car looks like this Body feels like this',
  D1: 'Settlement Comparison', D2: 'You will regret suing the person who hit you',
  D3: 'If you skipped ER after your car accident',
  F1: 'I need to tell you something (Whisper)', F2: 'How much did you get for the little accident',
  F3: 'First day back at gym after my accident', F4: 'Settlement Amount Comparison',
  H1: "Didn't go to the ER", H2: 'Never Sue the person who hit you',
  H3: 'I almost let insurance settle my accident for',
  H4: "I didn't know there were two checks you could get",
  H5: 'Drink Driver hit my car (BNR)', H6: 'Biggest Mistake',
}

export default function AnglesPage() {
  const [datePreset, setDatePreset] = useState('maximum')
  const [firm, setFirm] = useState('all')
  const [data, setData] = useState<AnglesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [section, setSection] = useState<'visual' | 'verbal' | 'combos'>('visual')
  const [modal, setModal] = useState<ModalState>(null)

  const load = useCallback((preset: string, firmId: string) => {
    setLoading(true)
    fetch(`/api/metrics/angles?date_preset=${preset}&firm=${firmId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load(datePreset, firm) }, [datePreset, firm, load])

  async function runAnalysis() {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/metrics/angles?date_preset=${datePreset}&firm=${firm}&analyze=true`)
      setData(await res.json())
    } finally { setAnalyzing(false) }
  }

  const config = ANGLE_TYPES.find(a => a.id === selected)
  const visual = data && config ? data.visual.filter(s => s.code.startsWith(config.vPfx)) : []
  const verbal = data && config ? data.verbal.filter(s => s.code.startsWith(config.bPfx)) : []
  const combos = data && config ? data.combos.filter(s => s.visualCode.startsWith(config.vPfx)) : []

  const filters = (
    <>
      <div className="mx-seg" role="group" aria-label="Firm">
        {FIRMS.map(f => (
          <button key={f.id} className="mx-seg-btn" aria-pressed={firm === f.id} onClick={() => setFirm(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="mx-seg" role="group" aria-label="Date range">
        {DATE_PRESETS.map(p => (
          <button key={p.value} className="mx-seg-btn" aria-pressed={datePreset === p.value}
            onClick={() => setDatePreset(p.value)}>
            {p.label}
          </button>
        ))}
      </div>
    </>
  )

  return (
    <>
      <MetricsHeader actions={filters} onRefresh={() => load(datePreset, firm)} />

      <main className="mx-main" id="mx-main">
        {!selected ? (
          <AngleLanding data={data} loading={loading}
            onPick={id => { setSelected(id); setSection('visual') }} />
        ) : config ? (
          <AngleDetail
            config={config}
            firm={firm}
            visual={visual}
            verbal={verbal}
            combos={combos}
            data={data}
            loading={loading}
            analyzing={analyzing}
            section={section}
            onSection={setSection}
            onBack={() => setSelected(null)}
            onAnalyse={runAnalysis}
            onStage={(stat, stage) => setModal({ stat, stage })}
          />
        ) : null}
      </main>

      {modal && <StageSheet modal={modal} onClose={() => setModal(null)} />}
    </>
  )
}

/* ── Landing ────────────────────────────────────────────────────────────── */

function AngleLanding({ data, loading, onPick }: {
  data: AnglesData | null
  loading: boolean
  onPick: (id: string) => void
}) {
  const rows = ANGLE_TYPES.map(c => {
    const vis = data ? data.visual.filter(s => s.code.startsWith(c.vPfx)) : []
    const vbl = data ? data.verbal.filter(s => s.code.startsWith(c.bPfx)) : []
    const spend = vis.reduce((t, a) => t + a.spend, 0)
    const leads = vis.reduce((t, a) => t + a.leads, 0)
    const signed = vis.reduce((t, a) => t + a.signedCases, 0)
    const best = vis.filter(a => a.cpq != null).sort((a, b) => (a.cpq ?? 1e9) - (b.cpq ?? 1e9))[0]?.cpq ?? null
    return { c, vis, vbl, spend, leads, signed, best, cpq: signed > 0 ? spend / signed : null }
  }).sort((a, b) => b.spend - a.spend)

  const totalSpend = rows.reduce((t, r) => t + r.spend, 0)
  const totalLeads = rows.reduce((t, r) => t + r.leads, 0)
  const totalSigned = rows.reduce((t, r) => t + r.signed, 0)

  return (
    <>
      <div className="mx-section-head" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="mx-page-title">Creative <i>angles</i></h1>
          <p className="mx-page-sub">
            Every creative is a visual hook paired with a verbal hook. Open a family to see which hooks
            — and which pairings — actually produce qualified cases.
          </p>
        </div>
      </div>

      {loading ? <DashboardSkeleton /> : (
        <>
          <div className="mx-hero" style={{ marginBottom: 22 }}>
            <div className="mx-hero-cell">
              <span className="mx-hero-label">Spend across angles</span>
              <span className="mx-hero-value">{money(totalSpend)}</span>
              <span className="mx-hero-foot">{rows.filter(r => r.spend > 0).length} of 6 families active</span>
            </div>
            <div className="mx-hero-cell">
              <span className="mx-hero-label">Leads</span>
              <span className={`mx-hero-value ${totalLeads ? '' : 'is-empty'}`}>{num(totalLeads)}</span>
              <span className="mx-hero-foot">
                {totalLeads > 0 ? `${money(totalSpend / totalLeads)} per lead` : 'no leads recorded'}
              </span>
            </div>
            <div className="mx-hero-cell">
              <span className="mx-hero-label">Signed</span>
              <span className={`mx-hero-value ${totalSigned ? 'is-good' : 'is-empty'}`}>{totalSigned}</span>
              <span className="mx-hero-foot">
                {totalSigned > 0 ? `${money(totalSpend / totalSigned)} per case` : 'nothing signed yet'}
              </span>
            </div>
            <div className="mx-hero-cell">
              <span className="mx-hero-label">Hooks tracked</span>
              <span className="mx-hero-value">{(data?.visual.length ?? 0) + (data?.verbal.length ?? 0)}</span>
              <span className="mx-hero-foot">
                {data?.visual.length ?? 0} visual · {data?.verbal.length ?? 0} verbal
              </span>
            </div>
            <div className="mx-hero-cell">
              <span className="mx-hero-label">Unparsed</span>
              <span className={`mx-hero-value ${data?.unparsedAds ? 'is-warn' : 'is-empty'}`}>
                {data?.unparsedAds ?? 0}
              </span>
              <span className="mx-hero-foot">
                {data?.unparsedSpend
                  ? `${money(data.unparsedSpend)} on ads whose name has no hook code`
                  : 'every ad name parsed'}
              </span>
            </div>
          </div>

          {(data?.unparsedAds ?? 0) > 0 && (
            <div style={{ marginBottom: 18 }}>
              <Banner tone="warn" title={`${data!.unparsedAds} ads are missing a hook code`}>
                {money(data!.unparsedSpend)} of spend is invisible to this page. Ad names need the visual
                and verbal codes in them to be attributed to an angle.
              </Banner>
            </div>
          )}

          <div className="mx-section-head">
            <p className="mx-eyebrow">Angle families · by spend</p>
            <p className="mx-section-note">Cost per qualified case is the ranking metric</p>
          </div>

          <div className="mx-inv-grid">
            {rows.map(({ c, vis, vbl, spend, leads, signed, cpq }) => {
              const quiet = spend === 0 && vis.length === 0
              return (
                <button key={c.id} className="mx-inv" onClick={() => onPick(c.id)}
                  style={{ textAlign: 'left', font: 'inherit', cursor: 'pointer', opacity: quiet ? 0.6 : 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="mx-inv-code">{c.codes}</span>
                    <span style={{ fontSize: 11, color: 'var(--mx-muted)' }}>{c.subtitle}</span>
                    <IconArrow className="mx-firm-arrow" style={{ marginLeft: 'auto' }} />
                  </span>

                  <span className="mx-inv-title">{c.label}</span>

                  <span className="mx-inv-dates">
                    {vis.length} visual · {vbl.length} verbal {vbl.length === 1 ? 'hook' : 'hooks'}
                  </span>

                  {quiet ? (
                    <span style={{ fontSize: 12, color: 'var(--mx-faint)', marginTop: 12 }}>
                      Nothing recorded in this period
                    </span>
                  ) : (
                    <span className="mx-inv-figs">
                      <span>
                        <span className="mx-inv-fig-label">Spend</span>
                        <span className="mx-inv-fig-val">{money(spend)}</span>
                      </span>
                      <span>
                        <span className="mx-inv-fig-label">Leads</span>
                        <span className="mx-inv-fig-val">{leads || '—'}</span>
                      </span>
                      <span>
                        <span className="mx-inv-fig-label">Signed</span>
                        <span className="mx-inv-fig-val" style={{ color: signed ? 'var(--mx-good)' : undefined }}>
                          {signed || '—'}
                        </span>
                      </span>
                      <span>
                        <span className="mx-inv-fig-label">CPQ</span>
                        <span className={`mx-inv-fig-val ${cpqTone(cpq)}`}>{money(cpq)}</span>
                      </span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

/* ── Detail ─────────────────────────────────────────────────────────────── */

function AngleDetail({
  config, firm, visual, verbal, combos, data, loading, analyzing, section,
  onSection, onBack, onAnalyse, onStage,
}: {
  config: (typeof ANGLE_TYPES)[number]
  firm: string
  visual: AngleStat[]
  verbal: AngleStat[]
  combos: ComboStat[]
  data: AnglesData | null
  loading: boolean
  analyzing: boolean
  section: 'visual' | 'verbal' | 'combos'
  onSection: (s: 'visual' | 'verbal' | 'combos') => void
  onBack: () => void
  onAnalyse: () => void
  onStage: (stat: AngleStat, stage: Stage) => void
}) {
  const spend = visual.reduce((t, a) => t + a.spend, 0)
  const leads = visual.reduce((t, a) => t + a.leads, 0)
  const signed = visual.reduce((t, a) => t + a.signedCases, 0)
  const cpl = leads > 0 ? spend / leads : null
  const cpq = signed > 0 ? spend / signed : null
  const firmLabel = FIRMS.find(f => f.id === firm)?.label

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <Breadcrumbs items={[
          
          { label: 'Angles' },
        ]} />
      </div>

      <div className="mx-section-head" style={{ marginBottom: 20 }}>
        <div>
          <button className="mx-btn mx-btn-ghost" onClick={onBack}
            style={{ padding: '4px 8px', marginBottom: 8, marginLeft: -8 }}>
            <IconBack /> All angles
          </button>
          <h1 className="mx-page-title" style={{ fontSize: 30 }}>
            {config.label} <i>{config.subtitle.toLowerCase()}</i>
          </h1>
          <p className="mx-page-sub">
            Visual hooks {config.vPfx}, verbal hooks {config.bPfx}
            {firm !== 'all' && ` · ${firmLabel} only`}
          </p>
        </div>
        <button className="mx-btn mx-btn-primary" onClick={onAnalyse} disabled={analyzing || loading}>
          <IconSpark className={analyzing ? 'mx-spin' : undefined} />
          {analyzing ? 'Reading the hooks…' : data?.aiAnalysis ? 'Run analysis again' : 'Analyse these hooks'}
        </button>
      </div>

      {loading ? <DashboardSkeleton /> : (
        <>
          {spend > 0 && (
            <div className="mx-hero" style={{ marginBottom: 22 }}>
              <div className="mx-hero-cell">
                <span className="mx-hero-label">Spend</span>
                <span className="mx-hero-value">{money(spend)}</span>
                <span className="mx-hero-foot">
                  across {visual.length} visual {visual.length === 1 ? 'hook' : 'hooks'}
                </span>
              </div>
              <div className="mx-hero-cell">
                <span className="mx-hero-label">Leads</span>
                <span className={`mx-hero-value ${leads ? '' : 'is-empty'}`}>{num(leads)}</span>
                <span className="mx-hero-foot">from this angle family</span>
              </div>
              <div className="mx-hero-cell">
                <span className="mx-hero-label">Cost per lead</span>
                <span className={`mx-hero-value ${cpl == null ? 'is-empty' : ''}`}
                  style={{ color: cplHeroColor(cpl) }}>
                  {money(cpl)}
                </span>
                <span className="mx-hero-foot">target under {money(120)}</span>
              </div>
              <div className="mx-hero-cell">
                <span className="mx-hero-label">Cost per qualified</span>
                <span className={`mx-hero-value ${cpq == null ? 'is-empty' : ''}`}
                  style={{ color: cpqHeroColor(cpq) }}>
                  {money(cpq)}
                </span>
                <span className="mx-hero-foot">target under {money(600)}</span>
              </div>
              <div className="mx-hero-cell">
                <span className="mx-hero-label">Signed</span>
                <span className={`mx-hero-value ${signed ? 'is-good' : 'is-empty'}`}>{signed}</span>
                <span className="mx-hero-foot">
                  {leads > 0 ? `${((signed / leads) * 100).toFixed(1)}% of leads` : 'no leads yet'}
                </span>
              </div>
            </div>
          )}

          <div className="mx-section-head">
            <div className="mx-seg" role="group" aria-label="Hook type">
              {([
                ['visual', `Visual (${config.vPfx})`, visual.length],
                ['verbal', `Verbal (${config.bPfx})`, verbal.length],
                ['combos', 'Combinations', combos.length],
              ] as const).map(([key, label, count]) => (
                <button key={key} className="mx-seg-btn" aria-pressed={section === key}
                  onClick={() => onSection(key)}>
                  {label} <span style={{ color: 'var(--mx-faint)' }}>{count}</span>
                </button>
              ))}
            </div>
            <p className="mx-section-note">
              Ranked by cost per qualified case · click a stage count to see the leads
            </p>
          </div>

          <div className="mx-card" style={{ overflow: 'hidden' }}>
            {section === 'combos'
              ? <ComboTable stats={combos} onStage={onStage} />
              : <HookTable stats={section === 'visual' ? visual : verbal} onStage={onStage} />}
          </div>

          {data?.aiAnalysis && (
            <section style={{ marginTop: 30 }}>
              <div className="mx-section-head">
                <p className="mx-eyebrow">What the numbers say</p>
                {data.analyzedAt && (
                  <p className="mx-section-note">
                    Generated {new Date(data.analyzedAt).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
              <div className="mx-card" style={{ padding: '22px 26px' }}>
                <AIAnalysis text={data.aiAnalysis} />
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}

function cplHeroColor(v: number | null) {
  if (v == null) return undefined
  return v <= 120 ? 'var(--mx-good)' : v <= 200 ? 'var(--mx-warn)' : 'var(--mx-crit)'
}
function cpqHeroColor(v: number | null) {
  if (v == null) return undefined
  return v <= 600 ? 'var(--mx-good)' : v <= 900 ? 'var(--mx-warn)' : 'var(--mx-crit)'
}

/* ── Sorting ────────────────────────────────────────────────────────────── */

function useSorted<T extends AngleStat>(stats: T[], key: string, dir: 'asc' | 'desc') {
  return useMemo(() => {
    const m = dir === 'asc' ? 1 : -1
    // A hook with no measurable cost sinks either way — it has not earned a rank.
    const lower = key === 'cpq' || key === 'cpl'
    return [...stats].sort((a: any, b: any) => {
      const av = a[key] ?? (lower ? Infinity : -1)
      const bv = b[key] ?? (lower ? Infinity : -1)
      if (!Number.isFinite(av)) return 1
      if (!Number.isFinite(bv)) return -1
      return (av - bv) * (lower ? -m : m)
    })
  }, [stats, key, dir])
}

function SortTh({ label, k, sortKey, dir, onSort, hint }: {
  label: string
  k: string
  sortKey: string
  dir: 'asc' | 'desc'
  onSort: (k: string) => void
  hint?: string
}) {
  return (
    <th className="sortable num" title={hint} onClick={() => onSort(k)}
      aria-sort={sortKey === k ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {label}
      <span className="sort-caret">{sortKey === k && dir === 'asc' ? '↑' : '↓'}</span>
    </th>
  )
}

function StageCell({ count, tone, onClick }: { count: number; tone: string; onClick: () => void }) {
  if (!count) return <span className="mx-dim">—</span>
  return (
    <button className="mx-drill" style={{ color: tone }} onClick={onClick}>
      {count}
    </button>
  )
}

/* ── Hook table ─────────────────────────────────────────────────────────── */

function HookTable({ stats, onStage }: { stats: AngleStat[]; onStage: (s: AngleStat, stage: Stage) => void }) {
  const [sortKey, setSortKey] = useState('cpq')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const sorted = useSorted(stats, sortKey, dir)

  function sort(k: string) {
    if (sortKey === k) setDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(k); setDir('desc') }
  }

  if (stats.length === 0) {
    return <EmptyState title="No hooks recorded" text="Nothing in this family delivered in the selected period." />
  }

  const totals = stats.reduce((t, s) => ({
    spend: t.spend + s.spend,
    leads: t.leads + s.leads,
    signed: t.signed + s.signedCases,
    nr: t.nr + s.nrCount,
    nq: t.nq + s.nqCount,
    fu: t.fu + s.fuCount,
    chase: t.chase + s.chaseCount,
    ads: t.ads + s.adCount,
  }), { spend: 0, leads: 0, signed: 0, nr: 0, nq: 0, fu: 0, chase: 0, ads: 0 })

  return (
    <div className="mx-tw">
      <table className="mx-table">
        <thead>
          <tr>
            <th style={{ width: 34 }}>#</th>
            <th>Code</th>
            <th>Hook</th>
            <SortTh label="Spend" k="spend" sortKey={sortKey} dir={dir} onSort={sort} />
            <SortTh label="Leads" k="leads" sortKey={sortKey} dir={dir} onSort={sort} />
            <SortTh label="CPL" k="cpl" hint="Cost per lead · target under $120" sortKey={sortKey} dir={dir} onSort={sort} />
            <SortTh label="Signed" k="signedCases" sortKey={sortKey} dir={dir} onSort={sort} />
            <SortTh label="CPQ" k="cpq" hint="Cost per qualified case · target under $600" sortKey={sortKey} dir={dir} onSort={sort} />
            <SortTh label="Conv" k="conversionRate" sortKey={sortKey} dir={dir} onSort={sort} />
            {STAGES.map(s => (
              <th key={s.key} className="num" title={s.label}>{s.label.split(' ')[0]}</th>
            ))}
            <SortTh label="Ads" k="adCount" sortKey={sortKey} dir={dir} onSort={sort} />
          </tr>
        </thead>

        <tbody>
          {sorted.map((s, i) => (
            <tr className="row" key={s.code}>
              <td style={{ color: 'var(--mx-faint)', fontWeight: 650, fontSize: 11 }}>{i + 1}</td>
              <td>
                <span className="mx-chip" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, fontWeight: 700 }}>
                  {s.code}
                </span>
              </td>
              <td title={s.name}
                style={{ fontWeight: 500, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </td>
              <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(s.spend)}</td>
              <td className="num" style={{ fontWeight: s.leads ? 650 : 400 }}>
                {s.leads || <span className="mx-dim">—</span>}
              </td>
              <td className={`num ${cplTone(s.cpl)}`}>{money(s.cpl)}</td>
              <td className="num" style={{ fontWeight: s.signedCases ? 700 : 400, color: s.signedCases ? 'var(--mx-good)' : undefined }}>
                {s.signedCases || <span className="mx-dim">—</span>}
              </td>
              <td className={`num ${cpqTone(s.cpq)}`}>{money(s.cpq)}</td>
              <td className="num" style={{ color: 'var(--mx-muted)' }}>
                {s.conversionRate != null ? `${s.conversionRate.toFixed(1)}%` : <span className="mx-dim">—</span>}
              </td>
              {STAGES.map(st => (
                <td className="num" key={st.key}>
                  <StageCell count={(s as any)[`${st.key}Count`]} tone={st.tone}
                    onClick={() => onStage(s, st.key)} />
                </td>
              ))}
              <td className="num" style={{ color: 'var(--mx-muted)', fontSize: 11 }}>{s.adCount}</td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <td colSpan={2} />
            <td className="lbl">Total</td>
            <td className="num">{money(totals.spend)}</td>
            <td className="num">{totals.leads || '—'}</td>
            <td className="num">{totals.leads ? money(totals.spend / totals.leads) : '—'}</td>
            <td className="num">{totals.signed || '—'}</td>
            <td className="num">{totals.signed ? money(totals.spend / totals.signed) : '—'}</td>
            <td className="num">{totals.leads ? `${((totals.signed / totals.leads) * 100).toFixed(1)}%` : '—'}</td>
            <td className="num">{totals.nr || '—'}</td>
            <td className="num">{totals.nq || '—'}</td>
            <td className="num">{totals.fu || '—'}</td>
            <td className="num">{totals.chase || '—'}</td>
            <td className="num">{totals.ads}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/* ── Combination table ──────────────────────────────────────────────────── */

function ComboTable({ stats, onStage }: { stats: ComboStat[]; onStage: (s: AngleStat, stage: Stage) => void }) {
  const [sortKey, setSortKey] = useState('cpq')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const sorted = useSorted(stats, sortKey, dir)

  function sort(k: string) {
    if (sortKey === k) setDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(k); setDir('desc') }
  }

  if (stats.length === 0) {
    return <EmptyState title="No combinations yet" text="A pairing appears once at least one creative uses both hooks." />
  }

  return (
    <div className="mx-tw">
      <table className="mx-table">
        <thead>
          <tr>
            <th style={{ width: 34 }}>#</th>
            <th>Visual hook</th>
            <th>Verbal hook</th>
            <SortTh label="Spend" k="spend" sortKey={sortKey} dir={dir} onSort={sort} />
            <SortTh label="Leads" k="leads" sortKey={sortKey} dir={dir} onSort={sort} />
            <SortTh label="CPL" k="cpl" sortKey={sortKey} dir={dir} onSort={sort} />
            <SortTh label="Signed" k="signedCases" sortKey={sortKey} dir={dir} onSort={sort} />
            <SortTh label="CPQ" k="cpq" sortKey={sortKey} dir={dir} onSort={sort} />
            <SortTh label="Conv" k="conversionRate" sortKey={sortKey} dir={dir} onSort={sort} />
            {STAGES.map(s => (
              <th key={s.key} className="num" title={s.label}>{s.label.split(' ')[0]}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sorted.map((s, i) => (
            <tr className="row" key={s.code}>
              <td style={{ color: 'var(--mx-faint)', fontWeight: 650, fontSize: 11 }}>{i + 1}</td>
              <td style={{ maxWidth: 190 }}>
                <span className="mx-chip" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10.5, fontWeight: 700 }}>
                  {s.visualCode}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--mx-muted)', marginTop: 3, lineHeight: 1.35 }}>
                  {VISUAL_HOOK_NAMES[s.visualCode] || s.visualCode}
                </span>
              </td>
              <td style={{ maxWidth: 190 }}>
                <span className="mx-chip" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10.5, fontWeight: 700, background: 'var(--mx-accent-soft)', color: 'var(--mx-accent-ink)' }}>
                  {s.verbalCode}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--mx-muted)', marginTop: 3, lineHeight: 1.35 }}>
                  {VERBAL_HOOK_NAMES[s.verbalCode] || s.verbalCode}
                </span>
              </td>
              <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(s.spend)}</td>
              <td className="num" style={{ fontWeight: s.leads ? 650 : 400 }}>
                {s.leads || <span className="mx-dim">—</span>}
              </td>
              <td className={`num ${cplTone(s.cpl)}`}>{money(s.cpl)}</td>
              <td className="num" style={{ fontWeight: s.signedCases ? 700 : 400, color: s.signedCases ? 'var(--mx-good)' : undefined }}>
                {s.signedCases || <span className="mx-dim">—</span>}
              </td>
              <td className={`num ${cpqTone(s.cpq)}`}>{money(s.cpq)}</td>
              <td className="num" style={{ color: 'var(--mx-muted)' }}>
                {s.conversionRate != null ? `${s.conversionRate.toFixed(1)}%` : <span className="mx-dim">—</span>}
              </td>
              {STAGES.map(st => (
                <td className="num" key={st.key}>
                  <StageCell count={(s as any)[`${st.key}Count`]} tone={st.tone}
                    onClick={() => onStage(s, st.key)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Stage leads ────────────────────────────────────────────────────────── */

function StageSheet({ modal, onClose }: { modal: NonNullable<ModalState>; onClose: () => void }) {
  const stage = STAGES.find(s => s.key === modal.stage)!
  const leads: PipelineLead[] = (modal.stat as any)[`${modal.stage}Leads`] || []

  return (
    <Overlay onClose={onClose} variant="sheet" labelledBy="stage-title">
      <div className="mx-sheet-head">
        <div style={{ minWidth: 0 }}>
          <p className="mx-eyebrow" style={{ marginBottom: 5, color: stage.tone }}>{stage.label}</p>
          <h2 id="stage-title" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.3, margin: 0 }}>
            {modal.stat.name}
          </h2>
          <p className="mx-creative-id" style={{ marginTop: 4 }}>{modal.stat.code}</p>
        </div>
        <button className="mx-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
      </div>

      <div className="mx-sheet-body">
        {leads.length === 0 ? (
          <EmptyState title="No leads in this stage"
            text="The count and the lead list are built separately, so a count without names means the contacts were not returned." />
        ) : (
          <table className="mx-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Phone</th>
                <th>Email</th>
                <th className="num">Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l, i) => (
                <tr className="row" key={i}>
                  <td style={{ fontWeight: 600 }}>{l.name || 'Unnamed contact'}</td>
                  <td style={{ color: 'var(--mx-muted)', fontSize: 12 }}>{l.phone || '—'}</td>
                  <td style={{ color: 'var(--mx-muted)', fontSize: 12, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.email || '—'}
                  </td>
                  <td className="num" style={{ color: 'var(--mx-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {l.createdAt
                      ? new Date(l.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mx-sheet-foot" style={{ fontSize: 11.5, color: 'var(--mx-muted)' }}>
        <b style={{ color: 'var(--mx-ink)' }}>{leads.length}</b> in {stage.label.toLowerCase()}
      </div>
    </Overlay>
  )
}

/* ── AI analysis renderer ───────────────────────────────────────────────── */

function AIAnalysis({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--mx-ink)', maxWidth: '72ch' }}>
      {text.split('\n').map((line, i) => {
        const t = line.trim()
        if (!t) return <div key={i} style={{ height: 10 }} />

        if (/^\*\*.*\*\*$/.test(t)) {
          return (
            <h3 key={i} className="mx-eyebrow" style={{ marginTop: 22, marginBottom: 7 }}>
              {t.replace(/\*\*/g, '')}
            </h3>
          )
        }

        if (/^\d+\.\s\*\*/.test(t)) {
          const title = t.replace(/^\d+\.\s\*\*/, '').replace(/\*\*.*/, '')
          const rest = t.replace(/^\d+\.\s\*\*[^*]+\*\*\s*—?\s*/, '')
          return (
            <div key={i} style={{ marginTop: 20 }}>
              <h3 className="mx-eyebrow" style={{ marginBottom: 6 }}>
                {t.match(/^\d+/)?.[0]}. {title}
              </h3>
              {rest && <p style={{ margin: 0 }}>{rest}</p>}
            </div>
          )
        }

        if (t.startsWith('- ') || t.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 9, marginBottom: 5, paddingLeft: 6 }}>
              <span style={{ color: 'var(--mx-accent)', flexShrink: 0 }}>•</span>
              <span>{t.replace(/^[-•]\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1')}</span>
            </div>
          )
        }

        return <p key={i} style={{ margin: '0 0 7px' }}>{t.replace(/\*\*([^*]+)\*\*/g, '$1')}</p>
      })}
    </div>
  )
}
