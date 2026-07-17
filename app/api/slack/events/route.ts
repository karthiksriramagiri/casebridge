import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || ''
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''
const SLACK_NR_LEAD_CHANNELS = new Set(
  (process.env.SLACK_NR_LEADS_CHANNELS || '').split(',').map(s => s.trim()).filter(Boolean)
)

async function getSlackDisplayName(userId: string): Promise<string> {
  if (!SLACK_BOT_TOKEN) return userId
  const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  })
  const d = await res.json()
  return d.user?.profile?.display_name || d.user?.real_name || userId
}

async function postThreadReply(channel: string, threadTs: string, text: string) {
  if (!SLACK_BOT_TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, thread_ts: threadTs, text }),
  })
}

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

  // Handle URL verification before signature check (challenge is not sensitive)
  let payload: any
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge })
  }

  const timestamp = req.headers.get('x-slack-request-timestamp') || ''
  const signature = req.headers.get('x-slack-signature') || ''

  // TODO: re-enable after confirming events flow
  // if (!verifySlackSignature(rawBody, timestamp, signature)) {
  //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  // }

  console.log('[slack/events] payload type:', payload.type, 'event type:', payload.event?.type, 'channel:', payload.event?.item?.channel)

  const event = payload.event
  if (!event) return NextResponse.json({ ok: true })

  // Capture Lead Bot messages as new lead sightings
  if (event.type === 'message' && !event.subtype && event.bot_profile) {
    const botName = (event.bot_profile?.name || event.username || '').toLowerCase()
    if (botName.includes('lead') && event.channel && event.ts) {
      const channel = event.channel
      if (SLACK_NR_LEAD_CHANNELS.size === 0 || SLACK_NR_LEAD_CHANNELS.has(channel)) {
        const postedAt = new Date(parseFloat(event.ts) * 1000).toISOString()
        // Extract contact name from message text if possible
        const nameMatch = (event.text || '').match(/Name\s*:\s*([^\n]+)/i)
        const contactName = nameMatch ? nameMatch[1].trim() : null
        await admin.from('nr_lead_sightings').upsert(
          {
            contact_id:     event.ts, // Slack message ts as unique ID
            contact_name:   contactName,
            first_seen_at:  postedAt,
            opp_created_at: postedAt,
          },
          { onConflict: 'contact_id', ignoreDuplicates: true }
        )
      }
    }
    return NextResponse.json({ ok: true })
  }

  // Only track reactions in the NR leads channel
  if (event.type === 'reaction_added') {
    const channel = event.item?.channel
    if (SLACK_NR_LEAD_CHANNELS.size > 0 && !SLACK_NR_LEAD_CHANNELS.has(channel)) {
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
      contact_id:         messageTsStr,
      worker_id:          profile?.id || null,
      worker_name:        profile?.name || slackUserId,
      event_type:         'slack_reaction',
      lead_first_seen_at: messagePostedAt.toISOString(),
      responded_at:       reactedAt.toISOString(),
      response_seconds:   responseSeconds,
    })

    // ── Lead claim winner announcement (✅ only) ──────────────────────────────
    if (event.reaction === 'white_check_mark') {
      const { error: claimError } = await admin
        .from('lead_claims')
        .insert({ message_ts: messageTsStr, channel_id: channel, claimed_by_slack_id: slackUserId })

      if (!claimError) {
        // First to claim — announce winner in thread
        const displayName = profile?.name || await getSlackDisplayName(slackUserId)
        await postThreadReply(channel, messageTsStr, `✅ *${displayName}* got the lead!`)
      } else if (claimError.code === '23505') {
        // Already claimed — look up who got it first
        const { data: existing } = await admin
          .from('lead_claims')
          .select('claimed_by_slack_id')
          .eq('message_ts', messageTsStr)
          .single()
        if (existing) {
          const { data: firstProfile } = await admin
            .from('profiles')
            .select('name')
            .eq('slack_user_id', existing.claimed_by_slack_id)
            .maybeSingle()
          const firstName = firstProfile?.name || await getSlackDisplayName(existing.claimed_by_slack_id)
          await postThreadReply(channel, messageTsStr, `⚡ *${firstName}* already claimed this lead first.`)
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
