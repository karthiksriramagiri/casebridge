import { NextRequest, NextResponse } from 'next/server'
import { venuAdmin } from '@/app/venu/_lib/auth'
import { INTERVIEW_BUCKET, MAX_RECORDING_BYTES } from '@/app/venu/_lib/candidates'

/* A signed URL the browser uploads the recording straight to.

   The file never passes through this route: an hour of screen-recorded video
   is far past what a serverless function will accept as a request body, and
   the upload would fail at exactly the moment the candidate is most likely to
   give up. Storage takes it directly and we only record where it landed. */

const SAFE = /[^a-zA-Z0-9._-]+/g

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const filename = String(body.filename ?? 'interview').slice(-120).replace(SAFE, '_')
  const size = Number(body.size ?? 0)

  if (size > MAX_RECORDING_BYTES) {
    return NextResponse.json({ error: 'That file is larger than 2 GB. Please share a compressed version.' }, { status: 400 })
  }

  const db = venuAdmin()
  const { data: row } = await db.from('venu_candidates')
    .select('id, status').eq('token', token).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (['qualified', 'not_qualified', 'onboarded'].includes(row.status)) {
    return NextResponse.json({ error: 'This application has already been reviewed.' }, { status: 409 })
  }

  // The bucket is created by the migration; make it on the fly if that has
  // not been run yet so a candidate is never blocked by our setup.
  const { data: buckets } = await db.storage.listBuckets()
  if (!(buckets ?? []).some(b => b.name === INTERVIEW_BUCKET)) {
    await db.storage.createBucket(INTERVIEW_BUCKET, { public: false, fileSizeLimit: MAX_RECORDING_BYTES })
  }

  // Answers are keyed by question so a reviewer can jump straight to one.
  const key = String(body.key ?? '').replace(SAFE, '')
  const path = key ? `${row.id}/${key}-${Date.now()}.webm` : `${row.id}/${Date.now()}-${filename}`
  const { data, error } = await db.storage.from(INTERVIEW_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error('[venu:candidates] signed upload failed', error)
    return NextResponse.json({ error: 'Could not start the upload. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl, bucket: INTERVIEW_BUCKET })
}
