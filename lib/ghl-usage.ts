// Counts GHL API calls per calling site, so the 200k/day location quota can be
// attributed to a culprit. Enabled only when GHL_USAGE_TRACKING=1, so it can be
// switched off in Vercel without a deploy.
//
// Counts are aggregated in-process and flushed in batches — one DB write per
// ~25 calls rather than per call.

// Writes go out per call rather than buffered. Serverless instances freeze
// between requests, so any buffered count on a short-lived instance is simply
// lost — which is exactly what happened on the first deploy (15k calls/hour
// recorded as 1).
const buffer = new Map<string, number>()
let flushing: Promise<void> | null = null

export function trackingEnabled(): boolean {
  return process.env.GHL_USAGE_TRACKING === '1'
}

// Pull the first stack frame that belongs to our own code. Next and undici
// frames are noise; what we want is the route or lib that initiated the call.
export function attributeCaller(stack: string | undefined): string {
  if (!stack) return 'unknown'
  for (const raw of stack.split('\n').slice(1)) {
    const line = raw.trim()
    if (!line.startsWith('at ')) continue
    if (line.includes('node_modules')) continue
    if (line.includes('node:internal')) continue
    if (line.includes('lib/ghl-usage')) continue
    if (line.includes('instrumentation')) continue
    // Prefer the app-relative path: ".../app/api/foo/route.ts:12:34"
    const m = line.match(/((?:app|lib|sms-bot)\/[^\s():]+)/)
    if (m) return m[1]
  }
  return 'unattributed'
}

export function bumpGhlUsage(source: string): void {
  buffer.set(source, (buffer.get(source) ?? 0) + 1)
  void flushGhlUsage()
}

export async function flushGhlUsage(): Promise<void> {
  if (flushing) return flushing
  if (buffer.size === 0) return

  const pending = [...buffer.entries()]
  buffer.clear()

  flushing = (async () => {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) return
      const { createClient } = await import('@supabase/supabase-js')
      const db = createClient(url, key)
      const day = new Date().toISOString().slice(0, 10)
      await Promise.all(
        pending.map(([source, n]) =>
          db.rpc('ghl_call_bump', { p_day: day, p_source: source, p_n: n })
        )
      )
    } catch {
      // Accounting must never break a request, and losing a batch is fine —
      // we only need the shape of the traffic, not exact totals.
    } finally {
      flushing = null
    }
  })()

  return flushing
}

// Exposed for tests / manual inspection.
export function peekBuffer(): Record<string, number> {
  return Object.fromEntries(buffer)
}
