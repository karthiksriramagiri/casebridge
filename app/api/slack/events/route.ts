import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || ''
const SLACK_NR_LEADS_CHANNEL = process.env.SLACK_NR_LEADS_CHANNEL || ''

// Verify the request came from Slack
function verifySlackSignature(body: string, timestamp: string, signature: string): boolean {
  if (!SLACK_SIGNING_SECRET) return true // skip in dev
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (age > 300) return false // reject requests older than 5 min
  const baseString = `v0:${timestamp}:${body}`
  const expected = 'v0=' + crypto.createHmac('sha256', SLACK_SIGNING_SECRET).update(baseString).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const timestamp = req.headers.get('x-slack-request-timestamp') || ''
  const signature = req.headers.get('x-slack-signature') || ''

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)

  // Slack URL verification challenge
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge })
  }

  const event = payload.event
  if (!event) return NextResponse.json({ ok: true })

  // Only track reactions in the NR leads channel
  if (event.type === 'reaction_added') {
    const channel = event.item?.channel
    if (SLACK_NR_LEADS_CHANNEL && channel !== SLACK_NR_LEADS_CHANNEL) {
      return NextResponse.json({ ok: true })
    }

    const messageTsStr: string = event.item?.ts || ''
    const eventTsStr: string   = event.event_ts || ''
    const slackUserId: string  = event.user || ''

    if (!messageTsStr || !eventTsStr || !slackUserId) {
      return NextResponse.json({ ok: true })
    }

    // Slack ts format: "1234567890.123456" — seconds since epoch
    const messagePostedAt = new Date(parseFloat(messageTsStr) * 1000)
    const reactedAt       = new Date(parseFloat(eventTsStr) * 1000)
    const responseSeconds = Math.round((reactedAt.getTime() - messagePostedAt.getTime()) / 1000)

    // Look up worker by Slack user ID
    const { data: profile } = await admin
      .from('profiles')
      .select('id, name')
      .eq('slack_user_id', slackUserId)
      .maybeSingle()

    await admin.from('lead_response_events').insert({
      contact_id:         messageTsStr, // use message ts as identifier (no contact link needed)
      worker_id:          profile?.id || null,
      worker_name:        profile?.name || slackUserId,
      event_type:         'slack_reaction',
      lead_first_seen_at: messagePostedAt.toISOString(),
      responded_at:       reactedAt.toISOString(),
      response_seconds:   responseSeconds,
    })
  }

  return NextResponse.json({ ok: true })
}
