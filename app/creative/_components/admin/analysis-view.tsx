'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, EyeOff, Eye, History, RotateCcw, Search, Skull, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { Input } from '@/app/creative/_ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/creative/_ui/select'
import { TODAY, YESTERDAY } from '@/app/creative/_lib/data'
import { adsetIsOn, daysLive, hasDeliveryIssue, isWatchCandidate, leadsIn, num, pct, RANGES, signedIn, stageOf, sumTotals, totalsFor, usd, WATCH_CPL } from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'
import { useDailyExclusions } from '@/app/creative/_lib/use-daily-exclusions'
import type { RangeKey, SignedLead, Stage, Totals } from '@/app/creative/_lib/types'
import { FIRMS, firmName } from '@/app/_metrics/firms'
import { cn } from '@/lib/utils'
import { CreativeDetail } from './creative-detail'
import { PeopleDialog } from './people-dialog'
import { PageHeader, Pill, RangeSelect, StatCard, Thumb } from './shared'

type SortKey = 'spend' | 'leads' | 'cpl' | 'acquisitions' | 'cpa' | 'hookRate' | 'ctr' | 'cpm' | 'impressions'

/* Signed cases and the CPA built on them come from ghl_leads, joined to the
   ad by the Meta ad id the case was attributed to. When that join has not
   loaded they render as "—": printing 0 would say every ad signed nobody,
   which is a claim the page cannot make. */
const columnsFor = (hasOutcomes: boolean): { key: SortKey; label: string; render: (t: Totals) => string }[] => [
  { key: 'spend', label: 'Amount spent', render: (t) => usd(t.spend) },
  { key: 'leads', label: 'Leads', render: (t) => num(t.leads) },
  { key: 'cpl', label: 'Cost per lead', render: (t) => usd(t.cpl) },
  { key: 'acquisitions', label: 'Signed', render: (t) => (hasOutcomes ? num(t.acquisitions) : '—') },
  { key: 'cpa', label: 'CPA', render: (t) => (hasOutcomes ? usd(t.cpa) : '—') },
  { key: 'hookRate', label: 'Hook rate', render: (t) => pct(t.hookRate) },
  { key: 'ctr', label: 'CTR (link)', render: (t) => pct(t.ctr) },
  { key: 'cpm', label: 'CPM', render: (t) => usd(t.cpm) },
  { key: 'impressions', label: 'Impressions', render: (t) => num(t.impressions) },
]

/* The list tags, rendered the same way at both row levels.

   An ad set is tagged when any of its ads is, with the count shown when it is
   only some of them — otherwise a set holding one watched ad out of nine
   reads exactly like a set where every ad is watched. */
function ListTags({
  watchedToday, watchedYesterday, inKill, of,
}: {
  watchedToday: number
  watchedYesterday: number
  inKill: number
  /** How many ads the counts are out of; omitted for a single creative. */
  of?: number
}) {
  const part = (n: number) => (of && of > 1 && n < of ? `${n} of ${of} ` : '')
  return (
    <>
      {watchedToday > 0 && (
        <Pill tone="blue">
          <Eye className="size-3" aria-hidden /> {part(watchedToday)}on today’s watch list
        </Pill>
      )}
      {inKill > 0 && (
        <Pill tone="red">
          <Skull className="size-3" aria-hidden /> {part(inKill)}on today’s kill list
        </Pill>
      )}
      {watchedYesterday > 0 && (
        <Pill tone="amber">
          <History className="size-3" aria-hidden /> {part(watchedYesterday)}on yesterday’s watch list
        </Pill>
      )}
    </>
  )
}

/* A number that opens into its names.

   Only Leads and Signed are clickable — they are the two counts that are a
   list of people. Everything else renders exactly as before, so the table
   does not sprout buttons it has nothing to put behind them. */
