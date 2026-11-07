'use client'

import { useEffect, useMemo, useState } from 'react'
import { pacificDay } from './data'
import { useStore } from './store'

/* ═══════════════════════════════════════════════════════════════════════════
   Creatives dismissed from the working view, kept for the day.

   Watch List Mode is a shift's work, not a query: someone goes down the list
   deciding what still needs looking at, and clearing a creative off it is
   progress.

   These used to live in localStorage. They survived a reload on the machine
   that made them and nowhere else — hide six ads on one laptop, open the
   same page on another screen, and all six are back. A dismissal is a
   decision about the day's work, so it belongs with the rest of the board.

   Still scoped to a Pacific day, and still cleared by the date rolling over
   rather than by anything having to run: rows for a day that is over are
   simply never matched again.
   ═══════════════════════════════════════════════════════════════════════════ */

export { pacificDay } from './data'

export function useDailyExclusions() {
  const { exclusions, exclude, restoreExclusions } = useStore()
  const [day, setDay] = useState(pacificDay)

  /* A tab left open overnight must not keep writing into yesterday. Checked
     on a timer rather than at midnight exactly, because a sleeping laptop
     misses a scheduled wake-up and would hold the stale day indefinitely. */
  useEffect(() => {
    const t = setInterval(() => {
      const now = pacificDay()
      setDay((d) => (d === now ? d : now))
    }, 60_000)
    return () => clearInterval(t)
  }, [])

  const excluded = useMemo(
    () => new Set(exclusions.filter((x) => x.day === day).map((x) => x.creativeId)),
    [exclusions, day],
  )

  return { excluded, exclude, restoreAll: restoreExclusions, day }
}
