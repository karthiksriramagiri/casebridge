/* Telling the floor a case has gone MIA.

   Lifted out of app/api/mia/route.ts so that adding a case and back-filling
   the board can post the identical message. A second implementation written
   for the backfill would have proved only that the backfill worked — the
   whole point of checking is to exercise the path the board actually uses.
*/

/* ── Telling the floor ─────────────────────────────────────────────────────

   A case only lands on this board because somebody noticed it had gone
   quiet, and the person who should ring it is usually not the person who
   noticed. Posting the moment it is added is what turns the board from a
   list somebody has to remember to open into something that reaches the
   closer the same day.

   Its own webhook, not shared with another channel. Webhooks here are
   per-channel and consolidating two onto one silently redirects the other's
   messages.

   The trailing-newline strip is deliberate: a value pasted into an env file
   through a shell heredoc picks one up, and Slack answers a URL with a
   newline in it with `no_service`, which reads as a dead webhook. */
const MIA_WEBHOOK = (process.env.SLACK_MIA_WEBHOOK || '').trim().replace(/\\n$/, '')

const BOARD_URL = 'https://teams.case-bridge.com/teams/mia'

/** What happened to the post. The caller adding a card ignores this — the
 *  card is the record and a Slack outage must not make adding one fail — but
 *  anything checking whether the channel is actually wired up needs to be
 *  able to tell a delivered message from a silently skipped one. */
export type AnnounceResult =
  | { ok: true }
  | { ok: false; reason: 'no-webhook' | 'rejected' | 'failed'; detail?: string }

/** Post that a case went on the board. Never throws: the card is the record,
 *  and a Slack outage must not make adding one fail. */
export async function announce(c: {
  name: string
  phone: string | null
  firmName: string | null
  closer: string | null
  note: string
  addedBy: string
}): Promise<AnnounceResult> {
  /* The failure that hid for weeks: the variable was set locally and never
     in production, so every add returned here and the channel stayed silent
     while the board filled up. Named rather than a bare `return`. */
  if (!MIA_WEBHOOK) return { ok: false, reason: 'no-webhook' }

  /* Who closed it, as a plain labelled field. Stated flat rather than as an
     instruction: the channel already knows the closer calls first, and a
     message that re-explains the rule every time reads as noise by the
     third one. */
  const lead = `Closer: ${c.closer ? `*${c.closer}*` : '_not recorded_'}`

  const facts = [
    c.phone ? `📞 ${c.phone}` : null,
    c.firmName,
  ].filter(Boolean).join('  ·  ')

  const blocks: unknown[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `🔴 *MIA — ${c.name}*\n${lead}` },
    },
  ]
  if (facts) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: facts }] })
  }
  if (c.note.trim()) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `>${c.note.trim().replace(/\n/g, '\n>')}` } })
  }
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Added by ${c.addedBy}  ·  <${BOARD_URL}|Open the MIA board>` }],
  })

  try {
    /* A deadline, so a slow Slack cannot hold the request that is adding the
       card. Five seconds is far longer than a webhook normally takes. */
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(MIA_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // `text` is the notification and the fallback for anywhere blocks do
      // not render — a push notification reading "undefined" is worse than
      // one that simply says what happened.
      body: JSON.stringify({ text: `MIA — ${c.name}`, blocks }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (res.ok) return { ok: true }
    const detail = await res.text().catch(() => '')
    console.error('[mia] slack webhook returned', res.status, detail)
    return { ok: false, reason: 'rejected', detail: `${res.status} ${detail}`.trim() }
  } catch (e) {
    const detail = (e as Error).message
    console.error('[mia] slack webhook failed:', detail)
    return { ok: false, reason: 'failed', detail }
  }
}
