import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/* Telling the other person it is their turn.

   Three moments, and they share two channels — because a channel belongs to
   a person, not to an event:

     review   Faisal finished a cut   → Jason's channel
     revise   Jason finished notes    → Faisal's channel
     comment  either one wrote a note → the *other* person's channel

   Which is why a comment routes on its author rather than carrying its own
   destination: a note is addressed to whoever did not write it. Each person's
   channel therefore holds only things waiting on them, rather than a feed of
   everything that happened.

   Both webhooks live in the environment and never in the repo: a webhook is a
   bearer credential, and anyone holding it can post into the channel. */
const clean = (v: string | undefined) => (v || '').trim().replace(/\\n$/, '')

const WEBHOOKS: Record<string, string> = {
  review: clean(process.env.SLACK_CREATIVE_REVIEW_WEBHOOK),
  revise: clean(process.env.SLACK_CREATIVE_REVISE_WEBHOOK),
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const kind = body.kind === 'revise' || body.kind === 'comment' ? body.kind : 'review'

  /* A comment goes to whoever did not write it. Everything else goes to the
     channel its own transition names. */
  const channel =
    kind === 'comment' ? (body.author === 'admin' ? 'revise' : 'review') :
    kind === 'revise'  ? 'revise' : 'review'

  const WEBHOOK = WEBHOOKS[channel]
  if (!WEBHOOK) {
    const key = channel === 'revise' ? 'SLACK_CREATIVE_REVISE_WEBHOOK' : 'SLACK_CREATIVE_REVIEW_WEBHOOK'
    return NextResponse.json({ sent: false, error: `${key} is not set.` }, { status: 200 })
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
    files > 0 && `${files} file${files === 1 ? '' : 's'} attached`,
  ].filter(Boolean).join(' · ')

  /* Slack renders a leading ">" as a quote block, so the comment itself is
     visible as the comment rather than as more of the sentence around it. */
  const quoted = String(body.text ?? '').trim().split('\n').map((l) => `> ${l}`).join('\n')
  const where = body.stage ? ` on *${String(body.stage).toUpperCase()}*` : ''

  const headline =
    kind === 'comment'
      ? `*${title}* — new comment${where}\n${by} wrote:\n${quoted}`
      : kind === 'revise'
        ? `*${title}* — feedback is done\n${by} finished reviewing this cut. Please check the notes and make the updates.`
        : `*${title}* is ready for review\n${by} finished this cut and moved it to *Feedback Request*.`

  const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text: headline } }]
  if (detail) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: detail }] })
  if (url) {
    blocks.push({
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Creative Center' }, url }],
    })
  }

  try {
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        /* The fallback line is what a notification preview and a screen
           reader get, so it has to say the whole thing on its own. */
        text:
          kind === 'comment' ? `${by} commented on ${title}` :
          kind === 'revise'  ? `${title} — feedback is done, ready for updates` :
                               `${title} is ready for Jason's review`,
        blocks,
      }),
    })
    if (!res.ok) {
      /* Slack answers with a plain-text reason — worth passing back, but a
         failed notification must never fail the status change that triggered
         it, so this still returns 200. */
      return NextResponse.json({ sent: false, error: (await res.text()).slice(0, 200) }, { status: 200 })
    }
    return NextResponse.json({ sent: true })
  } catch (e) {
    return NextResponse.json({ sent: false, error: (e as Error).message }, { status: 200 })
  }
}
