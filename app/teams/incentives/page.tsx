'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import UserNav from '../dashboard/UserNav'

export default function IncentivesPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const [teamType, setTeamType] = useState('intake')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/teams/login'); return }
      const { data: prof } = await supabase.from('profiles').select('timeclock_enabled, team_type').eq('id', user.id).single()
      if (prof?.team_type === 'creative') { router.push('/teams/dashboard'); return }
      setTimeclockEnabled(!!prof?.timeclock_enabled)
      setTeamType(prof?.team_type ?? 'intake')
      setChecking(false)
    })
  }, [router])

  if (checking) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <UserNav timeclockEnabled={timeclockEnabled} teamType={teamType} />

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Incentives</h1>

        {/* Bi-weekly */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Evaluated bi-weekly at pay-out</p>
            <p className="text-base font-semibold text-gray-800">Starting score: 2 pts</p>
          </div>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-green-500 font-bold mt-0.5">▪</span>
              <span>Average score <span className="font-semibold">&gt; 4.5 pts</span> = <span className="font-semibold text-green-600">$100 Bonus</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-500 font-bold mt-0.5">▪</span>
              <span>Average score <span className="font-semibold">&lt; 2.5 pts</span> = Initial Warning → Second time = <span className="font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded text-xs uppercase tracking-wide">Immediate Termination</span></span>
            </li>
          </ul>
        </div>

        {/* Monthly */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Evaluated monthly</p>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-gray-400 mt-1">•</span>
              <span><span className="font-semibold text-green-600">$200 bonus</span> on paycheck</span>
            </li>
          </ul>
        </div>

        {/* Base & Commission */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4 space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Base increase milestones</p>
            <ul className="space-y-1.5 text-sm text-gray-600 ml-1">
              <li className="flex items-start gap-2"><span className="text-gray-300 mt-1">○</span>Accumulated bonus hits <span className="font-semibold text-gray-800 ml-1">$1,000</span> → base increase by $1</li>
              <li className="flex items-start gap-2"><span className="text-gray-300 mt-1">○</span>Accumulated bonus hits <span className="font-semibold text-gray-800 ml-1">$5,000</span> → base increase by $1</li>
              <li className="flex items-start gap-2"><span className="text-gray-300 mt-1">○</span>Evaluation based after monthly performance from managers</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Commission tiers per close</p>
            <div className="space-y-2">
              {[
                { tier: 'Tier 1', closes: '15 closes', rate: '$30/close' },
                { tier: 'Tier 2', closes: '25 closes', rate: '$40/close' },
                { tier: 'Tier 3', closes: '35 closes', rate: '$50/close' },
                { tier: 'Overtime', closes: '', rate: '$50/close' },
              ].map(({ tier, closes, rate }) => (
                <div key={tier} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{tier}</span>
                    {closes && <span className="text-gray-400">— {closes}</span>}
                  </div>
                  <span className="font-semibold text-green-600">{rate}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
