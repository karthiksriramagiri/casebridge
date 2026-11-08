'use client'

import type { ReactNode } from 'react'
import { num, pct, totalsFor, sumTotals, usd, WATCH_CPL, WINNER_CPL } from '@/app/creative/_lib/metrics'
import type { Creative, RangeKey, Totals } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'
import { WeekOnWeek } from './week-on-week'

/* ═══════════════════════════════════════════════════════════════════════════
   The numbers column, shared by every list that shows ads.

   Creative Analysis reads as a table — one aligned column per measure, the
   same measure in the same place on every row, so a figure can be compared
   straight down the page. The watch and kill lists grew up separately and
   said the same things as a wrapping row of pills: "$200/day · Added Nov 7 ·
   3d CPL $156 (3 leads on $467)". Every row put its numbers in a different
   place, nothing lined up, and the lists were the two places where someone
   is deciding to spend or stop money.

   So the columns live here and all three render the same ones. A page still
   owns its own rows — the kill list has a tick and a Fatigue button, the
   watch list has WATCH/KILL — but what a row *says* about an ad is one
   definition in one file.
   ═══════════════════════════════════════════════════════════════════════════ */

export type MetricColumn = {
  key: string
  label: string
  /** The full name, for the header's tooltip when the label is shortened. */
  title?: string
  render: (t: Totals) => string
  /** Reads the ads rather than the range totals — the week-on-week window is
      fixed at last 7 days against the 7 before, so it ignores the range. */
  fromAds?: (ads: Creative[]) => ReactNode
}

/* `hasOutcomes` false means the GHL sweep has not landed: Signed and CPA are
   unknown, and printing 0 would claim every ad signed nobody.

   Full labels, the same words Creative Analysis uses. Shortening them was an
   attempt to make ten measures fit a laptop; they do not fit, and the table
   scrolls instead. */
export const metricColumns = (hasOutcomes: boolean): MetricColumn[] => {
  return [
    { key: 'spend', label: 'Amount spent', render: (t) => usd(t.spend) },
    { key: 'leads', label: 'Leads', render: (t) => num(t.leads) },
    { key: 'cpl', label: 'Cost per lead', render: (t) => usd(t.cpl) },
    /* Signed and CPA are read over the ad's whole life, not the selected
       range, and they say so.

       A case signs days to weeks after the click that produced it, so a
       range of Today or T&Y puts the spend in one window and the signing
       in another: the column read 0 for ads that have signed sixteen
       cases, and CPA read "—" beside a healthy ad. Of the 239 signed cases
       attributed to the live ads, 93 were signed before the 30-day Meta
       window even opens — invisible to any range the page offers.

       Lifetime on both halves keeps the ratio honest: the spend that
       bought those cases is the same spend. The other columns stay on the
       range, which is what they are for. */
    { key: 'acquisitions', label: 'Signed (life)', title: 'Signed cases attributed to this ad over its whole life — a case signs days after the click, so this ignores the range filter', render: (t) => (hasOutcomes ? num(t.acquisitions) : '—') },
    { key: 'cpa', label: 'CPA (life)', title: 'Lifetime spend ÷ lifetime signed cases', render: (t) => (hasOutcomes ? usd(t.cpa) : '—') },
    { key: 'hookRate', label: 'Hook rate', render: (t) => pct(t.hookRate) },
    { key: 'ctr', label: 'CTR (link)', render: (t) => pct(t.ctr) },
    { key: 'cpm', label: 'CPM', render: (t) => usd(t.cpm) },
    { key: 'impressions', label: 'Impressions', render: (t) => num(t.impressions) },
    {
      key: 'wow',
      label: 'CPL last / this week',
      render: () => '',
      fromAds: (ads) => <WeekOnWeek ads={ads} />,
    },
  ]
}

/* No sticky column.

   Ten measures do not fit a laptop, and every attempt to make them —
   shortened headers, pinned widths, a pinned action column — traded one
   problem for another: columns half a hand apart, a name truncated to
   nothing, buttons sitting on top of the last figure. Creative Analysis
   does not do any of that. It sets a sensible minimum, shows the columns at
   their natural width, and lets the table scroll sideways inside its own
   box. These two lists now do the same, so all three read identically.

   Kept as no-op strings so the pages that reference them need no edit. */
export const stickyCell = ''
export const stickyTint = ''

/** The header cells for `metricColumns`, plus the empty one over the actions. */
export function MetricHead({
  columns, lead, actionWidth = 'w-28',
}: {
  columns: MetricColumn[]
  lead: ReactNode
  /** Room for the row's buttons — three icons need w-28, four need w-36. */
  actionWidth?: string
}) {
  return (
    <thead className="bg-muted/60 text-xs text-muted-foreground">
      <tr>
        {lead}
        {columns.map((col) => (
          <th key={col.key} scope="col" title={col.title} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
            {col.label}
          </th>
        ))}
        {/* A real width. Under `table-fixed` an unsized column takes an
            equal share — 61px, less than the three icon buttons in it — so
            the buttons spilled left and sat on top of the last figure. */}
        <th scope="col" className={cn(actionWidth, 'px-3 py-2.5 text-right font-medium')}>
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  )
}

/** One row's worth of number cells. `ads` feeds the week-on-week column,
    which cannot be read off the totals. */
export function MetricCells({
  columns, t, ads, muted,
}: {
  columns: MetricColumn[]
  t: Totals
  ads: Creative[]
  /** A struck-through row: the figures stay legible but stop competing with
      the live ones above them. */
  muted?: boolean
}) {
  return (
    <>
      {columns.map((col) => (
        <td
          key={col.key}
          className={cn(
            'whitespace-nowrap px-3 py-2 text-right tabular-nums',
            /* The week-on-week column carries two figures and a delta —
               "$466.54/$230.82 (−50.5%)" — and holding it on one line was
               the single thing pushing the table past the page. It is the
               only column allowed to wrap. */
            muted && 'text-muted-foreground',
            /* The one column that is read for a decision rather than for
               information, coloured the same way it is on Creative
               Analysis: under the winner line is good, over the watch line
               is not, and spend with no leads at all is the worst of the
               three. */
            !muted && col.key === 'cpl' && t.cpl !== null && t.cpl < WINNER_CPL && 'font-semibold text-success',
            !muted && col.key === 'cpl' && (t.cpl === null ? t.spend > 0 : t.cpl > WATCH_CPL) && 'text-destructive',
            !muted && col.key === 'acquisitions' && t.acquisitions > 0 && 'font-semibold text-success',
          )}
        >
          {col.fromAds ? col.fromAds(ads) : col.render(t)}
        </td>
      ))}
    </>
  )
}

/** The totals for a set of ads over one range — what an ad-set row shows. */
export const totalsOf = (ads: Creative[], range: RangeKey = 'max') =>
  sumTotals(ads.map((c) => totalsFor(c, range)))
