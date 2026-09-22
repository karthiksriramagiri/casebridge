import { NextRequest, NextResponse } from 'next/server'
import { admin, isMissingTable } from '../_lib'

export const dynamic = 'force-dynamic'

/* GET  /api/creative/competitors/ads?batch=…   — the working set
   POST /api/creative/competitors/ads           — add one ad, or a manifest  */

export async function GET(req: NextRequest) {
  const batch = req.nextUrl.searchParams.get('batch')
  let q = admin()
    .from('competitor_ads')
    .select('id, source_type, brand_name, label, video_url, ad_library_url, first_seen, run_days, duration_seconds, status, error, has_audio, frames_count, transcript, scorecard, taxonomy_version, batch, created_at')
    .order('created_at', { ascending: false })
  if (batch) q = q.eq('batch', batch)

  const { data, error } = await q
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ ads: [], needsMigration: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ads: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  /* Accepts either one ad or a manifest. A manifest is how a batch of
     competitor ads actually arrives — someone pastes a list. */
  const rows = Array.isArray(body.ads) ? body.ads : [body]
  const batch = body.batch || new Date().toISOString().slice(0, 10)

  const prepared = rows
    .filter((r: any) => r.video_url || r.ad_library_url)
    .map((r: any) => ({
      source_type: r.source_type === 'ours' ? 'ours' : 'competitor',
      brand_name: r.brand_name || null,
      label: r.label || null,
      video_url: r.video_url || null,
      ad_library_url: r.ad_library_url || null,
      first_seen: r.first_seen || null,
      run_days: r.run_days ?? null,
      batch,
      status: 'new',
    }))

  if (prepared.length === 0) {
    return NextResponse.json({ error: 'Every ad needs a video URL or an Ad Library URL.' }, { status: 400 })
  }

  const { data, error } = await admin().from('competitor_ads').insert(prepared).select()
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ error: 'Run supabase/migration_competitor_ads.sql first.' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ads: data, batch })
}
