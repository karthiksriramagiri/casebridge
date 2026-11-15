'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TeamsShell as Shell } from '@/app/teams/_components/teams-shell'

/* The rep-side shell.

   Kept at this path and with this exact prop signature because all eleven
   rep pages already render it — rebuilding here is what re-shells the whole
   rep side without touching them. The chrome it draws is now the center's
   sidebar (see _components/teams-shell); the navy header bar and the row of
   tabs it used to draw are gone.

   `phase` is still fetched here rather than passed in. It gates three nav
   items and the pages do not know it; defaulting to 1 — the most restricted
   — while the fetch is in flight keeps items from appearing and then
   vanishing a moment later. */

interface Props {
  timeclockEnabled: boolean
  teamType: string
  children: ReactNode
}

export default function TeamsShell({ timeclockEnabled, teamType, children }: Props) {
  const [phase, setPhase] = useState<number>(1)
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('rep_phase, name')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.rep_phase != null) setPhase(data.rep_phase)
          if (data?.name) setName(data.name)
        })
    })
  }, [])

  return (
    <Shell
      role="rep"
      teamType={teamType}
      phase={phase}
      timeclockEnabled={timeclockEnabled}
      name={name}
    >
      {children}
    </Shell>
  )
}
