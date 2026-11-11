import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/* One brief, one thread.

   A brief landing is a message in the channel. Everything that happens to it
   afterwards — the status moves, the feedback, every comment — is a reply
   under that message. A card that goes three rounds used to leave six
   unconnected messages in the channel, and the only way to tell which
   belonged together was to read the titles.

   Five moments, all of them the same conversation:

     assigned Jason raised a brief       → the message that starts the thread
     status   either moved the card      → a reply
     review   Faisal finished a cut      → a reply
     revise   Jason finished his notes   → a reply
     comment  either one wrote a note    → a reply

   Threading needs the Web API, not a webhook: a webhook does not tell you
   the timestamp of the message it just posted, and without that timestamp
   there is nothing to reply to. So when a bot token and a channel are both
   configured, this posts with `chat.postMessage` and hands the caller back
   the `ts` to keep on the card.

   Without them it falls back to the webhooks and behaves as it did before —
   a separate message per event, routed to whoever is waiting. That is the
   older arrangement rather than a broken one: nothing is lost, it is just
   not gathered.

   The token and the webhooks live in the environment and never in the repo:
   each is a bearer credential, and anyone holding one can post as us. */
const clean = (v: string | undefined) => (v || '').trim().replace(/\\n$/, '')

const WEBHOOKS: Record<string, string> = {
  review: clean(process.env.SLACK_CREATIVE_REVIEW_WEBHOOK),
  revise: clean(process.env.SLACK_CREATIVE_REVISE_WEBHOOK),
}

/* Where the thread lives. One channel for the whole conversation about a
   brief, because a thread cannot span two: splitting the replies between
   Jason's channel and Faisal's would be the same scattering this exists to
   fix. A name works as well as an id — the bot holds chat:write.public.

   The per-person variables are still read, so a workspace that had them set
   keeps working; the single channel wins where it is set. */
const THREAD_CHANNEL = clean(process.env.SLACK_CREATIVE_CHANNEL)

const CHANNELS: Record<string, string> = {
  review: THREAD_CHANNEL || clean(process.env.SLACK_CREATIVE_REVIEW_CHANNEL),
  revise: THREAD_CHANNEL || clean(process.env.SLACK_CREATIVE_REVISE_CHANNEL),
}

/* The center's own bot token, falling back to the shared one.

   Kept separate on purpose. `SLACK_BOT_TOKEN` is read by the lead-claim
   handler in /api/slack/events, which has been dormant for as long as that
   variable has been empty; filling it in to get threading here would switch
   that back on as a side effect, in a completely different part of the
   product. A second variable turns on one thing at a time. */
const BOT_TOKEN = clean(process.env.SLACK_CREATIVE_BOT_TOKEN) || clean(process.env.SLACK_BOT_TOKEN)

/** Post through the Web API so the message can carry — and start — a thread. */
type Posted = { ok: boolean; ts?: string; error?: string; reparented: boolean }

