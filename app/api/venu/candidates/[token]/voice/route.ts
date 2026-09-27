import { NextRequest, NextResponse } from 'next/server'
import { deepgramKey, venuAdmin } from '@/app/venu/_lib/auth'
import { claim } from '@/app/venu/_lib/tts-prewarm'
import { VENU_VOICE, turnsOf } from '@/app/venu/_lib/candidates'

/* Venu's voice for the candidate interview.

   A GET so the browser's <audio> element streams it — Deepgram starts
   returning audio a quarter-second in but takes seconds to finish a sentence,
   and buffering the whole thing first puts dead air in front of every line.

   What she says is looked up from the turn the server itself wrote, never
   taken off the query string: this route is public, and a text parameter
   would make it an open proxy onto the Deepgram account. */

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const index = Number(req.nextUrl.searchParams.get('turn') ?? -1)

  const { data: row } = await venuAdmin()
    .from('venu_candidates').select('answers').eq('token', token).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const turn = turnsOf(row)[index]
  const text = turn?.who === 'venu' ? turn.text : ''
  if (!text) return NextResponse.json({ error: 'unknown line' }, { status: 400 })

  // Claim the synthesis the turn route already started, if it is still warm.
  const res = await (claim(text, VENU_VOICE) ?? fetch(`https://api.deepgram.com/v1/speak?model=${VENU_VOICE}`, {
    method: 'POST',
    headers: { Authorization: `Token ${deepgramKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }))
  if (!res.ok || !res.body) {
    console.error('[venu:candidates] tts failed', res.status, await res.text().catch(() => ''))
    return NextResponse.json({ error: 'voice unavailable' }, { status: 502 })
  }

  return new NextResponse(res.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  })
}
