import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser, venuAdmin } from '@/app/venu/_lib/auth'

/**
 * Signs a short-lived URL for one stored utterance. The bucket is private, so
 * a rep can only ever reach audio from a session they own (or any session, if
 * they are an admin reviewing the team).
 */
export async function GET(req: NextRequest) {
  const user = await getVenuUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const path = req.nextUrl.searchParams.get('path') ?? ''
  const sessionId = path.split('/')[0]
  if (!sessionId) return NextResponse.json({ error: 'path is required' }, { status: 400 })

  const db = venuAdmin()
  const { data: session } = await db
    .from('venu_sessions').select('user_id').eq('id', sessionId).single()
  if (!session) return NextResponse.json({ error: 'Unknown session' }, { status: 404 })
  if (session.user_id !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Not yours' }, { status: 403 })
  }

  const { data, error } = await db.storage.from('venu-audio').createSignedUrl(path, 600)
  if (error || !data) return NextResponse.json({ error: 'Not available' }, { status: 404 })

  return NextResponse.json({ url: data.signedUrl })
}
