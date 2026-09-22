import { NextRequest, NextResponse } from 'next/server'
import type { AdMetrics } from '@/app/_metrics/benchmarks'
import { computeDelta, healthVerdict, creativeVerdict } from '@/app/_metrics/benchmarks'
import { firmOf } from '@/app/_metrics/firms'
import { parseAdName } from '@/app/_metrics/ad-meta'
import { adAccounts, type AdAccount } from '@/app/_metrics/ad-accounts'

/* ═══════════════════════════════════════════════════════════════════════════
   Ad-level insights for the two analysis views.

   The existing /api/metrics call cannot answer either question: it asks for
   `ctr` and `cpc`, which are ALL clicks — thumbstops, profile taps, expands —
   not link clicks. Link CTR and link CPC are separate fields, and the video
   quartiles that hook rate depends on were never requested at all.

   Two Meta calls:
     1. the selected range, aggregated per ad — the table rows
     2. a fixed 14-day daily series per ad — the trend baseline behind
        KEEP/WATCH/KILL, which a single aggregate can never show
   ═══════════════════════════════════════════════════════════════════════════ */

const BASE = 'https://graph.facebook.com/v25.0'

export const dynamic = 'force-dynamic'

/* Meta only returns the identifiers that belong to the level being queried —
   asking for ad_name at adset level errors rather than aggregating — so the
   identity fields are chosen per level and the rest are shared. */
const METRIC_FIELDS = [
  'spend', 'impressions', 'reach', 'frequency', 'cpm',
  'clicks', 'ctr', 'cpc',
  // Link-specific — the ones the benchmarks are actually written against
  'inline_link_clicks', 'inline_link_click_ctr', 'cost_per_inline_link_click',
  'actions', 'cost_per_action_type',
  // Video engagement
  'video_play_actions',
  'video_p25_watched_actions', 'video_p50_watched_actions',
  'video_p75_watched_actions', 'video_p100_watched_actions',
  'video_thruplay_watched_actions',
]

type Level = 'ad' | 'adset' | 'campaign'

const ID_FIELDS: Record<Level, { id: string; name: string; extra: string[] }> = {
  ad:       { id: 'ad_id',       name: 'ad_name',       extra: ['adset_name', 'campaign_name'] },
  adset:    { id: 'adset_id',    name: 'adset_name',    extra: ['campaign_name'] },
  campaign: { id: 'campaign_id', name: 'campaign_name', extra: [] },
}

function fieldsFor(level: Level) {
  const f = ID_FIELDS[level]
  return [f.id, f.name, ...f.extra, ...METRIC_FIELDS].join(',')
}

async function fetchMeta(token: string, path: string, params: Record<string, string>) {
  if (!token) return { data: [] }
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 300 }, signal: ctrl.signal })
    const json = await res.json()
    if (!res.ok || json?.error) {
      console.error('[creative:insights] Meta error', json?.error?.message || res.status)
      return { data: [], error: json?.error?.message || `HTTP ${res.status}` }
    }
    return json
  } catch (err) {
    console.error('[creative:insights] Meta fetch failed', (err as Error).message)
    return { data: [], error: (err as Error).message }
  } finally {
    clearTimeout(timer)
  }
}

