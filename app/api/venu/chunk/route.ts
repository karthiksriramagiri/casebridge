import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser } from '@/app/venu/_lib/auth'
import { push } from '@/app/venu/_lib/stt-stream'

/**
 * A slice of audio, forwarded to the live transcription socket as the rep
 * speaks. Deliberately does no work of its own — it must return fast enough to
 * keep up with a 250ms recording cadence.
 */
export async function POST(req: NextRequest) {
  const user = await getVenuUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const sessionId = req.headers.get('x-session-id') ?? ''
  if (!sessionId) return NextResponse.json({ error: 'no session' }, { status: 400 })

  const audio = await req.arrayBuffer()
  if (audio.byteLength > 0) void push(sessionId, audio)

  return new NextResponse(null, { status: 204 })
}
