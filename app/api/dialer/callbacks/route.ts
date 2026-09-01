import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET /api/dialer/callbacks — list all callbacks (pending + recent completed)
export async function GET() {
  const db = supabaseAdmin()

  const { data, error } = await db
    .from('dialer_callbacks')
    .select('*')
    .order('callback_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ callbacks: data ?? [] })
}

// POST /api/dialer/callbacks — create a manual callback
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { contact_id, callback_at, callback_context, rep_identity } = body

  if (!contact_id || !callback_at) {
    return NextResponse.json({ error: 'contact_id and callback_at required' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Look up contact info from dialer data
  const { data: attempt } = await db.from('dialer_attempts')
    .select('contact_name, phone, firm, stage_name')
    .eq('contact_id', contact_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: call } = await db.from('dialer_calls')
    .select('contact_name, phone, firm')
    .eq('contact_id', contact_id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const name  = attempt?.contact_name ?? call?.contact_name ?? 'Unknown'
  const phone = attempt?.phone ?? call?.phone
  const firm  = attempt?.firm ?? call?.firm ?? null

  if (!phone) {
    return NextResponse.json({ error: 'Could not find phone for contact' }, { status: 404 })
  }

  const { error } = await db.from('dialer_callbacks').insert({
    contact_id,
    contact_name:     name,
    phone,
    firm,
    stage_name:       attempt?.stage_name ?? null,
    callback_at:      new Date(callback_at).toISOString(),
    callback_context: callback_context || null,
    source:           'manual',
    owner_rep:        rep_identity || null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// PATCH /api/dialer/callbacks — mark a callback completed or cancelled
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, status, disposition, completed_by } = body

  if (!id || !status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  }

  const db = supabaseAdmin()

  const update: Record<string, any> = { status }
  if (status === 'completed') {
    update.completed_at = new Date().toISOString()
    update.completed_by = completed_by || null
    update.disposition  = disposition || null
  }

  const { error } = await db.from('dialer_callbacks')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
