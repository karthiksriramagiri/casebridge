import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import {
  currentPayPeriodStart, nextPaymentDate, fmtPayDate,
  recentPayDates, PERIOD_START_OVERRIDES,
} from '@/lib/pay'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const META_TOKEN = (process.env.META_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN || '').trim()
const SALARY_PER_PERIOD = 500
const COMMISSION_PER_CASE = 10

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await admin
    .from('profiles')
    .select('name, team_type, creative_slug')
    .eq('id', user.id)
    .single()

  if (!profile || profile.team_type !== 'creative') {
    return NextResponse.json({ error: 'Not a creative rep' }, { status: 403 })
  }

  const slug = (profile.creative_slug as string | null)?.toUpperCase() ?? null

  const now = new Date()
  const periodStart = currentPayPeriodStart(now)
  const periodEnd = nextPaymentDate(now)
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const periodEndStr = periodEnd.toISOString().slice(0, 10)

  // Build previous periods (last 4)
  const allPayDates = recentPayDates(now, 4)
  const pastDates = allPayDates.filter(d => d.getTime() < now.getTime())
  const completedPeriods: { start: Date; end: Date }[] = []
  for (let i = 0; i < pastDates.length - 1; i++) {
    if (pastDates[i + 1].getTime() <= periodStart.getTime()) {
      completedPeriods.push({ start: pastDates[i], end: pastDates[i + 1] })
    }
  }
  const prevPeriods = completedPeriods.slice(-4)

  // Fetch cases attributed to this creative slug
  let allCases: { id: string; name: string; date: string; status: string }[] = []

  if (slug) {
    // Get Meta ad IDs matching the slug
    const metaAdIds = new Set<string>()
    if (META_TOKEN) {
      try {
        const accountsRes = await fetch(
          `https://graph.facebook.com/v19.0/me/adaccounts?fields=id&access_token=${META_TOKEN}`,
          { next: { revalidate: 300 } } as any
        )
        if (accountsRes.ok) {
          const accountsData = await accountsRes.json()
          const accountIds: string[] = (accountsData.data ?? []).map((a: any) => a.id)
          const adResults = await Promise.all(
            accountIds.map(async (actId) => {
              const r = await fetch(
                `https://graph.facebook.com/v19.0/${actId}/ads?fields=id,name&filtering=${encodeURIComponent(JSON.stringify([{ field: 'ad.name', operator: 'CONTAIN', value: slug }]))}&limit=50&access_token=${META_TOKEN}`,
                { next: { revalidate: 300 } } as any
              )
              if (!r.ok) return []
              const d = await r.json()
              return (d.data ?? []).map((ad: any) => String(ad.id))
            })
          )
          for (const id of adResults.flat()) metaAdIds.add(id)
        }
      } catch {}
    }

    // Query cases by ad_name or ad_id
    const [byNameRes, byIdRes] = await Promise.all([
      admin.from('ghl_leads')
        .select('id, contact_name, ad_name, ad_id, qualified_at, case_status')
        .ilike('ad_name', `%${slug}%`)
        .order('qualified_at', { ascending: false }),
      metaAdIds.size > 0
        ? admin.from('ghl_leads')
            .select('id, contact_name, ad_name, ad_id, qualified_at, case_status')
            .in('ad_id', [...metaAdIds])
            .order('qualified_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ])

    // Deduplicate
    const seen = new Set<string>()
    for (const c of [...(byNameRes.data ?? []), ...(byIdRes.data ?? [])]) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      const status = (c.case_status || 'signed').toLowerCase()
      if (status === 'cancelled') continue // skip cancelled
      if (status === 'replacement') continue // skip replacements
      if (!c.qualified_at) continue
      allCases.push({
        id: c.id,
        name: c.contact_name || 'Unknown',
        date: c.qualified_at.slice(0, 10),
        status,
      })
    }
  }

  // Cases in current period (by sign date)
  const currentPeriodCases = allCases.filter(
    c => c.date >= periodStartStr && c.date < periodEndStr
  )
  const currentCommission = currentPeriodCases.length * COMMISSION_PER_CASE
  const currentTotal = SALARY_PER_PERIOD + currentCommission

  // Previous periods
  const previousPeriods = prevPeriods.map(({ start, end }) => {
    const endStr = end.toISOString().slice(0, 10)
    const effectiveStart = PERIOD_START_OVERRIDES[endStr] ? new Date(PERIOD_START_OVERRIDES[endStr]) : start
    const startStr = effectiveStart.toISOString().slice(0, 10)

    const periodCases = allCases.filter(c => c.date >= startStr && c.date < endStr)
    const commission = periodCases.length * COMMISSION_PER_CASE
    return {
      start: startStr,
      end: endStr,
      payDate: fmtPayDate(end),
      salary: SALARY_PER_PERIOD,
      cases: periodCases.length,
      commission,
      total: SALARY_PER_PERIOD + commission,
      caseList: periodCases.map(({ id, name, date }) => ({ id, name, date })),
    }
  }).reverse()

  return NextResponse.json({
    period: {
      start: periodStartStr,
      end: periodEndStr,
      nextPayDate: fmtPayDate(periodEnd),
    },
    salary: SALARY_PER_PERIOD,
    commissionPerCase: COMMISSION_PER_CASE,
    cases: {
      thisPeriod: currentPeriodCases.map(({ id, name, date }) => ({ id, name, date })),
    },
    pay: {
      salary: SALARY_PER_PERIOD,
      commission: currentCommission,
      totalEstimated: currentTotal,
    },
    previousPeriods,
  })
}
