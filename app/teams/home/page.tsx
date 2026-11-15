'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TeamsShell from '../dashboard/TeamsShell'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'

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
  return <span className="text-xs font-bold text-muted-foreground w-6 text-center">#{rank}</span>
}

function LeaderboardCard({
  title, entries, emptyText,
}: { title: string; entries: LeaderboardEntry[]; emptyText: string }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="font-semibold text-foreground text-sm">{title}</h2>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{emptyText}</p>
      ) : (
        <div className="divide-y divide-border">
          {entries.map(e => (
            <div key={e.userId} className={`flex items-center justify-between px-5 py-2.5 ${e.isMe ? 'bg-accent' : ''}`}>
              <div className="flex items-center gap-2.5">
                <RankBadge rank={e.rank} />
                <span className={`text-sm font-medium ${e.isMe ? 'text-primary font-semibold' : 'text-foreground'}`}>
                  {e.name}{e.isMe && <span className="text-xs text-primary-foreground/70 ml-1">(you)</span>}
                </span>
              </div>
              <span className={`text-sm font-bold ${e.rank === 1 ? 'text-warning' : 'text-muted-foreground'}`}>
                {e.count} {e.count === 1 ? 'close' : 'closes'}
              </span>
            </div>
          ))}
        </div>
      )}
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
      if (prof.team_type === 'creative') { router.push('/teams/dashboard'); return }

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
      <div className="tc-root min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const d = data
  const modulesPct = d && d.modules.total > 0
    ? Math.round((d.modules.completed / d.modules.total) * 100)
    : 0

  return (
      <TeamsShell timeclockEnabled={profile.timeclock_enabled} teamType={profile.team_type}>
      <PageHeader
        title={`Welcome back, ${profile.name}`}
        description={`${month} · your full overview.`}
      />
      <PageBody>

        {/* ── Stat grid ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

          {/* Closes this month */}
          <div className="bg-card rounded-xl border border-border px-4 py-4">
            <p className="text-xs text-muted-foreground font-medium">Closes This Month</p>
            <p className="text-2xl font-bold text-foreground mt-1">{d?.myMonthCloses ?? 0}</p>
            {d?.myRank && (
              <p className="text-xs text-muted-foreground mt-1">Rank <span className="font-semibold text-foreground/90">#{d.myRank}</span> this month</p>
            )}
          </div>

          {/* All-time */}
          <div className="bg-card rounded-xl border border-border px-4 py-4">
            <p className="text-xs text-muted-foreground font-medium">All-Time Closes</p>
            <p className="text-2xl font-bold text-foreground mt-1">{d?.allTimeCloses ?? 0}</p>
          </div>

          {/* Next paycheck */}
          <div className="bg-primary rounded-xl border border-transparent px-4 py-4">
            <p className="text-xs text-primary-foreground/75 font-medium">Next Paycheck</p>
            <p className="text-2xl font-bold text-primary-foreground mt-1">{d ? fmt$(d.paycheck.estimate) : '—'}</p>
            <p className="text-xs text-primary-foreground/70 mt-1">{d?.paycheck.nextPayDate}</p>
          </div>

          {/* Training progress */}
          <div className="bg-card rounded-xl border border-border px-4 py-4">
            <p className="text-xs text-muted-foreground font-medium">Training Progress</p>
            {d ? (
              <>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {d.modules.completed}<span className="text-sm font-normal text-muted-foreground">/{d.modules.total}</span>
                </p>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all ${modulesPct === 100 ? 'bg-success' : 'bg-primary'}`}
                    style={{ width: `${modulesPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {d.modules.remaining === 0
                    ? '✓ All modules complete'
                    : `${d.modules.remaining} module${d.modules.remaining !== 1 ? 's' : ''} remaining`}
                </p>
              </>
            ) : <p className="text-2xl font-bold text-muted-foreground/50 mt-1">—</p>}
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

        </PageBody>
      </TeamsShell>
  )
}
