import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function PUT(req: NextRequest) {
  const { identity, status } = await req.json()
  if (!identity || !status) return NextResponse.json({ error: 'identity and status required' }, { status: 400 })

  const db = supabaseAdmin()
  await db.from('dialer_rep_status').upsert(
    { rep_identity: identity, status, updated_at: new Date().toISOString() },
    { onConflict: 'rep_identity' }
  )
  return NextResponse.json({ ok: true })
}
