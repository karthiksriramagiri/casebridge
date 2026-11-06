import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
/* A benchmark is a reference ad — a short video or a still. Big enough to
   need saying, small enough to go through a route rather than needing the
   signed-upload dance the hour-long interview recordings use. */
export const maxDuration = 60

/* Two buckets: a benchmark is a reference someone else made, an upload is the
   work itself. Keeping them apart means a cleanup of one cannot touch the
   other, and the public URLs say which is which. */
const BUCKETS = { benchmark: 'creative-benchmarks', upload: 'creative-uploads' } as const
const MAX_BYTES = 50 * 1024 * 1024

const OK_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
]

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const bucket = String(form?.get('bucket') ?? 'benchmark') === 'upload' ? BUCKETS.upload : BUCKETS.benchmark
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file was sent.' }, { status: 400 })

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `That file is ${(file.size / 1024 / 1024).toFixed(0)}MB — the limit is 50MB.` }, { status: 413 })
  }
  if (file.type && !OK_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Benchmarks have to be an image or a video.' }, { status: 415 })
  }

  /* Name it by time and a random suffix rather than by the original filename:
     two people uploading "ref.mp4" must not overwrite each other, and the
     original name is kept on the row for display. */
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`

  const db = createClient(url, key)
  const { error } = await db.storage
    .from(bucket)
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (error) {
    const missing = /bucket not found/i.test(error.message)
    return NextResponse.json(
      {
        error: missing
          ? `The ${bucket} bucket does not exist yet — run supabase/migration_creative_assignments.sql.`
          : error.message,
      },
      { status: missing ? 503 : 500 },
    )
  }

  const { data } = db.storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl, name: file.name, kind: file.type.startsWith('video/') ? 'video' : 'image' })
}
