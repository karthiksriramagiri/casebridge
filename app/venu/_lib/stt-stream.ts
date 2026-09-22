import { deepgramKey } from './auth'

/**
 * Live transcription, held open on the server.
 *
 * Batch transcription costs ~600ms after the rep stops talking, because none of
 * the work starts until the whole utterance has been uploaded. Streaming moves
 * that work under the speech itself: the socket opens the moment the rep starts
 * talking, audio goes up as it is recorded, and when they stop there is only
 * the last fragment left to flush.
 *
 * The socket lives here rather than in the browser on purpose — a browser
 * talking directly to Deepgram is what extensions, VPNs and network filters
 * silently drop, and it cost us a day. Only the server needs to reach Deepgram.
 *
 * This requires a long-lived process. It works under `next start`; it would not
 * work on Vercel, where each request gets its own short-lived function.
 */

interface Live {
  ws: WebSocket
  ready: Promise<void>
  finals: string[]
  opened: number
  /** Resolved when Deepgram acknowledges the Finalize with its flushed tail. */
  onFlushed?: () => void
}

const streams = new Map<string, Live>()
const MAX_AGE_MS = 10 * 60_000

const PARAMS = new URLSearchParams({
  model: 'nova-3',
  language: 'en',
  smart_format: 'true',
  punctuate: 'true',
  interim_results: 'false',
})

function sweep() {
  for (const [id, live] of streams) {
    if (Date.now() - live.opened > MAX_AGE_MS) {
      try { live.ws.close() } catch {}
      streams.delete(id)
    }
  }
}

/** Opens a socket for this utterance, or returns the one already running. */
export function begin(sessionId: string): Live {
  sweep()
  const existing = streams.get(sessionId)
  if (existing && existing.ws.readyState <= 1) return existing

  // A raw API key authenticates with the `token` subprotocol; `bearer` is for
  // the short-lived JWTs from /v1/auth/grant. Using the wrong one fails the
  // handshake silently. A grant would be cleaner, but this socket is
  // server-to-server and the key never leaves the process.
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${PARAMS}`, [
    'token',
    deepgramKey(),
  ])

  const live: Live = {
    ws,
    finals: [],
    opened: Date.now(),
    ready: new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('transcription socket failed'))
      setTimeout(() => reject(new Error('transcription socket timed out')), 6000)
    }),
  }
  live.ready.catch(() => {})

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data))
      if (msg.type !== 'Results') return
      const text: string = msg.channel?.alternatives?.[0]?.transcript ?? ''
      if (text && msg.is_final) live.finals.push(text)
      // Deepgram marks the result it produced in response to Finalize. That is
      // the signal the tail has arrived — guessing with a timer drops the last
      // few words, which on an intake call is usually the actual question.
      if (msg.from_finalize) live.onFlushed?.()
    } catch {}
  }

  streams.set(sessionId, live)
  return live
}

export async function push(sessionId: string, audio: ArrayBuffer) {
  const live = begin(sessionId)
  try {
    await live.ready
    if (live.ws.readyState === 1) live.ws.send(audio)
  } catch {
    // A dead socket must not take the turn down — /say falls back to batch.
  }
}

/**
 * Flushes the socket and returns everything heard. Deepgram holds the tail
 * until told the stream is done, so the Finalize is what makes the last few
 * words appear.
 */
export async function finish(sessionId: string): Promise<string | null> {
  const live = streams.get(sessionId)
  if (!live) return null
  streams.delete(sessionId)

  try {
    await live.ready
    if (live.ws.readyState === 1) {
      const flushed = new Promise<void>((resolve) => { live.onFlushed = resolve })
      live.ws.send(JSON.stringify({ type: 'Finalize' }))
      // Bounded: this sits on the critical path, but the bound has to be
      // generous enough to actually get the tail.
      await Promise.race([
        flushed,
        new Promise((r) => setTimeout(r, 1200)),
      ])
    }
  } catch {
    return null
  } finally {
    try { live.ws.close() } catch {}
  }

  const text = live.finals.join(' ').trim()
  return text || null
}

export function discard(sessionId: string) {
  const live = streams.get(sessionId)
  if (!live) return
  streams.delete(sessionId)
  try { live.ws.close() } catch {}
}
