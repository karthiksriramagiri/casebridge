import { NextRequest, NextResponse } from 'next/server'
import { adAccounts, accountByKey } from '@/app/_metrics/ad-accounts'

/* ═══════════════════════════════════════════════════════════════════════════
   The video behind an ad.

   A thumbnail says what the cut looks like in the first frame; the question
   in the meeting is usually what it does after that. Meta will hand over
   the file, but not in one call: the ad names a video id, and the video
   names a source.

   So: ad → creative → video id → source. Two round trips, which is why the
   answer is cached — though only briefly. The source is a signed CDN URL
   with an expiry on it, and serving a stale one back would play nothing at
   all. Ten minutes is long enough that re-opening the same ad is instant
   and short enough that the link still works.

   The URL is handed to the browser rather than streamed through here. A
   30-second ad is a few megabytes; proxying every play through a
   serverless function would spend bandwidth and add a hop to something
   fbcdn already serves well, and the <video> element does not need CORS to
   play it.
   ═══════════════════════════════════════════════════════════════════════════ */

const BASE = 'https://graph.facebook.com/v25.0'

/* Short, because the source is signed and expires. The thumbnail proxy
   caches for a day; this cannot. */
const CACHE = 'private, max-age=600'

function tokensToTry(key: string | null): string[] {
  const named = accountByKey(key)
  if (named) return [named.token]
  return adAccounts().map((a) => a.token)
}

const CREATIVE_FIELDS =
  'creative{object_type,video_id,' +
  'object_story_spec{video_data{video_id}},' +
  'asset_feed_spec{videos{video_id}}}'

/** The first video id the ad names, wherever Meta happened to put it. */
function pickVideoId(c: any): string | null {
  if (!c) return null
  return (
    c.object_story_spec?.video_data?.video_id ??
    c.asset_feed_spec?.videos?.find((v: any) => v?.video_id)?.video_id ??
    c.video_id ??
    null
  )
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const account = req.nextUrl.searchParams.get('account')
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const tokens = tokensToTry(account)
  if (tokens.length === 0) return NextResponse.json({ error: 'No Meta token configured.' }, { status: 503 })

  /* Each token in turn, because an ad belongs to exactly one account and
     only that account's token can read it. A caller that knows the account
     passes it and this is a single attempt. */
  for (const token of tokens) {
    if (!token) continue
    const adRes: any = await fetch(
      `${BASE}/${id}?fields=${encodeURIComponent(CREATIVE_FIELDS)}&access_token=${token}`,
      { cache: 'no-store' },
    ).then((r) => r.json()).catch(() => null)
    if (!adRes || adRes.error) continue

    const videoId = pickVideoId(adRes.creative)
    /* An image ad is not a failure — it is an ad with no video, and the
       caller needs to tell those apart from a lookup that broke. */
    if (!videoId) {
      return NextResponse.json({ video: false }, { headers: { 'Cache-Control': CACHE } })
    }

    const vRes: any = await fetch(
      `${BASE}/${videoId}?fields=source,picture,length&access_token=${token}`,
      { cache: 'no-store' },
    ).then((r) => r.json()).catch(() => null)

    if (vRes?.source) {
      return NextResponse.json(
        { video: true, source: vRes.source, poster: vRes.picture ?? null, seconds: vRes.length ?? null },
        { headers: { 'Cache-Control': CACHE } },
      )
    }
    /* The ad names a video the token cannot read the file for — usually a
       page-owned video the ad account has access to but the video API does
       not hand over. Say so rather than reporting it as having no video. */
    return NextResponse.json(
      { video: true, error: vRes?.error?.message ?? 'Meta would not return the file for this video.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ error: 'Could not read that ad with any configured token.' }, { status: 404 })
}
