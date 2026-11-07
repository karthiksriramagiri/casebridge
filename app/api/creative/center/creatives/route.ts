import { NextRequest, NextResponse } from 'next/server'
import { adAccounts, type AdAccount } from '@/app/_metrics/ad-accounts'
import { parseAdName } from '@/app/_metrics/ad-meta'
import { firmOf } from '@/app/_metrics/firms'

/* ═══════════════════════════════════════════════════════════════════════════
   Live creatives for the Creative Center.

   The revamped center models an ad as a name plus a daily series and derives
   every number from that series — T&Y CPL, the 3/5/7/14/30-day strip, week on
   week, spend since last lead. /api/creative/insights cannot feed it: that one
   returns a pre-aggregated row for a chosen range plus a fixed 14-day trend,
   which is the right shape for the legacy funnel and the wrong one here.

   So this asks Meta for one row per ad PER DAY over a lookback window and
   hands back the window itself. Every range the center offers is then a filter
   over that array, computed client-side, with no second round trip when the
   date picker moves.

   Read-only by construction. Nothing here can write to Meta — the center
   advises, a human acts in Ads Manager.
   ═══════════════════════════════════════════════════════════════════════════ */

const BASE = 'https://graph.facebook.com/v25.0'

export const dynamic = 'force-dynamic'

const FIELDS = [
  'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name',
  'spend', 'impressions', 'inline_link_clicks',
  'actions', 'video_play_actions',
].join(',')

const num = (v: any) => {
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}

const actionVal = (arr: any[] = [], type: string) =>
  parseInt(arr?.find((a: any) => a.action_type === type)?.value || '0', 10)

const leadsOf = (actions: any[] = []) =>
  actionVal(actions, 'lead') || actionVal(actions, 'offsite_conversion.fb_pixel_lead')

/* UTC, matching TODAY in _lib/data.ts. The two have to agree on what day it
   is or the client filters a window whose edges it disagrees with — "Today"
   would read empty on the very rows this just fetched. */
function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

async function metaGet(url: string) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch(url, { next: { revalidate: 300 }, signal: ctrl.signal })
    const json = await res.json()
    if (!res.ok || json?.error) {
      return { data: [], error: json?.error?.message || `HTTP ${res.status}` }
    }
    return json
  } catch (err) {
    return { data: [], error: (err as Error).message }
  } finally {
    clearTimeout(timer)
  }
}

/** Follows paging.next. A 30-day daily series over a busy account runs past
    one page, and a truncated series silently shortens every trend. */
async function metaAll(token: string, path: string, params: Record<string, string>, maxPages = 12) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const out: any[] = []
  let next: string | null = url.toString()
  let pages = 0
  let error: string | null = null

  while (next && pages < maxPages) {
    const json: any = await metaGet(next)
    if (json.error) { error = json.error; break }
    out.push(...(json.data || []))
    next = json.paging?.next ?? null
    pages++
  }
  return { data: out, error, truncated: !!next }
}

/* Budgets, and whether the thing is actually switched on.

   Spend is a proxy for "is this live" and not a very good one: an ad switched
   on an hour ago has not spent yet, and one paused at noon spent all morning.
   Meta will answer the question directly, so ask it.

   `effective_status` is the field that matters rather than `status`. `status`
   is the ad's own switch, while `effective_status` rolls its parents in — an
   ad left ON inside a paused ad set reports ADSET_PAUSED, which is the truth
   about delivery. Only ACTIVE means it is running; PAUSED, ADSET_PAUSED,
   CAMPAIGN_PAUSED, ARCHIVED and the review states all mean it is not. */
