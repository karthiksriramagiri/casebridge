import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const TOKEN = process.env.META_ACCESS_TOKEN!
const BASE = 'https://graph.facebook.com/v25.0'

async function fetchMeta(path: string, params: Record<string, string> = {}) {
  if (!TOKEN) return { data: [] }
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok || json?.error) { console.error('Meta trend error:', json?.error); return { data: [] } }
    return json
  } catch { return { data: [] } }
}

function getLeads(actions: Array<{ action_type: string; value: string }> = []) {
  return parseInt(actions?.find(a =>
    a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead'
  )?.value || '0')
}

function getLandingPageViews(actions: Array<{ action_type: string; value: string }> = []) {
  return parseInt(actions?.find(a => a.action_type === 'landing_page_view')?.value || '0')
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const firmSlug = searchParams.get('firm') || ''
  const adId = searchParams.get('ad_id') || ''
  const timeframe = searchParams.get('timeframe') || 'last_7d'
  const invoiceParam = searchParams.get('invoice') || ''

  if (!firmSlug || !adId) {
    return NextResponse.json({ error: 'firm and ad_id required' }, { status: 400 })
  }

  const { data: firm } = await supabase
    .from('firms')
    .select('id, meta_account_id')
    .eq('slug', firmSlug)
    .single()

  if (!firm?.meta_account_id) return NextResponse.json({ data: [] })

  const isToday = timeframe === 'today'
  let timeParams: Record<string, string>

  if (timeframe === 'invoice' && invoiceParam) {
    const { data: inv } = await supabase
      .from('firm_invoices')
      .select('period_start, period_end')
      .eq('firm_id', firm.id)
      .eq('code', invoiceParam)
      .single()
    if (!inv) return NextResponse.json({ data: [] })
    timeParams = { time_range: JSON.stringify({ since: inv.period_start, until: inv.period_end }) }
  } else if (isToday) {
    timeParams = { date_preset: 'today' }
  } else {
    timeParams = { date_preset: timeframe }
  }

  const res = await fetchMeta(`/${firm.meta_account_id}/insights`, {
    fields: 'spend,impressions,clicks,ctr,cpc,actions,ad_name',
    ...timeParams,
    time_increment: isToday ? 'hourly' : '1',
    level: 'ad',
    filtering: JSON.stringify([{ field: 'ad.id', operator: 'EQUAL', value: adId }]),
    limit: '500',
  })

  const rows = (res.data || []).map((d: any, i: number) => {
    const spend = parseFloat(d.spend || '0')
    const leads = getLeads(d.actions)
    const lpvs = getLandingPageViews(d.actions)
    const clicks = parseInt(d.clicks || '0', 10)

    // Hourly: date_start may be "YYYY-MM-DD HH:MM:SS" or plain date with separate time field
    let label: string
    if (isToday) {
      const dateStart: string = d.date_start || ''
      const timeMatch = dateStart.match(/(\d{2}:\d{2})/)
      label = timeMatch ? timeMatch[1] : `H${String(i).padStart(2, '0')}`
    } else {
      // daily: "YYYY-MM-DD" → "MMM D"
      const dt = new Date(d.date_start + 'T12:00:00Z')
      label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    return {
      label,
      rawDate: d.date_start || '',
      spend: spend > 0 ? spend : null,
      leads: leads > 0 ? leads : null,
      impressions: parseInt(d.impressions || '0', 10),
      cpl: leads > 0 ? spend / leads : null,
      cpc: parseFloat(d.cpc || '0') || null,
      ctr: parseFloat(d.ctr || '0') || null,
      clickToLeadPct: clicks > 0 && leads >= 0 ? (leads / clicks) * 100 : null,
      lpvToLeadPct: lpvs > 0 ? (leads / lpvs) * 100 : null,
    }
  })

  return NextResponse.json({
    adName: res.data?.[0]?.ad_name || adId,
    isHourly: isToday,
    data: rows,
  })
}
