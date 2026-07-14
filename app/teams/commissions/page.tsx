'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import TeamsShell from '../dashboard/TeamsShell'

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

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/teams/login'); return }
      supabase.from('profiles').select('team_type, timeclock_enabled').eq('id', user.id).single().then(({ data: profile }) => {
        if (profile) {
          setTeamType(profile.team_type ?? 'creative')
          setTimeclockEnabled(!!profile.timeclock_enabled)
        }
      })
    })

    fetch('/api/teams/commissions')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load.'); setLoading(false) })
  }, [router])

  return (
    <TeamsShell timeclockEnabled={timeclockEnabled} teamType={teamType}>
      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">Loading...</div>
        ) : error || !data ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-10 text-center text-red-500 text-sm">
            {error || 'Unable to load commissions.'}
          </div>
        ) : !data.slug ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-10 text-center text-gray-400 text-sm">
            No creative slug assigned to your account yet. Contact an admin.
          </div>
        ) : (
          <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Commissions</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Cases attributed to your creative slug{' '}
                  <span className="font-mono font-bold text-purple-600">{data.slug}</span>
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 text-center">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Cases</p>
                <p className="text-4xl font-bold text-gray-900 mt-1">{data.totalCases}</p>
              </div>
            </div>

            {/* Active Meta Ads */}
            {data.metaAds.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Your Active Ads</h2>
                <div className="space-y-2">
                  {data.metaAds.map(ad => {
                    const casesForAd = data.byAd.find(g => g.adId === ad.id)
                    return (
                      <div key={ad.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4">
                        {ad.creative?.thumbnail_url ? (
                          <img src={ad.creative.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{ad.name}</p>
                          {ad.adset?.name && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{ad.adset.name}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-2xl font-bold text-purple-600">{casesForAd?.count ?? 0}</p>
                          <p className="text-xs text-gray-400">cases</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Case Breakdown */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Case Breakdown</h2>
              {data.byAd.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-10 text-center text-gray-400 text-sm">
                  No signed cases yet for slug <span className="font-mono font-semibold">{data.slug}</span>.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.byAd.sort((a, b) => b.count - a.count).map(group => {
                    const isExpanded = expandedAd === group.adId
                    return (
                      <div key={group.adId} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div
                          onClick={() => setExpandedAd(isExpanded ? null : group.adId)}
                          className={`flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors ${isExpanded ? 'border-b border-gray-100 bg-gray-50' : ''}`}
                        >
                          <p className="text-sm font-medium text-gray-800 truncate flex-1 min-w-0 mr-4">{group.adName}</p>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-lg font-bold text-purple-600">{group.count}</span>
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="divide-y divide-gray-50">
                            {group.cases.map(c => (
                              <div key={c.id} className="flex items-center justify-between px-5 py-2.5">
                                <p className="text-sm text-gray-700">{c.contactName || 'Unknown'}</p>
                                <div className="flex items-center gap-3">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    c.status === 'replacement' ? 'bg-orange-100 text-orange-600' :
                                    c.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                                    'bg-green-100 text-green-700'
                                  }`}>
                                    {c.status === 'replacement' ? 'Replacement' : c.status === 'cancelled' ? 'Cancelled' : 'Signed'}
                                  </span>
                                  <span className="text-xs text-gray-400">
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
      </main>
    </TeamsShell>
  )
}
