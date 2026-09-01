import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const GHL_API_KEY = process.env.GHL_API_KEY

// POST /api/webhooks/ghl/callback
// Add this URL to a GHL workflow automation to create dialer callbacks from tasks.
// Payload: { contact_id, full_name?, phone?, due_date?, title?, body? }
// If contact_id is provided, it fetches the latest task + contact details from GHL.
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

  // Resolve contact details + task due date from GHL
  let resolvedName  = contactName
  let resolvedPhone = phone
  let resolvedFirm  = firm
  let resolvedNotes = notes
  let dueDate: Date | null = rawDueDate ? new Date(rawDueDate) : null
  let ghlTaskId: string | null = null

  if (GHL_API_KEY) {
    const headers = { Authorization: `Bearer ${GHL_API_KEY.trim()}`, Version: '2021-07-28' }

    const [contactRes, tasksRes] = await Promise.allSettled([
      fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, { headers, cache: 'no-store' }),
      fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/tasks`, { headers, cache: 'no-store' }),
    ])

    // Fill in contact details
    if (contactRes.status === 'fulfilled' && contactRes.value.ok) {
      try {
        const data = await contactRes.value.json()
        const c = data.contact ?? data
        if (!resolvedName)  resolvedName  = c.name || c.contactName
        if (!resolvedPhone) resolvedPhone = c.phone || (c.phones?.[0]?.number)
      } catch { /* keep what we have */ }
    }

    // Get latest incomplete task for due date
    if (tasksRes.status === 'fulfilled' && tasksRes.value.ok) {
      try {
        const data = await tasksRes.value.json()
        const tasks: any[] = data.tasks || []
        const latest = tasks
          .filter((t: any) => !t.completed)
          .sort((a: any, b: any) =>
            new Date(b.createdAt || b.dateAdded || 0).getTime() -
            new Date(a.createdAt || a.dateAdded || 0).getTime()
          )[0]

        if (latest) {
          ghlTaskId = latest.id
          if (!dueDate) {
            const raw = latest.dueDate || latest.due_date
            if (raw) dueDate = new Date(raw)
          }
          // Use task body/title as notes if none provided in payload
          if (!notes) {
            const taskNotes = latest.body || latest.title
            if (taskNotes) resolvedNotes = taskNotes
          }
        }
      } catch { /* ignore */ }
    }
  }

  // Fallback: look up from dialer data if still missing
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

  // Also try dialer_attempts for firm/stage info
  if (!resolvedFirm) {
    const { data: attempt } = await db.from('dialer_attempts')
      .select('firm, stage_name')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (attempt) resolvedFirm = attempt.firm
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
