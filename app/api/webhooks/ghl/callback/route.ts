import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// POST /api/webhooks/ghl/callback
// Add this URL to a GHL workflow automation to create dialer callbacks from tasks.
// Payload: { contact_id, full_name?, phone?, due_date?, title?, body? }
// Pulls due date from ghl_task_reminders first (already populated by the task webhook),
// then falls back to payload fields, then GHL API, then defaults to 2h from now.
export async function POST(req: NextRequest) {
  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('[callback-webhook] payload:', JSON.stringify(payload).slice(0, 500))

  const contactId   = payload.contact_id || payload.contactId || payload.contact?.id
  const contactName = payload.full_name || payload.contact_name || payload.contactName || payload.contact?.name
  const phone       = payload.phone || payload.contact?.phone
  const firm        = payload.firm || null
  const notes       = payload.body || payload.title || payload.notes || payload.callback_context || null
  const rawDueDate  = payload.due_date || payload.dueDate || payload.callback_at || payload.task?.dueDate || payload.task?.due_date || null

  if (!contactId) {
    return NextResponse.json({ error: 'contact_id required' }, { status: 400 })
  }

  const db = supabaseAdmin()

  let resolvedName  = contactName
  let resolvedPhone = phone
  let resolvedFirm  = firm
  let resolvedNotes = notes
  let dueDate: Date | null = rawDueDate ? new Date(rawDueDate) : null
  let ghlTaskId: string | null = null

  // 1. Try ghl_task_reminders first — the task webhook already stored the due date
  const { data: taskReminder } = await db.from('ghl_task_reminders')
    .select('task_id, contact_name, due_date, title, body')
    .eq('contact_id', contactId)
    .order('due_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (taskReminder) {
    ghlTaskId = taskReminder.task_id
    if (!resolvedName) resolvedName = taskReminder.contact_name
    if (!dueDate) {
      dueDate = new Date(taskReminder.due_date)
    }
    if (!resolvedNotes) {
      resolvedNotes = taskReminder.body || taskReminder.title || null
    }
  }

  // 2. Fallback: look up contact info from dialer data
  if (!resolvedName || !resolvedPhone) {
    const { data: call } = await db.from('dialer_calls')
      .select('contact_name, phone, firm')
      .eq('contact_id', contactId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (call) {
      if (!resolvedName)  resolvedName  = call.contact_name
      if (!resolvedPhone) resolvedPhone = call.phone
      if (!resolvedFirm)  resolvedFirm  = call.firm
    }
  }

  if (!resolvedName || !resolvedPhone) {
    const { data: attempt } = await db.from('dialer_attempts')
      .select('contact_name, phone, firm, stage_name')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (attempt) {
      if (!resolvedName)  resolvedName  = attempt.contact_name
      if (!resolvedPhone) resolvedPhone = attempt.phone
      if (!resolvedFirm)  resolvedFirm  = attempt.firm
    }
  }

  // 3. Last resort for contact info: GHL API (may be rate limited)
  if (!resolvedName || !resolvedPhone) {
    const GHL_API_KEY = process.env.GHL_API_KEY
    if (GHL_API_KEY) {
      try {
        const res = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
          headers: { Authorization: `Bearer ${GHL_API_KEY.trim()}`, Version: '2021-07-28' },
          cache: 'no-store',
        })
        if (res.ok) {
          const data = await res.json()
          const c = data.contact ?? data
          if (!resolvedName)  resolvedName  = c.name || c.contactName
          if (!resolvedPhone) resolvedPhone = c.phone || (c.phones?.[0]?.number)
        }
      } catch { /* keep what we have */ }
    }
  }

  if (!resolvedName || !resolvedPhone) {
    return NextResponse.json({ error: 'Could not resolve contact name/phone', contactId }, { status: 400 })
  }

  // Default due date: 2 hours from now
  if (!dueDate || isNaN(dueDate.getTime())) {
    dueDate = new Date(Date.now() + 2 * 3600 * 1000)
  }

  const { error } = await db.from('dialer_callbacks').insert({
    contact_id:       contactId,
    contact_name:     resolvedName,
    phone:            resolvedPhone,
    firm:             resolvedFirm,
    callback_at:      dueDate.toISOString(),
    callback_context: resolvedNotes,
    source:           'ghl',
    ghl_task_id:      ghlTaskId,
  })

  if (error) {
    console.error('[callback-webhook] insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[callback-webhook] created callback', { contactId, name: resolvedName, dueDate: dueDate.toISOString() })
  return NextResponse.json({ ok: true, contactId, callbackAt: dueDate.toISOString() })
}
