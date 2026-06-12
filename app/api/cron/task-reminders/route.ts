import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLACK_WEBHOOK = process.env.SLACK_TASK_REMINDERS
const GHL_API_KEY = process.env.GHL_API_KEY

// Snippet template IDs — set these env vars once you have the codes
const GHL_SNIPPET_1_ID = process.env.GHL_SNIPPET_1_ID // 1 hour before
const GHL_SNIPPET_2_ID = process.env.GHL_SNIPPET_2_ID // 30 min before
const GHL_SNIPPET_3_ID = process.env.GHL_SNIPPET_3_ID // 9AM day-of

async function sendGhlSnippet(contactId: string, templateId: string): Promise<{ ok: boolean; error?: string }> {
  if (!GHL_API_KEY) return { ok: false, error: 'No GHL API key' }

  const res = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GHL_API_KEY}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'SMS',
      contactId,
      templateId,
    }),
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
  if (GHL_SNIPPET_1_ID) {
    const { data: s1Tasks } = await supabase
      .from('ghl_task_reminders')
      .select('id, contact_id, contact_name')
      .eq('snippet_1_sent', false)
      .lte('snippet_1_at', nowIso)
      .gte('due_date', graceIso)

    for (const task of s1Tasks ?? []) {
      const result = await sendGhlSnippet(task.contact_id, GHL_SNIPPET_1_ID)
      if (result.ok) {
        await supabase.from('ghl_task_reminders').update({ snippet_1_sent: true }).eq('id', task.id)
        snippetResults.push(`✓ snippet-1 → ${task.contact_name ?? task.contact_id}`)
      } else {
        snippetResults.push(`✗ snippet-1 → ${task.contact_name ?? task.contact_id} (${result.error})`)
      }
    }
  }

  // ── Snippet 2: 30 min before ───────────────────────────────────────────────
  if (GHL_SNIPPET_2_ID) {
    const { data: s2Tasks } = await supabase
      .from('ghl_task_reminders')
      .select('id, contact_id, contact_name')
      .eq('snippet_2_sent', false)
      .lte('snippet_2_at', nowIso)
      .gte('due_date', graceIso)

    for (const task of s2Tasks ?? []) {
      const result = await sendGhlSnippet(task.contact_id, GHL_SNIPPET_2_ID)
      if (result.ok) {
        await supabase.from('ghl_task_reminders').update({ snippet_2_sent: true }).eq('id', task.id)
        snippetResults.push(`✓ snippet-2 → ${task.contact_name ?? task.contact_id}`)
      } else {
        snippetResults.push(`✗ snippet-2 → ${task.contact_name ?? task.contact_id} (${result.error})`)
      }
    }
  }

  // ── Snippet 3: 9 AM day-of (next-day calls only) ───────────────────────────
  if (GHL_SNIPPET_3_ID) {
    const { data: s3Tasks } = await supabase
      .from('ghl_task_reminders')
      .select('id, contact_id, contact_name')
      .eq('snippet_3_sent', false)
      .not('snippet_3_at', 'is', null)
      .lte('snippet_3_at', nowIso)
      .gte('due_date', nowIso) // call hasn't happened yet

    for (const task of s3Tasks ?? []) {
      const result = await sendGhlSnippet(task.contact_id, GHL_SNIPPET_3_ID)
      if (result.ok) {
        await supabase.from('ghl_task_reminders').update({ snippet_3_sent: true }).eq('id', task.id)
        snippetResults.push(`✓ snippet-3 → ${task.contact_name ?? task.contact_id}`)
      } else {
        snippetResults.push(`✗ snippet-3 → ${task.contact_name ?? task.contact_id} (${result.error})`)
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
