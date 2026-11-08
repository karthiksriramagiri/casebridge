'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { PageHeader, Pill, StatCard, EmptyState } from '@/app/creative/_components/admin/shared'
import { PeopleDialog } from '@/app/creative/_components/admin/people-dialog'
import { Button } from '@/app/creative/_ui/button'
import { num, pct, usd } from '@/app/creative/_lib/metrics'
import type { SignedLead } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'
import {
  ANGLE_FAMILIES, DATE_PRESETS, STAGES,
  CPL_GOOD, CPL_WARN, CPQ_GOOD, CPQ_WARN,
  type AngleFamily, type AngleStat, type AnglesData, type PipelineLead,
} from './_config'
import { NewHookDialog } from './_new-hook-dialog'

/* ═══════════════════════════════════════════════════════════════════════════
   Creative angles

   Every creative is a visual hook paired with a verbal one. This page ranks
   the hooks, and their pairings, by what they actually cost per qualified
   case — not by what they cost per lead, which flatters anything that brings
   in volume the intake team then has to throw away.

   Rebuilt from the page running in production, in this center's palette. The
   shape is deliberately unchanged: families on the landing, then one family
   at a time with its visual hooks, verbal hooks and combinations, and a stage
   count that opens into the people behind it.
   ═══════════════════════════════════════════════════════════════════════════ */

const toneCpl = (v: number | null) =>
  v == null ? '' : v <= CPL_GOOD ? 'text-success' : v <= CPL_WARN ? 'text-warning-foreground' : 'text-destructive'
const toneCpq = (v: number | null) =>
  v == null ? '' : v <= CPQ_GOOD ? 'text-success' : v <= CPQ_WARN ? 'text-warning-foreground' : 'text-destructive'

/** The pipeline's shape for a person, in the shape the names dialog wants. */
function asPeople(leads: PipelineLead[], stage: string): SignedLead[] {
  return leads.map((l) => ({
    name: (l.name || 'Unnamed').replace(/\s+/g, ' ').trim(),
    date: (l.createdAt || '').slice(0, 10),
    stage,
    phone: l.phone,
  }))
}

export default function AnglesPage() {
  const [datePreset, setDatePreset] = useState('maximum')
  const [data, setData] = useState<AnglesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [newHook, setNewHook] = useState(false)
  const [people, setPeople] = useState<{ title: string; subtitle: string; list: SignedLead[] } | null>(null)

  /* No firm filter: the hooks are written once and run across every firm, so
     splitting them by firm answered a question nobody was asking. */
  const load = useCallback((preset: string) => {
    setLoading(true)
    fetch(`/api/metrics/angles?date_preset=${preset}&firm=all`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(datePreset) }, [datePreset, load])

  const family = ANGLE_FAMILIES.find((f) => f.id === selected) ?? null

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <Seg options={DATE_PRESETS.map((p) => ({ value: p.value, label: p.label }))} value={datePreset} onChange={setDatePreset} label="Date range" />
      <Button variant="outline" size="icon-sm" aria-label="Refresh" onClick={() => load(datePreset)}>
        <RefreshCw aria-hidden className={loading ? 'animate-spin' : undefined} />
      </Button>
      <Button onClick={() => setNewHook(true)}>
        <Plus aria-hidden /> New angle
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col">
      <PageHeader
        title={family ? `${family.id} · ${family.label}` : 'Creative angles'}
        description={
          family
            ? `Visual hooks ${family.visual}, verbal hooks ${family.verbal}.`
            : 'Every creative is a visual hook paired with a verbal hook. Open a family to see which hooks — and which pairings — actually produce qualified cases.'
        }
        actions={filters}
      />

      <div className="flex flex-col gap-4 p-6">
        {family && (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> All angles
          </button>
        )}

        {loading && !data ? (
          <div className="h-64 animate-pulse rounded-lg border bg-card" />
        ) : !data ? (
          <EmptyState title="Angles could not be loaded">
            The angles report did not answer. Try refreshing.
          </EmptyState>
        ) : family ? (
          <FamilyDetail
            family={family}
            data={data}
            onOpenPeople={setPeople}
          />
        ) : (
          <Landing data={data} onPick={setSelected} />
        )}
      </div>

      {/* Codes already running in ads, so the suggested number skips them
          even when nobody has named them yet. */}
      <NewHookDialog
        open={newHook}
        onOpenChange={setNewHook}
        onCreated={() => load(datePreset)}
        inUse={[...(data?.visual ?? []), ...(data?.verbal ?? [])].map((h) => h.code)}
      />

      <PeopleDialog
        open={people !== null}
        onOpenChange={(v) => !v && setPeople(null)}
        title={people?.title ?? ''}
        subtitle={people?.subtitle ?? ''}
        people={people?.list ?? []}
      />
    </div>
  )
}

