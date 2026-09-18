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

// Thrown so callers can distinguish "GHL refused us" from "no results", instead
// of collapsing both into an empty list.
export class GhlQuotaError extends Error {
  constructor(
    readonly status: number,
    readonly dailyRemaining: string | null,
    readonly resetMs: string | null
  ) {
    super(
      status === 429
        ? `GHL rate limit hit (daily remaining: ${dailyRemaining ?? 'unknown'})`
        : `GHL responded ${status}`
    )
    this.name = 'GhlQuotaError'
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
      res.headers.get('x-ratelimit-daily-reset')
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