function PeopleCell({
  col, t, hasOutcomes, onOpen,
}: {
  col: { key: SortKey; render: (t: Totals) => string }
  t: Totals
  hasOutcomes: boolean
  onOpen: (which: 'signed' | 'leads') => void
}) {
  const which = col.key === 'leads' ? 'leads' : col.key === 'acquisitions' ? 'signed' : null
  const count = col.key === 'leads' ? t.leads : t.acquisitions
  /* Signed needs the sweep to have landed; leads need the sweep too, since
     the names come from it even when the count is Meta's. */
  const openable = which !== null && hasOutcomes && count > 0

  if (!openable) return <>{col.render(t)}</>
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(which) }}
      className="rounded underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      title={which === 'signed' ? 'Who signed' : 'Which leads'}
    >
      {col.render(t)}
    </button>
  )
}

/* Meta and the pipeline count leads differently — Meta counts the form
   submission, GHL counts an opportunity it could attribute back to the ad —
   so they rarely agree, in either direction. The cell keeps Meta's number,
   which is what CPL is built on; this says what the pipeline actually holds,
   and only when the two differ, because saying it every time is noise.

   It has to read sensibly both ways round. The pipeline can hold more than
   Meta counted (a lead that came in late, or was worked under a second
   opportunity) as well as fewer, and the old wording — "Meta reported 4; 5
   are matched" — made the commoner case look like an error. */
function leadNote(metaLeads: number, matched: number): string | undefined {
  if (metaLeads === matched) return undefined
  const more = matched > metaLeads
  return (
    `Meta counted ${num(metaLeads)} form ${metaLeads === 1 ? 'submission' : 'submissions'} in this range; ` +
    `the pipeline holds ${num(matched)} ${matched === 1 ? 'person' : 'people'} attributed to this ad — ` +
    `${more ? 'more' : 'fewer'}. The two are counted differently and rarely agree exactly.`
  )
}

