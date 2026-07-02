'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import UserNav from '../dashboard/UserNav'
import LogoutButton from '../dashboard/LogoutButton'

interface Case {
  id: string
  contact_name: string
  case_value: number | null
  status: string
  closed_at: string
  notes: string | null
}

const STATUS_STYLES: Record<string, string> = {
  signed: 'bg-green-100 text-green-700',
  replacement: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-600',
}

export default function CasesPage() {
  const router = useRouter()
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const [teamType, setTeamType] = useState('intake')
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/teams/login'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('role, nda_signed, timeclock_enabled, team_type')
        .eq('id', user.id)
        .single()

      if (!prof || !prof.nda_signed) { router.push('/teams/onboarding'); return }
      if (prof.role === 'admin') { router.push('/teams/admin'); return }
      if (prof.team_type === 'creative') { router.push('/teams/dashboard'); return }
      setTimeclockEnabled(!!prof.timeclock_enabled)
      setTeamType(prof.team_type ?? 'intake')

      const res = await fetch('/api/teams/cases')
      if (res.ok) {
        const d = await res.json()
        setCases(d.cases || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const signed = cases.filter(c => c.status === 'signed').length
  const replacements = cases.filter(c => c.status === 'replacement').length
  const commission = signed * 30

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f1e3c] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal ml-2">· Training Portal</span>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <UserNav timeclockEnabled={timeclockEnabled} teamType={teamType} />

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Cases</h1>
          <p className="text-gray-500 mt-1">All cases you've closed. $30 per signed · $0 per replacement.</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4">
                <p className="text-xs text-gray-400 font-medium">Signed Cases</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{signed}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4">
                <p className="text-xs text-gray-400 font-medium">Replacements</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{replacements}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4">
                <p className="text-xs text-gray-400 font-medium">Commission Earned</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {commission > 0 ? `$${commission.toLocaleString()}` : '—'}
                </p>
              </div>
            </div>

            {/* Cases table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Case History</h2>
              </div>
              {cases.length === 0 ? (
                <div className="px-5 py-12 text-center text-gray-400 text-sm">No cases logged yet.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {cases.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3.5 gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{c.contact_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {format(new Date(c.closed_at + 'T12:00:00'), 'MMM d, yyyy')}
                          {c.notes && ` · ${c.notes}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-gray-500">
                          {c.status === 'replacement' ? '+$0' : c.status === 'signed' ? '+$30' : ''}
                        </span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[c.status] || 'bg-gray-100 text-gray-600'}`}>
                          {c.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
