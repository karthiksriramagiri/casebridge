import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   The day's kill list and launch list, in Slack.

   Both lists are the same shape of work and the same handover twice a day:
   Jason decides what comes off and what goes up, somebody else opens Ads
   Manager and does it, and Jason wants to know when it is done. Three things
   used to be missing from that — the launch list had no announcement at all,
   the kill list's announcement had no answer, and nothing tied the answer to
   the question.

   So each day's list is a thread:

     ready   Jason says the list is ready   → the message that starts it
     done    the K-Team says it is carried out → a reply underneath

   The thread's timestamp is kept in the database rather than in the page,
   because the two halves are posted by two different people on two different
   machines. `creative_day_threads` holds one row per day per board.

   Threading needs the Web API — a webhook never tells you the timestamp of
   the message it just posted, so there would be nothing to reply to. With a
   bot token and a channel this posts through `chat.postMessage`; without
   them it falls back to the kill webhook and posts a flat message, which is
   what it did before and is better than silence.
   ═══════════════════════════════════════════════════════════════════════════ */

const clean = (v: string | undefined) => (v || '').trim().replace(/\\n$/, '')

/* One channel for both lists: they are the same job and the same audience,
   and the thread keeps them apart inside it. */
const CHANNEL = clean(process.env.SLACK_CREATIVE_OPS_CHANNEL)
const BOT_TOKEN = clean(process.env.SLACK_CREATIVE_BOT_TOKEN) || clean(process.env.SLACK_BOT_TOKEN)
/* The kill list's original webhook, still the fallback when there is no bot
   token to thread with. */
const FALLBACK_WEBHOOK = clean(process.env.SLACK_CREATIVE_KILL_WEBHOOK)

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

type Board = 'kill' | 'launch'
type Phase = 'ready' | 'done'
type Group = { firm: string; adsets: { name: string; ads: string[] }[] }

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key) : null
}

/** The day's thread for this board, if one has been started. */
async function readThread(day: string, board: Board) {
  const supabase = db()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('creative_day_threads')
    .select('thread_ts, channel')
    .eq('day', day).eq('board', board).maybeSingle()
  /* A missing table is a migration nobody has run yet, not an outage: the
     message still goes out, just unthreaded. */
  if (error) return null
  return data?.thread_ts ? { ts: String(data.thread_ts), channel: String(data.channel || CHANNEL) } : null
}

async function writeThread(day: string, board: Board, ts: string, channel: string) {
  const supabase = db()
  if (!supabase) return false
  const { error } = await supabase
    .from('creative_day_threads')
    .upsert({ day, board, thread_ts: ts, channel, updated_at: new Date().toISOString() }, { onConflict: 'day,board' })
  return !error
}

