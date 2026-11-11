import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* ═══════════════════════════════════════════════════════════════════════════
   Where creative files and benchmarks go.

   Supabase Storage, two ways in.

     POST (JSON)        hands back a signed URL the browser PUTs the file
                        straight to. The file never passes through here.
     POST (multipart)   the old path, kept for anything still calling it.
                        Small files only, by the platform's rules, not ours.

   The signed URL is not an optimisation. A serverless function will not
   accept a request body of any real size — the platform rejects it around
   4.5MB, long before our own limit was ever reached — so routing a 300MB
   video through here could never have worked, whatever number we wrote in
   the code.

   There is no size limit here, and the buckets carry none either. What
   remains is the project's own storage ceiling, set in the Supabase
   dashboard, which is the only place left that can refuse a large file.
   ═══════════════════════════════════════════════════════════════════════════ */

const BUCKETS = { benchmark: 'creative-benchmarks', upload: 'creative-uploads' } as const

const bucketFor = (v: unknown) => (String(v ?? 'benchmark') === 'upload' ? BUCKETS.upload : BUCKETS.benchmark)

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key) : null
}

/** Storage path: the day, a random id, and the original extension. Never the
 *  original filename — two people uploading "ref.mp4" must not overwrite each
 *  other, and the real name is kept on the row for display. */
function pathFor(filename: string, folder: string) {
  const ext = (filename.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
}

const kindOf = (type: string, name: string) => {
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('image/')) return 'image'
  /* An empty content-type is common on a drag-and-drop from some file
     managers, so the extension gets the last word rather than the file being
     filed as "file" and losing its preview. */
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return 'video'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'heic'].includes(ext)) return 'image'
  return 'file'
}

const missingBucket = (bucket: string, message: string) =>
  NextResponse.json(
    {
      error: /bucket not found/i.test(message)
        ? `The ${bucket} bucket does not exist yet — run supabase/migration_creative_assignments.sql.`
        : message,
    },
    { status: /bucket not found/i.test(message) ? 503 : 500 },
  )

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}))

    /* ── A signed upload URL; the browser does the upload ────────────── */
    const supabase = db()
    if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })

    const bucket = bucketFor(body.bucket)
    const name = String(body.filename ?? 'file').slice(-160)
    const path = pathFor(name, '').replace(/^\//, '')

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path)
    if (error || !data) return missingBucket(bucket, error?.message ?? 'Could not start the upload.')

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
    return NextResponse.json({
      mode: 'signed',
      backend: 'supabase',
      bucket,
      path,
      signedUrl: data.signedUrl,
      token: data.token,
      url: pub.publicUrl,
      name,
      kind: kindOf(String(body.type ?? ''), name),
    })
  }

  /* ── The original multipart path ───────────────────────────────────── */
  const supabase = db()
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const bucket = bucketFor(form?.get('bucket'))
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file was sent.' }, { status: 400 })

  const path = pathFor(file.name, '').replace(/^\//, '')
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (error) return missingBucket(bucket, error.message)

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl, name: file.name, kind: kindOf(file.type, file.name) })
}