async function budgetsFor(acct: AdAccount) {
  const [adsets, campaigns, ads] = await Promise.all([
    metaAll(acct.token, `/${acct.id}/adsets`, { fields: 'id,daily_budget,effective_status', limit: '500' }, 6),
    metaAll(acct.token, `/${acct.id}/campaigns`, { fields: 'id,daily_budget', limit: '500' }, 6),
    metaAll(acct.token, `/${acct.id}/ads`, { fields: 'id,effective_status', limit: '500' }, 12),
  ])
  const toDollars = (v: any) => (v != null ? num(v) / 100 : 0)
  const byAdset: Record<string, number> = {}
  const byCampaign: Record<string, number> = {}
  const adStatus: Record<string, string> = {}
  const adsetStatus: Record<string, string> = {}
  for (const a of adsets.data) {
    if (a.daily_budget) byAdset[a.id] = toDollars(a.daily_budget)
    if (a.effective_status) adsetStatus[a.id] = String(a.effective_status)
  }
  for (const c of campaigns.data) if (c.daily_budget) byCampaign[c.id] = toDollars(c.daily_budget)
  for (const a of ads.data) if (a.effective_status) adStatus[a.id] = String(a.effective_status)
  return { byAdset, byCampaign, adStatus, adsetStatus }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const days = Math.min(Math.max(parseInt(sp.get('days') || '30', 10) || 30, 7), 90)

  const until = new Date()
  const since = new Date()
  since.setDate(since.getDate() - (days - 1))

  const accounts = adAccounts()
  if (accounts.length === 0) {
    return NextResponse.json(
      { creatives: [], accounts: [], outcomes: false, error: 'No Meta ad account is configured.' },
      { status: 200 },
    )
  }

  const perAccount = await Promise.all(
    accounts.map(async (acct) => {
      const [insights, budgets] = await Promise.all([
        metaAll(acct.token, `/${acct.id}/insights`, {
          fields: FIELDS,
          level: 'ad',
          time_increment: '1',
          time_range: JSON.stringify({ since: isoDay(since), until: isoDay(until) }),
          limit: '1000',
        }),
        budgetsFor(acct),
      ])

      /* Group the per-day rows under their ad. Meta emits one row per ad per
         day it delivered — days with no delivery are simply absent, which is
         exactly what the center's date filters expect. */
      const byAd = new Map<string, any[]>()
      for (const r of insights.data) {
        if (!r.ad_id) continue
        const list = byAd.get(r.ad_id)
        if (list) list.push(r)
        else byAd.set(r.ad_id, [r])
      }

      const creatives = [...byAd.entries()].map(([adId, rows]) => {
        rows.sort((a, b) => (a.date_start < b.date_start ? -1 : 1))
        const head = rows[rows.length - 1]
        const name: string = head.ad_name ?? ''

        const daily = rows.map((r) => {
          const hooks = actionVal(r.actions, 'video_view') || actionVal(r.video_play_actions, 'video_view')
          return {
            date: r.date_start,
            spend: num(r.spend),
            impressions: num(r.impressions),
            hooks,
            linkClicks: r.inline_link_clicks != null ? num(r.inline_link_clicks) : actionVal(r.actions, 'link_click'),
            leads: leadsOf(r.actions),
            /* Signed cases are a pipeline outcome, dated by the stage change
               that signed them — Meta cannot answer it. The client fills this
               in from the GHL sweep; 0 here means "not loaded yet", which is
               why the response reports outcomes: false. */
            acquisitions: 0,
          }
        })

        const parsed = parseAdName(name)
        const anyVideo = daily.some((d) => d.hooks > 0)

        return {
          id: adId,
          adId,
          name,
          // The ad name IS the naming convention in this account.
          convention: name,
          campaign: head.campaign_name ?? '—',
          adset: head.adset_name ?? '—',
          /* The id, not just the name: the watch list groups on the ad set, and
             two accounts can carry ad sets of the same name. */
          adsetId: head.adset_id,
          angle: parsed.angle ?? 'Unassigned',
          /* The firm the ad runs for, read off its name. Campaign names carry
             the same code, and the two agree across all 171 live ads — the ad
             name is used because it is the field the convention guarantees. */
          firm: firmOf(name),
          format: anyVideo ? 'Video' : 'Image',
          /* First day the ad actually delivered inside the window. Meta's
             created_time would need a per-ad hop for a number that only feeds
             NEW-vs-ACTIVE staging, and anything first delivering before the
             window opened is ACTIVE either way. */
          launchDate: rows[0].date_start,
          dailyBudget: budgets.byAdset[head.adset_id] ?? budgets.byCampaign[head.campaign_id] ?? 0,
          daily,
          account: acct.key,
          accountLabel: acct.label,
          /* Meta's own answer to "is this switched on". Undefined if the ad
             was not in the status sweep, which the UI treats as unknown
             rather than as off. */
          status: budgets.adStatus[adId],
          adsetStatus: budgets.adsetStatus[head.adset_id],
        }
      })

      return { acct, creatives, error: insights.error, truncated: insights.truncated }
    }),
  )

  const creatives = perAccount
    .flatMap((p) => p.creatives)
    .sort((a, b) => {
      const s = (c: typeof a) => c.daily.reduce((t, d) => t + d.spend, 0)
      return s(b) - s(a)
    })

  // One account failing must not blank the other, and "Meta error" with two
  // configured leaves nobody knowing which half of the page is missing.
  const failures = perAccount.filter((p) => p.error).map((p) => `${p.acct.label}: ${p.error}`)

  return NextResponse.json({
    creatives,
    accounts: perAccount.map((p) => ({
      key: p.acct.key,
      label: p.acct.label,
      creatives: p.creatives.length,
      error: p.error,
      truncated: p.truncated,
    })),
    window: { since: isoDay(since), until: isoDay(until), days },
    /* Pipeline outcomes are loaded separately by the client, from the GHL
       sweep — until they arrive the UI must not read 0 as fact. */
    outcomes: false,
    error: failures.length ? failures.join(' · ') : null,
  })
}
