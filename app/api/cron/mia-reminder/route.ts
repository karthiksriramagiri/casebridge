import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { onShiftAt, inCallWindow, pickForHour, SHIFT_TZ, WINDOW_TZ } from '@/lib/mia/shifts'

export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   The hourly nudge to work the MIA board.

   One rep, one hour, the whole board. Not a case each — a case each is a
   queue, and the board already is one; what was missing was somebody whose
   job it was to pick up the phone this hour.

   Three gates, in order, and each one is a reason to say nothing:

     the clock    9am-9pm Pacific. Outside it nobody is called, so nobody
                  is reminded to call.
     the floor    somebody has to be on shift. An unassigned reminder is a
                  message everyone reads and nobody owns.
     the board    no cases, no nudge. Nagging about an empty board is how a
                  channel teaches people to ignore it.

   The cron fires every hour of the day and the window is enforced here
   rather than in the schedule. A Vercel cron is UTC, and a Pacific window
   written as UTC hours is wrong for the two weeks a year the offset moves.
   ═══════════════════════════════════════════════════════════════════════════ */

const WEBHOOK = (process.env.SLACK_MIA_WEBHOOK || '').trim().replace(/\\n$/, '')
const BOARD_URL = 'https://teams.case-bridge.com/teams/mia'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** How long a case has been sitting, in words a rep reads at a glance. */
function waiting(since: string | null): string {
  if (!since) return ''
  const days = Math.floor((Date.now() - Date.parse(since)) / 86_400_000)
  if (!Number.isFinite(days) || days < 0) return ''
  return days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`
}

export async function GET(req: NextRequest) {
  /* Vercel sends the secret; a browser hitting this by accident must not
     post to the channel. */
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const at = (tz: string) => now.toLocaleString('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
  })

  if (!inCallWindow(now)) {
    return NextResponse.json({ sent: false, reason: 'outside the 9am-9pm Pacific window', pacific: at(WINDOW_TZ) })
  }

  const onShift = onShiftAt(now)
  const rep = pickForHour(onShift, now)
  if (!rep) {
    return NextResponse.json({ sent: false, reason: 'nobody on shift', eastern: at(SHIFT_TZ) })
  }

  const db = admin()
  const [{ data: cases, error }, { data: profiles }] = await Promise.all([
    db.from('mia_cases')
      .select('name, phone, firm_id, closer, created_at')
      .eq('status', 'mia')
      .order('created_at', { ascending: true }),
    db.from('profiles').select('name, slack_user_id'),
  ])

  if (error) {
    console.error('[cron:mia-reminder]', error.message)
    return NextResponse.json({ sent: false, reason: error.message }, { status: 500 })
  }
  if (!cases?.length) {
    return NextResponse.json({ sent: false, reason: 'board is empty', rep: rep.name })
  }

  const { data: firms } = await db.from('firms').select('id, name')
  const firmName = (id: string | null) =>
    id ? ((firms ?? []).find((f: any) => f.id === id)?.name ?? null) : null

  /* A real mention where we have the id, the plain name where we do not.
     Only one rep has a slack_user_id today, so most of these are names —
     which still reads correctly, it just does not buzz their phone. */
  const slackId = (profiles ?? []).find(
    (p: any) => String(p.name || '').trim().toLowerCase() === rep.name.toLowerCase(),
  )?.slack_user_id
  const mention = slackId ? `<@${slackId}>` : `*${rep.name}*`

  const lines = cases.map(c => {
    const bits = [c.phone, firmName(c.firm_id), waiting(c.created_at)].filter(Boolean)
    return `• *${c.name}* — ${bits.join('  ·  ')}`
  })

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🔴 *MIA calls — ${at(WINDOW_TZ)} PT*\n${mention}, these are yours this hour. Call every one.`,
      },
    },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `${cases.length} on the board  ·  on shift now: ${onShift.map(s => s.name).join(', ')}  ·  <${BOARD_URL}|Open the MIA board>`,
      }],
    },
  ]

  if (!WEBHOOK) {
    console.error('[cron:mia-reminder] SLACK_MIA_WEBHOOK is not set')
    return NextResponse.json({ sent: false, reason: 'no webhook configured', rep: rep.name, cases: cases.length })
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `MIA calls for ${rep.name} — ${cases.length} on the board`, blocks }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[cron:mia-reminder] slack returned', res.status, detail)
      return NextResponse.json({ sent: false, reason: `slack ${res.status}`, detail }, { status: 502 })
    }
  } catch (e) {
    const detail = (e as Error).message
    console.error('[cron:mia-reminder] slack failed:', detail)
    return NextResponse.json({ sent: false, reason: detail }, { status: 502 })
  }

  console.log('[cron:mia-reminder] nudged %s about %d case(s)', rep.name, cases.length)
  return NextResponse.json({
    sent: true, rep: rep.name, cases: cases.length,
    onShift: onShift.map(s => s.name), pacific: at(WINDOW_TZ),
  })
}
