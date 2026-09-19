import { NextRequest, NextResponse } from 'next/server'
import { getConversationData } from '@/app/dialer/_lib/ghl-conversations'
import { buildZip, type ZipEntry } from '@/lib/zip'

export const maxDuration = 120

// GET /api/sendcase/images/download?contactId=...&name=...
// Every photo for a contact as one zip, named IMG1, IMG2, … in the order the
// client sent them.
export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get('contactId')
  const label = (req.nextUrl.searchParams.get('name') ?? contactId ?? 'images')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 60)
  if (!contactId) {
    return NextResponse.json({ error: 'contactId required' }, { status: 400 })
  }

  try {
    const { images } = await getConversationData(contactId, { maxCalls: 0, maxImages: 40 })
    if (!images.length) {
      return NextResponse.json({ error: 'No photos found for this contact' }, { status: 404 })
    }

    const entries: ZipEntry[] = []
    const failed: string[] = []

    // Sequential: these come from one host and a burst of 40 invites throttling.
    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      const ext = (img.url.match(/\.(jpe?g|png|gif|webp)(?:\?|$)/i)?.[1] ?? 'jpg').toLowerCase()
      try {
        const res = await fetch(img.url, { cache: 'no-store' })
        if (!res.ok) { failed.push(`IMG${i + 1}`); continue }
        const buf = Buffer.from(await res.arrayBuffer())
        if (!buf.length) { failed.push(`IMG${i + 1}`); continue }
        entries.push({ name: `IMG${i + 1}.${ext}`, data: buf })
      } catch {
        failed.push(`IMG${i + 1}`)
      }
    }

    if (!entries.length) {
      return NextResponse.json({ error: 'Could not download any photos' }, { status: 502 })
    }

    const zip = buildZip(entries)
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${label}-photos.zip"`,
        'Content-Length': String(zip.length),
        // Surfaced so the UI can tell the user some photos were unreachable
        // instead of silently handing over a short zip.
        'X-Photos-Included': String(entries.length),
        'X-Photos-Failed': failed.join(',') || 'none',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 502 })
  }
}
