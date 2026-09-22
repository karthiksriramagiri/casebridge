import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'creative-benchmarks'
const MAX_BYTES = 200 * 1024 * 1024   // 200 MB — a reference cut, not a master

/* POST /api/creative/briefs/benchmark
   Multipart upload of a benchmark video, stored privately and handed back as
   a signed URL. A pasted link needs no upload — the board PATCHes
   benchmark_url straight onto the brief. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const briefId = String(form?.get('brief_id') || '')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received.' }, { status: 400 })
  }
  if (!briefId) {
    return NextResponse.json({ error: 'brief_id is required.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({
      error: `That file is ${(file.size / 1048576).toFixed(0)}MB — the limit is ${MAX_BYTES / 1048576}MB. Paste a link instead.`,
    }, { status: 413 })
  }

  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${briefId}/${Date.now()}.${ext}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'video/mp4', upsert: false })

  if (upErr) {
    const missingBucket = /bucket.*not found/i.test(upErr.message)
    return NextResponse.json({
      error: missingBucket
        ? 'The creative-benchmarks storage bucket does not exist yet — run migration_creative_briefs.sql.'
        : upErr.message,
    }, { status: 500 })
  }

  // Long-lived signed URL: the board is behind auth and these are reference
  // cuts, not anything sensitive. Re-signed on read if it ever expires.
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365)

  const benchmark = {
    benchmark_url: signed?.signedUrl ?? null,
    benchmark_name: file.name,
    benchmark_kind: 'upload' as const,
  }

  await supabase.from('creative_briefs').update(benchmark).eq('id', briefId)

  return NextResponse.json({ ...benchmark, path })
}
