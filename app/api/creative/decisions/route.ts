import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/* ═══════════════════════════════════════════════════════════════════════════
   Keep / Watch / Kill, recorded.

   Deliberately does not touch Meta. Pausing an ad from a dashboard is a
   one-click irreversible spend decision made against numbers that are up to
   an hour stale; the call gets logged here and a human still pulls the
   trigger in Ads Manager. The log is what makes the morning review stop
   repeating itself.
   ═══════════════════════════════════════════════════════════════════════════ */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

const MISSING = /relation .* does not exist|schema cache/i

// GET /api/creative/decisions → the current call for every ad that has one
export async function GET() {
  const { data, error } = await supabase
    .from('creative_decisions')
    .select('ad_id, ad_name, decision, note, decided_by, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (error) {
    if (MISSING.test(error.message)) return NextResponse.json({ decisions: {}, needsMigration: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Newest row per ad wins — the list is already newest-first.
  const decisions: Record<string, any> = {}
  for (const row of data ?? []) {
    if (!decisions[row.ad_id]) decisions[row.ad_id] = row
  }
  return NextResponse.json({ decisions })
}

// POST /api/creative/decisions  { adId, adName, decision, cpl?, spend?, verdict?, note? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { adId, adName, decision } = body

  if (!adId) return NextResponse.json({ error: 'adId is required' }, { status: 400 })
  if (!['keep', 'watch', 'kill'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be keep, watch or kill' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('creative_decisions')
    .insert({
      ad_id:           adId,
      ad_name:         adName ?? '',
      decision,
      cpl_at_time:     body.cpl ?? null,
      spend_at_time:   body.spend ?? null,
      verdict_at_time: body.verdict ?? null,
      note:            body.note ?? null,
      decided_by:      body.decidedBy ?? null,
    })
    .select('ad_id, ad_name, decision, note, decided_by, created_at')
    .single()

  if (error) {
    if (MISSING.test(error.message)) {
      return NextResponse.json(
        { error: 'Run supabase/migration_creative_decisions.sql to start recording decisions.' },
        { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ decision: data })
}
