// GHL access for the sendcase agent.
//
// Hard-won context: GHL's 200,000/day quota is metered PER LOCATION, not per
// token, so this service shares one bucket with the dialer, the metrics
// dashboards and the Next app. A second API key buys nothing. Every call
// therefore goes through this module, which enforces three things:
//
//   1. a burst limiter (GHL allows 100 req / 10s; we stay well under)
//   2. a self-imposed daily ceiling, so the agent can never drain the quota
//   3. a reserve floor — if the location's remaining daily quota drops below
//      it, the agent stops rather than starving the dialer
//
// It also never turns a refusal into empty data. Returning [] on a 429 is what
// made /sendcase and the dialer leads page look "empty" for a full day.

const GHL_BASE = 'https://services.leadconnectorhq.com'

export const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID ?? 'AGAoUCwWTwc4Bqslwt9r'

const DAILY_BUDGET = Number(process.env.GHL_DAILY_BUDGET ?? 20000)
const RESERVE_FLOOR = Number(process.env.GHL_RESERVE_FLOOR ?? 20000)
const MAX_PER_10S = Number(process.env.GHL_MAX_PER_10S ?? 40)

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

export class GhlBudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GhlBudgetError'
  }
}

// ── Burst limiter: a sliding 10s window ─────────────────────────────────────

let window: number[] = []

async function throttle(): Promise<void> {
  for (;;) {
    const now = Date.now()
    window = window.filter((t) => now - t < 10_000)
    if (window.length < MAX_PER_10S) {
      window.push(now)
      return
    }
    const waitMs = 10_000 - (now - window[0]) + 50
    await new Promise((r) => setTimeout(r, waitMs))
  }
}

// ── Daily self-imposed ceiling ──────────────────────────────────────────────

let spentToday = 0
let spendDay = new Date().toISOString().slice(0, 10)

export function callsSpentToday(): number {
  return spentToday
}

function countCall(): void {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== spendDay) {
    spendDay = today
    spentToday = 0
  }
  spentToday++
  if (spentToday > DAILY_BUDGET) {
    throw new GhlBudgetError(
      `Agent hit its self-imposed ceiling of ${DAILY_BUDGET} GHL calls today. ` +
        `Raise GHL_DAILY_BUDGET only if the location quota can absorb it.`
    )
  }
}

// ── Core request ────────────────────────────────────────────────────────────

function headers(): Record<string, string> {
  const key = (process.env.GHL_API_KEY ?? '').trim()
  return {
    Authorization: `Bearer ${key}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

export async function ghlFetch(
  path: string,
  init: RequestInit = {}
): Promise<any> {
  countCall()
  await throttle()

  const res = await fetch(path.startsWith('http') ? path : `${GHL_BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  })

  const remaining = res.headers.get('x-ratelimit-daily-remaining')
  if (remaining !== null && Number(remaining) < RESERVE_FLOOR) {
    throw new GhlBudgetError(
      `Location daily quota down to ${remaining}, below the ${RESERVE_FLOOR} reserve ` +
        `kept for the dialer. Stopping so the dialer keeps working.`
    )
  }

  if (!res.ok) {
    throw new GhlQuotaError(
      res.status,
      remaining,
      res.headers.get('x-ratelimit-daily-reset')
    )
  }

  return res.json()
}

// ── Cached pipeline schemas ─────────────────────────────────────────────────

export interface GhlStage { id: string; name: string }
export interface GhlPipeline { id: string; name: string; stages: GhlStage[] }

const PIPELINE_TTL_MS = 60 * 60 * 1000
let pipelineCache: { at: number; data: GhlPipeline[] } | null = null

export async function getPipelines(): Promise<GhlPipeline[]> {
  if (pipelineCache && Date.now() - pipelineCache.at < PIPELINE_TTL_MS) {
    return pipelineCache.data
  }
  const data = await ghlFetch(
    `/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`
  )
  const pipelines: GhlPipeline[] = (data.pipelines ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    stages: (p.stages ?? []).map((s: any) => ({ id: s.id, name: s.name })),
  }))
  pipelineCache = { at: Date.now(), data: pipelines }
  return pipelines
}

// ── Contact reads / writes ──────────────────────────────────────────────────

export async function getContact(contactId: string): Promise<any> {
  const data = await ghlFetch(`/contacts/${contactId}`)
  return data.contact ?? data
}

