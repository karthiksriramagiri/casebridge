'use client'

import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import UserNav from './UserNav'
import LogoutButton from './LogoutButton'

interface Props {
  timeclockEnabled: boolean
  teamType: string
  children: ReactNode
}

export default function TeamsShell({ timeclockEnabled, teamType, children }: Props) {
  // Default to phase 1 (most restricted) while loading to avoid tab flicker
  const [phase, setPhase] = useState<number>(1)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('rep_phase')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.rep_phase != null) setPhase(data.rep_phase)
        })
    })
  }, [])

  return (
    <>
      {/* Header — always full width */}
      <header className="bg-[#0f1e3c] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal ml-2">· Training Portal</span>
        </div>
        <LogoutButton />
      </header>

      {/* Nav — always in a consistent max-w-4xl wrapper */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-4xl mx-auto">
          <UserNav timeclockEnabled={timeclockEnabled} teamType={teamType} phase={phase} />
        </div>
      </div>

      {children}
    </>
  )
}
