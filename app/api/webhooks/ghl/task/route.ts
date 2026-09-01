import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET
const GHL_API_KEY = process.env.GHL_API_KEY

// Returns the UTC Date that corresponds to 9:00 AM on the same calendar day
// as `date`, but in the given IANA timezone (e.g. "America/New_York").
function get9AMInTimezone(date: Date, timezone: string): Date {
  // Get the calendar date string (YYYY-MM-DD) in the target timezone
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date)

  // Walk through UTC hours 0–23 until the local hour in that timezone equals 9
  for (let h = 0; h <= 23; h++) {
    const candidate = new Date(`${localDate}T${String(h).padStart(2, '0')}:00:00Z`)
    const localHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(candidate),
      10
    )
    if (localHour === 9) return candidate
  }
  // Fallback: 9 AM UTC
  return new Date(`${localDate}T09:00:00Z`)
}

export async function POST(request: NextRequest) {
  if (WEBHOOK_SECRET) {
    const secret = request.nextUrl.searchParams.get('secret')
    if (secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let payload: any
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('[task-webhook] payload keys:', Object.keys(payload))

  const contactId = payload.contact_id || payload.contactId || payload.contact?.id || null
  const contactName = payload.full_name || payload.contact?.name || payload.contactName || null

  if (!contactId) {
    return NextResponse.json({ error: 'No contact ID in payload', payload }, { status: 400 })
  }

  let taskId: string | null = null
  let title = 'Untitled Task'
  let body: string | null = null
  let dueDate: Date | null = null
  let contactTimezone = 'America/Los_Angeles' // default
  let ghlPhone: string | null = null

  if (GHL_API_KEY) {
    // Fetch tasks and contact details in parallel
    const [tasksRes, contactRes] = await Promise.allSettled([
      fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/tasks`, {
        headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
        cache: 'no-store',
      }),
      fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
        headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
        cache: 'no-store',
      }),
    ])

    // Pull timezone + phone from contact
    if (contactRes.status === 'fulfilled' && contactRes.value.ok) {
      try {
        const contactData = await contactRes.value.json()
        const c = contactData.contact ?? contactData
        const tz = c.timezone
        if (tz) contactTimezone = tz
        ghlPhone = c.phone || (c.phones?.[0]?.number) || null
      } catch { /* keep default */ }
    }

    // Pull latest incomplete task
    if (tasksRes.status === 'fulfilled' && tasksRes.value.ok) {
      try {
        const data = await tasksRes.value.json()
        const tasks: any[] = data.tasks || []
        const latest = tasks
          .filter((t: any) => !t.completed)
          .sort((a: any, b: any) => new Date(b.createdAt || b.dateAdded || 0).getTime() - new Date(a.createdAt || a.dateAdded || 0).getTime())[0]

        if (latest) {
          taskId = latest.id
          title = latest.title || 'Untitled Task'
          const rawBody = latest.body || latest.description || null
          body = rawBody ? rawBody.replace(/<[^>]*>/g, '').trim() : null
          const dueDateRaw = latest.dueDate || latest.due_date
          if (dueDateRaw) dueDate = new Date(dueDateRaw)
        }
      } catch (err) {
        console.error('[task-webhook] GHL tasks parse error:', err)
      }
    }
  }

  if (!taskId) taskId = `contact-${contactId}-${Date.now()}`

  if (!dueDate || isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: 'No due date found on task', contactId }, { status: 400 })
  }

  // Slack: 5 min before the call
  const notifyAt = new Date(dueDate.getTime() - 5 * 60 * 1000)

  // Snippet 1: 1 hour before the call
  const snippet1At = new Date(dueDate.getTime() - 60 * 60 * 1000)

  // Snippet 2: 15 min before the call
  const snippet2At = new Date(dueDate.getTime() - 15 * 60 * 1000)

  // Snippet 3: 9 AM on the day of the call in the PC's timezone,
  // but only if the call is on a different calendar day than right now.
  const nowLocalDate = new Intl.DateTimeFormat('en-CA', { timeZone: contactTimezone }).format(new Date())
  const dueLocalDate = new Intl.DateTimeFormat('en-CA', { timeZone: contactTimezone }).format(dueDate)
  const snippet3At = dueLocalDate !== nowLocalDate
    ? get9AMInTimezone(dueDate, contactTimezone)
    : null

  // Check if this task already has snippets sent — preserve those flags so
  // duplicate webhook fires from GHL don't reset them and cause double-sends.
  const { data: existing } = await supabase
    .from('ghl_task_reminders')
    .select('notified, snippet_1_sent, snippet_2_sent, snippet_3_sent')
    .eq('task_id', taskId)
    .maybeSingle()

  const { error } = await supabase
    .from('ghl_task_reminders')
    .upsert({
      task_id: taskId,
      contact_id: contactId,
      contact_name: contactName,
      contact_timezone: contactTimezone,
      title,
      body,
      due_date: dueDate.toISOString(),
      notify_at: notifyAt.toISOString(),
      notified: existing?.notified ?? false,
      snippet_1_at: snippet1At.toISOString(),
      snippet_1_sent: existing?.snippet_1_sent ?? false,
      snippet_2_at: snippet2At.toISOString(),
      snippet_2_sent: existing?.snippet_2_sent ?? false,
      snippet_3_at: snippet3At?.toISOString() ?? null,
      snippet_3_sent: existing?.snippet_3_sent ?? false,
    }, { onConflict: 'task_id' })

  if (error) {
    console.error('[task-webhook] Supabase error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also create a dialer callback so reps can call from the Callbacks page
  // Look up phone from dialer data
  let cbPhone: string | null = null
  let cbFirm: string | null = null
  const { data: call } = await supabase.from('dialer_calls')
    .select('phone, firm')
    .eq('contact_id', contactId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (call) {
    cbPhone = call.phone
    cbFirm = call.firm
  }
  if (!cbPhone) {
    const { data: attempt } = await supabase.from('dialer_attempts')
      .select('phone, firm')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (attempt) {
      cbPhone = attempt.phone
      if (!cbFirm) cbFirm = attempt.firm
    }
  }
  // Try GHL contact phone if still missing
  if (!cbPhone && ghlPhone) cbPhone = ghlPhone

  if (cbPhone && contactName) {
    // Avoid duplicates — check if callback already exists for this task
    const { data: existingCb } = await supabase.from('dialer_callbacks')
      .select('id').eq('ghl_task_id', taskId).maybeSingle()
    if (!existingCb) {
      const { error: cbErr } = await supabase.from('dialer_callbacks').insert({
        contact_id:       contactId,
        contact_name:     contactName,
        phone:            cbPhone,
        firm:             cbFirm,
        callback_at:      dueDate.toISOString(),
        callback_context: body || title,
        source:           'ghl',
        ghl_task_id:      taskId,
      })
      if (cbErr) console.error('[task-webhook] callback insert error:', cbErr)
      else console.log('[task-webhook] created dialer callback', { contactId, dueDate: dueDate!.toISOString() })
    }
  }

  return NextResponse.json({
    success: true,
    title,
    dueDate: dueDate.toISOString(),
    contactTimezone,
    snippet1At: snippet1At.toISOString(),
    snippet2At: snippet2At.toISOString(),
    snippet3At: snippet3At?.toISOString() ?? null,
  })
}
