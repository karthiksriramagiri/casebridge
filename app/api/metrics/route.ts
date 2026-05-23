import { NextRequest, NextResponse } from 'next/server'

const TOKEN = process.env.META_ACCESS_TOKEN!
const AD_ACCOUNT = 'act_788484706914452'
const BASE = 'https://graph.facebook.com/v25.0'

async function fetchMeta(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 300 },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      console.error('Meta API error:', path, res.status)
      return { data: [] }
    }
    return await res.json()
  } catch (err) {
    console.error('Meta API fetch failed:', path, (err as Error).message)
    return { data: [] }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const datePreset = searchParams.get('date_preset') || 'last_30d'

  const insightFields = 'spend,impressions,clicks,ctr,cpc,reach,frequency,actions,cost_per_action_type'

  // Campaign level
  const [campaignsRes, campaignInsights, adsetInsights, adInsights, dailyInsights] = await Promise.all([
    fetchMeta(`/${AD_ACCOUNT}/campaigns`, {
      fields: 'id,name,status,objective',
      filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
      limit: '20',
    }),
    fetchMeta(`/${AD_ACCOUNT}/insights`, {
      fields: insightFields,
      date_preset: datePreset,
      level: 'campaign',
    }),
    fetchMeta(`/${AD_ACCOUNT}/insights`, {
      fields: insightFields,
      date_preset: datePreset,
      level: 'adset',
    }),
    fetchMeta(`/${AD_ACCOUNT}/insights`, {
      fields: `${insightFields},ad_name,adset_name,campaign_name`,
      date_preset: datePreset,
      level: 'ad',
    }),
    fetchMeta(`/${AD_ACCOUNT}/insights`, {
      fields: 'spend,actions,impressions',
      date_preset: datePreset,
      time_increment: '1',
      level: 'account',
    }),
  ])

  function getLeads(actions: any[] = []) {
    return parseInt(actions.find(a => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead')?.value || '0')
  }

  function getCPL(actions: any[] = [], spend: string) {
    const leads = getLeads(actions)
    return leads > 0 ? (parseFloat(spend) / leads).toFixed(2) : null
  }

  // Process campaign insights
  const campaigns = (campaignInsights.data || []).map((c: any) => ({
    id: c.campaign_id,
    name: c.campaign_name,
    spend: parseFloat(c.spend || 0),
    impressions: parseInt(c.impressions || 0),
    clicks: parseInt(c.clicks || 0),
    ctr: parseFloat(c.ctr || 0).toFixed(2),
    cpc: parseFloat(c.cpc || 0).toFixed(2),
    reach: parseInt(c.reach || 0),
    frequency: parseFloat(c.frequency || 0).toFixed(2),
    leads: getLeads(c.actions),
    cpl: getCPL(c.actions, c.spend),
  }))

  // Process adset insights
  const adsets = (adsetInsights.data || []).map((a: any) => ({
    id: a.adset_id,
    name: a.adset_name,
    campaignName: a.campaign_name,
    spend: parseFloat(a.spend || 0),
    impressions: parseInt(a.impressions || 0),
    clicks: parseInt(a.clicks || 0),
    ctr: parseFloat(a.ctr || 0).toFixed(2),
    cpc: parseFloat(a.cpc || 0).toFixed(2),
    reach: parseInt(a.reach || 0),
    leads: getLeads(a.actions),
    cpl: getCPL(a.actions, a.spend),
  }))

  // Process ad/creative insights
  const ads = (adInsights.data || []).map((a: any) => ({
    id: a.ad_id,
    name: a.ad_name,
    adsetName: a.adset_name,
    campaignName: a.campaign_name,
    spend: parseFloat(a.spend || 0),
    impressions: parseInt(a.impressions || 0),
    clicks: parseInt(a.clicks || 0),
    ctr: parseFloat(a.ctr || 0).toFixed(2),
    cpc: parseFloat(a.cpc || 0).toFixed(2),
    reach: parseInt(a.reach || 0),
    leads: getLeads(a.actions),
    cpl: getCPL(a.actions, a.spend),
  }))

  // Daily data for charts
  const daily = (dailyInsights.data || []).map((d: any) => ({
    date: d.date_start,
    spend: parseFloat(d.spend || 0),
    leads: getLeads(d.actions),
    impressions: parseInt(d.impressions || 0),
  }))

  // Account totals
  const totalSpend = campaigns.reduce((s: number, c: any) => s + c.spend, 0)
  const totalLeads = campaigns.reduce((s: number, c: any) => s + c.leads, 0)
  const totalImpressions = campaigns.reduce((s: number, c: any) => s + c.impressions, 0)
  const totalClicks = campaigns.reduce((s: number, c: any) => s + c.clicks, 0)

  return NextResponse.json({
    summary: {
      spend: totalSpend.toFixed(2),
      leads: totalLeads,
      cpl: totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : null,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: totalClicks > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0',
    },
    campaigns,
    adsets,
    ads,
    daily,
  })
}
