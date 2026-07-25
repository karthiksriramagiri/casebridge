import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '../../../dialer/_lib/supabase-server'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAdmin(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'ADMIN') return null
  return user
}

// GET /api/dialer/admin/reps — list all reps
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data, error } = await db.from('dialer_users').select('*').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reps: data })
}

// POST /api/dialer/admin/reps — create a new rep
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, email, password, role, twilio_identity } = await req.json()
  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: 'name, email, password, role required' }, { status: 400 })
  }

  const db = adminClient()

  // Create Supabase auth user
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, twilio_identity: twilio_identity ?? '' },
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  // Insert into dialer_users
  const { error: dbError } = await db.from('dialer_users').insert({
    id:              authData.user.id,
    name,
    email,
    role,
    twilio_identity: twilio_identity ?? null,
    active:          true,
  })
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: authData.user.id })
}

// PATCH /api/dialer/admin/reps — update rep (deactivate, change role, etc.)
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, active, role, twilio_identity, name } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = adminClient()

  // Update dialer_users
  const updates: Record<string, any> = {}
  if (active           !== undefined) updates.active          = active
  if (role             !== undefined) updates.role            = role
  if (twilio_identity  !== undefined) updates.twilio_identity = twilio_identity
  if (name             !== undefined) updates.name            = name

  await db.from('dialer_users').update(updates).eq('id', id)

  // Sync metadata to auth user
  const metaUpdates: Record<string, any> = {}
  if (role             !== undefined) metaUpdates.role             = role
  if (twilio_identity  !== undefined) metaUpdates.twilio_identity  = twilio_identity
  if (name             !== undefined) metaUpdates.name             = name

  if (Object.keys(metaUpdates).length > 0) {
    await db.auth.admin.updateUserById(id, { user_metadata: metaUpdates })
  }

  // Deactivate = ban from signing in
  if (active === false) {
    await db.auth.admin.updateUserById(id, { ban_duration: '87600h' }) // 10 years
  } else if (active === true) {
    await db.auth.admin.updateUserById(id, { ban_duration: 'none' })
  }

  return NextResponse.json({ ok: true })
}
