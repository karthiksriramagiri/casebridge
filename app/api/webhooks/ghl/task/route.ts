import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET
const GHL_API_KEY = process.env.GHL_API_KEY

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

  // GHL sends contact_id reliably — use it to fetch the latest task via API
  const contactId = payload.contact_id || payload.contactId || payload.contact?.id || null
  const contactName = payload.full_name || payload.contact?.name || payload.contactName || null

  if (!contactId) {
    return NextResponse.json({ error: 'No contact ID in payload', payload }, { status: 400 })
  }

  // Fetch all tasks for this contact from GHL and get the most recently created one
  let taskId: string | null = null
  let title = 'Untitled Task'
  let body: string | null = null
  let dueDate: Date | null = null

  if (GHL_API_KEY) {
    try {
      const res = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/tasks`, {
        headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        const tasks: any[] = data.tasks || []
        // Get the most recent incomplete task
        const latest = tasks
          .filter((t: any) => !t.completed)
          .sort((a: any, b: any) => new Date(b.createdAt || b.dateAdded || 0).getTime() - new Date(a.createdAt || a.dateAdded || 0).getTime())[0]

        if (latest) {
          taskId = latest.id
          title = latest.title || 'Untitled Task'
          body = latest.body || latest.description || null
          const dueDateRaw = latest.dueDate || latest.due_date
          if (dueDateRaw) dueDate = new Date(dueDateRaw)
        }
      }
    } catch (err) {
      console.error('[task-webhook] GHL fetch error:', err)
    }
  }

  // Fallback: use contact ID as task ID if we couldn't fetch
  if (!taskId) taskId = `contact-${contactId}-${Date.now()}`

  if (!dueDate || isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: 'No due date found on task', contactId }, { status: 400 })
  }

  const notifyAt = new Date(dueDate.getTime() - 5 * 60 * 1000)

  const { error } = await supabase
    .from('ghl_task_reminders')
    .upsert({
      task_id: taskId,
      contact_id: contactId,
      contact_name: contactName,
      title,
      body,
      due_date: dueDate.toISOString(),
      notify_at: notifyAt.toISOString(),
      notified: false,
    }, { onConflict: 'task_id' })

  if (error) {
    console.error('[task-webhook] Supabase error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, title, dueDate: dueDate.toISOString(), notifyAt: notifyAt.toISOString() })
}
