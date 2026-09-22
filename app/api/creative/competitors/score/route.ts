import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { admin, BUCKET, anthropicHeaders } from '../_lib'
import {
  SCORECARD_SCHEMA, TAXONOMY_VERSION,
  HOOK_TYPES, STRUCTURE_BEATS, MVA_ELEMENTS,
} from '@/app/_metrics/ad-taxonomy'

/* ═══════════════════════════════════════════════════════════════════════════
   Structure & hook classification.

   Claude sees the sampled frames, the timestamped transcript and the ad
   metadata together, and fills the scorecard schema. Structured outputs make
   the shape non-negotiable, so the frequency tables downstream can count on
   every label being drawn from the taxonomy rather than improvised.

   The taxonomy version is stamped onto the row: a report refuses to mix
   versions rather than averaging labels that no longer mean the same thing.
   ═══════════════════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic'
export const maxDuration = 600

const MAX_FRAMES = 20   // ~1 image per 1.5s of a 30s ad; beyond this the
                        // marginal frame adds cost, not signal

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set.' }, { status: 500 })

  const { ad_id } = await req.json()
  if (!ad_id) return NextResponse.json({ error: 'ad_id is required.' }, { status: 400 })

  const db = admin()
  const { data: ad } = await db
    .from('competitor_ads')
    .select('id, label, brand_name, source_type, transcript, transcript_json, duration_seconds, run_days, has_audio')
    .eq('id', ad_id)
    .maybeSingle()

  if (!ad) return NextResponse.json({ error: 'Unknown ad.' }, { status: 404 })

  await db.from('competitor_ads').update({ status: 'analyzing', error: null }).eq('id', ad_id)

  try {
    /* ── Frames ──────────────────────────────────────────────────────────── */
    const { data: frameRows } = await db
      .from('competitor_ad_frames')
      .select('t_seconds, path')
      .eq('ad_id', ad_id)
      .order('t_seconds', { ascending: true })

    const picked = pickEvenly(frameRows || [], MAX_FRAMES)
    const images: { t: number; b64: string }[] = []
    for (const f of picked) {
      const { data: blob } = await db.storage.from(BUCKET).download(f.path)
      if (!blob) continue
      const buf = Buffer.from(await blob.arrayBuffer())
      images.push({ t: Number(f.t_seconds), b64: buf.toString('base64') })
    }

    /* ── Transcript with timings ─────────────────────────────────────────── */
    const words: any[] = (ad.transcript_json as any)?.words || []
    const timedTranscript = words.length
      ? groupIntoLines(words)
      : (ad.transcript || '(no speech in this ad)')

    const anthropic = new Anthropic({ apiKey, ...anthropicHeaders() })

    const content: any[] = []
    for (const img of images) {
      content.push({ type: 'text', text: `Frame at ${fmt(img.t)}:` })
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: img.b64 },
      })
    }
    content.push({ type: 'text', text: buildPrompt(ad, timedTranscript, images.length) })

    const msg = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      output_config: { effort: 'high', format: SCORECARD_SCHEMA },
      messages: [{ role: 'user', content }],
    } as any)

    const block = (msg as any).content.find((c: any) => c.type === 'text')
    const raw: string = block?.text ?? ''
    if (!raw) throw new Error(`The model returned no scorecard (stop_reason: ${(msg as any).stop_reason}).`)

    const scorecard = JSON.parse(raw)

    await db.from('competitor_ads').update({
      status: 'scored',
      scorecard,
      taxonomy_version: TAXONOMY_VERSION,
      error: null,
    }).eq('id', ad_id)

    return NextResponse.json({ ok: true, scorecard, framesUsed: images.length })
  } catch (err: any) {
    const message = err?.message || 'Scoring failed.'
    console.error('[competitors:score]', message)
    await db.from('competitor_ads').update({ status: 'failed', error: message }).eq('id', ad_id)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/* Evenly spaced rather than the first N — the back half of an ad carries the
   offer and CTA, and truncating to the first 20 frames would systematically
   lose them. */
function pickEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr
  const step = (arr.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)])
}

function fmt(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Word-level timings are noise at full resolution; group into spoken lines. */
function groupIntoLines(words: any[]): string {
  const lines: string[] = []
  let start = words[0]?.s ?? 0
  let buf: string[] = []
  for (const w of words) {
    buf.push(w.w)
    const ends = /[.!?]$/.test(w.w)
    if (ends || buf.length >= 14) {
      lines.push(`[${fmt(start)}–${fmt(w.e)}] ${buf.join(' ')}`)
      buf = []
      start = w.e
    }
  }
  if (buf.length) lines.push(`[${fmt(start)}–…] ${buf.join(' ')}`)
  return lines.join('\n')
}

function buildPrompt(ad: any, transcript: string, frameCount: number) {
  const hookList = HOOK_TYPES.map(h => `  - ${h.key}: ${h.hint}`).join('\n')
  const beatList = STRUCTURE_BEATS.map(b => `  - ${b.key}: ${b.label}`).join('\n')
  const mvaList = MVA_ELEMENTS.map(m => `  - ${m.key}: ${m.label}`).join('\n')

  return `You are analysing a single paid social video ad for a personal injury / motor vehicle
accident lead-generation account. Classify it against the fixed taxonomy below.

AD
  Label:    ${ad.label || '(unnamed)'}
  Brand:    ${ad.brand_name || '(unknown)'}
  Source:   ${ad.source_type === 'ours' ? 'OUR OWN creative' : 'a COMPETITOR'}
  Duration: ${ad.duration_seconds ? `${Math.round(ad.duration_seconds)}s` : 'unknown'}
  ${ad.run_days ? `Days running: ${ad.run_days}` : ''}

You have ${frameCount} sampled frames above, in chronological order, each labelled with its
timestamp. ${frameCount === 0 ? 'NO FRAMES WERE AVAILABLE — you are working from the transcript alone. Set confidence to "low" and say so in notable_observations.' : 'Read the on-screen text directly from the frames.'}

TRANSCRIPT (timestamped)
${transcript}
${ad.has_audio === false ? '\nThis ad has NO SPOKEN AUDIO. Classify the hook and structure from the visuals and on-screen text alone. Do not invent spoken lines.' : ''}

HOOK TYPES — pick exactly one for the first 3 seconds:
${hookList}

STRUCTURE BEATS — record which are present, with timestamps, and which are absent:
${beatList}

VERTICAL-SPECIFIC ELEMENTS — record every one the ad uses:
${mvaList}

RULES
- Quote verbatim. The hook line must be the ad's actual words (or a literal description of the
  opening visual), never a paraphrase.
- Frames are sampled at intervals, so a cut between two samples is invisible to you. Estimate
  avg_shot_length_seconds from what you can actually see and do not overstate precision.
- Only report an element as present if you can point to it. Absence is a finding; a guess is not.
- Set confidence to "low" if frames were missing or the transcript was empty, and explain why in
  notable_observations.
- hook_to_first_cta_seconds is the time to the FIRST ask for action, spoken or on-screen. Null if
  the ad never asks.`
}
