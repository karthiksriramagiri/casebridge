import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('attribution_events')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    const msg = error.message || ''
    const missingTable =
      error.code === 'PGRST205' ||
      /attribution_events/i.test(msg) ||
      /schema cache/i.test(msg)
    if (missingTable) {
      return NextResponse.json({
        events: [],
        byAd: [],
        totals: { signedCases: 0, notQualified: 0, noResponse: 0 },
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by ad (utm_content)
  const byAd: Record<string, any> = {}
  for (const event of data || []) {
    const adId = event.utm_content || 'unknown'
    if (!byAd[adId]) {
      byAd[adId] = { adId, signedCases: 0, notQualified: 0, noResponse: 0, total: 0 }
    }
    byAd[adId].total++
    if (event.event_name === 'SignedCase') byAd[adId].signedCases++
    if (event.event_name === 'NotQualified') byAd[adId].notQualified++
    if (event.event_name === 'NoResponse') byAd[adId].noResponse++
  }

  return NextResponse.json({
    events: data,
    byAd: Object.values(byAd),
    totals: {
      signedCases: (data || []).filter(e => e.event_name === 'SignedCase').length,
      notQualified: (data || []).filter(e => e.event_name === 'NotQualified').length,
      noResponse: (data || []).filter(e => e.event_name === 'NoResponse').length,
    }
  })
}
