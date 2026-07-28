import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

// Use the same token as the metrics page (META_ACCESS_TOKEN)
const META_TOKEN = (process.env.META_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN || '').trim()

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

  // Pull matching Meta ads first so we can also filter ghl_leads by ad_id
  let metaAds: any[] = []
  const metaAdIds = new Set<string>()
  if (META_TOKEN) {
    try {
      const accountsRes = await fetch(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=id&access_token=${META_TOKEN}`,
        { next: { revalidate: 300 } }
      )
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json()
        const accountIds: string[] = (accountsData.data ?? []).map((a: any) => a.id)

        const adResults = await Promise.all(
          accountIds.map(async (actId) => {
            const r = await fetch(
              `https://graph.facebook.com/v19.0/${actId}/ads?fields=id,name,creative{name,thumbnail_url},adset{name},campaign{name}&filtering=${encodeURIComponent(JSON.stringify([{ field: 'ad.name', operator: 'CONTAIN', value: slug }]))}&limit=50&access_token=${META_TOKEN}`,
              { next: { revalidate: 300 } }
            )
            if (!r.ok) return []
            const d = await r.json()
            return d.data ?? []
          })
        )
        metaAds = adResults.flat()
        for (const ad of metaAds) {
          if (ad.id) metaAdIds.add(String(ad.id))
        }
      }
    } catch {}
  }

  // Build a name map from Meta ad ID → ad name for display
  const metaAdNameById: Record<string, string> = {}
  for (const ad of metaAds) {
    if (ad.id) metaAdNameById[String(ad.id)] = ad.name || ad.id
  }

  // Fetch cases matching by ad_name (legacy) OR ad_id (current — GHL sends id but not name)
  const [byNameRes, byIdRes] = await Promise.all([
    admin
      .from('ghl_leads')
      .select('id, contact_name, ad_name, ad_id, created_at, case_status')
      .ilike('ad_name', `%${slug}%`)
      .order('created_at', { ascending: false }),
    metaAdIds.size > 0
      ? admin
          .from('ghl_leads')
          .select('id, contact_name, ad_name, ad_id, created_at, case_status')
          .in('ad_id', [...metaAdIds])
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ])

  // Merge and deduplicate by id
  const seen = new Set<string>()
  const allCases: any[] = []
  for (const c of [...(byNameRes.data ?? []), ...(byIdRes.data ?? [])]) {
    if (!seen.has(c.id)) {
      seen.add(c.id)
      allCases.push(c)
    }
  }

  const signedCases = allCases.filter(c => !['cancelled'].includes(c.case_status ?? ''))

  // Group by ad_id for summary, using Meta name when ad_name is null
  const byAd: Record<string, { adName: string; count: number; cases: any[] }> = {}
  for (const c of signedCases) {
    const key = c.ad_id || c.ad_name || 'unknown'
    const displayName = c.ad_name || metaAdNameById[c.ad_id] || c.ad_id || 'Unknown Ad'
    if (!byAd[key]) byAd[key] = { adName: displayName, count: 0, cases: [] }
    byAd[key].count++
    byAd[key].cases.push({ id: c.id, contactName: c.contact_name, createdAt: c.created_at, status: c.case_status })
  }

  return NextResponse.json({
    slug,
    totalCases: signedCases.length,
    byAd: Object.entries(byAd).map(([adId, v]) => ({ adId, ...v })),
    metaAds,
  })
}
