import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { adCodes } from '@/app/_metrics/hooks'

/* ═══════════════════════════════════════════════════════════════════════════
   One creative, read closely.

   /api/creative/analysis reads the whole account and returns findings across
   ads. This answers the narrower question the winners panel asks: why did
   THIS creative perform the way it did, and what should the next version
   change?

   The model is given only numbers that came off the screen — the ad's own
   metrics, the account medians it is being compared against, and the hook
   codes parsed out of its name. It is told to work from those and to say so
   when the data cannot support a claim, because a brief that invents a
   reason sends a designer off to shoot the wrong thing.
   ═══════════════════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BRIEF_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['diagnosis', 'keep', 'test_next', 'deliverable', 'confidence'],
    properties: {
      diagnosis: {
        type: 'string',
        description:
          'Two or three sentences on what the funnel shape says about this creative. Name the stage that is carrying it and the stage that is losing people, with the numbers.',
      },
      keep: {
        type: 'array',
        description: 'What is working and must survive into the next version. Each item is one short clause, tied to something observable.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'detail'],
          properties: {
            label:  { type: 'string', description: 'e.g. "Core angle", "Opening structure", "Message", "CTA"' },
            detail: { type: 'string' },
          },
        },
      },
      test_next: {
        type: 'array',
        description: 'Concrete next variations, most promising first. At most 6.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['change', 'why'],
          properties: {
            change: { type: 'string', description: 'The single thing to change, stated as an instruction a designer can execute.' },
            why:    { type: 'string', description: 'The number or pattern that motivates it.' },
          },
        },
      },
      deliverable: {
        type: 'string',
        description: 'One line naming what to actually produce, e.g. "4 variations on the same core angle, new openings only."',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'low when spend or leads are too thin for the numbers to mean much — say that in the diagnosis.',
      },
    },
  },
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set.' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const ad = body.ad
  if (!ad?.name) return NextResponse.json({ error: 'An ad is required.' }, { status: 400 })

  const codes = adCodes(ad.name)
  const acct = body.account || {}

  const n = (v: any, d = 2) => (typeof v === 'number' && isFinite(v) ? +v.toFixed(d) : null)

  /* The retention curve is the part a creative actually controls, so it is
     handed over as a curve rather than four loose numbers. */
  const plays = ad.videoPlays || 0
  const curve = plays > 0
    ? {
        plays,
        held_25pct:  Math.round((ad.p25 / plays) * 100),
        held_50pct:  Math.round((ad.p50 / plays) * 100),
        held_75pct:  Math.round((ad.p75 / plays) * 100),
        held_100pct: Math.round((ad.p100 / plays) * 100),
      }
    : null

  const payload = {
    ad_name: ad.name,
    campaign: ad.campaignName ?? null,
    firm: ad.firm ?? null,
    format: codes.formatLabel ?? codes.format ?? null,
    visual_hook: codes.visualLabel ?? null,
    verbal_hook: codes.verbalLabel ?? null,
    verdict: ad.creative?.label ?? null,
    verdict_reason: ad.creative?.why ?? null,
    health: ad.health?.level ?? null,
    spend: Math.round(ad.spend || 0),
    leads: ad.leads || 0,
    metrics: {
      cpl: n(ad.cpl, 0),
      hook_rate_pct: n(ad.hookRate, 0),
      link_ctr_pct: n(ad.linkCtr),
      link_cpc: n(ad.linkCpc),
      click_to_lead_pct: n(ad.clickToLead, 1),
      frequency: n(ad.frequency),
      cpm: n(ad.cpm),
      impressions: ad.impressions || 0,
      link_clicks: ad.linkClicks || 0,
    },
    retention: curve,
    account_medians: {
      cpl: n(acct.cpl, 0),
      hook_rate_pct: n(acct.hookRate, 0),
      link_ctr_pct: n(acct.linkCtr),
      click_to_lead_pct: n(acct.clickToLead, 1),
    },
    recent_trend_vs_prior_week: ad.delta ?? null,
    daily: (ad.daily || []).slice(-10).map((d: any) => ({
      d: d.date?.slice(5),
      spend: Math.round(d.spend || 0),
      leads: d.leads || 0,
      cpl: d.cpl != null ? Math.round(d.cpl) : null,
      ctr: n(d.linkCtr),
    })),
  }

  const anthropic = new Anthropic({
    apiKey,
    // Org-level keys need the workspace header or the call 401s.
    ...(process.env.ANTHROPIC_WORKSPACE_ID
      ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } }
      : {}),
  })

  const prompt = `You are the creative strategist on a motor-vehicle-accident lead-gen account.
One creative's performance is below. Write the brief for its next version.

${JSON.stringify(payload, null, 2)}

How to read it:
- hook_rate_pct is 3-second views over impressions — whether the opening stopped anyone.
- retention.held_* is the share of video plays still watching at each quartile — whether the
  middle held them. Meta exposes 25/50/75/100 only; there is no 95% metric.
- link_ctr_pct is link clicks over impressions, click_to_lead_pct is leads over link clicks —
  the ad's ask and the landing page's close, in that order.
- A strong hook with weak retention is a middle problem, not an opening problem. Strong
  retention with weak CTR is an ask problem. Strong CTR with weak click-to-lead is not a
  creative problem at all — say so rather than inventing creative fixes for it.

Rules:
- Work only from these numbers and the hook labels given. Never invent a detail about what is
  on screen — you have not watched the video. Where a claim needs the footage, say what to
  check instead of asserting it.
- Compare against account_medians explicitly when you cite a metric as strong or weak.
- If spend or leads are too thin to support conclusions, set confidence low and say which
  number you would need.
- test_next must change one thing per item, and each must be executable without further
  instruction.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      output_config: { effort: 'high', format: BRIEF_FORMAT },
      messages: [{ role: 'user', content: prompt }],
    } as any)

    const block = (msg as any).content.find((c: any) => c.type === 'text')
    const raw: string = block?.text ?? ''
    if (!raw) {
      console.error('[creative:diagnose] empty reply. stop_reason=%s', (msg as any).stop_reason)
      return NextResponse.json({ error: 'The model returned no usable brief.' }, { status: 502 })
    }

    const parsed = JSON.parse(raw)
    return NextResponse.json({
      ...parsed,
      test_next: (parsed.test_next ?? []).slice(0, 6),
      adName: ad.name,
      analysedAt: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[creative:diagnose]', err?.message || err)
    return NextResponse.json({ error: err?.message || 'Diagnosis failed.' }, { status: 500 })
  }
}