export async function getConversations(contactId: string): Promise<any[]> {
  const data = await ghlFetch(
    `/conversations/search?locationId=${GHL_LOCATION_ID}&contactId=${contactId}`
  )
  return data.conversations ?? []
}

export async function getMessages(conversationId: string): Promise<any[]> {
  const data = await ghlFetch(`/conversations/${conversationId}/messages`)
  return data.messages?.messages ?? data.messages ?? []
}

export async function getNotes(contactId: string): Promise<any[]> {
  const data = await ghlFetch(`/contacts/${contactId}/notes`)
  return data.notes ?? []
}

export async function updateContactFields(
  contactId: string,
  customFields: { id: string; field_value: string }[],
  standard: Record<string, string> = {}
): Promise<void> {
  const body: any = {}
  if (customFields.length) body.customFields = customFields
  Object.assign(body, standard)
  await ghlFetch(`/contacts/${contactId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function addNote(contactId: string, body: string): Promise<void> {
  await ghlFetch(`/contacts/${contactId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

// ── Finding cases in Pending Send ───────────────────────────────────────────

// Configured pipelines, firm slug → pipeline id. Mirrors the Next app.
export const PIPELINES: { firm: string; id: string }[] = [
  { firm: 'lhp',         id: 'yMqNixSnChC5lcGQXA1g' },
  { firm: 'lhp_spanish', id: 'r1AsAtC7lzwO9ybtkQlA' },
  { firm: 'eisenberg',   id: 'Yk4w3ML56ECc10PFzjpK' },
  { firm: 'thl',         id: 'DYtmw8WEUtGePFbEDAIZ' },
  { firm: 'mca',         id: '6Ku9EwTtMFk51o7Re9x0' },
  { firm: 'fears',       id: 'Jj4DCdu5duYDgI87ERbx' },
  { firm: 'levine',      id: 'JPyMNjGGAIxUv0FWW7Cg' },
  { firm: 'jm',          id: '0tBzhg0eGSNKL870y3yV' },
]

// "Pending Send" is the one and only stage tracked: signed, not yet sent to
// the firm. "Signed/Sent" is the archive of cases already sent — targeting it
// swept in 413 closed cases that a backfill would have re-filled. Pipelines
// without a Pending Send stage contribute nothing, by design.
const PENDING_NAMES = ['pending send', 'pending_send', 'pending-send']

export function isPendingStage(name: string): boolean {
  const lower = name.toLowerCase().trim()
  return PENDING_NAMES.some((n) => lower.includes(n))
}

export interface PSCase {
  contactId: string
  contactName: string | null
  firm: string
  stageName: string
  opportunityId: string | null
}

// Every case currently sitting in a Pending Send stage, across all pipelines.
export async function findPendingSendCases(): Promise<PSCase[]> {
  const pipelines = await getPipelines()
  const out: PSCase[] = []

  for (const configured of PIPELINES) {
    const pl = pipelines.find((p) => p.id === configured.id)
    if (!pl) continue

    for (const stage of pl.stages.filter((st) => isPendingStage(st.name))) {

      let cursor: string | null = null
      let cursorId: string | null = null

      for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams({
          location_id: GHL_LOCATION_ID,
          pipeline_id: configured.id,
          pipeline_stage_id: stage.id,
          limit: '100',
        })
        if (cursor) params.set('startAfter', cursor)
        if (cursorId) params.set('startAfterId', cursorId)

        const data = await ghlFetch(`/opportunities/search?${params}`)
        const opps = data.opportunities ?? []
        if (!opps.length) break

        for (const opp of opps) {
          const contact = opp.contact ?? {}
          const id = contact.id ?? opp.contactId
          if (id) {
            out.push({
              contactId: id,
              contactName: contact.name ?? opp.name ?? null,
              firm: configured.firm,
              stageName: stage.name,
              opportunityId: opp.id ?? null,
            })
          }
        }

        if (opps.length < 100 || !data.meta?.startAfter) break
        cursor = data.meta.startAfter
        cursorId = data.meta.startAfterId
      }
    }
  }

  // De-dupe by contact
  const seen = new Map<string, PSCase>()
  for (const c of out) if (!seen.has(c.contactId)) seen.set(c.contactId, c)
  return [...seen.values()]
}

export function hasPSTag(contact: any, tag = process.env.PS_TAG ?? '-ps'): boolean {
  const tags: string[] = contact?.tags ?? []
  return tags.some((t) => String(t).toLowerCase().trim() === tag.toLowerCase().trim())
}
