import { NextRequest, NextResponse } from 'next/server'
import { getConversationData } from '@/app/dialer/_lib/ghl-conversations'

export const maxDuration = 60

// GET /api/sendcase/images?contactId=...
// Photos a client texted in. Fetched on demand rather than with the lead list,
// because this costs GHL quota per contact and the list is polled.
export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get('contactId')
  if (!contactId) {
    return NextResponse.json({ error: 'contactId required' }, { status: 400 })
  }
  try {
    const { images } = await getConversationData(contactId, { maxCalls: 0, maxImages: 40 })
    return NextResponse.json({
      contactId,
      count: images.length,
      images: images.map((img, i) => ({
        name: `IMG${i + 1}`,
        url: img.url,
        mediaType: img.mediaType,
        dateAdded: img.dateAdded,
        direction: img.direction,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 502 })
  }
}
