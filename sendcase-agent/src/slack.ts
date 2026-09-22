// Slack notification when a case is filled and ready for review.
//
// NOTE: this project has many distinct Slack webhooks, one per channel. This
// service uses its own (SLACK_SENDCASE_WEBHOOK) rather than reusing another
// channel's URL — set it to whichever channel should receive review pings.

const WEBHOOK = () =>
  (process.env.SLACK_SENDCASE_WEBHOOK ?? process.env.SLACK_WEBHOOK_URL ?? '').trim()

export interface ReviewNotice {
  contactId: string
  contactName: string | null
  firm: string | null
  written: Record<string, string>
  skipped: Record<string, string>
  flags: string[]
  summary: string | null
}

export async function notifyReady(n: ReviewNotice): Promise<void> {
  const url = WEBHOOK()
  if (!url) {
    console.warn('[slack] no webhook configured; skipping notification')
    return
  }

  const name = n.contactName ?? n.contactId
  const writtenCount = Object.keys(n.written).length
  const skippedCount = Object.keys(n.skipped).length
  const sendcaseUrl = process.env.SENDCASE_URL ?? 'https://case-bridge.com/sendcase'

  const lines = [
    `*${name}*${n.firm ? ` — ${n.firm}` : ''}`,
    `Filled *${writtenCount}* field${writtenCount === 1 ? '' : 's'}` +
      (skippedCount ? ` · ${skippedCount} left alone (already had values)` : ''),
  ]
  if (n.summary) lines.push(`\n${n.summary}`)
  if (n.flags.length) lines.push(`\n:warning: *Needs a look:*\n• ${n.flags.join('\n• ')}`)

  const payload = {
    text: `Intake ready for review — ${name}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `:white_check_mark: *Intake ready for review*` },
      },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Review on /sendcase' },
            url: sendcaseUrl,
          },
        ],
      },
    ],
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) console.error('[slack] post failed', res.status, await res.text())
  } catch (err) {
    console.error('[slack] post threw', err)
  }
}

export async function notifyError(contactId: string, name: string | null, message: string) {
  const url = WEBHOOK()
  if (!url) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:x: Intake fill failed for ${name ?? contactId}: ${message}`,
      }),
    })
  } catch {
    // notification failure must not mask the original error
  }
}