async function postThreaded(channelId: string, text: string, blocks: unknown[], threadTs?: string): Promise<Posted> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { authorization: `Bearer ${BOT_TOKEN}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      channel: channelId,
      text,
      blocks,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      /* A reply stays in the thread. Broadcasting every comment back to the
         channel would undo the point of threading them. */
      reply_broadcast: false,
      unfurl_links: false,
    }),
  })
  const d = await res.json().catch(() => ({ ok: false, error: 'unreadable response' }))
  /* A thread whose parent has been deleted answers thread_not_found. The
     message still matters more than its placement, so it is posted again at
     the top level and the caller is told to forget the old timestamp. */
  if (!d.ok && /thread_not_found|message_not_found/.test(String(d.error)) && threadTs) {
    return { ...(await postThreaded(channelId, text, blocks)), reparented: true }
  }
  return { ok: !!d.ok, ts: d.ts as string | undefined, error: d.error as string | undefined, reparented: false }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  /* Which transport is live, without sending anything.

     Worth having its own answer: every other request to this route posts
     into a real channel, so there was no way to check the wiring without
     putting a test message in front of the team. */
  if (body.kind === 'ping') {
    return NextResponse.json({
      transport: BOT_TOKEN && (THREAD_CHANNEL || CHANNELS.revise) ? 'thread' : 'webhook',
      channel: THREAD_CHANNEL || CHANNELS.revise || null,
      botToken: !!BOT_TOKEN,
      webhooks: { review: !!WEBHOOKS.review, revise: !!WEBHOOKS.revise },
    })
  }
  const kind = ['revise', 'comment', 'assigned', 'status'].includes(body.kind) ? body.kind : 'review'

  /* A comment goes to whoever did not write it. Everything else goes to the
     channel its own transition names. */
  /* With one channel configured this is decided already. The routing below
     only matters on the old two-channel arrangement, where a message goes
     to whoever is waiting on it. */
  const channel = THREAD_CHANNEL ? 'revise' :
    kind === 'comment'  ? (body.author === 'admin' ? 'revise' : 'review') :
    kind === 'revise'   ? 'revise' :
    kind === 'assigned' ? 'revise' :
    kind === 'status'   ? 'revise' : 'review'

  const WEBHOOK = WEBHOOKS[channel]
  const CHANNEL_ID = CHANNELS[channel]
  /* Threaded when we can, webhook when we cannot. Neither configured is the
     only real failure. */
  const threaded = !!BOT_TOKEN && !!CHANNEL_ID
  if (!threaded && !WEBHOOK) {
    const key = channel === 'revise' ? 'SLACK_CREATIVE_REVISE_WEBHOOK' : 'SLACK_CREATIVE_REVIEW_WEBHOOK'
    return NextResponse.json(
      { sent: false, error: `${key} is not set, and no bot token + channel id to post with instead.` },
      { status: 200 },
    )
  }

  const title = String(body.title ?? 'A creative').trim()
  const by = String(body.by ?? 'The Creative Team').trim()
  const convention = String(body.convention ?? '').trim()
  const files = Number(body.files ?? 0)
  const url = String(body.url ?? '').trim()

  /* The detail line is assembled rather than templated so an empty field
     leaves no stray separator behind. */
  const detail = [
    convention && `\`${convention}\``,
    kind === 'assigned' && body.notes ? String(body.notes).split('\n')[0].slice(0, 160) : '',
    files > 0 && `${files} file${files === 1 ? '' : 's'} attached`,
  ].filter(Boolean).join(' · ')

  /* Slack renders a leading ">" as a quote block, so the comment itself is
     visible as the comment rather than as more of the sentence around it. */
  const quoted = String(body.text ?? '').trim().split('\n').map((l) => `> ${l}`).join('\n')
  const where = body.stage ? ` on *${String(body.stage).toUpperCase()}*` : ''

  /* What kind of brief it is reads first on an assignment — a Double Down
     and a New Concept are different jobs, and the type is the fastest way
     to tell which one has just landed. */
  const type = String(body.assignmentType ?? '').trim()

  const status = String(body.status ?? '').trim()

  /* Inside a thread the brief's name is already at the top, so a reply says
     what changed rather than repeating which card it is about. The title is
     kept in the fallback line, which is what a notification preview shows. */
  const threadReply = !!body.threadTs && !!THREAD_CHANNEL

  const headline =
    kind === 'comment'
      ? (threadReply
          ? `💬 *${by}*${where}\n${quoted}`
          : `*${title}* — new comment${where}\n${by} wrote:\n${quoted}`)
      : kind === 'status'
        ? (threadReply
            ? `↪︎ ${by} moved this to *${status}*`
            : `*${title}* — moved to *${status}* by ${by}`)
        : kind === 'revise'
          ? (threadReply
              ? `✅ ${by} finished the notes — ready for updates`
              : `*${title}* — feedback is done\n${by} finished reviewing this cut. Please check the notes and make the updates.`)
          : kind === 'assigned'
            ? `*Task assigned* — ${title}\n${by} raised ${type ? `a *${type}*` : 'a brief'} for you. It is on the board under *Assigned*.`
            : (threadReply
                ? `🎬 ${by} finished this cut — ready for review`
                : `*${title}* is ready for review\n${by} finished this cut and moved it to *Feedback Request*.`)

  const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text: headline } }]
  if (detail && !threadReply) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: detail }] })
  if (url && !threadReply) {
    blocks.push({
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Creative Center' }, url }],
    })
  }

  /* The fallback line is what a notification preview and a screen reader
     get, so it has to say the whole thing on its own. */
  const fallback =
    kind === 'comment'  ? `${by} commented on ${title}` :
    kind === 'status'   ? `${title} — moved to ${status}` :
    kind === 'revise'   ? `${title} — feedback is done, ready for updates` :
    kind === 'assigned' ? `Task assigned: ${title}` :
                          `${title} is ready for Jason's review`

  try {
    if (threaded) {
      /* The card's own thread in THIS channel, if it has started one. A
         brief has at most one per channel: a thread cannot span two, so the
         caller sends both and the channel we picked decides which to use. */
      const parent = String((channel === 'review' ? body.threadTsReview : body.threadTs) ?? '').trim() || undefined
      const posted = await postThreaded(CHANNEL_ID, fallback, blocks, parent)
      if (!posted.ok) {
        return NextResponse.json({ sent: false, error: posted.error ?? 'Slack refused the message.' }, { status: 200 })
      }
      /* `ts` goes back to the caller, which keeps it on the card so the next
         message about this brief lands underneath this one. On a reply the
         parent is unchanged, so only a new thread is worth reporting. */
      return NextResponse.json({
        sent: true,
        threaded: true,
        channelKey: channel,
        /* A reparented message started a new thread, so its own ts is the
           one to keep. */
        ts: parent && !posted.reparented ? undefined : posted.ts,
      })
    }

    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: fallback, blocks }),
    })
    if (!res.ok) {
      /* Slack answers with a plain-text reason — worth passing back, but a
         failed notification must never fail the status change that triggered
         it, so this still returns 200. */
      return NextResponse.json({ sent: false, error: (await res.text()).slice(0, 200) }, { status: 200 })
    }
    return NextResponse.json({ sent: true, threaded: false })
  } catch (e) {
    return NextResponse.json({ sent: false, error: (e as Error).message }, { status: 200 })
  }
}
