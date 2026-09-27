import { STATUS_LABEL, type CandidateStatus } from './candidates'

/* Slack, for the review queue.

   Recruiting gets its own webhook rather than borrowing one of the operational
   channels — those are watched for leads and calls, and a hiring ping in the
   middle of them is noise. SLACK_WEBHOOK_URL is the fallback so the pings are
   never silently dropped when the dedicated hook is not set yet. */
const HOOK = process.env.SLACK_RECRUITING_WEBHOOK || process.env.SLACK_WEBHOOK_URL || ''

const SITE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://case-bridge.com').replace(/\/$/, '')

async function post(payload: object) {
  if (!HOOK) {
    console.warn('[venu:candidates] no Slack webhook configured — skipping notification')
    return
  }
  try {
    await fetch(HOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.error('[venu:candidates] Slack notification failed', e)
  }
}

export async function notifyNewSubmission(row: any) {
  const answers = row.answers ?? {}
  const facts = [
    answers.role && `*Seat:* ${answers.role}`,
    answers.experience && `*Experience:* ${answers.experience}`,
    answers.hours && `*Hours (ET):* ${answers.hours}`,
    answers.spanish && answers.spanish !== 'No' && `*Spanish:* ${answers.spanish}`,
    row.source && `*Source:* ${row.source}`,
  ].filter(Boolean).join('\n')

  await post({
    text: `New interview to review — ${row.name}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🎧 Interview ready to review' } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${row.name}* finished their interview with Venu.\n${facts}`,
        },
      },
      ...(answers.about ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: `_“${String(answers.about).slice(0, 500)}”_` },
      }] : []),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '▶ Listen to the interview' },
            url: `${SITE}/venu/admin/candidates?c=${row.token}`,
            style: 'primary',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'All candidates' },
            url: `${SITE}/venu/admin/candidates`,
          },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `${row.phone}${row.email ? ` · ${row.email}` : ''}` }],
      },
    ],
  })
}

export async function notifyDecision(row: any, decision: CandidateStatus, reviewer: string) {
  const qualified = decision === 'qualified'
  await post({
    text: `${row.name} — ${STATUS_LABEL[decision]}`,
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${qualified ? '✅' : '🚫'} *${row.name}* — ${STATUS_LABEL[decision]} by ${reviewer}.` +
          (qualified ? `\nNext: start the WhatsApp group on ${row.phone} and hand over their Team Center login.` : '') +
          (row.review_note ? `\n_${String(row.review_note).slice(0, 400)}_` : ''),
      },
    }],
  })
}

export async function notifyOnboarded(row: any, reviewer: string) {
  await post({
    text: `${row.name} onboarded to the Team Center`,
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🎉 *${row.name}* is onboarded by ${reviewer}.\n` +
          `Team Center login: \`${row.team_login_email}\`` +
          (row.whatsapp_group_url ? `\nWhatsApp group: ${row.whatsapp_group_url}` : ''),
      },
    }],
  })
}
