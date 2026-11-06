'use client'

import { useCallback, useEffect, useState } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   Creatives dismissed from the working view, kept for the day.

   Watch List Mode is a shift's work, not a query: someone goes down the list
   deciding what still needs looking at, and clearing a creative off it is
   progress. Holding that in component state threw it away on the next reload
   or tab change, so the same ads came back and had to be judged twice.

   It is scoped to a Pacific day and keyed by it, so the slate clears by
   itself at midnight PST without anything having to run — a key for a day
   that is over is simply never read again, and is swept on the next load.

   Deliberately local to the browser. The watch and kill lists themselves are
   still in-memory seed state in this center; putting one of the three in a
   table would imply the other two are durable when they are not. The moment
   those move to Supabase this should move with them, and then a dismissal
   would follow the person between machines rather than staying on one.
   ═══════════════════════════════════════════════════════════════════════════ */

const PREFIX = 'cc:excluded:'

/** The current Pacific day, which is the one the reset is pinned to. */
export function pacificDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

function read(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set()
  } catch {
    /* A corrupt or unreadable entry must not take the page down with it —
       an empty set is the same as never having dismissed anything. */
    return new Set()
  }
}

/** Drop every day but today's, so this cannot grow without bound. */
function sweep(keep: string) {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(PREFIX) && k !== keep) window.localStorage.removeItem(k)
    }
  } catch {
    /* Storage disabled or full — nothing here is worth failing over. */
  }
}

export function useDailyExclusions() {
  const [day, setDay] = useState(pacificDay)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  /* Read after mount, never during render: localStorage does not exist on the
     server, and seeding state from it directly makes the first client render
     disagree with the server's and fail hydration. */
  useEffect(() => {
    const key = PREFIX + day
    setExcluded(read(key))
    sweep(key)
  }, [day])

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

  const persist = useCallback(
    (next: Set<string>) => {
      setExcluded(next)
      try {
        window.localStorage.setItem(PREFIX + day, JSON.stringify([...next]))
      } catch {
        /* Out of quota or blocked: the dismissal still holds for this session,
           it just will not survive a reload. Better than throwing. */
      }
    },
    [day],
  )

  const exclude = useCallback(
    (ids: string[]) => persist(new Set([...excluded, ...ids])),
    [excluded, persist],
  )

  const restoreAll = useCallback(() => persist(new Set()), [persist])

  return { excluded, exclude, restoreAll, day }
}
