import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/* ═══════════════════════════════════════════════════════════════════════════
   New-lead Slack alerts, swept from the GHL API.

   There are eleven separate "New Lead" stages — one per pipeline — so driving
   this from workflow webhooks means eleven workflows that each have to exist,
   stay enabled and keep pointing at the right URL. One that is missing fails
   silently, and a silent gap in a live feed is worse than no feed.

   This sweeps every pipeline instead: one job, no per-pipeline configuration,
   and a new pipeline is picked up automatically because the stages are read
   from GHL rather than hardcoded.

   The webhook still fires too and is instant; this is the net beneath it. Both
   write to the same dedupe table, so a lead announced by the webhook is never
   announced again here.
   ═══════════════════════════════════════════════════════════════════════════ */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'
const GHL_API = 'https://services.leadconnectorhq.com'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const headers = () => ({
  Authorization: `Bearer ${(process.env.GHL_API_KEY ?? '').trim()}`,
  Version: '2021-07-28',
})

/** Only announce leads this fresh. A first run, or a long outage, must not
    dump hours of history into the channel as though it just arrived. */
const MAX_AGE_MIN = 90

type NewStage = { pipelineId: string; pipelineName: string; stageId: string }

/** Every "New Lead" stage, read from GHL so a new pipeline needs no code. */
async function newLeadStages(): Promise<NewStage[]> {
  const res = await fetch(`${GHL_API}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`,
    { headers: headers(), cache: 'no-store' })
  if (!res.ok) throw new Error(`pipelines ${res.status}`)
  const data: any = await res.json()
  const out: NewStage[] = []
  for (const p of data.pipelines ?? []) {
    for (const st of p.stages ?? []) {
      if (String(st.name || '').toLowerCase().includes('new lead')) {
        out.push({ pipelineId: p.id, pipelineName: p.name, stageId: st.id })
      }
    }
  }
  return out
}

/** Resolve an ad id to its creative and ad set names. */
async function creativeNames(adId: string | null) {
  const token = (process.env.FB_ACCESS_TOKEN || '').trim()
  if (!adId || adId.includes('{{') || !token) return { creative: null, adset: null }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${adId}?fields=name,adset{name}&access_token=${token}`,
      { next: { revalidate: 3600 } })
    if (!res.ok) return { creative: null, adset: null }
    const d: any = await res.json()
    return { creative: d.name ?? null, adset: d.adset?.name ?? null }
  } catch { return { creative: null, adset: null } }
}

export async function GET(req: NextRequest) {
  // Vercel signs cron requests; a manual call needs the same secret.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const qs = req.nextUrl.searchParams.get('secret')
    if (auth !== `Bearer ${secret}` && qs !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const hook = process.env.SLACK_NEW_LEAD_WEBHOOK
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'
  if (!hook && !dryRun) return NextResponse.json({ error: 'SLACK_NEW_LEAD_WEBHOOK is not set' }, { status: 503 })

  const cutoff = Date.now() - MAX_AGE_MIN * 60_000
  const found: any[] = []

  try {
    const stages = await newLeadStages()

    for (const st of stages) {
      const url = `${GHL_API}/opportunities/search?location_id=${GHL_LOCATION_ID}` +
                  `&pipeline_id=${st.pipelineId}&pipeline_stage_id=${st.stageId}&limit=100`
      const res = await fetch(url, { headers: headers(), cache: 'no-store' })
      if (!res.ok) {
        console.error('[new-lead-alerts] search failed', st.pipelineName, res.status)
        continue
      }
      const data: any = await res.json()
      for (const opp of data.opportunities ?? []) {
        const created = Date.parse(opp.createdAt || '')
        if (!created || created < cutoff) continue
        const attr = opp.attributions?.find((a: any) => a.isFirst) || opp.attributions?.[0]
        found.push({
          id: opp.id,
          name: opp.contact?.name || opp.name || null,
          pipeline: st.pipelineName,
          adId: attr?.utmAdId || attr?.utmContent || null,
          createdAt: opp.createdAt,
        })
      }
    }

    if (found.length === 0) {
      return NextResponse.json({ ok: true, stages: stages.length, found: 0, sent: 0 })
    }

    /* Drop anything already announced — by this sweep on a previous run or by
       the webhook, which writes the same table. */
    const { data: seen, error: seenErr } = await supabase
      .from('lead_alerts').select('opportunity_id')
      .in('opportunity_id', found.map(f => f.id))
    const tableMissing = seenErr && /lead_alerts|schema cache/i.test(seenErr.message)
    /* Without the dedupe table there is no way to avoid repeating a lead every
       five minutes, so the live path refuses. A dry run still reports what the
       sweep found — that is the half worth checking before the table exists. */
    if (seenErr && !(tableMissing && dryRun)) {
      return NextResponse.json({
        error: tableMissing
          ? 'Run supabase/migration_lead_alerts.sql to enable new-lead alerts.'
          : seenErr.message,
      }, { status: 503 })
    }
    const already = new Set((seen ?? []).map(r => r.opportunity_id))
    const fresh = found.filter(f => !already.has(f.id))

    if (dryRun) {
      return NextResponse.json({
        ok: true, dryRun: true,
        stages: stages.length,
        found: found.length,
        wouldSend: fresh.length,
        dedupeTable: tableMissing ? 'missing — run migration_lead_alerts.sql' : 'ready',
        sample: fresh.slice(0, 5),
      })
    }

    let sent = 0
    for (const lead of fresh) {
      /* Claim it before posting. If the write loses a race with the webhook the
         insert conflicts and we skip — better a missed duplicate than two
         messages for one lead. */
      const { error: claimErr } = await supabase.from('lead_alerts').insert({
        opportunity_id: lead.id,
        contact_name: lead.name,
        pipeline: lead.pipeline,
        ad_id: lead.adId,
        lead_created_at: lead.createdAt,
      })
      if (claimErr) continue

      const { creative, adset } = await creativeNames(lead.adId)
      const timePst = new Date(lead.createdAt).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
      })

      const text = [
        `Creative : ${creative || '—'}`,
        `Adset : ${adset || '—'}`,
        `Time(PST) : ${timePst}`,
      ].join('\n')

      const r = await fetch(hook!, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (r.ok) sent++
      else console.error('[new-lead-alerts] slack refused', r.status)
    }

    return NextResponse.json({ ok: true, stages: stages.length, found: found.length, sent })
  } catch (err: any) {
    console.error('[new-lead-alerts]', err?.message || err)
    return NextResponse.json({ error: err?.message || 'sweep failed' }, { status: 500 })
  }
}
