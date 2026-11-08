'use client'

import { useCallback, useEffect, useState } from 'react'

/* Which rows are open, kept across a reload.

   Expanding an ad set to look at its cuts and then losing that on every
   refresh makes the page feel like it forgets — you come back from Ads
   Manager and have to open the same three sets again.

   This is view state, not a decision: it is per person and per browser on
   purpose, and it is the one thing in the center that belongs in
   localStorage rather than in a table. Keyed by the day being viewed, so
   stepping back to an earlier list does not inherit today's open rows.
*/
export function useExpanded(key: string) {
  const [open, setOpen] = useState<Set<string>>(new Set())

  /* Read after mount, never during render: localStorage does not exist on
     the server, and seeding from it directly makes the first client render
     disagree with the server's and fail hydration. */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      setOpen(new Set(raw ? (JSON.parse(raw) as string[]) : []))
    } catch {
      setOpen(new Set())
    }
  }, [key])

  const toggle = useCallback(
    (id: string) =>
      setOpen((prev) => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        try {
          window.localStorage.setItem(key, JSON.stringify([...next]))
        } catch {
          /* Blocked or full: the row still opens, it just will not be open
             again after a reload. Better than throwing. */
        }
        return next
      }),
    [key],
  )

  return { open, toggle }
}
