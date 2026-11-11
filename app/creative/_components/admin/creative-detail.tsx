'use client'

import { Eye, Skull } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/app/creative/_ui/sheet'
import { Button } from '@/app/creative/_ui/button'
import { daysInRange, formatDate, num, pct, signedInRange, sumDays, usd, RANGES } from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'
import type { RangeKey } from '@/app/creative/_lib/types'
import { Pill, Thumb } from './shared'

export function CreativeDetail({
  creativeId,
  range,
  onClose,
}: {
  creativeId: string | null
  range: RangeKey
  onClose: () => void
}) {
  const { getCreative, addToWatch, addToKill } = useStore()
  const c = creativeId ? getCreative(creativeId) : undefined
  const days = c ? daysInRange(c, range).slice().reverse() : []
  const t = sumDays(days)
  /* The range, like the Signed tile above it — a lifetime roster under a
     range-scoped count read as the count being wrong. */
  const signed = c ? signedInRange(c, range) : []

  return (
    <Sheet open={!!c} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-xl">
        {c && (
          <>
            <SheetHeader className="border-b p-5">
              <div className="flex items-start gap-3">
                <Thumb c={c} />
                <div className="flex min-w-0 flex-col gap-1">
                  <SheetTitle className="text-pretty leading-snug">{c.name}</SheetTitle>
                  <SheetDescription>
                    Ad ID {c.adId} · {c.campaign}
                  </SheetDescription>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Pill tone="blue">{c.angle}</Pill>
                    <Pill>{c.format}</Pill>
                    <Pill>Launched {formatDate(c.launchDate)}</Pill>
                    <Pill>{RANGES.find((r) => r.key === range)?.label}</Pill>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast(addToWatch([c.id]) ? 'Added to watch list' : 'Already on today’s watch list')}
                >
                  <Eye aria-hidden /> Watch
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => toast(addToKill([c.id]) ? 'Added to kill list' : 'Already on the kill list')}
                >
                  <Skull aria-hidden /> Kill
                </Button>
              </div>
            </SheetHeader>

            <div className="grid grid-cols-3 gap-px border-b bg-border">
              {[
                ['Amount spent', usd(t.spend)],
                ['Leads', num(t.leads)],
                ['CPL', usd(t.cpl)],
                ['Signed', num(t.rangeAcquisitions)],
                ['CPA', usd(t.rangeCpa)],
                ['Hook rate', pct(t.hookRate)],
                ['Link CTR', pct(t.ctr)],
                ['CPM', usd(t.cpm)],
                ['Impressions', num(t.impressions)],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 bg-card px-4 py-3">
                  <span className="text-xs text-muted-foreground">{k}</span>
                  <span className="font-semibold tabular-nums">{v}</span>
                </div>
              ))}
            </div>

            {signed.length > 0 && (
              <div className="border-b p-5">
                <h3 className="pb-2 text-sm font-semibold">
                  Signed from this creative
                  <span className="pl-1.5 font-normal text-muted-foreground">
                    · {signed.length} {signed.length === 1 ? 'case' : 'cases'}
                  </span>
                </h3>
                {/* The point of the join: who actually signed, not only how
                    many. Newest first, which is the one being asked about. */}
                <ul className="divide-y rounded-md border">
                  {signed.map((l, i) => (
                    <li key={`${l.name}-${l.date}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{l.name}</span>
                      <span className="shrink-0 pl-3 text-xs text-muted-foreground">{formatDate(l.date)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-5">
              <h3 className="pb-2 text-sm font-semibold">Daily breakdown</h3>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-right text-xs tabular-nums">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      {['Date', 'Spend', 'Leads', 'CPL', 'Signed', 'Hook', 'CTR'].map((h) => (
                        <th key={h} scope="col" className="px-2.5 py-2 font-medium first:text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => {
                      const dt = sumDays([d])
                      return (
                        <tr key={d.date} className="border-t">
                          <td className="px-2.5 py-1.5 text-left">{formatDate(d.date)}</td>
                          <td className="px-2.5 py-1.5">{usd(d.spend, 0)}</td>
                          <td className="px-2.5 py-1.5">{d.leads}</td>
                          <td className="px-2.5 py-1.5">{usd(dt.cpl, 0)}</td>
                          <td className="px-2.5 py-1.5">{d.acquisitions || ''}</td>
                          <td className="px-2.5 py-1.5">{pct(dt.hookRate)}</td>
                          <td className="px-2.5 py-1.5">{pct(dt.ctr)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
