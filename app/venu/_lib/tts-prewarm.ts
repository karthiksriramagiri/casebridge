import { deepgramKey } from './auth'

/**
 * Starts synthesising a line before the browser asks for it.
 *
 * The reply text is known the moment /api/venu/say finishes, but the audio
 * request only begins once the browser has received that response and issued a
 * second request — and the rep hears silence for the whole of that gap plus
 * Deepgram's own time to first byte. Kicking the fetch off server-side at the
 * end of /say means the connection is open and the first bytes are usually
 * already arriving by the time the browser's request lands.
 *
 * The Response is held, not the bytes: piping the live body keeps playback
 * starting on the first chunk instead of waiting for a complete clip.
 */
const inflight = new Map<string, { res: Promise<Response>; at: number }>()
const MAX_AGE_MS = 30_000

export function keyFor(text: string, voice: string) {
  return `${voice}::${text}`
}

export function prewarm(text: string, voice: string) {
  if (!text) return
  const key = keyFor(text, voice)
  if (inflight.has(key)) return

  const res = fetch(`https://api.deepgram.com/v1/speak?model=${voice}`, {
    method: 'POST',
    headers: { Authorization: `Token ${deepgramKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    cache: 'no-store',
  })
  // An unconsumed rejection here must not take the process down.
  res.catch(() => {})
  inflight.set(key, { res, at: Date.now() })

  // Drop anything the browser never came back for.
  for (const [k, v] of inflight) {
    if (Date.now() - v.at > MAX_AGE_MS) {
      v.res.then((r) => r.body?.cancel()).catch(() => {})
      inflight.delete(k)
    }
  }
}

/** Claims a pre-warmed synthesis, if one is waiting. */
export function claim(text: string, voice: string): Promise<Response> | null {
  const key = keyFor(text, voice)
  const hit = inflight.get(key)
  if (!hit) return null
  inflight.delete(key)
  return hit.res
}
