import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const FB_TOKEN = process.env.FB_ACCESS_TOKEN || ''

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get creative rep's slug
  const { data: profile } = await admin
    .from('profiles')
    .select('name, team_type, creative_slug')
    .eq('id', user.id)
    .single()

  if (!profile || profile.team_type !== 'creative') {
    return NextResponse.json({ error: 'Not a creative rep' }, { status: 403 })
  }

  const slug = (profile.creative_slug as string | null)?.toUpperCase() ?? null
  if (!slug) {
    return NextResponse.json({ slug: null, cases: [], ads: [] })
  }

  // Get signed cases where ad_name contains this slug
  const { data: cases } = await admin
    .from('ghl_leads')
    .select('id, contact_name, ad_name, ad_id, created_at, case_status')
    .ilike('ad_name', `%${slug}%`)
    .order('created_at', { ascending: false })

  const signedCases = (cases ?? []).filter(c => !['cancelled'].includes(c.case_status ?? ''))

  // Group by ad_id for summary
  const byAd: Record<string, { adName: string; count: number; cases: any[] }> = {}
  for (const c of signedCases) {
    const key = c.ad_id || c.ad_name || 'unknown'
    if (!byAd[key]) byAd[key] = { adName: c.ad_name || 'Unknown Ad', count: 0, cases: [] }
    byAd[key].count++
    byAd[key].cases.push({ id: c.id, contactName: c.contact_name, createdAt: c.created_at, status: c.case_status })
  }

  // Pull matching ads from Meta if token available
  let metaAds: any[] = []
  if (FB_TOKEN) {
    try {
      // Search across the ad accounts for ads matching this slug in their name
      const accountsRes = await fetch(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=id&access_token=${FB_TOKEN}`,
        { next: { revalidate: 300 } }
      )
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json()
        const accountIds: string[] = (accountsData.data ?? []).map((a: any) => a.id)

        const adResults = await Promise.all(
          accountIds.map(async (actId) => {
            const r = await fetch(
              `https://graph.facebook.com/v19.0/${actId}/ads?fields=id,name,creative{name,thumbnail_url},adset{name},campaign{name}&filtering=${encodeURIComponent(JSON.stringify([{ field: 'ad.name', operator: 'CONTAIN', value: slug }]))}&limit=50&access_token=${FB_TOKEN}`,
              { next: { revalidate: 300 } }
            )
            if (!r.ok) return []
            const d = await r.json()
            return d.data ?? []
          })
        )
        metaAds = adResults.flat()
      }
    } catch {}
  }

  return NextResponse.json({
    slug,
    totalCases: signedCases.length,
    byAd: Object.entries(byAd).map(([adId, v]) => ({ adId, ...v })),
    metaAds,
  })
}