/** Pulls the people out of one row, or out of a whole ad set. */
function gather(ads: { c: any }[], range: RangeKey, which: 'signed' | 'leads'): SignedLead[] {
  const pick = which === 'signed' ? signedIn : leadsIn
  return ads
    .flatMap(({ c }) => pick(c, range))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** The signed names behind a count, for the cell's hover title. */
function namesOf(signed: { name: string }[]): string | undefined {
  if (signed.length === 0) return undefined
  return `Signed: ${signed.map((l) => l.name).join(', ')}`
}

export function AnalysisView() {
  const { creatives, killedIds, watch, kill, addToWatch, addToKill, addAssignment, assignments, accounts, loading, loadError, hasOutcomes, adsetTotals } = useStore()
  const [range, setRange] = useState<RangeKey>('today')
  const [query, setQuery] = useState('')
  const [account, setAccount] = useState('all')
  const [firm, setFirm] = useState('all')
  const [stage, setStage] = useState<'all' | Stage>('all')
  const [watchMode, setWatchMode] = useState(false)
  /* Dismissals survive a reload and clear themselves at midnight Pacific —
     going down the watch list is a shift's work, not a query. */
  const { excluded, exclude, restoreAll } = useDailyExclusions()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'spend', dir: -1 })
  const [detailId, setDetailId] = useState<string | null>(null)
  /* Which number was clicked: the names behind it, and what to call them. */
  const [people, setPeople] = useState<
    { title: string; subtitle: string; note?: string; list: SignedLead[]; total?: number } | null
  >(null)

  const COLUMNS = useMemo(() => columnsFor(hasOutcomes), [hasOutcomes])
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? ''

  /* Firms run inside one ad account, so the list narrows with the account
     above it — otherwise the picker offers a firm that cannot appear under
     the current selection. Ordered by the canonical FIRMS list rather than
     alphabetically, so a firm and its Spanish board stay adjacent. */
  const firms = useMemo(() => {
    const present = new Set(
      creatives.filter((c) => account === 'all' || c.account === account).map((c) => c.firm),
    )
    const order = (code: string) => {
      const i = FIRMS.findIndex((f) => f.code === code)
      return i === -1 ? FIRMS.length : i
    }
    return [...present].sort((a, b) => order(a) - order(b) || a.localeCompare(b))
  }, [creatives, account])

  /* A firm held over from another account would filter everything away and
     read as "no data" rather than as a stale selection. */
  useEffect(() => {
    if (firm !== 'all' && !firms.includes(firm)) setFirm('all')
  }, [firms, firm])
  const yesterdayWatch = useMemo(() => new Set(watch.filter((w) => w.date === YESTERDAY).map((w) => w.creativeId)), [watch])
  const todayWatch = useMemo(() => new Set(watch.filter((w) => w.date === TODAY).map((w) => w.creativeId)), [watch])
  const pendingKill = useMemo(() => new Set(kill.filter((k) => k.status === 'pending').map((k) => k.creativeId)), [kill])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return creatives
      .filter((c) => !killedIds.has(c.id))
      .filter((c) => !excluded.has(c.id))
      .filter((c) => account === 'all' || c.account === account)
      .filter((c) => firm === 'all' || c.firm === firm)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.adId.includes(q) || c.angle.toLowerCase().includes(q))
      .filter((c) => stage === 'all' || stageOf(c) === stage)
      /* Judged on the ad set the creative sits in, not the creative — one
         ad going quiet inside a converting ad set is not watch-worthy. */
      .filter((c) => !watchMode || isWatchCandidate(c, adsetTotals))
      /* The one filter: an ad set that has been turned off takes its ads out
         of the table. Nothing else is hidden — not by spend, not by range. */
      .filter(adsetIsOn)
      .map((c) => ({ c, t: totalsFor(c, range) }))
      .sort((a, b) => {
        const av = a.t[sort.key] ?? Number.POSITIVE_INFINITY
        const bv = b.t[sort.key] ?? Number.POSITIVE_INFINITY
        return (av - bv) * sort.dir
      })
  }, [creatives, killedIds, excluded, account, firm, stage, query, watchMode, range, sort, adsetTotals])

  /* ── Ad sets ────────────────────────────────────────────────────────────
     Rows are ad sets; the ads inside are revealed by the chevron. Worth
     knowing how this account is actually shaped: 171 ads sit in 144 ad sets,
     so most sets hold exactly one ad and the grouping is close to one row per
     ad. The parent therefore carries the first ad's still, so the creative is
     visible without expanding anything, and the aggregate only really earns
     its keep on the handful of sets running 2–3 variants. */
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; adset: string; firm: string; accountLabel: string; ads: typeof rows }>()
    for (const r of rows) {
      const key = `${r.c.account}::${r.c.adset}`
      const g = map.get(key)
      if (g) g.ads.push(r)
      else map.set(key, { key, adset: r.c.adset, firm: firmName(r.c.firm), accountLabel: r.c.accountLabel, ads: [r] })
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        total: sumTotals(g.ads.map((a) => a.t)),
        /* Everyone who signed off any ad in this set, so the count in the
           Signed column can name them on hover. */
        signed: g.ads.flatMap((a) => signedIn(a.c, range)),
      }))
      .sort((a, b) => {
        const av = a.total[sort.key] ?? Number.POSITIVE_INFINITY
        const bv = b.total[sort.key] ?? Number.POSITIVE_INFINITY
        return (av - bv) * sort.dir
      })
  }, [rows, sort, range])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleGroup = (k: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const total = sumTotals(rows.map((r) => r.t))
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.c.id))
  const selectedIds = rows.filter((r) => selected.has(r.c.id)).map((r) => r.c.id)

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const bulkWatch = (ids: string[]) => {
    const n = addToWatch(ids)
    toast(n ? `Added ${n} to today’s watch list` : 'Already on today’s watch list')
    setSelected(new Set())
  }
  const bulkKill = (ids: string[]) => {
    const n = addToKill(ids)
    toast(n ? `Added ${n} to kill list` : 'Already on the kill list')
    setSelected(new Set())
  }
  const bulkExclude = (ids: string[]) => {
    exclude(ids)
    setSelected(new Set())
  }

  /* Double down, from the table the decision is actually made in.

     It used to live only on Winner Analysis, which meant spotting a winner
     here and acting on it were two different pages: you read the row, went
     looking for the same ad on another screen, and assigned it there. The
     assignment it writes is the same one — the Double Down brief Faisal
     picks up. */
  const alreadyDoubled = useMemo(
    () => new Set(assignments.filter((a) => a.type === 'Double Down').map((a) => a.sourceCreativeId)),
    [assignments],
  )

  const bulkDoubleDown = (ids: string[]) => {
    const fresh = ids.filter((id) => !alreadyDoubled.has(id))
    for (const id of fresh) {
      const c = creatives.find((x) => x.id === id)
      if (!c) continue
      addAssignment({
        title: `Double Down – ${c.id} ${c.angle}`,
        type: 'Double Down',
        angle: c.angle,
        sourceCreativeId: c.id,
      })
    }
    toast(
      fresh.length
        ? `Sent ${fresh.length} to double down`
        : 'Already sent to double down',
    )
    setSelected(new Set())
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Creative Analysis"
        description="Ads Manager-style breakdown with watch & kill shortcuts."
        actions={<RangeSelect value={range} onChange={setRange} />}
      />

      <div className="flex flex-col gap-4 p-6">
        {/* One account can fail while the other answers — naming which is
            the difference between a fixable token and a blank page. */}
        {loadError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {loadError}
          </p>
        )}

        <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total amount spent" value={usd(total.spend, 0)} />
          <StatCard
            label="Leads"
            value={num(total.leads)}
            hint={hasOutcomes ? 'Click to see who' : undefined}
            onClick={
              hasOutcomes && total.leads > 0
                ? () => {
                    const list = gather(rows, range, 'leads')
                    setPeople({
                      title: 'Everything in view',
                      subtitle: `Leads · ${rangeLabel}`,
                      note: leadNote(total.leads, list.length),
                      list,
                    })
                  }
                : undefined
            }
          />
          <StatCard label="CPL" value={usd(total.cpl)} tone={total.cpl !== null && total.cpl < 120 ? 'good' : undefined} />
          <StatCard
            label="Signed"
            value={hasOutcomes ? num(total.acquisitions) : '—'}
            hint={hasOutcomes ? 'Cases signed off these ads' : 'From GHL'}
            onClick={
              hasOutcomes && total.acquisitions > 0
                ? () =>
                    setPeople({
                      title: 'Everything in view',
                      subtitle: `Signed cases · ${rangeLabel}`,
                      list: gather(rows, range, 'signed'),
                    })
                : undefined
            }
          />
          <StatCard
            label="CPA"
            value={hasOutcomes ? usd(total.cpa) : '—'}
            hint={hasOutcomes ? 'Spend ÷ signed cases' : 'From GHL'}
          />
        </section>

        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, ad ID or angle"
                aria-label="Search creatives"
                className="pl-8"
              />
            </div>
            {/* Ad account comes first: a campaign only means something once
                you know whose account it is in, and the two accounts run
                campaigns under the same naming scheme. */}
            <Select value={account} onValueChange={(v) => setAccount(v as string)}>
              <SelectTrigger className="w-56" aria-label="Ad account">
                <SelectValue>
                  {(v: string) => (v === 'all' ? 'All ad accounts' : accounts.find((a) => a.key === v)?.label ?? v)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ad accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.key} value={a.key}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={firm} onValueChange={(v) => setFirm(v as string)}>
              <SelectTrigger className="w-60" aria-label="Firm">
                <SelectValue>{(v: string) => (v === 'all' ? 'All firms' : firmName(v))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All firms</SelectItem>
                {firms.map((f) => (
                  <SelectItem key={f} value={f}>
                    {firmName(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div role="radiogroup" aria-label="Stage" className="flex overflow-hidden rounded-md border">
              {(['all', 'NEW', 'ACTIVE'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={stage === s}
                  onClick={() => setStage(s)}
                  title={s === 'NEW' ? 'Day 1–3 since launch' : s === 'ACTIVE' ? 'Day 4+ since launch' : undefined}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    stage === s ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                  )}
                >
                  {s === 'all' ? 'All' : s}
                </button>
              ))}
            </div>
            <Button
              variant={watchMode ? 'default' : 'outline'}
              aria-pressed={watchMode}
              onClick={() => setWatchMode((v) => !v)}
              title={`Ad-set level: hides ads whose ad set got a lead today or is under $${WATCH_CPL} T&Y CPL`}
            >
              <Eye aria-hidden /> Watch List Mode
            </Button>
            {excluded.size > 0 && (
              <Button
                variant="ghost"
                onClick={restoreAll}
                title="Dismissals are kept until midnight Pacific. This puts them all back now."
              >
                <RotateCcw aria-hidden /> Show {excluded.size} removed
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {selectedIds.length > 0 ? (
                <>
                  <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
                  <Button variant="outline" size="sm" onClick={() => bulkWatch(selectedIds)}>
                    <Eye aria-hidden /> Add to watch
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => bulkDoubleDown(selectedIds)}>
                    <TrendingUp aria-hidden /> Double down
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => bulkKill(selectedIds)}>
                    <Skull aria-hidden /> Add to kill
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => bulkExclude(selectedIds)}>
                    <EyeOff aria-hidden /> Exclude
                  </Button>
                </>
              ) : (
                watchMode &&
                rows.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => bulkWatch(rows.map((r) => r.c.id))}>
                    <Eye aria-hidden /> Add all {rows.length} to watch
                  </Button>
                )
              )}
            </div>
          </div>

          {watchMode && (
            <p className="border-b bg-accent/60 px-4 py-2 text-xs text-accent-foreground">
              {`Watch List Mode: judged on the ad set, not the single ad — hiding anything whose ad set got a lead today or whose ad set is under $${WATCH_CPL} Today & Yesterday CPL.`}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <Checkbox
                      aria-label="Select all"
                      checked={allSelected}
                      onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.c.id)))}
                    />
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">
                    Ad set
                  </th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} scope="col" className="px-3 py-2.5 text-right font-medium">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() =>
                          setSort((s) => ({ key: col.key, dir: s.key === col.key ? ((s.dir * -1) as 1 | -1) : -1 }))
                        }
                      >
                        {col.label}
                        {sort.key === col.key &&
                          (sort.dir === -1 ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />)}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* An empty table during a 7-second Meta fetch reads as "no
                    ads are running", which is the opposite of the truth. */}
                {(loading || rows.length === 0) && (
                  <tr>
                    <td colSpan={COLUMNS.length + 3} className="px-3 py-12 text-center text-sm text-muted-foreground">
                      {loading
                        ? 'Loading ads from Meta…'
                        : creatives.length === 0
                          ? 'No ads came back from Meta for the last 30 days.'
                          : 'No ads match these filters.'}
                    </td>
                  </tr>
                )}
                {!loading &&
                  groups.map((g) => {
                    const open = expanded.has(g.key)
                    const groupIds = g.ads.map((a) => a.c.id)
                    const allIn = groupIds.every((id) => selected.has(id))
                    const head = g.ads[0].c
                    const gt = g.total
                    return (
                      <Fragment key={g.key}>
                        {/* ── The ad set ───────────────────────────────── */}
                        <tr className={cn('group border-t hover:bg-muted/40', allIn && 'bg-accent/50')}>
                          <td className="px-3 py-2">
                            <Checkbox
                              aria-label={`Select every ad in ${g.adset}`}
                              checked={allIn}
                              onCheckedChange={() =>
                                setSelected((prev) => {
                                  const next = new Set(prev)
                                  for (const id of groupIds) if (allIn) next.delete(id); else next.add(id)
                                  return next
                                })
                              }
                            />
                          </td>
                          <td className="max-w-[420px] px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleGroup(g.key)}
                                aria-expanded={open}
                                aria-label={`${open ? 'Collapse' : 'Expand'} ${g.adset}`}
                                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                              </button>
                              <Thumb c={head} />
                              <div className="flex min-w-0 flex-col gap-1">
                                <button
                                  type="button"
                                  onClick={() => toggleGroup(g.key)}
                                  className="truncate text-left font-medium hover:text-primary"
                                >
                                  {g.adset}
                                </button>
                                {/* The firm truncates and the pills keep their width,
                                    which is what stops a long name pushing them onto a
                                    second line and making every ad-set row taller than
                                    the creatives nested under it. Wrapping is allowed
                                    only for the list tags, which appear on the few sets
                                    that are actually being watched or killed — the cost
                                    of a taller row is worth paying there. */}
                                <div className="flex flex-wrap items-center gap-1 overflow-hidden">
                                  <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                                    {g.firm}
                                  </span>
                                  <span className="shrink-0">
                                    <Pill>{g.ads.length === 1 ? '1 ad' : `${g.ads.length} ads`}</Pill>
                                  </span>
                                  <ListTags
                                    watchedToday={g.ads.filter((a) => todayWatch.has(a.c.id)).length}
                                    watchedYesterday={g.ads.filter((a) => yesterdayWatch.has(a.c.id)).length}
                                    inKill={g.ads.filter((a) => pendingKill.has(a.c.id)).length}
                                    of={g.ads.length}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                          {COLUMNS.map((col) => (
                            <td
                              key={col.key}
                              title={col.key === 'acquisitions' ? namesOf(g.signed) : undefined}
                              className={cn(
                                'whitespace-nowrap px-3 py-2 text-right tabular-nums',
                                col.key === 'cpl' && gt.cpl !== null && gt.cpl < 120 && 'font-semibold text-success',
                                col.key === 'cpl' && (gt.cpl === null ? gt.spend > 0 : gt.cpl > WATCH_CPL) && 'text-destructive',
                                col.key === 'acquisitions' && gt.acquisitions > 0 && 'font-semibold text-success',
                              )}
                            >
                              <PeopleCell
                                col={col}
                                t={gt}
                                hasOutcomes={hasOutcomes}
                                onOpen={(which) =>
                                  setPeople({
                                    title: g.adset,
                                    subtitle: `${which === 'signed' ? 'Signed cases' : 'Leads'} · ${rangeLabel}`,
                                    note: which === 'leads' ? leadNote(gt.leads, gather(g.ads, range, 'leads').length) : undefined,
                                    list: gather(g.ads, range, which),
                                    total: g.ads.reduce(
                                      (n, a) => n + ((which === 'signed' ? a.c.signedLeads : a.c.leadPeople)?.length ?? 0),
                                      0,
                                    ),
                                  })
                                }
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100">
                              <Button size="icon-sm" variant="ghost" aria-label={`Add every ad in ${g.adset} to watch list`} title="Add the whole ad set to the watch list" onClick={() => bulkWatch(groupIds)}>
                                <Eye aria-hidden />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Send every ad in ${g.adset} to double down`}
                                title="Send the whole ad set to double down"
                                disabled={groupIds.every((id) => alreadyDoubled.has(id))}
                                onClick={() => bulkDoubleDown(groupIds)}
                              >
                                <TrendingUp aria-hidden />
                              </Button>
                              <Button size="icon-sm" variant="ghost" aria-label={`Add every ad in ${g.adset} to kill list`} title="Add the whole ad set to the kill list" onClick={() => bulkKill(groupIds)}>
                                <Skull aria-hidden />
                              </Button>
                              <Button size="icon-sm" variant="ghost" aria-label={`Exclude ${g.adset} from view`} onClick={() => bulkExclude(groupIds)}>
                                <EyeOff aria-hidden />
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {/* ── Its creatives ────────────────────────────── */}
                        {open &&
                          g.ads.map(({ c, t }) => {
                            const isSel = selected.has(c.id)
                            return (
                              <tr key={c.id} className={cn('group border-t border-dashed bg-muted/20 hover:bg-muted/40', isSel && 'bg-accent/50')}>
                                <td className="px-3 py-2">
                                  <Checkbox aria-label={`Select ${c.name}`} checked={isSel} onCheckedChange={() => toggle(c.id)} />
                                </td>
                                <td className="max-w-[420px] py-2 pl-10 pr-3">
                                  {/* Same thumbnail size as the ad-set row above it — a
                                      larger still here made the expanded row tower over
                                      every other one and broke the scan down the table. */}
                                  <div className="flex items-center gap-2.5 border-l-2 border-border pl-3">
                                    <Thumb c={c} />
                                    <div className="flex min-w-0 flex-col gap-1">
                                      <button
                                        onClick={() => setDetailId(c.id)}
                                        className="truncate text-left font-medium text-primary hover:underline"
                                      >
                                        {c.name}
                                      </button>
                                      <div className="flex flex-wrap items-center gap-1">
                                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                          <span className="size-1.5 rounded-full bg-success" aria-hidden /> Active · {c.angle}
                                        </span>
                                        <Pill tone={stageOf(c) === 'NEW' ? 'blue' : 'muted'}>
                                          {stageOf(c)} · Day {daysLive(c)}
                                        </Pill>
                                        <Pill>{c.format}</Pill>
                                        {hasDeliveryIssue(c) && (
                                          <span title="Meta reports a problem with this ad — it is switched on but may not be delivering.">
                                            <Pill tone="amber">Issues</Pill>
                                          </span>
                                        )}
                                        <ListTags
                                          watchedToday={todayWatch.has(c.id) ? 1 : 0}
                                          watchedYesterday={yesterdayWatch.has(c.id) ? 1 : 0}
                                          inKill={pendingKill.has(c.id) ? 1 : 0}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                {COLUMNS.map((col) => (
                                  <td
                                    key={col.key}
                                    title={col.key === 'acquisitions' ? namesOf(signedIn(c, range)) : undefined}
                                    className={cn(
                                      'whitespace-nowrap px-3 py-2 text-right tabular-nums',
                                      col.key === 'cpl' && t.cpl !== null && t.cpl < 120 && 'font-semibold text-success',
                                      col.key === 'cpl' && (t.cpl === null ? t.spend > 0 : t.cpl > WATCH_CPL) && 'text-destructive',
                                      col.key === 'acquisitions' && t.acquisitions > 0 && 'font-semibold text-success',
                                    )}
                                  >
                                    <PeopleCell
                                      col={col}
                                      t={t}
                                      hasOutcomes={hasOutcomes}
                                      onOpen={(which) =>
                                        setPeople({
                                          title: c.name,
                                          subtitle: `${which === 'signed' ? 'Signed cases' : 'Leads'} · ${rangeLabel}`,
                                          note: which === 'leads' ? leadNote(t.leads, leadsIn(c, range).length) : undefined,
                                          list: which === 'signed' ? signedIn(c, range) : leadsIn(c, range),
                                          total: (which === 'signed' ? c.signedLeads : c.leadPeople)?.length ?? 0,
                                        })
                                      }
                                    />
                                  </td>
                                ))}
                                <td className="px-3 py-2">
                                  <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100">
                                    <Button size="icon-sm" variant="ghost" aria-label="Add to watch list" title="Add to watch list" onClick={() => bulkWatch([c.id])}>
                                      <Eye aria-hidden />
                                    </Button>
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label={alreadyDoubled.has(c.id) ? 'Already sent to double down' : 'Send to double down'}
                                      title={alreadyDoubled.has(c.id) ? 'Already sent to double down' : 'Send to double down'}
                                      disabled={alreadyDoubled.has(c.id)}
                                      onClick={() => bulkDoubleDown([c.id])}
                                    >
                                      <TrendingUp aria-hidden />
                                    </Button>
                                    <Button size="icon-sm" variant="ghost" aria-label="Add to kill list" title="Add to kill list" onClick={() => bulkKill([c.id])}>
                                      <Skull aria-hidden />
                                    </Button>
                                    <Button size="icon-sm" variant="ghost" aria-label="Exclude from view" title="Hide for the rest of today" onClick={() => bulkExclude([c.id])}>
                                      <EyeOff aria-hidden />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                      </Fragment>
                    )
                  })}
              </tbody>
              <tfoot className="border-t bg-muted/60 text-sm font-semibold">
                <tr>
                  <td />
                  <td className="px-3 py-2.5">Results from {rows.length} ads in {groups.length} ad sets</td>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                      {col.render(total)}
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <CreativeDetail creativeId={detailId} range={range} onClose={() => setDetailId(null)} />

      <PeopleDialog
        open={people !== null}
        onOpenChange={(v) => !v && setPeople(null)}
        title={people?.title ?? ''}
        subtitle={people?.subtitle ?? ''}
        note={people?.note}
        people={people?.list ?? []}
        total={people?.total}
      />
    </div>
  )
}
