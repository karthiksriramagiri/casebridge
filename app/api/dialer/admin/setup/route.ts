import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Check if admin already exists
  const { data: existing } = await db
    .from('dialer_users')
    .select('id')
    .ilike('name', 'admin')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, message: 'Admin already exists' })
  }

  const email = 'admin@cb.internal'

  // Create Supabase auth user — omit role from metadata so the Teams profiles
  // trigger (which has its own role check constraint) doesn't conflict.
  // We patch role + twilio_identity onto the user immediately after creation.
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email,
    password: 'Admin123',
    email_confirm: true,
    user_metadata: { name: 'Admin' },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Now patch dialer-specific metadata (avoids profiles trigger on create)
  await db.auth.admin.updateUserById(authData.user.id, {
    user_metadata: { name: 'Admin', role: 'ADMIN', twilio_identity: 'admin' },
  })

  // Insert into dialer_users
  await db.from('dialer_users').insert({
    id:              authData.user.id,
    name:            'Admin',
    email,
    role:            'ADMIN',
    twilio_identity: 'admin',
    active:          true,
  })

  return NextResponse.json({ ok: true, message: 'Admin account created. Username: Admin, Password: Admin123' })
}
