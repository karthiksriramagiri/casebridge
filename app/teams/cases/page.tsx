'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import TeamsShell from '../dashboard/TeamsShell'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'

interface Case {
  id: string
  contact_name: string
  case_value: number | null
  status: string
  closed_at: string
  notes: string | null
}

const STATUS_STYLES: Record<string, string> = {
  signed: 'bg-success/15 text-success',
  replacement: 'bg-warning/15 text-warning',
  cancelled: 'bg-destructive/10 text-destructive',
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
        .select('role, nda_signed, timeclock_enabled, team_type, rep_phase')
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
      <TeamsShell timeclockEnabled={timeclockEnabled} teamType={teamType}>
      <PageHeader
        title="My Cases"
        description="Every case you have closed. $30 per signed · $0 per replacement."
      />
      <PageBody>


        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-card rounded-xl border border-border px-4 py-4">
                <p className="text-xs text-muted-foreground font-medium">Signed Cases</p>
                <p className="text-2xl font-bold text-foreground mt-1">{signed}</p>
              </div>
              <div className="bg-card rounded-xl border border-border px-4 py-4">
                <p className="text-xs text-muted-foreground font-medium">Replacements</p>
                <p className="text-2xl font-bold text-warning mt-1">{replacements}</p>
              </div>
              <div className="bg-card rounded-xl border border-border px-4 py-4">
                <p className="text-xs text-muted-foreground font-medium">Commission Earned</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {commission > 0 ? `$${commission.toLocaleString()}` : '—'}
                </p>
              </div>
            </div>

            {/* Cases table */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Case History</h2>
              </div>
              {cases.length === 0 ? (
                <div className="px-5 py-12 text-center text-muted-foreground text-sm">No cases logged yet.</div>
              ) : (
                <div className="divide-y divide-border">
                  {cases.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3.5 gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{c.contact_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(c.closed_at + 'T12:00:00'), 'MMM d, yyyy')}
                          {c.notes && ` · ${c.notes}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-muted-foreground">
                          {c.status === 'replacement' ? '+$0' : c.status === 'signed' ? '+$30' : ''}
                        </span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[c.status] || 'bg-muted text-muted-foreground'}`}>
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
        </PageBody>
      </TeamsShell>
  )
}
