'use client'

import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Send, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { EmptyState, matchesQuery, PageHeader, Pill, SearchBox, Thumb } from '@/app/creative/_components/admin/shared'
import { adsetDupeTags, adsetKey, adsetTotalsFor, isDelivering, parseCreativeName, pct, totalsFor, usd, WINNER_ADSET_CPL } from '@/app/creative/_lib/metrics'
import { buildDoubleDowns, doubleDownAdset, doubleDownTarget, knownCreativeNames, nextDoubleDownName } from '@/app/creative/_lib/double-down'
import { useExpanded } from '@/app/creative/_lib/use-expanded'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName } from '@/app/_metrics/firms'
import { assigneeOf, type Assignment, type AssignmentFirm, type AssignmentStatus, type CreativeFormat, type Creative, type Totals } from '@/app/creative/_lib/types'

/* ═══════════════════════════════════════════════════════════════════════════
   Winner Analysis — which ad sets are working, and what to make more of.

   An ad set is the unit. Meta spends across the cuts inside one as it likes,
   so a single creative showing a cheap CPL off a sliver of the budget is not
   a winner; the ad set is what is working, and doubling down means making
   more for that ad set. The cuts sit behind a chevron, the way they do in
   Creative Analysis — there when you want to see which one is carrying the
   set, out of the way while you work down the list.

   Lifetime only, with no range selector. A winner is an ad set that has
   earned its CPL over its whole run; the same list read over "last 3 days"
   is a different question wearing the same name, and the answer flipped
   depending on which one happened to be selected.
   ═══════════════════════════════════════════════════════════════════════════ */

const firmRank = (code: string) => {
  const i = FIRMS.findIndex((f) => f.code === code)
  return i === -1 ? FIRMS.length : i
}

