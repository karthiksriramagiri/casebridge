import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser, venuAdmin } from '@/app/venu/_lib/auth'
import { INTERVIEW_BUCKET } from '@/app/venu/_lib/candidates'

/* A short-lived playback URL for the reviewer. The bucket is private, so the
   recording is never reachable without a live admin session. */

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const user = await getVenuUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { token } = await ctx.params
  const db = venuAdmin()
  const { data: row } = await db.from('venu_candidates')
    .select('recording_path').eq('token', token).maybeSingle()

  // The whole interview, one file.
  const path = row?.recording_path
  if (!path) return NextResponse.json({ error: 'no_recording' }, { status: 404 })

  const { data, error } = await db.storage.from(INTERVIEW_BUCKET).createSignedUrl(path, 60 * 60)
  if (error || !data) return NextResponse.json({ error: error?.message || 'signing failed' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
