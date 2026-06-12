import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLACK_WEBHOOK = process.env.SLACK_TASK_REMINDERS
const GHL_API_KEY = process.env.GHL_API_KEY
// Optional: set this to a GHL snippet/template ID to send a template instead of a plain message
const GHL_SNIPPET_ID = process.env.GHL_CALL_SNIPPET_ID

export async function GET(request: NextRequest) {
  // Verify cron secret via query param or header
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
  // Grace window: allow up to 30 minutes past due (handles late cron runs)
  const graceIso = new Date(now.getTime() - 30 * 60 * 1000).toISOString()

  // ── GHL snippet sends (15-20 min before call) ──────────────────────────────
  const snippetResults: string[] = []

  if (GHL_API_KEY) {
    const { data: snippetTasks } = await supabase
      .from('ghl_task_reminders')
      .select('*')
      .eq('snippet_sent', false)
      .lte('snippet_at', nowIso)
      .gte('due_date', graceIso)

    for (const task of snippetTasks ?? []) {
      try {
        const body: Record<string, string> = {
          type: 'SMS',
          contactId: task.contact_id,
        }

        if (GHL_SNIPPET_ID) {
          body.templateId = GHL_SNIPPET_ID
        } else {
          const dueTime = new Date(task.due_date).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Los_Angeles',
          })
          body.message = `Reminder: your onboarding call is coming up at ${dueTime} PT. Please be ready!`
        }

        const ghlRes = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${GHL_API_KEY}`,
            Version: '2021-07-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (ghlRes.ok) {
          await supabase
            .from('ghl_task_reminders')
            .update({ snippet_sent: true })
            .eq('id', task.id)
          snippetResults.push(`✓ snippet → ${task.contact_name ?? task.contact_id}`)
        } else {
          const errText = await ghlRes.text()
          snippetResults.push(`✗ snippet → ${task.contact_name ?? task.contact_id} (${ghlRes.status}: ${errText.slice(0, 80)})`)
        }
      } catch (err) {
        snippetResults.push(`✗ snippet → ${task.contact_name ?? task.contact_id} (fetch error)`)
      }
    }
  }

  // ── Slack notifications (5 min before call) ────────────────────────────────
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
          elements: [
            {
              type: 'mrkdwn',
              text: `Due at *${dueTime}* on ${dueDate}`,
            },
          ],
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
        await supabase
          .from('ghl_task_reminders')
          .update({ notified: true })
          .eq('id', task.id)
        results.push(`✓ ${task.title}`)
      } else {
        results.push(`✗ ${task.title} (slack ${slackRes.status})`)
      }
    } catch (err) {
      results.push(`✗ ${task.title} (fetch error)`)
    }
  }

  return NextResponse.json({ sent: results.length, snippets: snippetResults.length, results, snippetResults })
}
