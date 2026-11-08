'use client'

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import { TODAY, addDays } from '@/app/creative/_lib/data'
import { formatDate } from '@/app/creative/_lib/metrics'

/* Step back through the saved days.

   The watch and kill lists are a record of what was decided on a given day,
   not just a working tray for today — "what did we kill on the 3rd" is a
   question people ask, and before this the only answer was that the list had
   moved on. Every row already carries its day, so this is only a way of
   asking for one. */
export function DayNav({
  date, onChange, label, right,
}: {
  date: string
  onChange: (d: string) => void
  label: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
        <ChevronLeft aria-hidden />
      </Button>
      <input
        type="date"
        value={date}
        aria-label={label}
        max={TODAY}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="rounded-md border bg-background px-2.5 py-1.5 text-sm"
      />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Next day"
        disabled={date >= TODAY}
        onClick={() => onChange(addDays(date, 1))}
      >
        <ChevronRight aria-hidden />
      </Button>
      {date !== TODAY && (
        <>
          <span className="text-sm text-muted-foreground">Viewing {formatDate(date)}</span>
          <Button variant="ghost" size="sm" onClick={() => onChange(TODAY)}>Back to today</Button>
        </>
      )}
      {right}
    </div>
  )
}
