// Reading a contact's GHL conversation history: call transcripts and the
// photos people text in.
//
// Endpoints verified against the live API (2026-09-19):
//   GET /conversations/search?locationId=&contactId=   -> conversations
//   GET /conversations/{conversationId}/messages       -> messages
//   GET /conversations/locations/{loc}/messages/{id}/transcription
//        -> [{ speaker, transcript, startTime, endTime }]  (200)
//        (the shorter /conversations/messages/{id}/transcription is a 404)
// Message attachment URLs are public https links ending in a real extension —
// fetchable with no auth, which is what lets Claude read them.

import { GHL_BASE, GHL_LOCATION_ID, ghlHeaders } from './ghl-fields'

export interface GhlCallTranscript {
  messageId: string
  dateAdded: string | null
  direction: string | null
  /** Sentences joined into readable text. */
  text: string
}

export interface GhlImage {
  url: string
  mediaType: string
  dateAdded: string | null
  direction: string | null
}

export interface GhlConversationData {
  callTranscripts: GhlCallTranscript[]
  images: GhlImage[]
  smsCount: number
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)(\?|$)/i

function mediaTypeFor(url: string): string {
  const m = url.toLowerCase().match(/\.(jpe?g|png|gif|webp)(\?|$)/)
  const ext = m?.[1] ?? 'jpeg'
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext.replace('jpeg', 'jpeg')}`
}

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: ghlHeaders('sendcase'), cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Pull call transcripts and shared photos for a contact.
 *
 * Cost is bounded deliberately: this runs against a shared GHL quota, and one
 * contact's history is not worth an unbounded sweep.
 */
export async function getConversationData(
  contactId: string,
  opts: { maxCalls?: number; maxImages?: number } = {}
): Promise<GhlConversationData> {
  const maxCalls = opts.maxCalls ?? 8
  const maxImages = opts.maxImages ?? 8

  const out: GhlConversationData = { callTranscripts: [], images: [], smsCount: 0 }

  const convos = await getJson(
    `${GHL_BASE}/conversations/search?locationId=${GHL_LOCATION_ID}&contactId=${contactId}`
  )
  const conversations: any[] = convos?.conversations ?? []
  if (!conversations.length) return out

  for (const convo of conversations.slice(0, 3)) {
    const data = await getJson(`${GHL_BASE}/conversations/${convo.id}/messages`)
    const messages: any[] = data?.messages?.messages ?? data?.messages ?? []

    for (const m of messages) {
      const type = m.messageType ?? m.type

      if (type === 'TYPE_SMS' || type === 'TYPE_EMAIL') out.smsCount++

      // Photos — clients text in damage and document shots.
      const attachments: any[] = Array.isArray(m.attachments) ? m.attachments : []
      for (const a of attachments) {
        const url = typeof a === 'string' ? a : a?.url
        if (!url || !IMAGE_EXT.test(url)) continue
        if (out.images.length >= maxImages) break
        out.images.push({
          url,
          mediaType: mediaTypeFor(url),
          dateAdded: m.dateAdded ?? null,
          direction: m.direction ?? null,
        })
      }

      // Call recordings that GHL has already transcribed.
      if (type === 'TYPE_CALL' && out.callTranscripts.length < maxCalls) {
        const tr = await getJson(
          `${GHL_BASE}/conversations/locations/${GHL_LOCATION_ID}/messages/${m.id}/transcription`
        )
        const sentences: any[] = Array.isArray(tr) ? tr : tr?.transcriptions ?? []
        if (!sentences.length) continue
        const text = sentences
          .map((s) => String(s.transcript ?? '').trim())
          .filter(Boolean)
          .join(' ')
        if (text) {
          out.callTranscripts.push({
            messageId: m.id,
            dateAdded: m.dateAdded ?? null,
            direction: m.direction ?? null,
            text,
          })
        }
      }
    }
  }

  return out
}

/** Fetch an image and base64 it for the vision API. Skips anything too large. */
export async function fetchImageAsBase64(
  img: GhlImage,
  maxBytes = 3_500_000
): Promise<{ mediaType: string; data: string } | null> {
  try {
    const res = await fetch(img.url, { cache: 'no-store' })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > maxBytes) return null
    return { mediaType: img.mediaType, data: buf.toString('base64') }
  } catch {
    return null
  }
}
