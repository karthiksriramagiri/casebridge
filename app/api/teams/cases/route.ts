import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Map ghl_leads.case_status → rep_cases.status
function mapStatus(caseStatus: string): string {
  if (caseStatus === 'replacement') return 'replacement'
  if (caseStatus === 'cancelled') return 'cancelled'
  return 'signed'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get the user's name so we can also match by the `closer` text field
  const { data: profile } = await admin
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const userName = profile?.name?.trim() || null

  // --- Pull from ghl_leads (the live source from /metrics) ---
  const ghlQuery = admin
    .from('ghl_leads')
    .select('id, contact_name, case_status, qualified_at, firm_id, closer, firms(case_value)')
    .order('qualified_at', { ascending: false })

  // Match by profile id OR by closer name (for historical records)
  if (userName) {
    ghlQuery.or(`closed_by_profile_id.eq.${user.id},closer.ilike.${userName}`)
  } else {
    ghlQuery.eq('closed_by_profile_id', user.id)
  }

  const { data: ghlLeads } = await ghlQuery

  const ghlCases = (ghlLeads || []).map((lead: any) => ({
    id: `ghl_${lead.id}`,
    contact_name: lead.contact_name || 'Unknown',
    case_value: lead.firms?.case_value ?? null,
    status: mapStatus(lead.case_status || 'signed'),
    closed_at: lead.qualified_at
      ? lead.qualified_at.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    notes: null,
    source: 'ghl',
  }))

  // --- Also pull manual rep_cases entries ---
  const { data: manualCases } = await admin
    .from('rep_cases')
    .select('id, contact_name, case_value, status, closed_at, notes')
    .eq('user_id', user.id)
    .order('closed_at', { ascending: false })

  const repCases = (manualCases || []).map((c: any) => ({ ...c, source: 'manual' }))

  // Deduplicate ghl rows by contact_name + date (keep first occurrence)
  const ghlSeen = new Set<string>()
  const dedupedGhl = ghlCases.filter(c => {
    const key = `${c.contact_name.toLowerCase()}|${c.closed_at}`
    if (ghlSeen.has(key)) return false
    ghlSeen.add(key)
    return true
  })

  // Merge: ghl first, skip manual entries already covered by ghl
  const manualKeys = new Set(repCases.map((c: any) => `${c.contact_name.toLowerCase()}|${c.closed_at}`))
  const filteredGhl = dedupedGhl.filter(
    (c) => !manualKeys.has(`${c.contact_name.toLowerCase()}|${c.closed_at}`)
  )

  const allCases = [...filteredGhl, ...repCases].sort(
    (a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime()
  )

  return NextResponse.json({ cases: allCases })
}
