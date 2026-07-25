import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { username } = await req.json()
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data } = await db
    .from('dialer_users')
    .select('email')
    .ilike('name', username.trim())
    .eq('active', true)
    .single()

  if (!data?.email) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json({ email: data.email })
}