/** Meta's ?ids= form takes 50 at a time. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const actionVal = (arr: any[] = [], type: string) =>
  parseInt(arr?.find((a: any) => a.action_type === type)?.value || '0', 10)

const num = (v: any) => {
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}

function leadsOf(actions: any[] = []) {
  return actionVal(actions, 'lead') || actionVal(actions, 'offsite_conversion.fb_pixel_lead')
}

/** Turn one Meta insights row into the metric set both views share. */
function toMetrics(r: any): AdMetrics {
  const spend = num(r.spend)
  const impressions = num(r.impressions)
  const leads = leadsOf(r.actions)

  // inline_link_clicks is the link-click count; fall back to the link_click
  // action only if the field is absent, never to total `clicks`.
  const linkClicks = r.inline_link_clicks != null
    ? num(r.inline_link_clicks)
    : actionVal(r.actions, 'link_click')

  /* Hook rate's numerator is 3-SECOND video views, which live in `actions`
     as action_type "video_view". `video_play_actions` is a different metric —
     video *starts*, autoplay included — and using it put hook rate at 90%+
     for every video, which is the tell that it is counting impressions that
     merely began rendering. Kept only as a fallback. */
  const plays3s = actionVal(r.actions, 'video_view')
    || actionVal(r.video_play_actions, 'video_view')

  /* Quartiles are a share of video PLAYS, not of 3-second views. Meta counts
     the two separately: on a short video, 25% of its length can be under
     three seconds, so p25 legitimately exceeds video_view and a quartile
     expressed against 3s views reads as 142%. Plays is always the larger
     denominator, which is what makes the retention curve monotonic. */
  const videoPlays = actionVal(r.video_play_actions, 'video_view')
    || Math.max(plays3s, actionVal(r.video_p25_watched_actions, 'video_view'))

  const p25 = actionVal(r.video_p25_watched_actions, 'video_view') || num(r.video_p25_watched_actions?.[0]?.value)
  const p50 = actionVal(r.video_p50_watched_actions, 'video_view') || num(r.video_p50_watched_actions?.[0]?.value)
  const p75 = actionVal(r.video_p75_watched_actions, 'video_view') || num(r.video_p75_watched_actions?.[0]?.value)
  const p100 = actionVal(r.video_p100_watched_actions, 'video_view') || num(r.video_p100_watched_actions?.[0]?.value)

  /* Landing-page views measure who actually arrived, so LP view rate is the
     first place a click-to-lead gap shows up: clicks that never become a page
     view are a speed or redirect problem, not a creative one. */
  const landingPageViews = actionVal(r.actions, 'landing_page_view')

  const linkCtr = r.inline_link_click_ctr != null
    ? num(r.inline_link_click_ctr)
    : (impressions > 0 ? (linkClicks / impressions) * 100 : null)

  const linkCpc = r.cost_per_inline_link_click != null
    ? num(r.cost_per_inline_link_click)
    : (linkClicks > 0 ? spend / linkClicks : null)

  return {
    spend,
    impressions,
    linkClicks,
    leads,
    frequency: r.frequency != null ? num(r.frequency) : null,
    cpm: r.cpm != null ? num(r.cpm) : (impressions > 0 ? (spend / impressions) * 1000 : null),
    linkCtr,
    linkCpc,
    cpl: leads > 0 ? spend / leads : null,
    hookRate: impressions > 0 && plays3s > 0 ? (plays3s / impressions) * 100 : null,
    clickToLead: linkClicks > 0 ? (leads / linkClicks) * 100 : null,
    p25, p50, p75, p100,
    videoPlays,
    holdRate: videoPlays > 0 ? (p100 / videoPlays) * 100 : null,
    reach: num(r.reach),
    landingPageViews,
    lpViewRate: linkClicks > 0 ? (landingPageViews / linkClicks) * 100 : null,
    costPerLpView: landingPageViews > 0 ? spend / landingPageViews : null,
  }
}

