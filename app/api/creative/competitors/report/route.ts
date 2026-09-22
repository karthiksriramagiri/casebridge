import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { admin, anthropicHeaders } from '../_lib'
import {
  TAXONOMY_VERSION, HOOK_LABEL, BEAT_LABEL, MVA_LABEL,
  STRUCTURE_BEATS,
} from '@/app/_metrics/ad-taxonomy'

/* ═══════════════════════════════════════════════════════════════════════════
   Cross-ad comparison, gap analysis and the framework.

   The frequency tables are computed in code, not by the model — counting is
   the one thing here that must be exactly right, and a model asked to tally
   30 scorecards will occasionally miscount. Claude receives the finished
   tables and does what it is actually good at: reading what the pattern
   means and proposing a structure worth testing.
   ═══════════════════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic'
export const maxDuration = 600

type Tally = { key: string; label: string; n: number; pct: number }

function tally(vals: string[], labels: Record<string, string>, total: number): Tally[] {
  const c: Record<string, number> = {}
  for (const v of vals) c[v] = (c[v] || 0) + 1
  return Object.entries(c)
    .map(([key, n]) => ({ key, label: labels[key] || key, n, pct: total ? Math.round((n / total) * 100) : 0 }))
    .sort((a, b) => b.n - a.n)
}

function profile(ads: any[]) {
  const n = ads.length
  const cards = ads.map(a => a.scorecard).filter(Boolean)

  const hooks = tally(cards.map(c => c?.hook?.type).filter(Boolean), HOOK_LABEL, n)

  // A beat is counted once per ad even if the model listed it twice.
  const beats = tally(
    cards.flatMap(c => [...new Set((c?.structure_beats_present || []).map((b: any) => b.beat))] as string[]),
    BEAT_LABEL, n)

  const mva = tally(cards.flatMap(c => (c?.mva_elements || []) as string[]), MVA_LABEL, n)
  const cuts = tally(cards.map(c => c?.pacing?.cut_frequency).filter(Boolean), {}, n)
  const styles = tally(cards.map(c => c?.pacing?.visual_style).filter(Boolean), {}, n)

  const ctaTimes = cards.map(c => c?.hook_to_first_cta_seconds).filter((v: any) => typeof v === 'number')
  const durations = ads.map(a => a.duration_seconds).filter((v: any) => typeof v === 'number')

  return {
    count: n,
    hooks, beats, mva, cuts, styles,
    medianCtaSeconds: median(ctaTimes),
    medianDurationSeconds: median(durations),
  }
}

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10
}

/** Present in the competitor set, rare or absent in ours — and the reverse. */
function gaps(theirs: Tally[], ours: Tally[], ourCount: number) {
  const ourBy: Record<string, Tally> = Object.fromEntries(ours.map(t => [t.key, t]))
  const theirBy: Record<string, Tally> = Object.fromEntries(theirs.map(t => [t.key, t]))

  const missing = theirs
    .filter(t => t.pct >= 25 && (ourBy[t.key]?.pct ?? 0) <= 10)
    .map(t => ({ key: t.key, label: t.label, theirN: t.n, theirPct: t.pct, ourN: ourBy[t.key]?.n ?? 0, ourPct: ourBy[t.key]?.pct ?? 0 }))

  const onlyOurs = ourCount === 0 ? [] : ours
    .filter(t => t.pct >= 25 && (theirBy[t.key]?.pct ?? 0) <= 10)
    .map(t => ({ key: t.key, label: t.label, ourN: t.n, ourPct: t.pct, theirN: theirBy[t.key]?.n ?? 0, theirPct: theirBy[t.key]?.pct ?? 0 }))

  return { missing, onlyOurs }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set.' }, { status: 500 })

  const { batch } = await req.json().catch(() => ({ batch: null }))

  const db = admin()
  let q = db.from('competitor_ads')
    .select('id, label, brand_name, source_type, run_days, duration_seconds, scorecard, taxonomy_version, transcript')
    .eq('status', 'scored')
  if (batch) q = q.eq('batch', batch)

  const { data: all, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const scored = (all || []).filter(a => a.scorecard)
  if (scored.length < 2) {
    return NextResponse.json({ error: 'At least two scored ads are needed to compare.' }, { status: 400 })
  }

  /* Refuse to mix taxonomy versions — labels that no longer mean the same
     thing would be silently averaged into one table. */
  const versions = [...new Set(scored.map(a => a.taxonomy_version).filter(Boolean))]
  if (versions.length > 1) {
    return NextResponse.json({
      error: `This batch mixes taxonomy versions (${versions.join(', ')}). Re-score the older ads before comparing.`,
    }, { status: 409 })
  }

  const theirs = scored.filter(a => a.source_type === 'competitor')
  const ours = scored.filter(a => a.source_type === 'ours')

  const theirProfile = profile(theirs)
  const ourProfile = profile(ours)

  const hookGaps = gaps(theirProfile.hooks, ourProfile.hooks, ours.length)
  const beatGaps = gaps(theirProfile.beats, ourProfile.beats, ours.length)
  const mvaGaps = gaps(theirProfile.mva, ourProfile.mva, ours.length)

  /* Run duration is the only public signal that a competitor's creative is
     working. It is inference, not fact, and is labelled as such throughout. */
  const longestRunning = [...theirs]
    .filter(a => typeof a.run_days === 'number')
    .sort((a, b) => (b.run_days || 0) - (a.run_days || 0))
    .slice(0, 5)
    .map(a => ({
      label: a.label, brand: a.brand_name, runDays: a.run_days,
      hook: a.scorecard?.hook?.type ? (HOOK_LABEL[a.scorecard.hook.type] || a.scorecard.hook.type) : null,
      hookLine: a.scorecard?.hook?.verbatim_line_or_visual ?? null,
      beats: (a.scorecard?.structure_beats_present || []).map((b: any) => b.beat),
    }))

  const tables = {
    competitors: theirProfile,
    ours: ourProfile,
    gaps: { hooks: hookGaps, beats: beatGaps, mva: mvaGaps },
    longestRunning,
  }

  const anthropic = new Anthropic({ apiKey, ...anthropicHeaders() })

  const prompt = `You are a creative strategist for a personal injury / MVA lead-generation account.

Below are FREQUENCY TABLES computed directly from ${scored.length} scored video ads
(${theirs.length} competitor, ${ours.length} ours). The counting is already done and is exact —
do not recount, and do not contradict these numbers.

Your job is to interpret them and produce something a scriptwriter can act on.

${JSON.stringify(tables, null, 1)}

HOOK LINES actually used by competitors (verbatim):
${theirs.slice(0, 20).map(a => `  - [${a.run_days ?? '?'}d] "${a.scorecard?.hook?.verbatim_line_or_visual ?? ''}"`).join('\n')}

${ours.length === 0 ? 'NOTE: no ads of ours were scored in this batch, so gap analysis against our own creative is not possible. Say so plainly and confine yourself to the competitor pattern.' : ''}

Produce:
1. A summary — 2-4 sentences, the headline findings.
2. Gap findings, each tied to the evidence in the tables, phrased with the counts
   ("6 of 8 competitor ads open with a question hook; 0 of our 5 do"). Include patterns WE use
   that they do not, flagged honestly as either a strength or a blind spot — do not pre-judge
   which it is; give the reasoning both ways where it is genuinely ambiguous.
3. One or more framework templates: a concrete beat-by-beat structure with suggested timings,
   derived from what the longest-running competitor ads share. Concrete enough to hand to an
   editor. If two genuinely different approaches are worth testing, give both.
4. A prioritised list of suggestions. Each needs: what to test, why (cite the evidence),
   effort ("quick test" or "production lift"), and expected signal to watch.

Distinguish OBSERVED from INFERRED. Run duration is a proxy for a creative working — it is not
proof, and must be labelled as inference wherever you lean on it.
These are recommendations for a human to review; nothing here is auto-applied to any campaign.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      output_config: { effort: 'high', format: REPORT_SCHEMA },
      messages: [{ role: 'user', content: prompt }],
    } as any)

    const block = (msg as any).content.find((c: any) => c.type === 'text')
    const raw: string = block?.text ?? ''
    if (!raw) throw new Error(`No report returned (stop_reason: ${(msg as any).stop_reason}).`)

    const narrative = JSON.parse(raw)
    const report = { tables, ...narrative, generatedAt: new Date().toISOString() }

    const { data: saved } = await db.from('competitor_reports').insert({
      batch: batch || null,
      title: `Ad Creative Intelligence — ${batch || new Date().toISOString().slice(0, 10)}`,
      report,
      ad_ids: scored.map(a => a.id),
      taxonomy_version: TAXONOMY_VERSION,
    }).select().single()

    return NextResponse.json({ report, id: saved?.id ?? null })
  } catch (err: any) {
    console.error('[competitors:report]', err?.message || err)
    return NextResponse.json({ error: err?.message || 'Report generation failed.' }, { status: 502 })
  }
}

const REPORT_SCHEMA = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'gap_findings', 'frameworks', 'suggestions'],
    properties: {
      summary: { type: 'string' },
      gap_findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['finding', 'evidence', 'kind'],
          properties: {
            finding: { type: 'string' },
            evidence: { type: 'string', description: 'The counts this rests on, stated explicitly.' },
            kind: { type: 'string', enum: ['they_do_we_dont', 'we_do_they_dont', 'shared'] },
            verdict: {
              type: ['string', 'null'],
              enum: ['strength', 'blind_spot', 'ambiguous', null],
              description: 'For we_do_they_dont only. "ambiguous" is a legitimate answer.',
            },
          },
        },
      },
      frameworks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'rationale', 'beats'],
          properties: {
            name: { type: 'string' },
            rationale: { type: 'string' },
            beats: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['beat', 'timing', 'direction'],
                properties: {
                  beat: { type: 'string', enum: STRUCTURE_BEATS.map(b => b.key) },
                  timing: { type: 'string', description: 'e.g. "0:00-0:03"' },
                  direction: { type: 'string', description: 'What to actually put here, concretely.' },
                },
              },
            },
          },
        },
      },
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['what', 'why', 'effort', 'watch', 'basis'],
          properties: {
            what: { type: 'string' },
            why: { type: 'string' },
            effort: { type: 'string', enum: ['quick_test', 'production_lift'] },
            watch: { type: 'string', description: 'The metric that would tell us it worked.' },
            basis: { type: 'string', enum: ['observed', 'inferred'] },
          },
        },
      },
    },
  },
}
