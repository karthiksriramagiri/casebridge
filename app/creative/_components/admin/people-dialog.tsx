'use client'

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/creative/_ui/dialog'
import { formatDate } from '@/app/creative/_lib/metrics'
import type { SignedLead } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

/* The names behind a number.

   Every count in the table is a list of real people, and the question asked
   of this page is almost always "which ones?" — so the Leads and Signed
   figures open into the names rather than making someone go to GHL.

   Signed cases are the Financial Center's own rows, so the names here are the
   names on the invoice, counted one per case: a driver and a passenger signed
   under one contact are two lines, because they are two cases. */

const SIGNED_STAGES = new Set(['Signed', 'Signed/Sent', 'Pending Send'])

export function PeopleDialog({
  open, onOpenChange, title, subtitle, note, people, total,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  subtitle: string
  note?: string
  people: SignedLead[]
  /** Everyone attributed to this ad in any range — tells an empty list apart
   *  from an ad nothing has ever been attributed to. */
  total?: number
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The shell sets `sm:max-w-sm`, and a plain `max-w-*` loses to it at
          every width above mobile — which is what pinned this card to 384px
          and clipped every date against the edge. Overriding at the same
          breakpoint is the fix. p-0 so the header and the scrolling list can
          own their own padding and the list can run edge to edge. */}
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-b px-5 py-4">
          {/* pr-10 keeps a long ad name clear of the close button. */}
          <DialogTitle className="truncate pr-10 text-base">{title}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <span>{subtitle}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {people.length} {people.length === 1 ? 'person' : 'people'}
            </span>
          </DialogDescription>
        </DialogHeader>

        {note && (
          /* A caveat, not a warning — it was a bordered amber block, which
             read as something being wrong when it is only a footnote. */
          <p className="border-b bg-muted/40 px-5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            {note}
          </p>
        )}

        {people.length === 0 ? (
          /* "Nobody" on its own reads as a bug. These are two different facts
             and only one of them is about the date range. */
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {total && total > 0
              ? `Nobody in this range. ${total} ${total === 1 ? 'person is' : 'people are'} attributed to this ad overall — widen the range above.`
              : 'Nothing in the pipeline carries this ad’s id. GHL records the ad on a lead only when the click carried it through, so an ad can deliver leads that cannot be traced back to it.'}
          </p>
        ) : (
          <ul className="max-h-[55vh] divide-y overflow-y-auto">
            {people.map((p, i) => (
              <li
                key={`${p.name}-${p.date}-${i}`}
                /* Three columns, and only the first one may shrink. The name
                   truncates; the stage and the date keep their width, which
                   is what stops a long name pushing the date off the edge. */
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[p.closer && `Closed by ${p.closer}`, p.invoiceCode, p.phone]
                      .filter(Boolean)
                      .join(' · ') || ' '}
                  </div>
                </div>

                <span
                  className={cn(
                    'whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
                    p.isReplacement
                      ? 'bg-warning/20 text-foreground'
                      : SIGNED_STAGES.has(p.stage)
                        ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {p.stage}
                </span>

                <span className="w-14 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                  {formatDate(p.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
