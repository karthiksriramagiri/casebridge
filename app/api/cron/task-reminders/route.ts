import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLACK_WEBHOOK = process.env.SLACK_TASK_REMINDERS
const GHL_API_KEY = process.env.GHL_API_KEY

function firstName(contactName: string | null): string {
  return (contactName ?? '').split(' ')[0] || 'there'
}

function formatCallTime(dueDateIso: string, timezone: string): string {
  return new Date(dueDateIso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone || 'America/Los_Angeles',
  })
}

async function sendGhlMessage(contactId: string, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!GHL_API_KEY) return { ok: false, error: 'No GHL API key' }

  const res = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GHL_API_KEY}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'SMS', contactId, message }),
  })

  if (res.ok) return { ok: true }
  const text = await res.text()
  return { ok: false, error: `${res.status}: ${text.slice(0, 120)}` }
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  if (secret !== process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!SLACK_WEBHOOK) {
    return NextResponse.json({ error: 'No Slack webhook configured' }, { status: 500 })
  }

  function stripHtml(html: string | null): string | null {
    if (!html) return null
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim() || null
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const graceIso = new Date(now.getTime() - 30 * 60 * 1000).toISOString()

  const snippetResults: string[] = []

  // ── Snippet 1: 1 hour before ───────────────────────────────────────────────
  {
    const { data: s1Tasks } = await supabase
      .from('ghl_task_reminders')
      .select('id, contact_id, contact_name, due_date, contact_timezone')
      .eq('snippet_1_sent', false)
      .lte('snippet_1_at', nowIso)
      .gte('due_date', graceIso)

    for (const task of s1Tasks ?? []) {
      const name = firstName(task.contact_name)
      const message =
        `Hi ${name},\n\n` +
        `Just a quick heads up that our call is coming up in about an hour. ` +
        `During the call, we'll review your accident details and see how we can help you move forward with treatment and your case. ` +
        `Please keep your phone nearby and if you need to reschedule, feel free to let us know!`

      const result = await sendGhlMessage(task.contact_id, message)
      if (result.ok) {
        await supabase.from('ghl_task_reminders').update({ snippet_1_sent: true }).eq('id', task.id)
        snippetResults.push(`✓ snippet-1 (1hr) → ${task.contact_name ?? task.contact_id}`)
      } else {
        snippetResults.push(`✗ snippet-1 (1hr) → ${task.contact_name ?? task.contact_id} (${result.error})`)
      }
    }
  }

  // ── Snippet 2: 30 min before ───────────────────────────────────────────────
  // TODO: add message text for 30-min reminder
  {
    const { data: s2Tasks } = await supabase
      .from('ghl_task_reminders')
      .select('id, contact_id, contact_name, due_date, contact_timezone')
      .eq('snippet_2_sent', false)
      .lte('snippet_2_at', nowIso)
      .gte('due_date', graceIso)

    for (const task of s2Tasks ?? []) {
      const name = firstName(task.contact_name)
      const callTime = formatCallTime(task.due_date, task.contact_timezone)
      // TODO: replace with actual 30-min message text
      const message = `Hi ${name}, your call is in 30 minutes at ${callTime}. Please keep your phone nearby!`

      const result = await sendGhlMessage(task.contact_id, message)
      if (result.ok) {
        await supabase.from('ghl_task_reminders').update({ snippet_2_sent: true }).eq('id', task.id)
        snippetResults.push(`✓ snippet-2 (30min) → ${task.contact_name ?? task.contact_id}`)
      } else {
        snippetResults.push(`✗ snippet-2 (30min) → ${task.contact_name ?? task.contact_id} (${result.error})`)
      }
    }
  }

  // ── Snippet 3: 9 AM day-of (next-day calls only) ───────────────────────────
  // TODO: add message text for day-before reminder
  {
    const { data: s3Tasks } = await supabase
      .from('ghl_task_reminders')
      .select('id, contact_id, contact_name, due_date, contact_timezone')
      .eq('snippet_3_sent', false)
      .not('snippet_3_at', 'is', null)
      .lte('snippet_3_at', nowIso)
      .gte('due_date', nowIso)

    for (const task of s3Tasks ?? []) {
      const name = firstName(task.contact_name)
      const callTime = formatCallTime(task.due_date, task.contact_timezone)
      // TODO: replace with actual day-before message text
      const message = `Hi ${name}, just a reminder that your call is scheduled for tomorrow at ${callTime}. We look forward to speaking with you!`

      const result = await sendGhlMessage(task.contact_id, message)
      if (result.ok) {
        await supabase.from('ghl_task_reminders').update({ snippet_3_sent: true }).eq('id', task.id)
        snippetResults.push(`✓ snippet-3 (9am) → ${task.contact_name ?? task.contact_id}`)
      } else {
        snippetResults.push(`✗ snippet-3 (9am) → ${task.contact_name ?? task.contact_id} (${result.error})`)
      }
    }
  }

  // ── Slack: 5 min before ────────────────────────────────────────────────────
  const { data: tasks, error } = await supabase
    .from('ghl_task_reminders')
    .select('*')
    .eq('notified', false)
    .lte('notify_at', nowIso)
    .gte('due_date', graceIso)

  if (error) {
    console.error('[task-reminders] Supabase error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: string[] = []

  for (const task of tasks ?? []) {
    const dueTime = new Date(task.due_date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Los_Angeles',
    })
    const dueDate = new Date(task.due_date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    })

    const contactLine = task.contact_name ? `*Contact:* ${task.contact_name}` : ''
    const bodyLine = stripHtml(task.body) ? `*Notes:* ${stripHtml(task.body)}` : ''

    const message = {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:alarm_clock: *Task Due in 5 Minutes*\n\n*${task.title}*\n${[contactLine, bodyLine].filter(Boolean).join('\n')}`,
          },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Due at *${dueTime}* on ${dueDate}` }],
        },
      ],
    }

    try {
      const slackRes = await fetch(SLACK_WEBHOOK!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      })

      if (slackRes.ok) {
        await supabase.from('ghl_task_reminders').update({ notified: true }).eq('id', task.id)
        results.push(`✓ ${task.title}`)
      } else {
        results.push(`✗ ${task.title} (slack ${slackRes.status})`)
      }
    } catch {
      results.push(`✗ ${task.title} (fetch error)`)
    }
  }

  return NextResponse.json({
    slackSent: results.length,
    snippetsSent: snippetResults.length,
    results,
    snippetResults,
  })
}
