import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { BENCH, TREND } from '@/app/_metrics/benchmarks'

/* The findings shape is enforced by the API rather than parsed out of prose,
   so a malformed reply is impossible by construction.

   Written as a raw JSON schema rather than via the SDK's zodOutputFormat
   helper: that helper imports `zod/v4`, which this project's zod 3.25 does
   not ship, and upgrading zod across the whole app for one endpoint is not
   worth it. The helper only wraps a schema in exactly this envelope anyway. */
const FINDINGS_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'findings'],
    properties: {
      headline: {
        type: 'string',
        description: 'One sentence on the single most important thing happening in this account right now.',
      },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ad', 'severity', 'finding', 'action'],
          properties: {
            ad:       { type: 'string', description: 'Exact ad name, or "Account-wide".' },
            severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
            finding:  { type: 'string', description: 'What the daily series shows, with specific numbers and dates.' },
            action:   { type: 'string', description: 'What to do about it.' },
          },
        },
      },
    },
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   The trend reader.

   The thresholds in benchmarks.ts catch what has already broken. Meta is not
   that formulaic — an ad can be three days into a slide and still sit inside
   every band. This hands Claude the full daily series for each creative and
   asks for the turns a fixed rule would miss.

   Explicitly advisory: it returns findings, never actions taken. Nothing here
   can touch an ad.
   ═══════════════════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set.' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const preset = body.date_preset || 'last_7d'

  // Reuse the insights endpoint so the model reads exactly the numbers on
  // screen — a second Meta query here could disagree with the table.
  const origin = req.nextUrl.origin
  const res = await fetch(`${origin}/api/creative/insights?date_preset=${preset}`, {
    headers: { cookie: req.headers.get('cookie') || '' },
    cache: 'no-store',
  })
  const data = await res.json()
  const ads: any[] = data.ads || []

  // Only creatives with enough of a series to have a shape worth reading.
  const candidates = ads
    .filter(a => (a.daily || []).length >= 5 && a.spend > 50)
    .slice(0, 25)
    .map(a => ({
      ad: a.name,
      verdict: a.health.level,
      totals: {
        spend: Math.round(a.spend),
        leads: a.leads,
        cpl: a.cpl != null ? Math.round(a.cpl) : null,
        linkCtr: a.linkCtr != null ? +a.linkCtr.toFixed(2) : null,
        linkCpc: a.linkCpc != null ? +a.linkCpc.toFixed(2) : null,
        frequency: a.frequency != null ? +a.frequency.toFixed(2) : null,
        hookRate: a.hookRate != null ? Math.round(a.hookRate) : null,
      },
      days: (a.daily || []).map((d: any) => ({
        d: d.date?.slice(5),
        spend: Math.round(d.spend),
        leads: d.leads,
        cpl: d.cpl != null ? Math.round(d.cpl) : null,
        ctr: d.linkCtr != null ? +d.linkCtr.toFixed(2) : null,
        cpc: d.linkCpc != null ? +d.linkCpc.toFixed(2) : null,
        freq: d.frequency != null ? +d.frequency.toFixed(2) : null,
      })),
    }))

  if (candidates.length === 0) {
    return NextResponse.json({ headline: null, findings: [] })
  }

  const anthropic = new Anthropic({
    apiKey,
    // Org-level keys need the workspace header or the call 401s.
    ...(process.env.ANTHROPIC_WORKSPACE_ID
      ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } }
      : {}),
  })

  const prompt = `You are a paid-media analyst for a personal injury law firm's lead-gen account on Meta.

For each live creative you get two things, measured over DIFFERENT windows — do not compare them
to each other or treat the difference as a discrepancy:
  - "totals": the selected reporting range only (${preset.replace('last_', 'last ').replace('_', ' ')})
  - "days":   the last 14 days, one entry per day
The daily entries will therefore sum to more than "totals" whenever the selected range is shorter
than 14 days. That is expected. Base every finding on "days".

The team already applies these fixed thresholds, and the "verdict" field shows what they produced:
- Frequency healthy <${BENCH.frequency.healthy}, watch ${BENCH.frequency.healthy}-${BENCH.frequency.watch}, problem ${BENCH.frequency.watch}+ with decline
- Link CTR healthy >${BENCH.linkCtr.healthy}%, watch ${BENCH.linkCtr.watch}-${BENCH.linkCtr.healthy}%, problem <${BENCH.linkCtr.watch}%
- Link CPC healthy <$${BENCH.linkCpc.healthy}, watch $${BENCH.linkCpc.healthy}-${BENCH.linkCpc.watch}, problem >$${BENCH.linkCpc.watch}
- CPL healthy <=$${BENCH.cpl.healthy}, watch ~$${BENCH.cpl.healthy}-${BENCH.cpl.watch}, problem $${BENCH.cpl.watch}+
- WATCH at ${TREND.watchPct}%+ deterioration, KILL at ${TREND.killPct}%+ CPL deterioration with CTR or CPC agreeing

Your job is NOT to restate those. Meta is not that formulaic. Read the actual shape of each day
and surface what a fixed rule misses:
- a creative sliding for 3-4 straight days that has not yet crossed a threshold
- volatility that makes an average misleading (one cheap day masking four bad ones)
- a CPL that only looks fine because of a single lucky lead
- frequency climbing while CTR holds (not yet fatigue) vs the true fatigue signature
- recovery: something that dipped and is genuinely coming back, which should NOT be killed
- days with spend but zero leads clustering at the end of a series

Be specific and quantitative. Name the ad and cite the days. No filler, no generic advice.
If a creative is genuinely fine, do not invent a concern for it.

DATA:
${JSON.stringify(candidates, null, 1)}

Give a headline naming the single most important thing happening in this account right now,
then the findings. For each: the exact ad name (or "Account-wide"), a severity, what the daily
series shows with specific numbers and dates, and what to do about it.
Order most urgent first. At most 8. Prefer few, high-signal findings over a long list.`

  try {
    /* max_tokens has to cover thinking as well as the answer. The first
       version asked for 3000 and got back a single empty thinking block with
       stop_reason "max_tokens" — adaptive thinking is on by default and had
       spent the entire budget before writing a character of output. */
    const msg = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      output_config: { effort: 'high', format: FINDINGS_FORMAT },
      messages: [{ role: 'user', content: prompt }],
    } as any)

    const block = (msg as any).content.find((c: any) => c.type === 'text')
    const raw: string = block?.text ?? ''
    if (!raw) {
      console.error('[creative:analysis] empty reply. stop_reason=%s', (msg as any).stop_reason)
      return NextResponse.json({ error: 'The model returned no usable analysis.' }, { status: 502 })
    }

    const parsed = JSON.parse(raw) as { headline?: string; findings?: any[] }

    return NextResponse.json({
      headline: parsed.headline ?? null,
      findings: (parsed.findings ?? []).slice(0, 8),
      analysedAt: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[creative:analysis]', err?.message || err)
    return NextResponse.json({ error: err?.message || 'Analysis failed.' }, { status: 500 })
  }
}
