'use client'

import { History, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import { TODAY } from '@/app/creative/_lib/data'
import { formatDate } from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'

/* What day the center is reading, on every page.

   The day used to be page-local: the kill list had one, the watch list had
   another, and Creative Analysis had none at all, so there was no way to
   tell which day's numbers were on screen. It is one shared value now, and
   this is the line that says so.

   Visible only when it matters. On today it appears just long enough to
   carry the refresh button; on a past day it is a warning, because what is
   on screen is a record and nothing on it can be changed. */
export function DayBar() {
  const { day, setDay, dayLocked, dayMissing, lockAvailable, snapshot, loading, refreshDay } = useStore()

  if (!dayLocked && lockAvailable && !snapshot) return null

  if (dayLocked) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-warning/40 bg-warning/10 px-6 py-2.5 text-sm">
        {snapshot ? <History className="size-4 shrink-0 text-warning-foreground" aria-hidden />
                  : <TriangleAlert className="size-4 shrink-0 text-warning-foreground" aria-hidden />}
        <span className="font-medium">{formatDate(day)}</span>
        <span className="text-muted-foreground">
          {/* Three different things, and saying the wrong one is worse than
              saying nothing: the day is frozen; the day predates the lock
              and cannot be rebuilt, because Meta only ever answers with the
              series as it stands now; or the lock is not switched on at all
              and the figures below are today's under someone else's date. */}
          {!lockAvailable
            ? 'The day lock is not switched on yet — the boards below are this day’s, but the ad figures are today’s. Run supabase/migration_creative_snapshot.sql.'
            : dayMissing
              ? 'No numbers were kept for this day — the boards below are real, the ad figures are not available.'
              /* Mid-fetch the day is known before its numbers are. Reaching
                 into a snapshot that has not landed yet crashed the bar, and
                 with it every page under it. */
              : !snapshot
                ? 'Locked — nothing here can be changed.'
                : `Locked. These are the numbers as they stood at ${takenAt(snapshot.takenAt)} — nothing here can be changed.`}
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setDay(TODAY)}>
          Back to today
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
      <span>
        {snapshot
          ? `Today’s numbers, taken ${takenAt(snapshot.takenAt)} · ${snapshot.ads} ads`
          : 'Day lock off — run supabase/migration_creative_snapshot.sql to keep a copy of each day.'}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 gap-1.5 text-xs"
        onClick={refreshDay}
        disabled={loading}
        title="Ask Meta again and replace today’s figures"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
        Refresh
      </Button>
    </div>
  )
}

const takenAt = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit',
  }) + ' PT'
