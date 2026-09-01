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

  // ── Snippet 2: 15 min before ───────────────────────────────────────────────
  {
    const { data: s2Tasks } = await supabase
      .from('ghl_task_reminders')
      .select('id, contact_id, contact_name, due_date, contact_timezone')
      .eq('snippet_2_sent', false)
      .lte('snippet_2_at', nowIso)
      .gte('due_date', graceIso)

    for (const task of s2Tasks ?? []) {
      const name = firstName(task.contact_name)
      const message =
        `Hi ${name},\n\n` +
        `Just a quick note before we reach out shortly. We'll be calling soon to go over your accident and discuss how people in similar situations are able to receive treatment and financial compensation. ` +
        `If now isn't a good time anymore, just let us know and we can set another time that works better.`

      const result = await sendGhlMessage(task.contact_id, message)
      if (result.ok) {
        await supabase.from('ghl_task_reminders').update({ snippet_2_sent: true }).eq('id', task.id)
        snippetResults.push(`✓ snippet-2 (15min) → ${task.contact_name ?? task.contact_id}`)
      } else {
        snippetResults.push(`✗ snippet-2 (15min) → ${task.contact_name ?? task.contact_id} (${result.error})`)
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

  // ── Dialer Callbacks: Slack 5 min before ───────────────────────────────────
  const CALLBACK_SLACK = process.env.SLACK_CALLBACK_REMINDERS
  const callbackResults: string[] = []
  const fiveFromNow = new Date(now.getTime() + 5 * 60 * 1000).toISOString()

  if (!CALLBACK_SLACK) {
    callbackResults.push('⚠ SLACK_CALLBACK_REMINDERS not set')
  }

  const { data: pendingCallbacks } = CALLBACK_SLACK ? await supabase
    .from('dialer_callbacks')
    .select('id, contact_id, contact_name, phone, firm, callback_at, callback_context, owner_rep')
    .eq('status', 'pending')
    .eq('notified', false)
    .lte('callback_at', fiveFromNow)
    .gte('callback_at', graceIso) : { data: null }

  for (const cb of pendingCallbacks ?? []) {
    const dueTime = new Date(cb.callback_at).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'America/Los_Angeles',
    })
    const dueDay = new Date(cb.callback_at).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      timeZone: 'America/Los_Angeles',
    })

    const firmLabel = cb.firm === 'lhp' ? 'LHP' : cb.firm === 'jm' ? 'J&M' : cb.firm === 'fears' ? 'Fears' : cb.firm ?? ''
    const notesLine = cb.callback_context ? `*Notes:* ${cb.callback_context.replace(/<[^>]*>/g, '').trim()}` : ''
    const repLine = cb.owner_rep ? `*Assigned:* ${cb.owner_rep}` : ''

    const message = {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:phone: *Dialer Callback in 5 Minutes*\n\n*${cb.contact_name}*${firmLabel ? ` (${firmLabel})` : ''}\n${cb.phone}\n${[notesLine, repLine].filter(Boolean).join('\n')}`,
          },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Scheduled for *${dueTime}* on ${dueDay}` }],
        },
      ],
    }

    try {
      const slackRes = await fetch(CALLBACK_SLACK!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      })
      if (slackRes.ok) {
        await supabase.from('dialer_callbacks').update({ notified: true }).eq('id', cb.id)
        callbackResults.push(`✓ callback ${cb.contact_name}`)
      } else {
        callbackResults.push(`✗ callback ${cb.contact_name} (slack ${slackRes.status})`)
      }
    } catch {
      callbackResults.push(`✗ callback ${cb.contact_name} (fetch error)`)
    }
  }

  // ── GHL SMS No-Reply: alert if outbound SMS unreplied after 5 min ──────────
  const SMS_NO_REPLY_SLACK = process.env.SLACK_SMS_NO_REPLY
  const smsNoReplyResults: string[] = []

  if (!SMS_NO_REPLY_SLACK) {
    smsNoReplyResults.push('⚠ SLACK_SMS_NO_REPLY not set')
  } else {
    const fiveAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()

    const { data: unreplied } = await supabase
      .from('ghl_sms_tracking')
      .select('id, contact_id, contact_name, phone, body, sent_at')
      .eq('direction', 'outbound')
      .eq('replied', false)
      .eq('notified', false)
      .lte('sent_at', fiveAgo)

    for (const msg of unreplied ?? []) {
      const sentTime = new Date(msg.sent_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: 'America/Los_Angeles',
      })
      const preview = (msg.body ?? '').slice(0, 100) + ((msg.body?.length ?? 0) > 100 ? '…' : '')

      const message = {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:warning: *No SMS Reply (5+ min)*\n\n*${msg.contact_name ?? 'Unknown'}*\n${msg.phone ?? ''}\n_"${preview}"_`,
            },
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `Sent at *${sentTime}* PT` }],
          },
        ],
      }

      try {
        const slackRes = await fetch(SMS_NO_REPLY_SLACK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        })
        if (slackRes.ok) {
          await supabase.from('ghl_sms_tracking').update({ notified: true }).eq('id', msg.id)
          smsNoReplyResults.push(`✓ no-reply alert → ${msg.contact_name ?? msg.phone}`)
        } else {
          smsNoReplyResults.push(`✗ no-reply alert → ${msg.contact_name ?? msg.phone} (slack ${slackRes.status})`)
        }
      } catch {
        smsNoReplyResults.push(`✗ no-reply alert → ${msg.contact_name ?? msg.phone} (fetch error)`)
      }
    }
  }

  return NextResponse.json({
    slackSent: results.length,
    snippetsSent: snippetResults.length,
    callbackNotifications: callbackResults.length,
    smsNoReplyAlerts: smsNoReplyResults.length,
    results,
    snippetResults,
    callbackResults,
    smsNoReplyResults,
  })
}
