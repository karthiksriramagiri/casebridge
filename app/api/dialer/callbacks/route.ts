import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function todayEastern() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

// GET /api/dialer/callbacks — list all callbacks (pending + completed today)
export async function GET(req: NextRequest) {
  const db = supabaseAdmin()
  const today = todayEastern()

  const { data, error } = await db
    .from('dialer_attempts')
    .select('id, contact_id, contact_name, phone, firm, stage_name, callback_at, callback_context, owner_rep, status, completed_at, disposition, plan_date, created_at')
    .eq('is_callback', true)
    .gte('plan_date', today)
    .order('callback_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ callbacks: data ?? [] })
}

// POST /api/dialer/callbacks — create a new manual callback
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { contact_id, callback_at, callback_context, rep_identity } = body

  if (!contact_id || !callback_at) {
    return NextResponse.json({ error: 'contact_id and callback_at required' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const today = todayEastern()
  const cbAt = new Date(callback_at)

  // Look up the contact's most recent attempt or call to get lead info
  const { data: recent } = await db
    .from('dialer_attempts')
    .select('contact_name, phone, firm, pipeline_id, stage_id, stage_name, ghl_opportunity_id, lead_timezone, day_ends_at, lang')
    .eq('contact_id', contact_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!recent) {
    // Fallback: check dialer_calls
    const { data: call } = await db
      .from('dialer_calls')
      .select('contact_name, phone, firm')
      .eq('contact_id', contact_id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!call) {
      return NextResponse.json({ error: 'Contact not found in dialer data' }, { status: 404 })
    }

    // Create callback with minimal info from calls
    const { error } = await db.from('dialer_attempts').insert({
      contact_id,
      contact_name:       call.contact_name ?? 'Unknown',
      phone:              call.phone,
      firm:               call.firm ?? 'lhp',
      pipeline_id:        'unknown',
      stage_id:           'unknown',
      stage_name:         'Callback',
      ghl_opportunity_id: null,
      plan_date:          today,
      attempt_number:     99,
      attempts_total:     1,
      block:              'morning',
      lead_timezone:      'America/Los_Angeles',
      due_from:           cbAt.toISOString(),
      due_until:          cbAt.toISOString(),
      day_ends_at:        new Date(cbAt.getTime() + 12 * 3600 * 1000).toISOString(),
      priority:           500,
      is_callback:        true,
      callback_at:        cbAt.toISOString(),
      callback_context:   callback_context || null,
      owner_rep:          rep_identity || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Create callback attempt from existing lead data
  const { error } = await db.from('dialer_attempts').insert({
    contact_id,
    contact_name:       recent.contact_name,
    phone:              recent.phone,
    firm:               recent.firm,
    pipeline_id:        recent.pipeline_id,
    stage_id:           recent.stage_id,
    stage_name:         recent.stage_name,
    ghl_opportunity_id: recent.ghl_opportunity_id,
    plan_date:          today,
    attempt_number:     99,
    attempts_total:     1,
    block:              'morning',
    lead_timezone:      recent.lead_timezone ?? 'America/Los_Angeles',
    due_from:           cbAt.toISOString(),
    due_until:          cbAt.toISOString(),
    day_ends_at:        recent.day_ends_at ?? new Date(cbAt.getTime() + 12 * 3600 * 1000).toISOString(),
    priority:           500,
    is_callback:        true,
    callback_at:        cbAt.toISOString(),
    callback_context:   callback_context || null,
    owner_rep:          rep_identity || null,
    lang:               recent.lang ?? 'en',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
