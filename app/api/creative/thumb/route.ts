import { NextRequest } from 'next/server'

/* ═══════════════════════════════════════════════════════════════════════════
   Creative stills, proxied.

   Meta hands back two shapes of image URL and the browser can only render
   one of them. The scontent CDN links load directly; the high-resolution
   ones (`facebook.com/ads/image/?d=…`) answer with a 302 to a signed CDN
   URL that a cross-origin <img> will not follow, so the card falls back to
   its placeholder — which is what put "BO" boxes on half the rows.

   Fetching server-side sidesteps all of it: redirects are followed here, the
   bytes are streamed back same-origin, and the URL the page holds is stable
   (an ad id) rather than a signed link that expires.
   ═══════════════════════════════════════════════════════════════════════════ */

const TOKEN = (process.env.META_ACCESS_TOKEN || '').trim().replace(/\\n$/, '')
const BASE = 'https://graph.facebook.com/v25.0'

/* A day in the browser, a week at the edge. The still for a given ad does not
   change — a new creative is a new ad id — so this is safe to hold onto. */
const CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'

const CREATIVE_FIELDS =
  'creative{thumbnail_url,image_url,object_type,' +
  'object_story_spec{video_data{image_url},link_data{picture}},' +
  'asset_feed_spec{videos{thumbnail_url},images{url}}}'

/** Widest asset first; thumbnail_url is 64×64 and only a last resort. */
function pickUrl(c: any): string | null {
  if (!c) return null
  const oss = c.object_story_spec ?? {}
  const afs = c.asset_feed_spec ?? {}
  return (
    oss.video_data?.image_url ??
    c.image_url ??
    afs.images?.[0]?.url ??
    afs.videos?.[0]?.thumbnail_url ??
    oss.link_data?.picture ??
    c.thumbnail_url ??
    null
  )
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) return new Response('bad id', { status: 400 })
  if (!TOKEN) return new Response('no token', { status: 503 })

  try {
    const metaUrl = new URL(`${BASE}/${id}`)
    metaUrl.searchParams.set('fields', CREATIVE_FIELDS)
    metaUrl.searchParams.set('access_token', TOKEN)

    const metaRes = await fetch(metaUrl.toString(), { next: { revalidate: 3600 } })
    const json = await metaRes.json()
    const src = pickUrl(json?.creative)
    if (!src) return new Response('no image', { status: 404 })

    // redirect: 'follow' is the default and is the whole point of this hop.
    const imgRes = await fetch(src)
    if (!imgRes.ok || !imgRes.body) return new Response('upstream failed', { status: 502 })

    return new Response(imgRes.body, {
      headers: {
        'Content-Type': imgRes.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': CACHE,
      },
    })
  } catch (err) {
    console.error('[creative:thumb]', (err as Error).message)
    return new Response('error', { status: 500 })
  }
}
