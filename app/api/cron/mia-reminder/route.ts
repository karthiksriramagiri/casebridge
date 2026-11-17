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

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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
    /* Only the count is needed — the message does not list them. A head
       count still has to be a real query, because an empty board is the one
       case where saying nothing is right. */
    db.from('mia_cases').select('id', { count: 'exact' }).eq('status', 'mia'),
    db.from('profiles').select('name, slack_user_id'),
  ])

  if (error) {
    console.error('[cron:mia-reminder]', error.message)
    return NextResponse.json({ sent: false, reason: error.message }, { status: 500 })
  }
  if (!cases?.length) {
    return NextResponse.json({ sent: false, reason: 'board is empty', rep: rep.name })
  }

  /* A real mention where we have the id, the plain name where we do not.
     Only one rep has a slack_user_id today, so most of these are names —
     which still reads correctly, it just does not buzz their phone. */
  const slackId = (profiles ?? []).find(
    (p: any) => String(p.name || '').trim().toLowerCase() === rep.name.toLowerCase(),
  )?.slack_user_id
  const mention = slackId ? `<@${slackId}>` : rep.name

  const text = `${mention} This is an hourly reminder. Please call all the MIAs on the Board.`

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
      body: JSON.stringify({ text }),
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