export default function WinnersPage() {
  const { creatives, killedIds, assignments, addAssignment, removeAssignment, today, launchDay } = useStore()
  const isAdmin = useRole() === 'admin'
  const { open, toggle } = useExpanded('cc:winners-open')

  /* Running, and not already killed. A paused ad cannot be doubled down on
     — there is nothing live to double. */
  const live = useMemo(
    () => creatives.filter((c) => !killedIds.has(c.id) && isDelivering(c)),
    [creatives, killedIds],
  )
  /* Two ad sets can share a name; tagged beside it rather than renamed. */
  const dupeTags = useMemo(() => adsetDupeTags(creatives), [creatives])
  const adsets = useMemo(() => adsetTotalsFor(live, 'max'), [live])

  /* Finding one winner.

     The list runs to every qualifying ad set across four firms, and the
     question asked of it is usually specific — "is B000142 still a winner",
     "what is working in the Spanish account". An ad set matches if it does
     itself or if any cut inside it does, so searching a creative name finds
     the row that holds it rather than nothing. */
  const [query, setQuery] = useState('')
  const hit = useCallback(
    (g: { adset: string; firm: string; ads: Creative[] }) =>
      matchesQuery(query, [
        g.adset, g.firm, firmName(g.firm),
        ...g.ads.flatMap((c) => [c.convention, c.name, c.adId, c.angle, c.accountLabel]),
      ]),
    [query],
  )

  /* Firm → qualifying ad sets → the cuts inside them, cheapest set first. */
  const allByFirm = useMemo(() => {
    const groups = new Map<string, { key: string; adset: string; firm: string; ads: Creative[]; t: Totals }>()
    for (const c of live) {
      const k = adsetKey(c)
      const t = adsets.get(k)
      if (!t || t.cpl === null || t.cpl >= WINNER_ADSET_CPL) continue
      const g = groups.get(k) ?? { key: k, adset: c.adset, firm: c.firm, ads: [] as Creative[], t }
      g.ads.push(c)
      groups.set(k, g)
    }
    const byCode = new Map<string, typeof groups extends Map<string, infer V> ? V[] : never>()
    for (const g of groups.values()) {
      g.ads.sort((a, b) => (totalsFor(a, 'max').cpl ?? Infinity) - (totalsFor(b, 'max').cpl ?? Infinity))
      byCode.set(g.firm, [...(byCode.get(g.firm) ?? []), g])
    }
    return [...byCode.entries()]
      .sort(([a], [b]) => firmRank(a) - firmRank(b) || a.localeCompare(b))
      .map(([firm, sets]) => [firm, sets.sort((a, b) => a.t.cpl! - b.t.cpl!)] as const)
  }, [live, adsets])

  /* What is on screen, and what qualifies. The empty state needs both: a
     search that finds nothing is a different thing from no winners. */
  const byFirm = useMemo(
    () => allByFirm
      .map(([firm, sets]) => [firm, sets.filter(hit)] as const)
      .filter(([, sets]) => sets.length > 0),
    [allByFirm, hit],
  )
  const qualifying = allByFirm.reduce((n, [, sets]) => n + sets.length, 0)
  const total = byFirm.reduce((n, [, sets]) => n + sets.length, 0)

  /* The double downs each cut already has — the assignments themselves, not
     a count, because undoing one means removing the card it created. Newest
     last, so undo takes back the most recent brief rather than the first. */
  const doubled = useMemo(() => {
    const m = new Map<string, Assignment[]>()
    for (const a of assignments) {
      if (a.type !== 'Double Down' || !a.sourceCreativeId) continue
      m.set(a.sourceCreativeId, [...(m.get(a.sourceCreativeId) ?? []), a])
    }
    for (const list of m.values()) list.sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : x.order - y.order))
    return m
  }, [assignments])
  const doubledCount = useMemo(
    () => new Map([...doubled].map(([id, list]) => [id, list.length])),
    [doubled],
  )

  /* Undo.

     Doubling down is one click and it is easy to click it on the wrong row,
     or on a whole ad set when you meant one cut. Before this the only way
     back was to find the card on the assignment board and delete it there,
     which is a different page and a different mental model — by then the
     brief looks like work somebody asked for rather than a misfire.

     It removes the briefs this winner raised, newest first, and the row goes
     back to offering Double Down because the button reads the same map. A
     brief that has already been worked on is left alone: pulling a card out
     from under someone mid-build is not an undo, it is a deletion, and it is
     the board's job to say so. */
  /** Would this cut's double down be Jason's own work? Images are. */
  const mine = (c: Creative) =>
    assigneeOf({
      type: 'Double Down',
      format: parseCreativeName(c.convention || c.name).format as CreativeFormat,
    }) === 'admin'

  const UNTOUCHED: AssignmentStatus[] = ['Assigned']
  const undo = (list: Creative[], label: string) => {
    let removed = 0
    let busy = 0
    for (const c of list) {
      const briefs = [...(doubled.get(c.id) ?? [])].reverse()
      const fresh = briefs.find((a) => UNTOUCHED.includes(a.status))
      if (!fresh) { if (briefs.length) busy++; continue }
      removeAssignment(fresh.id)
      removed++
    }
    if (removed === 0) {
      toast.error(
        busy > 0 ? 'Already being worked on' : 'Nothing to undo',
        { description: busy > 0 ? 'The brief has moved past Assigned. Delete it on the assignment board if it really should go.' : undefined },
      )
      return
    }
    toast(
      removed === 1 ? `Double down undone — ${label} is back on the list` : `${removed} double downs undone — ${label}`,
    )
  }

  /* The names already in play, and the brief that comes out of them, both
     live in _lib/double-down so Creative Analysis raises exactly the same
     thing from the same inputs. */
  const knownNames = useMemo(() => knownCreativeNames(creatives, assignments), [creatives, assignments])
  const adsetFor = (c: Creative) => doubleDownAdset(c, launchDay)
  const nextNameFor = (c: Creative, taken: string[] = []) => nextDoubleDownName(c, launchDay, knownNames, taken)

  const push = (list: Creative[], label: string) => {
    for (const { assignment } of buildDoubleDowns(list, launchDay, knownNames)) {
      addAssignment(assignment)
    }
    const targets = [...new Set(list.map(doubleDownTarget))]
    const to = targets.length === 1 ? targets[0] : 'you and Faisal'
    toast(
      list.length === 1
        ? `${nextNameFor(list[0])} sent to ${to}`
        : `${label} — ${list.length} sent to ${to}`,
    )
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Winner Analysis"
        description={
          isAdmin
            ? `Ad sets under $${WINNER_ADSET_CPL} lifetime CPL, by firm. Open one to see its cuts.`
            : `View only. Ad sets under $${WINNER_ADSET_CPL} lifetime CPL that Jason can assign to you.`
        }
      />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search winning ad sets"
            placeholder="Search ad set, creative, firm, angle"
          />
          {query.trim() && (
            <span className="text-xs text-muted-foreground">
              {total} of {qualifying} winning ad set{qualifying === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {qualifying === 0 ? (
          <div className="rounded-lg border bg-card p-4">
            <EmptyState title="No winning ad sets yet">
              {`An ad set lands here once its lifetime CPL is under $${WINNER_ADSET_CPL}.`}
            </EmptyState>
          </div>
        ) : total === 0 ? (
          <div className="rounded-lg border bg-card p-4">
            <EmptyState title={`No winner matches “${query.trim()}”`}>
              {`${qualifying} ad set${qualifying === 1 ? ' is' : 's are'} under $${WINNER_ADSET_CPL} lifetime CPL — none of them by that name, firm or angle.`}
            </EmptyState>
          </div>
        ) : (
          byFirm.map(([firm, sets]) => (
            <section key={firm} className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <h2 className="text-sm font-semibold">{firmName(firm)}</h2>
                <span className="text-sm text-muted-foreground">
                  {sets.length} ad set{sets.length === 1 ? '' : 's'} · {sets.reduce((n, g) => n + g.ads.length, 0)} ads
                </span>
              </div>

              {sets.map((g) => {
                const isOpen = open.has(g.key)
                const done = g.ads.every((c) => (doubledCount.get(c.id) ?? 0) > 0)
                return (
                  <div key={g.key} className="border-b last:border-b-0">
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggle(g.key)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${g.adset}`}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {isOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => toggle(g.key)}
                          className="truncate text-left font-mono text-sm font-medium hover:underline"
                        >
                          {g.adset}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {g.ads.length} ad{g.ads.length === 1 ? '' : 's'} · {g.t.leads} leads · {g.t.rangeAcquisitions} signed ·{' '}
                          {usd(g.t.spend, 0)} spent
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {dupeTags.get(g.key) && <Pill tone="amber">{dupeTags.get(g.key)} with this name</Pill>}
                        <Pill tone="green">CPL {usd(g.t.cpl, 0)}</Pill>
                        <Pill>CPA {usd(g.t.rangeCpa, 0)}</Pill>
                        <Pill>Hook {pct(g.t.hookRate)}</Pill>
                        <Pill>CTR {pct(g.t.ctr)}</Pill>
                      </div>
                      {isAdmin ? (
                        <div className="flex items-center gap-1">
                        {/* Once assigned the button becomes Reassign rather
                            than going dead: a cut that earned one double down
                            often earns another, and the version carries on
                            from where the last one left off. */}
                        <Button
                          size="sm"
                          variant={done ? 'outline' : 'default'}
                          onClick={() => push(g.ads, g.adset)}
                          title={done ? 'Raise another Double Down, next version up' : undefined}
                        >
                          {done ? <RotateCcw aria-hidden /> : <Send aria-hidden />} {done ? 'Reassign' : 'Double Down'}
                        </Button>
                        {/* Takes the brief back off the board and puts the ad
                            set back to offering Double Down. Only shown once
                            there is something to take back. */}
                        {g.ads.some((c) => (doubledCount.get(c.id) ?? 0) > 0) && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Undo the double down on ${g.adset}`}
                            title="Undo — removes the brief and puts this back on the list"
                            onClick={() => undo(g.ads, g.adset)}
                          >
                            <Undo2 aria-hidden />
                          </Button>
                        )}
                        </div>
                      ) : (
                        <Pill tone={done ? 'green' : 'muted'}>{done ? 'Assigned to you' : 'Double Down'}</Pill>
                      )}
                    </div>

                    {isOpen && (
                      <ul className="divide-y border-t bg-muted/20">
                        {g.ads.map((c) => {
                          const t = totalsFor(c, 'max')
                          const times = doubledCount.get(c.id) ?? 0
                          const next = nextNameFor(c)
                          return (
                            <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 pl-12 pr-4">
                              <Thumb c={c} />
                              <div className="flex min-w-0 flex-1 flex-col">
                                <code className="truncate font-mono text-xs font-medium">{c.convention || c.name}</code>
                                <p className="truncate text-xs text-muted-foreground">
                                  {t.leads} leads · {t.rangeAcquisitions} signed · {c.angle}
                                  {times > 0 && ` · ${times} double down${times === 1 ? '' : 's'} assigned`}
                                </p>
                              </div>
                              <div className="flex gap-1">
                                {/* The cut's own CPL, labelled as such. The set's
                                    is what qualified the row above it. */}
                                <Pill tone={t.cpl !== null && t.cpl < WINNER_ADSET_CPL ? 'green' : undefined}>
                                  This ad {usd(t.cpl, 0)}
                                </Pill>
                                <Pill>Hook {pct(t.hookRate)}</Pill>
                                <Pill>CTR {pct(t.ctr)}</Pill>
                                {/* Said before the click, not after it: an
                                    image double down is Jason's own build. */}
                                {mine(c) && <Pill tone="blue">Image → Jason</Pill>}
                              </div>
                              {isAdmin && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => push([c], c.convention || c.name)}
                                    title={mine(c) ? `Brief yourself for ${next}` : `Brief Faisal for ${next}`}
                                  >
                                    {times > 0 ? <RotateCcw aria-hidden /> : <Send aria-hidden />}{' '}
                                    {times > 0 ? `Reassign → ${next.split('|')[1]?.trim() ?? 'next'}` : 'Double Down'}
                                  </Button>
                                  {times > 0 && (
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label={`Undo the double down on ${c.convention || c.name}`}
                                      title="Undo — removes the brief and puts this cut back on the list"
                                      onClick={() => undo([c], c.convention || c.name)}
                                    >
                                      <Undo2 aria-hidden />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })}
            </section>
          ))
        )}
      </div>
    </div>
  )
}