async function post(text: string, blocks: unknown[], threadTs?: string) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { authorization: `Bearer ${BOT_TOKEN}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      channel: CHANNEL,
      text,
      blocks,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      /* The "done" reply is broadcast back to the channel. It is the one
         message in the thread that someone is waiting on — Jason is not
         sitting inside a thread watching for it — and a reply nobody sees
         is the same as no reply. */
      ...(threadTs ? { reply_broadcast: true } : {}),
      unfurl_links: false,
    }),
  })
  const d = await res.json().catch(() => ({ ok: false, error: 'unreadable response' }))
  return { ok: !!d.ok, ts: d.ts as string | undefined, error: d.error as string | undefined }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  /* Which transport is live, without posting anything. */
  if (body.kind === 'ping') {
    return NextResponse.json({
      transport: BOT_TOKEN && CHANNEL ? 'thread' : FALLBACK_WEBHOOK ? 'webhook' : 'none',
      channel: CHANNEL || null,
      botToken: !!BOT_TOKEN,
    })
  }

  const board: Board = body.board === 'launch' ? 'launch' : 'kill'
  const phase: Phase = body.phase === 'done' ? 'done' : 'ready'
  const day = String(body.day ?? '').slice(0, 10)
  const dateLabel = String(body.dateLabel ?? day).trim()
  const count = Number(body.count ?? 0)
  const freed = Number(body.freed ?? 0)
  const budget = Number(body.budget ?? 0)
  const by = String(body.by ?? (phase === 'ready' ? 'Jason' : 'The K-Team')).trim()
  const url = String(body.url ?? '').trim()
  const groups: Group[] = Array.isArray(body.groups) ? body.groups : []

  if (phase === 'ready' && count <= 0) {
    return NextResponse.json(
      { sent: false, error: `There is nothing on the ${board === 'kill' ? 'kill' : 'launch'} list.` },
      { status: 200 },
    )
  }

  const noun = board === 'kill' ? 'Kill list' : 'Launch list'
  const verb = board === 'kill' ? 'turn off' : 'launch'

  /* One line per ad set with its cuts under it — the same shape the page
     groups them in, because the person reading this is about to open those
     ad sets one at a time. Capped: Slack refuses a block over 3000
     characters, and a list that long is worked off the page anyway. */
  const lines: string[] = []
  let shown = 0
  for (const g of groups) {
    lines.push(`*${String(g.firm ?? '').trim() || 'Unknown firm'}*`)
    for (const set of g.adsets ?? []) {
      if (shown >= 25) continue
      lines.push(`• \`${set.name}\` — ${set.ads.length} ad${set.ads.length === 1 ? '' : 's'}`)
      shown += set.ads.length
    }
  }
  const more = count - shown
  if (more > 0) lines.push(`…and ${more} more ad${more === 1 ? '' : 's'} on the page.`)

  const headline = phase === 'ready'
    ? `*${noun} is ready to go* — ${count} ad${count === 1 ? '' : 's'} to ${verb}` +
      (dateLabel ? ` · ${dateLabel}` : '') +
      `\n${by} has finished the list. Do these in Ads Manager, then tick them off in the Creative Center.`
    : `✅ *${noun} done* — ${by} has carried out ${count > 0 ? `${count} ad${count === 1 ? '' : 's'}` : 'the list'}` +
      (dateLabel ? ` · ${dateLabel}` : '') +
      `\nOver to Jason to review.`

  const detail = board === 'kill'
    ? (freed > 0
        ? `${usd(freed)}/day freed once the whole ad set is off`
        : 'No whole ad set goes off, so no daily budget is freed')
    : (budget > 0 ? `${usd(budget)}/day going up` : 'No daily budget set on these yet')

  const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text: headline } }]
  if (phase === 'ready' && lines.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 2900) } })
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: detail }] })
  if (url && phase === 'ready') {
    blocks.push({
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: `Open the ${noun.toLowerCase()}` }, url }],
    })
  }

  const fallback = phase === 'ready'
    ? `${noun} is ready — ${count} ad${count === 1 ? '' : 's'} to ${verb}`
    : `${noun} done — over to Jason to review`

  try {
    if (BOT_TOKEN && CHANNEL) {
      /* A "done" goes under that day's "ready". If there is no thread —
         nobody pressed ready, or the table is not there yet — it posts on
         its own rather than being swallowed. */
      const existing = phase === 'done' ? await readThread(day, board) : null
      const sent = await post(fallback, blocks, existing?.ts)
      if (!sent.ok) return NextResponse.json({ sent: false, error: sent.error ?? 'Slack refused the message.' }, { status: 200 })

      if (phase === 'ready' && sent.ts) {
        const kept = await writeThread(day, board, sent.ts, CHANNEL)
        /* Saying so matters: without the row the "done" reply cannot find
           its parent, and the two messages drift apart again. */
        return NextResponse.json({ sent: true, threaded: true, ts: sent.ts, threadKept: kept })
      }
      return NextResponse.json({ sent: true, threaded: true, repliedTo: existing?.ts ?? null })
    }

    if (!FALLBACK_WEBHOOK) {
      return NextResponse.json(
        { sent: false, error: 'No Slack channel configured — set SLACK_CREATIVE_OPS_CHANNEL and a bot token, or SLACK_CREATIVE_KILL_WEBHOOK.' },
        { status: 200 },
      )
    }
    const res = await fetch(FALLBACK_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: fallback, blocks }),
    })
    if (!res.ok) return NextResponse.json({ sent: false, error: (await res.text()).slice(0, 200) }, { status: 200 })
    return NextResponse.json({ sent: true, threaded: false })
  } catch (e) {
    return NextResponse.json({ sent: false, error: (e as Error).message }, { status: 200 })
  }
}
