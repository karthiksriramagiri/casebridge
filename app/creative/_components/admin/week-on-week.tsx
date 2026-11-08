'use client'

import { usd, weekOnWeekOf } from '@/app/creative/_lib/metrics'
import type { Creative } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

/* Cost per lead, last week against this one.

   Read left to right in time order — $153.23/$190.34 (+23.4%) is last week,
   then this week, then the move. Putting this week first and the comparison
   after it made the reader work out which number was which every time.

   The colour is about money, not direction: a rising cost per lead is bad
   however the arrow points, so up is red and down is green. That is the
   opposite of the usual reading of a green arrow, which is exactly why it
   is worth being deliberate about.

   Both weeks are the ad set's totals when a list of ads is passed — summed
   before the CPL is taken, since averaging the members' CPLs would weight a
   $5 ad like a $500 one. */
export function WeekOnWeek({ ads, className }: { ads: Creative[]; className?: string }) {
  const { cur, prev, change } = weekOnWeekOf(ads)

  if (cur === null && prev === null) return <span className="text-muted-foreground">—</span>

  return (
    /* The two figures hold together on one line; the note after them is
       allowed to fall to a second. Held all on one line this was the widest
       column in the table by far and the one that pushed the row off the
       page — "$466.54/$230.82 (first week)" needs 190px, where every other
       figure needs 60. */
    <span className={cn('tabular-nums', className)}>
      <span className="whitespace-nowrap">
        <span className="text-muted-foreground">{prev === null ? '—' : usd(prev)}</span>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{cur === null ? '—' : usd(cur)}</span>
      </span>
      {change === null ? (
        /* One of the two weeks produced no leads, so there is no ratio to
           report. "+100%" for "went from nothing to something" is a number
           someone would act on. */
        <span className="ml-1 whitespace-nowrap text-xs text-muted-foreground">
          ({prev === null ? '1st wk' : 'no leads'})
        </span>
      ) : (
        <span
          className={cn(
            'ml-1 text-xs font-medium',
            change > 0.001 ? 'text-destructive' : change < -0.001 ? 'text-success' : 'text-muted-foreground',
          )}
        >
          ({change > 0 ? '+' : ''}{(change * 100).toFixed(1)}%)
        </span>
      )}
    </span>
  )
}
