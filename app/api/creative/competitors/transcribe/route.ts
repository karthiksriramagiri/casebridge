import { NextRequest, NextResponse } from 'next/server'
import { admin } from '../_lib'
import { deepgramKey } from '@/app/venu/_lib/auth'

/* ═══════════════════════════════════════════════════════════════════════════
   Transcript extraction.

   No ffmpeg anywhere: Deepgram accepts a remote media URL and pulls the audio
   track out of the video itself. That matters because this deploys to Vercel
   serverless, where an ffmpeg binary is not available — the spec's "extract
   audio, then transcribe" step would have been the one thing that could not
   run in production.

   An ad with no speech (music-only, text-only) is a real and common case. It
   is recorded as has_audio:false with an empty transcript rather than being
   failed or forced into a hallucinated one.
   ═══════════════════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { ad_id } = await req.json()
  if (!ad_id) return NextResponse.json({ error: 'ad_id is required.' }, { status: 400 })

  const db = admin()
  const { data: ad } = await db
    .from('competitor_ads')
    .select('id, video_url, label')
    .eq('id', ad_id)
    .maybeSingle()

  if (!ad) return NextResponse.json({ error: 'Unknown ad.' }, { status: 404 })
  if (!ad.video_url) {
    return NextResponse.json({ error: 'This ad has no video URL to transcribe.' }, { status: 400 })
  }

  const key = deepgramKey()
  if (!key) return NextResponse.json({ error: 'DEEPGRAM_API_KEY is not set.' }, { status: 500 })

  await db.from('competitor_ads').update({ status: 'transcribing', error: null }).eq('id', ad_id)

  try {
    const res = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true&paragraphs=true&utterances=true',
      {
        method: 'POST',
        headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ad.video_url }),
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Deepgram ${res.status}: ${detail.slice(0, 300)}`)
    }

    const json = await res.json()
    const alt = json?.results?.channels?.[0]?.alternatives?.[0]
    const transcript: string = (alt?.transcript || '').trim()
    const duration: number | null = json?.metadata?.duration ?? null

    /* Word-level timings are what let the classifier say "the hook runs
       0:00–0:03" instead of guessing from sentence order. Keep them, drop the
       rest of Deepgram's payload. */
    const words = (alt?.words || []).map((w: any) => ({
      w: w.punctuated_word || w.word,
      s: Math.round(w.start * 100) / 100,
      e: Math.round(w.end * 100) / 100,
    }))

    await db.from('competitor_ads').update({
      status: 'transcribed',
      transcript,
      transcript_json: { words, paragraphs: alt?.paragraphs ?? null },
      has_audio: transcript.length > 0,
      duration_seconds: duration,
      error: null,
    }).eq('id', ad_id)

    return NextResponse.json({
      ok: true,
      transcript,
      hasAudio: transcript.length > 0,
      durationSeconds: duration,
      wordCount: words.length,
    })
  } catch (err: any) {
    const message = err?.message || 'Transcription failed.'
    console.error('[competitors:transcribe]', message)
    await db.from('competitor_ads').update({ status: 'failed', error: message }).eq('id', ad_id)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
