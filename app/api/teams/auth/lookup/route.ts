import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const { name } = await request.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }

  const adminClient = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find profile by name (case-insensitive)
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('id')
    .ilike('name', name.trim())
    .limit(1)

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ error: 'Invalid name or password.' }, { status: 401 })
  }

  const userId = profiles[0].id

  // Get email from auth.users via admin API
  const { data: userData } = await adminClient.auth.admin.getUserById(userId)

  if (!userData?.user?.email) {
    return NextResponse.json({ error: 'Invalid name or password.' }, { status: 401 })
  }

  return NextResponse.json({ email: userData.user.email })
}
