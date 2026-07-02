'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import UserNav from '../dashboard/UserNav'
import LogoutButton from '../dashboard/LogoutButton'

interface LeaderboardEntry { name: string; count: number; rank: number; isMe: boolean; userId: string }

interface HomeData {
  thisMonthLeaderboard: LeaderboardEntry[]
  lastMonthLeaderboard: LeaderboardEntry[]
  monthlyPrize: string | null
  todayScore: { score: number; notes: string | null } | null
  myMonthCloses: number
  allTimeCloses: number
  myRank: number | null
  modules: { total: number; completed: number; remaining: number }
  paycheck: { estimate: number; nextPayDate: string; periodEnd: string }
}

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>
  if (rank === 2) return <span className="text-lg">🥈</span>
  if (rank === 3) return <span className="text-lg">🥉</span>
  return <span className="text-xs font-bold text-gray-400 w-6 text-center">#{rank}</span>
}

function LeaderboardCard({
  title, entries, emptyText,
}: { title: string; entries: LeaderboardEntry[]; emptyText: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">{emptyText}</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {entries.map(e => (
            <div key={e.userId} className={`flex items-center justify-between px-5 py-2.5 ${e.isMe ? 'bg-blue-50' : ''}`}>
              <div className="flex items-center gap-2.5">
                <RankBadge rank={e.rank} />
                <span className={`text-sm font-medium ${e.isMe ? 'text-blue-700 font-semibold' : 'text-gray-800'}`}>
                  {e.name}{e.isMe && <span className="text-xs text-blue-400 ml-1">(you)</span>}
                </span>
              </div>
              <span className={`text-sm font-bold ${e.rank === 1 ? 'text-yellow-600' : 'text-gray-600'}`}>
                {e.count} {e.count === 1 ? 'close' : 'closes'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScoreStars({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} className={`w-4 h-4 ${n <= Math.round(score) ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<{ name: string; timeclock_enabled: boolean; team_type: string } | null>(null)
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/teams/login'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('name, role, nda_signed, timeclock_enabled, team_type')
        .eq('id', user.id)
        .single()

      if (!prof || !prof.nda_signed) { router.push('/teams/onboarding'); return }
      if (prof.role === 'admin') { router.push('/teams/admin'); return }

      setProfile({ name: prof.name, timeclock_enabled: !!prof.timeclock_enabled, team_type: prof.team_type ?? 'intake' })

      const res = await fetch('/api/teams/home')
      if (res.ok) setData(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })
  const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' })

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  const d = data
  const modulesPct = d && d.modules.total > 0
    ? Math.round((d.modules.completed / d.modules.total) * 100)
    : 0
  const bonusEligible = (d?.todayScore?.score ?? 0) >= 4.5

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f1e3c] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal ml-2">· Training Portal</span>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <UserNav timeclockEnabled={profile.timeclock_enabled} teamType={profile.team_type} />

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {profile.name}!</h1>
          <p className="text-gray-500 mt-0.5 text-sm">{month} · here's your full overview.</p>
        </div>

        {/* ── Stat grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

          {/* Closes this month */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4">
            <p className="text-xs text-gray-400 font-medium">Closes This Month</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{d?.myMonthCloses ?? 0}</p>
            {d?.myRank && (
              <p className="text-xs text-gray-400 mt-1">Rank <span className="font-semibold text-gray-700">#{d.myRank}</span> this month</p>
            )}
          </div>

          {/* All-time */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4">
            <p className="text-xs text-gray-400 font-medium">All-Time Closes</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{d?.allTimeCloses ?? 0}</p>
          </div>

          {/* Today's score */}
          <div className={`rounded-xl border shadow-sm px-4 py-4 ${bonusEligible ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
            <p className="text-xs text-gray-400 font-medium">Today's Score</p>
            {d?.todayScore ? (
              <>
                <p className={`text-2xl font-bold mt-1 ${bonusEligible ? 'text-green-600' : 'text-gray-900'}`}>
                  {d.todayScore.score}<span className="text-sm font-normal text-gray-400">/5</span>
                </p>
                {bonusEligible && <p className="text-xs text-green-600 font-semibold mt-1">✓ Bonus eligible</p>}
                {d.todayScore.notes && <p className="text-xs text-gray-400 mt-1 truncate">{d.todayScore.notes}</p>}
              </>
            ) : (
              <p className="text-2xl font-bold text-gray-300 mt-1">—</p>
            )}
          </div>

          {/* Next paycheck */}
          <div className="bg-[#0f1e3c] rounded-xl border border-transparent shadow-sm px-4 py-4">
            <p className="text-xs text-blue-300 font-medium">Next Paycheck</p>
            <p className="text-2xl font-bold text-white mt-1">{d ? fmt$(d.paycheck.estimate) : '—'}</p>
            <p className="text-xs text-blue-400 mt-1">{d?.paycheck.nextPayDate}</p>
          </div>

          {/* Training progress */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4">
            <p className="text-xs text-gray-400 font-medium">Training Progress</p>
            {d ? (
              <>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {d.modules.completed}<span className="text-sm font-normal text-gray-400">/{d.modules.total}</span>
                </p>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all ${modulesPct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${modulesPct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {d.modules.remaining === 0
                    ? '✓ All modules complete'
                    : `${d.modules.remaining} module${d.modules.remaining !== 1 ? 's' : ''} remaining`}
                </p>
              </>
            ) : <p className="text-2xl font-bold text-gray-300 mt-1">—</p>}
          </div>

          {/* Monthly prize */}
          <div className="bg-gradient-to-br from-yellow-400 to-orange-400 rounded-xl shadow-sm px-4 py-4">
            <p className="text-xs font-semibold text-yellow-100 uppercase tracking-wide">🎁 {month} Prize</p>
            <p className="text-lg font-bold text-white mt-1 leading-tight">{d?.monthlyPrize || 'TBD'}</p>
            <p className="text-xs text-yellow-100 mt-1">Most signed closes wins</p>
          </div>

        </div>

        {/* ── Leaderboards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LeaderboardCard
            title={`🏆 ${month} Leaderboard`}
            entries={d?.thisMonthLeaderboard ?? []}
            emptyText="No closes yet."
          />
          <LeaderboardCard
            title={`📅 ${lastMonth} Final Standings`}
            entries={d?.lastMonthLeaderboard ?? []}
            emptyText="No data for last month."
          />
        </div>

        {/* ── Performance + Training row ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Today's performance detail */}
          <div className={`rounded-xl border shadow-sm px-5 py-4 ${bonusEligible ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Today's Performance</p>
            {d?.todayScore ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <ScoreStars score={d.todayScore.score} />
                  <span className={`text-2xl font-bold ${bonusEligible ? 'text-green-600' : 'text-gray-900'}`}>{d.todayScore.score}</span>
                  {bonusEligible && (
                    <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Bonus eligible!</span>
                  )}
                </div>
                {d.todayScore.notes && <p className="text-sm text-gray-500">{d.todayScore.notes}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No score entered for today yet.</p>
            )}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link href="/teams/performance" className="text-xs text-blue-600 font-semibold hover:underline">
                View full score history →
              </Link>
            </div>
          </div>

          {/* Training summary */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Training</p>
            {d ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Modules completed</span>
                  <span className="text-sm font-bold text-gray-900">{d.modules.completed} / {d.modules.total}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${modulesPct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${modulesPct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {d.modules.remaining === 0
                    ? '🎉 All required modules complete!'
                    : `${d.modules.remaining} module${d.modules.remaining !== 1 ? 's' : ''} left to complete`}
                </p>
              </div>
            ) : <p className="text-sm text-gray-400">Loading...</p>}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link href="/teams/dashboard" className="text-xs text-blue-600 font-semibold hover:underline">
                Go to training →
              </Link>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