/** Sum a set of daily rows into one metric set (ratios recomputed, not averaged). */
function aggregate(rows: any[]): AdMetrics {
  const spend = rows.reduce((s, r) => s + num(r.spend), 0)
  const impressions = rows.reduce((s, r) => s + num(r.impressions), 0)
  const linkClicks = rows.reduce((s, r) => s + (r.inline_link_clicks != null ? num(r.inline_link_clicks) : actionVal(r.actions, 'link_click')), 0)
  const leads = rows.reduce((s, r) => s + leadsOf(r.actions), 0)
  const plays3s = rows.reduce((s, r) => s + (actionVal(r.actions, 'video_view') || actionVal(r.video_play_actions, 'video_view')), 0)
  const videoPlays = rows.reduce((s, r) => s + actionVal(r.video_play_actions, 'video_view'), 0)
  const p100 = rows.reduce((s, r) => s + (actionVal(r.video_p100_watched_actions, 'video_view') || num(r.video_p100_watched_actions?.[0]?.value)), 0)

  // Frequency cannot be summed — it is impressions/reach over the window, and
  // reach de-duplicates across days. The daily mean is the honest stand-in.
  const freqs = rows.map(r => num(r.frequency)).filter(f => f > 0)
  const frequency = freqs.length ? freqs.reduce((a, b) => a + b, 0) / freqs.length : null

  return {
    spend, impressions, linkClicks, leads,
    frequency,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    linkCtr: impressions > 0 ? (linkClicks / impressions) * 100 : null,
    linkCpc: linkClicks > 0 ? spend / linkClicks : null,
    cpl: leads > 0 ? spend / leads : null,
    hookRate: impressions > 0 && plays3s > 0 ? (plays3s / impressions) * 100 : null,
    clickToLead: linkClicks > 0 ? (leads / linkClicks) * 100 : null,
    p25: 0, p50: 0, p75: 0, p100,
    videoPlays,
    reach: 0,
    landingPageViews: rows.reduce((s, r) => s + actionVal(r.actions, 'landing_page_view'), 0),
    lpViewRate: null,
    costPerLpView: null,
    holdRate: videoPlays > 0 ? (p100 / videoPlays) * 100 : null,
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const startDate = sp.get('start_date')
  const endDate = sp.get('end_date')
  const datePreset = sp.get('date_preset') || 'last_7d'

  const levelParam = sp.get('level')
  const level: Level = levelParam === 'adset' || levelParam === 'campaign' ? levelParam : 'ad'
  /* The 14-day daily series is the single most expensive thing here — it is a
     per-day row for every ad in the account — and nothing on first paint
     needs it. Only the delta arrows and the trend-aware verdicts do. The
     client asks for the table first (trend=0) and enriches after, so the
     funnel paints on one cheap range query instead of waiting on this. */
  const wantTrend = sp.get('trend') !== '0'
  const ids = ID_FIELDS[level]
  const FIELDS = fieldsFor(level)

  const dateParam: Record<string, string> = startDate && endDate
    ? { time_range: JSON.stringify({ since: startDate, until: endDate }) }
    : { date_preset: datePreset }

  /* One pass per configured account, run in parallel and merged. Each carries
     its own token — a token only reaches the accounts its system user is
     assigned to — and one account failing must not blank the others, so a
     failure is collected and reported alongside whatever did come back. */
  const accounts = adAccounts()
  if (accounts.length === 0) {
    return NextResponse.json({ ads: [], level, error: 'No Meta ad account is configured.', accounts: [] })
  }

  const perAccount = await Promise.all(accounts.map(async (acct: AdAccount) => {
    const [rangeRes, dailyRes, todayRes] = await Promise.all([
      fetchMeta(acct.token, `/${acct.id}/insights`, {
        fields: FIELDS, ...dateParam, level, limit: '500',
      }),
      // Always 14 days, independent of the selected range: the trend baseline
      // has to be stable, or switching the date picker would change the verdict.
      wantTrend
        ? fetchMeta(acct.token, `/${acct.id}/insights`, {
            fields: FIELDS, date_preset: 'last_14d', level,
            time_increment: '1', limit: '1000',
          })
        : Promise.resolve({ data: [] }),
      /* Today on its own. Nothing else can answer "is this still running" — a
         creative paused three days ago still carries seven days of spend in the
         selected range and looks alive in every column. */
      fetchMeta(acct.token, `/${acct.id}/insights`, {
        fields: [ids.id, 'spend', 'impressions'].join(','),
        date_preset: 'today', level, limit: '500',
      }),
    ])

    const today: Record<string, { spend: number; impressions: number }> = {}
    for (const r of todayRes.data || []) {
      today[r[ids.id]] = { spend: num(r.spend), impressions: num(r.impressions) }
    }

    /* Thumbnails. Insights carries no creative asset, so this is a second hop —
       addressed by ad id rather than walking /ads, because that edge returns
       every ad the account has ever had and the few dozen that delivered this
       week are not reliably in the first page of it. Fails soft: a card without
       a still is still a card. */
    const adIds: string[] = level === 'ad' && wantTrend
      ? (rangeRes.data || []).map((r: any) => r.ad_id).filter(Boolean)
      : []
    const creativeById: Record<string, { thumb: string | null; isVideo: boolean }> = {}

    /* thumbnail_url is a 64×64 crop — it renders as a blur at card size. The
       full asset lives on the story spec (1080×1920 for video, ~940px for
       image ads), so that is preferred and thumbnail_url is only the last
       resort. */
    const CREATIVE_FIELDS = [
      'creative{',
      'thumbnail_url,image_url,object_type,',
      'object_story_spec{video_data{image_url},link_data{picture}},',
      'asset_feed_spec{videos{thumbnail_url},images{url}}',
      '}',
    ].join('')

    await Promise.all(
      chunk(adIds, 50).map(async idsChunk => {
        const res = await fetchMeta(acct.token, '/', { ids: idsChunk.join(','), fields: CREATIVE_FIELDS })
        for (const [adId, val] of Object.entries<any>(res || {})) {
          const c = val?.creative
          if (!c) continue
          const oss = c.object_story_spec ?? {}
          const afs = c.asset_feed_spec ?? {}
          creativeById[adId] = {
            thumb:
              oss.video_data?.image_url ?? c.image_url ??
              afs.images?.[0]?.url ?? afs.videos?.[0]?.thumbnail_url ??
              oss.link_data?.picture ?? c.thumbnail_url ?? null,
            isVideo: c.object_type === 'VIDEO' || !!oss.video_data,
          }
        }
      })
    )

    // Group the daily series by row, newest last.
    const series: Record<string, any[]> = {}
    for (const row of dailyRes.data || []) {
      (series[row[ids.id]] ??= []).push(row)
    }
    for (const k of Object.keys(series)) {
      series[k].sort((a, b) => (a.date_start < b.date_start ? -1 : 1))
    }

    const rows = (rangeRes.data || []).map((r: any) => {
      const rowId = r[ids.id]
      const rowName = r[ids.name] ?? ''
      const metrics = toMetrics(r)
      const days = series[rowId] || []

      // Recent 3 days against the 7 before them. Short enough to catch a turn,
      // long enough that one bad day does not trigger a kill.
      const recentRows = days.slice(-3)
      const baseRows = days.slice(-10, -3)
      const hasTrend = recentRows.length >= 2 && baseRows.length >= 3

      const recent = recentRows.length ? aggregate(recentRows) : null
      const baseline = baseRows.length ? aggregate(baseRows) : null
      const delta = hasTrend ? computeDelta(recent!, baseline!) : { cpl: null, linkCtr: null, linkCpc: null, frequency: null }

      return {
        id: rowId,
        name: rowName,
        level,
        account: acct.key,
        accountLabel: acct.label,
        firm: firmOf(rowName),
        adsetName: r.adset_name ?? null,
        campaignName: r.campaign_name ?? null,
        ...parseAdName(rowName),
        hasThumb: !!creativeById[rowId]?.thumb,
        isVideo: creativeById[rowId]?.isVideo ?? false,
        spendToday: today[rowId]?.spend ?? 0,
        impressionsToday: today[rowId]?.impressions ?? 0,
        ...metrics,
        delta,
        hasTrend,
        health: healthVerdict(metrics, delta),
        creative: creativeVerdict(metrics, hasTrend ? delta : undefined),
        daily: days.map(d => {
          const m = toMetrics(d)
          return {
            date: d.date_start,
            spend: m.spend,
            leads: m.leads,
            cpl: m.cpl,
            linkCtr: m.linkCtr,
            linkCpc: m.linkCpc,
            frequency: m.frequency,
            impressions: m.impressions,
            hookRate: m.hookRate,
          }
        }),
      }
    })

    return { acct, rows, error: rangeRes.error ?? null }
  }))

  /* Outcomes (qualified / signed, and so CPQ and CPA) deliberately do NOT
     load here. They come from a GHL pipeline sweep that takes the better part
     of a minute, and blocking the whole funnel on the two columns it fills
     made this endpoint a 65-second request while every Meta call in it
     answered in single-digit milliseconds. The client fetches them alongside
     and merges when they land, so the table paints immediately. */
  const ads = perAccount.flatMap(p => p.rows)
    .map((r: any) => ({ ...r, qualified: null, signed: null, cpq: null, cpa: null, leadCvr: r.clickToLead }))
    .sort((a: any, b: any) => b.spend - a.spend)

  /* Account benchmarks: the spend-weighted average across everything in the
     range. The detail view judges a creative against these rather than
     against a fixed number, which is what "above account average" has to mean
     for it to be worth saying. */
  const totals = ads.reduce((t: any, a: any) => ({
    spend: t.spend + (a.spend || 0),
    impressions: t.impressions + (a.impressions || 0),
    linkClicks: t.linkClicks + (a.linkClicks || 0),
    leads: t.leads + (a.leads || 0),
    plays3s: t.plays3s + (a.hookRate != null ? (a.hookRate / 100) * (a.impressions || 0) : 0),
  }), { spend: 0, impressions: 0, linkClicks: 0, leads: 0, plays3s: 0 })

  const benchmarks = {
    hookRate: totals.impressions > 0 ? (totals.plays3s / totals.impressions) * 100 : null,
    linkCtr: totals.impressions > 0 ? (totals.linkClicks / totals.impressions) * 100 : null,
    leadCvr: totals.linkClicks > 0 ? (totals.leads / totals.linkClicks) * 100 : null,
    cpl: totals.leads > 0 ? totals.spend / totals.leads : null,
    cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null,
  }

  const summary = {
    creatives: ads.length,
    spend: totals.spend,
    leads: totals.leads,
    cpl: benchmarks.cpl,
  }

  /* Report per-account failures by name. "Meta error" with two accounts
     configured leaves nobody knowing which half of the page is missing. */
  const failures = perAccount.filter(p => p.error).map(p => `${p.acct.label}: ${p.error}`)

  return NextResponse.json({
    ads,
    benchmarks,
    summary,
    level,
    accounts: perAccount.map(p => ({ key: p.acct.key, label: p.acct.label, rows: p.rows.length, error: p.error })),
    error: failures.length ? failures.join(' · ') : null,
    trend: wantTrend,
    // Meta exposes 25/50/75/100% video quartiles. There is no 95% metric, so
    // the last column is true completions.
    videoQuartiles: [25, 50, 75, 100],
  })
}
