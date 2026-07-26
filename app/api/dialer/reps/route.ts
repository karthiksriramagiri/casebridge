import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// The four dialer reps for the team center
const DIALER_REP_NAMES = ['Karthik', 'Pablo', 'Ziyad']

export async function GET() {
  const admin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, name, role, team_type, ghl_user_ids')
    .or(DIALER_REP_NAMES.map((n) => `name.ilike.${n}%`).join(','))
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch emails for these reps
  const ids = (profiles ?? []).map((p) => p.id)
  let emailMap: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: usersData } = await admin.auth.admin.listUsers()
    for (const u of usersData?.users ?? []) {
      if (ids.includes(u.id)) {
        emailMap[u.id] = u.email ?? ''
      }
    }
  }

  const reps = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    email: emailMap[p.id] ?? '',
    role: p.role,
    teamType: p.team_type ?? 'intake',
    ghlUserIds: p.ghl_user_ids ?? [],
    // Twilio identity = lowercased first name (must match token identity)
    twilioIdentity: p.name?.split(' ')[0]?.toLowerCase() ?? p.id,
    status: 'OFFLINE' as const,
  }))

  return NextResponse.json({ reps })
}
