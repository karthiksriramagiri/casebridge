import { NextRequest, NextResponse } from 'next/server'

const SLACK_WEBHOOK = process.env.SLACK_CONNECTED_WEBHOOK

export async function POST(req: NextRequest) {
  if (!SLACK_WEBHOOK) {
    return NextResponse.json({ error: 'No webhook configured' }, { status: 500 })
  }

  const { repName, leadName, phone, firm, stage, duration } = await req.json()

  const durationStr = duration
    ? `${Math.floor(duration / 60)}m ${duration % 60}s`
    : '0s'

  const message = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:white_check_mark: *Connected Call*\n\n*${leadName}*${firm ? ` (${firm})` : ''}\n${phone}${stage ? `\nStage: ${stage}` : ''}\nRep: *${repName}*\nAt: ${durationStr} into the call`,
        },
      },
    ],
  }

  try {
    const res = await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Slack ${res.status}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Slack fetch failed' }, { status: 500 })
  }
}
