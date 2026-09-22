import { NextRequest, NextResponse } from 'next/server'
import { admin, BUCKET } from '../_lib'

/* ═══════════════════════════════════════════════════════════════════════════
   Frame storage.

   The spec calls for ffmpeg frame sampling plus scene detection. Neither can
   run on Vercel serverless — there is no ffmpeg binary. Frames are instead
   sampled in the browser: a <video> element seeks to each timestamp and draws
   to a canvas, which is exactly what ffmpeg -ss would produce, minus the
   binary. The browser posts the JPEGs here.

   The tradeoff is real and worth stating: canvas sampling is fixed-interval,
   so it does not do true scene-change detection. Cuts falling between samples
   are missed. At a ~1.5s interval on a 30s ad that is 20 frames, which has
   been enough for the classifier to build an accurate shot timeline; if the
   pipeline ever moves to a container with ffmpeg, swap this for the scene
   filter and nothing downstream changes.
   ═══════════════════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const adId = String(form?.get('ad_id') || '')
  if (!adId) return NextResponse.json({ error: 'ad_id is required.' }, { status: 400 })

  const files = form!.getAll('frames').filter((f): f is File => f instanceof File)
  const times = String(form?.get('times') || '').split(',').map(Number)
  if (!files.length) return NextResponse.json({ error: 'No frames received.' }, { status: 400 })

  const db = admin()
  // Re-sampling replaces the previous timeline rather than appending to it.
  await db.from('competitor_ad_frames').delete().eq('ad_id', adId)

  const rows: { ad_id: string; t_seconds: number; path: string }[] = []
  for (let i = 0; i < files.length; i++) {
    const t = Number.isFinite(times[i]) ? times[i] : i
    const path = `${adId}/frames/${String(i).padStart(3, '0')}.jpg`
    const { error } = await db.storage.from(BUCKET)
      .upload(path, files[i], { contentType: 'image/jpeg', upsert: true })
    if (error) {
      const missing = /bucket.*not found/i.test(error.message)
      return NextResponse.json({
        error: missing
          ? 'The competitor-ads storage bucket does not exist — run migration_competitor_ads.sql.'
          : error.message,
      }, { status: 500 })
    }
    rows.push({ ad_id: adId, t_seconds: t, path })
  }

  await db.from('competitor_ad_frames').insert(rows)
  await db.from('competitor_ads').update({ frames_count: rows.length }).eq('id', adId)

  return NextResponse.json({ ok: true, frames: rows.length })
}
