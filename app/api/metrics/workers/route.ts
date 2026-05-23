import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COMMISSION_PER_CLOSED = 25

export async function GET() {
  // All signed leads across all firms
  const { data: leads, error } = await supabase
    .from('ghl_leads')
    .select('closer, closed_by_profile_id, case_status, qualified_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // All profiles for name lookup
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')

  const profileNames: Record<string, string> = {}
  for (const p of profiles || []) {
    if (p.name) profileNames[p.id] = p.name
  }

  // Aggregate by worker name
  const byWorker: Record<string, { signedCases: number; closedCases: number }> = {}

  for (const lead of leads || []) {
    const name =
      (lead.closed_by_profile_id ? profileNames[lead.closed_by_profile_id] : null) ||
      lead.closer ||
      null
    if (!name) continue

    const key = name.trim()
    if (!byWorker[key]) byWorker[key] = { signedCases: 0, closedCases: 0 }
    byWorker[key].signedCases += 1
    if ((lead.case_status || '').toLowerCase() === 'closed') {
      byWorker[key].closedCases += 1
    }
  }

  // Also include registered reps with 0 cases
  const { data: reps } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('role', 'rep')

  for (const rep of reps || []) {
    const name = (rep.name || '').trim()
    if (!name) continue
    if (!byWorker[name]) byWorker[name] = { signedCases: 0, closedCases: 0 }
  }

  const workers = Object.entries(byWorker)
    .map(([name, stats]) => ({
      name,
      signedCases: stats.signedCases,
      closedCases: stats.closedCases,
      closeRate: stats.signedCases > 0 ? Math.round(stats.closedCases / stats.signedCases * 100) : 0,
      commission: stats.closedCases * COMMISSION_PER_CLOSED,
    }))
    .sort((a, b) => b.signedCases - a.signedCases)

  return NextResponse.json({ workers, commissionPerClosed: COMMISSION_PER_CLOSED })
}
