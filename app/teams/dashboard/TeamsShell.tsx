'use client'

import type { ReactNode } from 'react'
import UserNav from './UserNav'
import LogoutButton from './LogoutButton'

interface Props {
  timeclockEnabled: boolean
  teamType: string
  children: ReactNode
}

export default function TeamsShell({ timeclockEnabled, teamType, children }: Props) {
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
          <UserNav timeclockEnabled={timeclockEnabled} teamType={teamType} />
        </div>
      </div>

      {children}
    </>
  )
}
