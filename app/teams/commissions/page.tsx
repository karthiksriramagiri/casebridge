'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import TeamsShell from '../dashboard/TeamsShell'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'
import { CommissionBoard } from '@/app/teams/_components/commission-board'

interface CaseEntry {
  id: string
  contactName: string | null
  createdAt: string
  status: string | null
}

interface AdGroup {
  adId: string
  adName: string
  count: number
  cases: CaseEntry[]
}

interface MetaAd {
  id: string
  name: string
  creative?: { name?: string; thumbnail_url?: string }
  adset?: { name?: string }
  campaign?: { name?: string }
}

interface CommissionsData {
  slug: string | null
  totalCases: number
  byAd: AdGroup[]
  metaAds: MetaAd[]
}

export default function CommissionsPage() {
  const [data, setData] = useState<CommissionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedAd, setExpandedAd] = useState<string | null>(null)
  const [teamType, setTeamType] = useState<string>('creative')
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const router = useRouter()

  /* Null until the profile is read. The two views answer different
     questions and loading the wrong one first makes an intake rep's page
     flash an error about creative slugs. */
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/teams/login'); return }
      supabase.from('profiles').select('team_type, timeclock_enabled').eq('id', user.id).single().then(({ data: profile }) => {
        const team = profile?.team_type ?? 'creative'
        setTeamType(team)
        setTimeclockEnabled(!!profile?.timeclock_enabled)
        setResolved(true)

        /* Only a creative rep has ad attribution to fetch. An intake rep's
           commissions come from the cases they closed, which the shared
           board reads from its own endpoint. */
        if (team !== 'creative') { setLoading(false); return }
        fetch('/api/teams/commissions')
          .then(r => r.json())
          .then(d => {
            if (d.error) setError(d.error)
            else setData(d)
            setLoading(false)
          })
          .catch(() => { setError('Failed to load.'); setLoading(false) })
      })
    })
  }, [router])

  /* An intake rep: the same board their manager reads, scoped to them. */
  if (resolved && teamType !== 'creative') {
    return (
      <TeamsShell timeclockEnabled={timeclockEnabled} teamType={teamType}>
        <CommissionBoard scope="mine" />
      </TeamsShell>
    )
  }

  return (
    <TeamsShell timeclockEnabled={timeclockEnabled} teamType={teamType}>
      <PageHeader
        title="Commissions"
        description={data ? `Cases attributed to your creative slug ${data.slug}` : undefined}
      />
      <PageBody>
        {loading ? (
          <div className="text-center py-20 text-muted-foreground text-sm">Loading...</div>
        ) : error || !data ? (
          <div className="bg-card rounded-xl border border-border px-6 py-10 text-center text-destructive text-sm">
            {error || 'Unable to load commissions.'}
          </div>
        ) : !data.slug ? (
          <div className="bg-card rounded-xl border border-border px-6 py-10 text-center text-muted-foreground text-sm">
            No creative slug assigned to your account yet. Contact an admin.
          </div>
        ) : (
          <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-end">
              <div className="bg-card rounded-xl border border-border px-6 py-4 text-center">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Cases</p>
                <p className="text-4xl font-bold text-foreground mt-1">{data.totalCases}</p>
              </div>
            </div>

            {/* Active Meta Ads */}
            {data.metaAds.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Active Ads</h2>
                <div className="space-y-2">
                  {data.metaAds.map(ad => {
                    const casesForAd = data.byAd.find(g => g.adId === ad.id)
                    return (
                      <div key={ad.id} className="bg-card rounded-xl border border-border px-5 py-4 flex items-center gap-4">
                        {ad.creative?.thumbnail_url ? (
                          <img src={ad.creative.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{ad.name}</p>
                          {ad.adset?.name && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{ad.adset.name}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-2xl font-bold text-team-creative">{casesForAd?.count ?? 0}</p>
                          <p className="text-xs text-muted-foreground">cases</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Case Breakdown */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Case Breakdown</h2>
              {data.byAd.length === 0 ? (
                <div className="bg-card rounded-xl border border-border px-6 py-10 text-center text-muted-foreground text-sm">
                  No signed cases yet for slug <span className="font-mono font-semibold">{data.slug}</span>.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.byAd.sort((a, b) => b.count - a.count).map(group => {
                    const isExpanded = expandedAd === group.adId
                    return (
                      <div key={group.adId} className="bg-card rounded-xl border border-border overflow-hidden">
                        <div
                          onClick={() => setExpandedAd(isExpanded ? null : group.adId)}
                          className={`flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-muted/50 transition-colors ${isExpanded ? 'border-b border-border bg-muted/40' : ''}`}
                        >
                          <p className="text-sm font-medium text-foreground truncate flex-1 min-w-0 mr-4">{group.adName}</p>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-lg font-bold text-team-creative">{group.count}</span>
                            <svg className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="divide-y divide-border">
                            {group.cases.map(c => (
                              <div key={c.id} className="flex items-center justify-between px-5 py-2.5">
                                <p className="text-sm text-foreground/90">{c.contactName || 'Unknown'}</p>
                                <div className="flex items-center gap-3">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
 c.status === 'replacement' ? 'bg-warning/15 text-warning' :
                                    c.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
                                    'bg-success/15 text-success'
                                  }`}>
                                    {c.status === 'replacement' ? 'Replacement' : c.status === 'cancelled' ? 'Cancelled' : 'Signed'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(c.createdAt), 'MMM d, yyyy')}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </PageBody>
    </TeamsShell>
  )
}
