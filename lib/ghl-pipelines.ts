// Shared GHL pipeline access with caching.
//
// Pipeline schemas change maybe monthly, but nearly every GHL-backed route was
// refetching the full list on every request with `cache: 'no-store'` — the
// metrics dashboards and app/api/metrics/case (once per lead) especially. That
// volume is what exhausted the 200k/day location quota, which surfaced as
// /sendcase silently showing 0 leads.

export const GHL_BASE = 'https://services.leadconnectorhq.com'
export const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

// Seconds to keep a pipeline schema response. A renamed stage takes up to this
// long to be picked up — acceptable against ~99% fewer schema fetches.
const PIPELINE_TTL = 3600

// 'sendcase' routes (the /sendcase board + intake-fill) run on their own
// private-integration token so their quota is isolated from the dialer and the
// metrics dashboards. Falls back to the shared key when unset.
export type GhlScope = 'sendcase' | 'shared'

export function ghlKey(scope: GhlScope = 'shared'): string {
  const shared = (process.env.GHL_API_KEY ?? '').trim()
  if (scope !== 'sendcase') return shared
  return (process.env.GHL_API_KEY_SENDCASE ?? '').trim() || shared
}

export function ghlHeaders(scope: GhlScope = 'shared'): Record<string, string> {
  return {
    Authorization: `Bearer ${ghlKey(scope)}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

export interface GhlStage {
  id: string
  name: string
}

export interface GhlPipeline {
  id: string
  name: string
  stages: GhlStage[]
}

/* GHL enforces TWO limits per location and a 429 can mean either:

     burst — 100 requests per 10 seconds
     daily — 200,000 requests per day

   Only the daily headers were being read, so every 429 was reported as daily
   exhaustion. A burst trip then produced "rate limit hit (daily remaining:
   158599) Resets in ~0h" — a message that says we are out of quota while
   also saying 158,599 requests remain, and offers a reset time for a window
   that was never the problem.

   The two need telling apart because the remedy is opposite: a burst limit
   clears in seconds and should simply be retried, while a daily limit means
   stopping until tomorrow. */
export type GhlLimitKind = 'burst' | 'daily' | 'other'

export function readGhlLimits(h: Headers) {
  const n = (v: string | null) => (v == null || v === '' ? null : Number(v))
  return {
    dailyRemaining: n(h.get('x-ratelimit-daily-remaining')),
    burstRemaining: n(h.get('x-ratelimit-remaining')),
    burstMax: n(h.get('x-ratelimit-max')),
    intervalMs: n(h.get('x-ratelimit-interval-milliseconds')),
  }
}

export class GhlQuotaError extends Error {
  readonly kind: GhlLimitKind
  readonly burstRemaining: number | null
  readonly intervalMs: number | null
  /** How long to wait before this limit could plausibly clear. */
  readonly retryAfterMs: number

  constructor(
    readonly status: number,
    readonly dailyRemaining: string | null,
    readonly resetMs: string | null,
    limits?: ReturnType<typeof readGhlLimits>
  ) {
    const daily = limits?.dailyRemaining ?? (dailyRemaining == null ? null : Number(dailyRemaining))
    const burst = limits?.burstRemaining ?? null

    /* A 429 while the daily allowance is still healthy is the burst window,
       whatever the daily headers say. */
    const kind: GhlLimitKind =
      status !== 429 ? 'other'
      : daily != null && daily > 1000 ? 'burst'
      : burst === 0 && (daily == null || daily > 0) ? 'burst'
      : daily != null && daily <= 1000 ? 'daily'
      : 'burst'

    const intervalMs = limits?.intervalMs ?? 10_000
    super(
      status !== 429 ? `GHL responded ${status}`
      : kind === 'burst'
        ? `GHL burst limit hit — more than ${limits?.burstMax ?? 100} requests in ${Math.round(intervalMs / 1000)}s. This clears in seconds; the daily allowance is unaffected${daily != null ? ` (${daily.toLocaleString()} left today)` : ''}.`
        : `GHL daily quota exhausted${daily != null ? ` (${daily.toLocaleString()} left)` : ''}. It resets at midnight UTC.`
    )
    this.name = 'GhlQuotaError'
    this.kind = kind
    this.burstRemaining = burst
    this.intervalMs = intervalMs
    this.retryAfterMs = kind === 'burst' ? intervalMs : Number(resetMs) || 0
  }
}

/* One fetch for every GHL call that matters, so a burst trip is waited out
   rather than surfaced. The sweeps behind the dashboards fire dozens of
   requests at once and will cross 100-per-10s whenever two of them overlap;
   that is a scheduling artefact, not a condition a person should be told
   about. A daily exhaustion is never retried — it would not clear. */
export async function ghlFetch(
  url: string,
  init: RequestInit = {},
  { retries = 3 }: { retries?: number } = {}
): Promise<Response> {
  let attempt = 0
  for (;;) {
    const res = await fetch(url, init)
    if (res.status !== 429) return res

    const limits = readGhlLimits(res.headers)
    const err = new GhlQuotaError(429, res.headers.get('x-ratelimit-daily-remaining'),
      res.headers.get('x-ratelimit-daily-reset'), limits)

    if (err.kind !== 'burst' || attempt >= retries) return res

    // The window is fixed, so waiting it out beats backing off exponentially.
    const waitMs = Math.min(err.intervalMs ?? 10_000, 10_000) + attempt * 500
    console.warn('[ghl] burst limit — waiting %dms (attempt %d/%d)', waitMs, attempt + 1, retries)
    await new Promise(r => setTimeout(r, waitMs))
    attempt++
  }
}

// Per-invocation memo, so a single request that needs pipelines in a loop only
// pays once even on a Data Cache miss.
let memo: { key: string; at: number; pipelines: GhlPipeline[] } | null = null

export async function getPipelines(scope: GhlScope = 'shared'): Promise<GhlPipeline[]> {
  const key = ghlKey(scope)
  if (memo && memo.key === key && Date.now() - memo.at < PIPELINE_TTL * 1000) {
    return memo.pipelines
  }

  const res = await fetch(
    `${GHL_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`,
    {
      headers: ghlHeaders(scope),
      // Next's Data Cache persists this across invocations on Vercel.
      next: { revalidate: PIPELINE_TTL, tags: ['ghl-pipelines'] },
    }
  )

  if (!res.ok) {
    throw new GhlQuotaError(
      res.status,
      res.headers.get('x-ratelimit-daily-remaining'),
      res.headers.get('x-ratelimit-daily-reset'),
      readGhlLimits(res.headers)
    )
  }

  const data = await res.json()
  const pipelines: GhlPipeline[] = (data.pipelines ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    stages: (p.stages ?? []).map((s: any) => ({ id: s.id, name: s.name })),
  }))

  memo = { key, at: Date.now(), pipelines }
  return pipelines
}

/** "~0h" is what you get from rounding seconds into hours. Say the unit that
    actually fits, and say nothing at all rather than "~0" of anything. */
export function formatResetIn(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return ''
  if (seconds < 90) return ` Try again in a few seconds.`
  if (seconds < 3600) return ` Resets in ~${Math.round(seconds / 60)} min.`
  const h = seconds / 3600
  return ` Resets in ~${h < 2 ? h.toFixed(1) : Math.round(h)}h.`
}