/* ── Landing ─────────────────────────────────────────────────────────────── */

function Landing({ data, onPick }: { data: AnglesData; onPick: (id: string) => void }) {
  const all = [...data.visual, ...data.verbal]
  const spend = data.visual.reduce((s, v) => s + v.spend, 0)
  const leads = data.visual.reduce((s, v) => s + v.leads, 0)
  const signed = data.visual.reduce((s, v) => s + v.signedCases, 0)

  const perFamily = ANGLE_FAMILIES.map((f) => {
    const visual = data.visual.filter((s) => s.code.startsWith(f.visual))
    const verbal = data.verbal.filter((s) => s.code.startsWith(f.verbal))
    const fSpend = visual.reduce((s, v) => s + v.spend, 0)
    const fLeads = visual.reduce((s, v) => s + v.leads, 0)
    const fSigned = visual.reduce((s, v) => s + v.signedCases, 0)
    return {
      f,
      visual: visual.length,
      verbal: verbal.length,
      spend: fSpend,
      leads: fLeads,
      signed: fSigned,
      cpq: fSigned > 0 ? fSpend / fSigned : null,
      live: visual.length > 0 || verbal.length > 0,
    }
  }).sort((a, b) => b.spend - a.spend)

  const active = perFamily.filter((p) => p.live).length

  return (
    <>
      <section aria-label="Angle totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Spend across angles" value={usd(spend, 0)} hint={`${active} of ${ANGLE_FAMILIES.length} families active`} />
        <StatCard label="Leads" value={num(leads)} hint={leads ? `${usd(spend / leads, 0)} per lead` : undefined} />
        <StatCard label="Signed" value={num(signed)} tone="good" hint={signed ? `${usd(spend / signed, 0)} per case` : undefined} />
        <StatCard label="Hooks tracked" value={num(all.length)} hint={`${data.visual.length} visual · ${data.verbal.length} verbal`} />
        <StatCard
          label="Unparsed"
          value={num(data.unparsedAds)}
          tone={data.unparsedAds > 0 ? 'bad' : undefined}
          hint={`${usd(data.unparsedSpend, 0)} on ads whose name has no hook code`}
        />
      </section>

      {data.unparsedAds > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">{num(data.unparsedAds)} ads are missing a hook code</p>
            <p className="text-muted-foreground">
              {usd(data.unparsedSpend, 0)} of spend is invisible to this page. Ad names need the visual and
              verbal codes in them to be attributed to an angle.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Angle families · by spend</h2>
        <span className="text-xs text-muted-foreground">Cost per qualified case is the ranking metric</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {perFamily.map(({ f, visual, verbal, spend, leads, signed, cpq, live }) => (
          <button
            key={f.id}
            type="button"
            disabled={!live}
            onClick={() => onPick(f.id)}
            className={cn(
              'group flex flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors',
              live ? 'hover:border-primary/40 hover:bg-muted/30' : 'cursor-default opacity-60',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-primary">{f.codes}</span>
                <span className="text-xs text-muted-foreground">{f.label}</span>
              </div>
              {live && <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />}
            </div>

            <div>
              <div className="text-lg font-semibold">{f.id}</div>
              <div className="text-xs text-muted-foreground">
                {num(visual)} visual · {num(verbal)} verbal hooks
              </div>
            </div>

            {live ? (
              <>
                <div className="grid grid-cols-3 gap-2 border-t pt-3">
                  <Fig label="Spend" value={usd(spend, 0)} />
                  <Fig label="Leads" value={num(leads)} />
                  <Fig label="Signed" value={num(signed)} tone="text-success" />
                </div>
                <Fig label="CPQ" value={cpq == null ? '—' : usd(cpq, 0)} tone={toneCpq(cpq)} />
              </>
            ) : (
              <p className="border-t pt-3 text-xs text-muted-foreground">Nothing recorded in this period</p>
            )}
          </button>
        ))}
      </div>
    </>
  )
}

/* ── One family ──────────────────────────────────────────────────────────── */

function FamilyDetail({
  family, data, onOpenPeople,
}: {
  family: AngleFamily
  data: AnglesData
  onOpenPeople: (p: { title: string; subtitle: string; list: SignedLead[] }) => void
}) {
  const visual = data.visual.filter((s) => s.code.startsWith(family.visual))
  const verbal = data.verbal.filter((s) => s.code.startsWith(family.verbal))
  const combos = data.combos.filter((s) => s.visualCode.startsWith(family.visual))
  const [tab, setTab] = useState<'visual' | 'verbal' | 'combos'>('visual')

  /* Family totals come off the visual side only. Every ad carries exactly one
     visual hook and one verbal hook, so adding both halves would count the
     same spend and the same cases twice. */
  const spend = visual.reduce((s, v) => s + v.spend, 0)
  const leads = visual.reduce((s, v) => s + v.leads, 0)
  const signed = visual.reduce((s, v) => s + v.signedCases, 0)
  const cpl = leads > 0 ? spend / leads : null
  const cpq = signed > 0 ? spend / signed : null

  const rows = tab === 'visual' ? visual : tab === 'verbal' ? verbal : combos
  const ranked = useMemo(
    () => [...rows].sort((a, b) => {
      /* Ranked by cost per qualified case, and a hook that has not signed
         anything sorts below every hook that has rather than above them all
         on a null. */
      const av = a.signedCases > 0 ? a.spend / a.signedCases : Number.POSITIVE_INFINITY
      const bv = b.signedCases > 0 ? b.spend / b.signedCases : Number.POSITIVE_INFINITY
      return av - bv || b.spend - a.spend
    }),
    [rows],
  )

  const tabs = [
    { key: 'visual' as const, label: `Visual (${family.visual})`, n: visual.length },
    { key: 'verbal' as const, label: `Verbal (${family.verbal})`, n: verbal.length },
    { key: 'combos' as const, label: 'Combinations', n: combos.length },
  ]

  const total = ranked.reduce(
    (a, r) => ({
      spend: a.spend + r.spend, leads: a.leads + r.leads, signed: a.signed + r.signedCases,
      nr: a.nr + r.nrCount, nq: a.nq + r.nqCount, fu: a.fu + r.fuCount, chase: a.chase + r.chaseCount,
      ads: a.ads + r.adCount,
    }),
    { spend: 0, leads: 0, signed: 0, nr: 0, nq: 0, fu: 0, chase: 0, ads: 0 },
  )

  return (
    <>
      <section aria-label="Family totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Spend" value={usd(spend, 0)} hint={`across ${num(visual.length)} visual hooks`} />
        <StatCard label="Leads" value={num(leads)} hint="from this angle family" />
        <StatCard label="Cost per lead" value={cpl == null ? '—' : usd(cpl, 0)} hint={`target under ${usd(CPL_GOOD, 0)}`} tone={cpl != null && cpl <= CPL_GOOD ? 'good' : cpl != null && cpl > CPL_WARN ? 'bad' : undefined} />
        <StatCard label="Cost per qualified" value={cpq == null ? '—' : usd(cpq, 0)} hint={`target under ${usd(CPQ_GOOD, 0)}`} tone={cpq != null && cpq <= CPQ_GOOD ? 'good' : cpq != null && cpq > CPQ_WARN ? 'bad' : undefined} />
        <StatCard label="Signed" value={num(signed)} tone="good" hint={leads ? `${pct(signed / leads)} of leads` : undefined} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Hook side" className="flex overflow-hidden rounded-md border">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
              )}
            >
              {t.label} <span className="opacity-70">{t.n}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Ranked by cost per qualified case · click a stage count to see the leads
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">#</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Code</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Hook</th>
              {['Spend', 'Leads', 'CPL', 'Signed', 'CPQ', 'Conv'].map((h) => (
                <th key={h} scope="col" className="px-3 py-2.5 text-right font-medium">{h}</th>
              ))}
              {STAGES.map((s) => (
                <th key={s.key} scope="col" className="px-3 py-2.5 text-right font-medium" title={s.label}>{s.short}</th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Ads</th>
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-10 text-center text-muted-foreground">
                  No hooks recorded for this family in this period.
                </td>
              </tr>
            ) : ranked.map((r, i) => {
              const rowCpl = r.leads > 0 ? r.spend / r.leads : null
              const rowCpq = r.signedCases > 0 ? r.spend / r.signedCases : null
              return (
                <tr key={r.code} className="border-t">
                  <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-medium">{r.code}</span>
                  </td>
                  <td className="max-w-[320px] truncate px-3 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{usd(r.spend, 0)}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{r.leads || '—'}</td>
                  <td className={cn('px-3 py-2.5 text-right font-medium tabular-nums', toneCpl(rowCpl))}>
                    {rowCpl == null ? '—' : usd(rowCpl, 0)}
                  </td>
                  <td className={cn('px-3 py-2.5 text-right font-medium tabular-nums', r.signedCases > 0 && 'text-success')}>
                    {r.signedCases || '—'}
                  </td>
                  <td className={cn('px-3 py-2.5 text-right font-medium tabular-nums', toneCpq(rowCpq))}>
                    {rowCpq == null ? '—' : usd(rowCpq, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.leads > 0 ? pct(r.signedCases / r.leads) : '—'}
                  </td>
                  {STAGES.map((s) => {
                    const n = r[s.count] as number
                    const list = r[s.leads] as PipelineLead[]
                    return (
                      <td key={s.key} className="px-3 py-2.5 text-right tabular-nums">
                        {n > 0 ? (
                          <button
                            type="button"
                            className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
                            onClick={() => onOpenPeople({
                              title: `${r.code} · ${r.name}`,
                              subtitle: s.label,
                              list: asPeople(list, s.label),
                            })}
                          >
                            {n}
                          </button>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.adCount}</td>
                </tr>
              )
            })}
          </tbody>
          {ranked.length > 0 && (
            <tfoot className="border-t bg-muted/40 text-xs">
              <tr>
                <td colSpan={3} className="px-3 py-2.5 font-medium uppercase tracking-wide text-muted-foreground">Total</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{usd(total.spend, 0)}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{num(total.leads)}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{total.leads ? usd(total.spend / total.leads, 0) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{num(total.signed)}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{total.signed ? usd(total.spend / total.signed, 0) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{total.leads ? pct(total.signed / total.leads) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{total.nr || '—'}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{total.nq || '—'}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{total.fu || '—'}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{total.chase || '—'}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{num(total.ads)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  )
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('font-semibold tabular-nums', tone)}>{value}</span>
    </div>
  )
}

function Seg({
  options, value, onChange, label,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex overflow-hidden rounded-md border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'px-2.5 py-1.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
