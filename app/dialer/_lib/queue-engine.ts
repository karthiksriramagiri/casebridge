/* ═══════════════════════════════════════════════════════════════════════════
   The dialer queue.

   Four jobs, in the order a lead meets them:

     PLAN     read GHL, work out which leads are callable today and at what
              times, and write one row per planned call.
     SELECT   decide which planned call each rep should make next.
     SERVE    hand it to them, exclusively, and hold it while they are on it.
     SETTLE   take the outcome and rewrite the rest of that lead's day.

   Everything about priority and timing lives in queue-rules.ts. This file is
   the database and GHL half: it asks the rules what the answer is and then
   makes it true. The rebuild exists because the old engine answered those
   questions in several places that had drifted apart — the admin screen and
   the floor used different comparators, the window was a filter in one path
   and a sort key in another, and leasing was written but never reached.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js'
import { resolveTimezone } from './area-codes'
import { getNumberPool, assignRandomCallerId } from './number-pool'
import { getPipelines, ghlFetch } from '@/lib/ghl-pipelines'
import {
  CALLABLE_STAGES, isCallableStage, DEFAULT_CADENCE, MAX_LEAD_AGE_DAYS,
  slotsForDay, orderQueue, compare, dialedTooRecently, rankOf, rankLabel,
  queueToday, isFresh, inWindow, MIN_REDIAL_GAP_MS,
  type BlockName,
} from './queue-rules'

export {
  rankOf, rankLabel, inWindow, isFresh, orderQueue,
  CALLABLE_STAGES, MAX_LEAD_AGE_DAYS,
} from './queue-rules'

const LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

const PIPELINES = [
  { id: 'yMqNixSnChC5lcGQXA1g', firm: 'lhp',   lang: 'en', defaultTz: 'America/Los_Angeles' },
  { id: 'r1AsAtC7lzwO9ybtkQlA', firm: 'lhp',   lang: 'es', defaultTz: 'America/Los_Angeles' },
  { id: 'Jj4DCdu5duYDgI87ERbx', firm: 'fears', lang: 'en', defaultTz: 'America/Chicago'     },
  { id: '0tBzhg0eGSNKL870y3yV', firm: 'jm',    lang: 'en', defaultTz: 'America/Los_Angeles' },
]

/** How many leads a rep holds at once. */
export const BUFFER_SIZE = 5

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${(process.env.GHL_API_KEY ?? '').trim()}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

/** The Eastern calendar date every plan is keyed to. */
export function todayEastern(): string {
  return queueToday()
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Attempt {
  id:                 string
  contact_id:         string
  contact_name:       string
  phone:              string
  firm:               string
  pipeline_id:        string
  stage_id:           string
  stage_name:         string
  ghl_opportunity_id: string | null
  plan_date:          string
  attempt_number:     number
  attempts_total:     number
  block:              string
  lead_timezone:      string
  due_from:           string
  due_until:          string
  day_ends_at:        string
  priority:           number
  is_carryover:       boolean
  status:             string
  buffered_for:       string | null
  buffered_at:        string | null
  leased_by:          string | null
  leased_at:          string | null
  lease_expires_at:   string | null
  completed_by:       string | null
  completed_at:       string | null
  disposition:        string | null
  call_sid:           string | null
  is_callback:        boolean
  callback_at:        string | null
  callback_context:   string | null
  callback_id:        string | null
  owner_rep:          string | null
  lang:               string
  stage_changed_at:   string | null
  lead_created_at:    string | null
  created_at:         string
  updated_at:         string
}

/* Columns added by migration_queue_rebuild.sql. Until it is run the engine
   has to keep working, so every write that touches them is gated on this and
   every read tolerates their absence. */
let COLUMNS_CHECKED = false
let HAS_NEW_COLUMNS = false
async function hasNewColumns(): Promise<boolean> {
  if (COLUMNS_CHECKED) return HAS_NEW_COLUMNS
  const { error } = await db().from('dialer_attempts').select('lead_created_at, callback_context, callback_id').limit(0)
  HAS_NEW_COLUMNS = !error
  COLUMNS_CHECKED = true
  if (!HAS_NEW_COLUMNS) {
    console.warn('[queue] migration_queue_rebuild.sql has not been run — freshness falls back to stage_changed_at')
  }
  return HAS_NEW_COLUMNS
}

/** PostgREST stops at 1000 rows however wide the range. Page, always. */
async function fetchAll<T = any>(build: () => any, maxRows = 20000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < maxRows; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) { console.error('[queue] paged fetch', error.message); break }
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/* ═══════════════════════════════════════════════════════════════════════════
   PLAN — GHL becomes today's call slots
   ═══════════════════════════════════════════════════════════════════════════ */

export async function syncGHLToQueue(): Promise<{
  created: number; updated: number; cancelled: number; skipped: number
}> {
  const sb      = db()
  const headers = ghlHeaders()
  const today   = todayEastern()
  const newCols = await hasNewColumns()

  const [rulesRes, stateRes, existingRes] = await Promise.all([
    sb.from('dialer_cadence_rules').select('stage_name, calls_per_day, enabled'),
    sb.from('dialer_lead_state').select('contact_id, suppressed, exhausted'),
    (async () => ({ data: await fetchAll(() => sb.from('dialer_attempts')
      .select('id, contact_id, attempt_number, status, stage_name, priority, lead_created_at, due_from')
      .eq('plan_date', today)
      .eq('is_callback', false)) }))(),
  ])

  const cadence: Record<string, number> = { ...DEFAULT_CADENCE }
  for (const r of rulesRes.data ?? []) {
    if (r.enabled) cadence[String(r.stage_name).toLowerCase()] = r.calls_per_day
  }

  const skip = new Set<string>()
  for (const row of stateRes.data ?? []) {
    if (row.suppressed || row.exhausted) skip.add(row.contact_id)
  }

  const existing = new Map<string, { id: string; status: string; stage_name: string; priority: number; lead_created_at: string | null; due_from: string | null }>()
  for (const a of existingRes.data ?? []) existing.set(`${a.contact_id}:${a.attempt_number}`, a as any)

  // ── Which (pipeline, stage) pairs to sweep ───────────────────────────────
  const schemas = await Promise.all(PIPELINES.map(async pipeline => {
    const res = await ghlFetch(
      `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${LOCATION_ID}`,
      { headers },
    )
    if (!res.ok) return null
    const pl = ((await res.json()).pipelines ?? []).find((p: any) => p.id === pipeline.id)
    return pl ? { pipeline, stages: pl.stages ?? [] } : null
  }))

  type StageJob = { pipeline: typeof PIPELINES[0]; stage: { id: string; name: string }; callsPerDay: number }
  const jobs: StageJob[] = []
  for (const schema of schemas) {
    if (!schema) continue
    for (const stage of schema.stages) {
      if (!isCallableStage(stage.name)) continue
      jobs.push({
        pipeline:    schema.pipeline,
        stage,
        callsPerDay: cadence[String(stage.name).toLowerCase()] ?? 2,
      })
    }
  }

  /* Set if any stage fetch ends early. The cancellation sweep infers deletion
     from absence, so a sweep that stopped halfway makes every lead it never
     reached look deleted. */
  let sweepIncomplete = false
  if (jobs.length === 0) sweepIncomplete = true

  const seen       = new Set<string>()
  const queuedKeys = new Set<string>()
  const toInsert:     Record<string, any>[] = []
  const toUpdate: {
    id: string; stage_name: string; stage_id: string; priority: number
    lead_created_at: string | null
    slot: { dueFrom: Date; dueUntil: Date; dayEndsAt: Date; block: string } | null
    attempts_total: number
  }[] = []
  const toReactivate: { id: string; fields: Record<string, any> }[] = []
  let skipped = 0

  await Promise.all(jobs.map(async ({ pipeline, stage, callsPerDay }) => {
    let cursor: string | null = null, cursorId: string | null = null

    while (true) {
      const url = new URL('https://services.leadconnectorhq.com/opportunities/search')
      url.searchParams.set('location_id', LOCATION_ID)
      url.searchParams.set('pipeline_id', pipeline.id)
      url.searchParams.set('pipeline_stage_id', stage.id)
      url.searchParams.set('limit', '100')
      if (cursor)   url.searchParams.set('startAfter',   cursor)
      if (cursorId) url.searchParams.set('startAfterId', cursorId)

      const res = await ghlFetch(url.toString(), { headers })
      if (!res.ok) {
        console.error('[queue:plan] GHL %d on %s/%s — stage truncated', res.status, pipeline.firm, stage.name)
        sweepIncomplete = true
        break
      }
      const data = await res.json()
      const opps = data.opportunities ?? []
      if (opps.length === 0) break

      for (const opp of opps) {
        const contact = opp.contact ?? {}
        const phone =
          contact.phone ??
          (contact.phones?.find((p: any) => p.type === 'mobile') ?? contact.phones?.[0])?.number ?? ''
        if (!phone || !opp.contactId)   { skipped++; continue }
        if (skip.has(opp.contactId))    { skipped++; continue }

        const stageChangedAt = opp.lastStageChangeAt ?? opp.updatedAt ?? null
        /* When the lead first arrived — not when it last moved stage. This is
           what decides freshness, and it has to be stable: anchoring to the
           stage change would make a lead fresh all over again every time it
           bounced between No Response and Follow Up, and it would never stop
           being called every two hours. */
        const leadCreatedAt = opp.createdAt ?? opp.contact?.dateAdded ?? stageChangedAt

        /* A lead untouched in its stage for three weeks is not worth a dial
           against one from this morning. A fresh lead is never stale, so the
           check cannot strand a lead that only just arrived. */
        const ageDays = stageChangedAt ? (Date.now() - Date.parse(stageChangedAt)) / 86_400_000 : null
        if (ageDays !== null && ageDays > MAX_LEAD_AGE_DAYS && !isFresh(leadCreatedAt)) { skipped++; continue }

        seen.add(opp.contactId)

        const timezone = resolveTimezone(contact.timezone ?? opp.timezone, phone, pipeline.defaultTz)

        /* An appointment is a booked event, called once at its time — never
           on the fresh cadence, which would otherwise put one lead in seven
           consecutive slots at the top of the floor's list. */
        const freshAnchor = String(stage.name).toLowerCase() === 'appointment scheduled'
          ? null
          : (leadCreatedAt ? new Date(leadCreatedAt) : null)

        const slots = slotsForDay({
          planDate:      today,
          timezone,
          callsPerDay,
          leadCreatedAt: freshAnchor,
        })
        if (slots.length === 0) { skipped++; continue }

        const priority = rankOf({
          stage_name: stage.name, is_callback: false,
          lead_created_at: leadCreatedAt, due_from: null, due_until: null,
        })

        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i]
          const key  = `${opp.contactId}:${i + 1}`
          const prev = existing.get(key)

          if (prev) {
            if (prev.status === 'cancelled') {
              toReactivate.push({ id: prev.id, fields: {
                status: 'pending', stage_name: stage.name, stage_id: stage.id, priority,
                lead_timezone: timezone,
                due_from: slot.dueFrom.toISOString(),
                due_until: slot.dueUntil.toISOString(),
                day_ends_at: slot.dayEndsAt.toISOString(),
                attempts_total: slots.length, block: slot.block,
                buffered_for: null, buffered_at: null,
                leased_by: null, leased_at: null, lease_expires_at: null,
                completed_by: null, completed_at: null, disposition: null,
                ...(newCols ? { lead_created_at: leadCreatedAt } : {}),
              }})
            } else if (prev.status === 'pending' || prev.status === 'buffered') {
              /* Buffered rows are refreshed too — they sit in a rep's list
                 unanswered, so a stage move still applies to them. `leased`
                 is excluded on purpose: a rep is on that call right now. */
              /* lead_created_at is refreshed here, not only written on
                 insert. A row planned before the column existed carries
                 nothing, and nothing else would ever fill it — the whole
                 day's queue would sit with no freshness at all until the
                 next morning rebuilt it from scratch. GHL is the truth; this
                 is where we hear it. */
              const freshMoved = newCols && leadCreatedAt && prev.lead_created_at !== leadCreatedAt

              /* A pending row's slot is re-planned, not just its stage.

                 Only the insert ever set due_from, so a row planned under an
                 older schedule kept that schedule for the rest of the day
                 however much the plan changed underneath it. Today's queue
                 was showing slots at 5:20 AM and 11:50 PM — times nobody may
                 be called at — because they were computed by a planner that
                 clipped its windows differently.

                 Pending only. A buffered row is sitting in front of a rep
                 right now and moving its window under them reads as the list
                 rewriting itself; it will be re-planned the moment it goes
                 back to the pool. */
              const reslot = prev.status === 'pending' && prev.due_from !== slot.dueFrom.toISOString()

              if (prev.stage_name !== stage.name || prev.priority !== priority || freshMoved || reslot) {
                toUpdate.push({
                  id: prev.id, stage_name: stage.name, stage_id: stage.id, priority,
                  lead_created_at: newCols ? leadCreatedAt : null,
                  slot: reslot ? slot : null,
                  attempts_total: slots.length,
                })
              }
            }
            continue
          }

          /* The same contact can sit in two callable stages at once, usually
             a lead present in both the English and Spanish pipeline. Each
             sweep would queue its own row under the same key, which the
             unique index rejects — and `existing` only knows what was in the
             database before this run started. */
          if (queuedKeys.has(key)) continue
          queuedKeys.add(key)

          const row: Record<string, any> = {
            contact_id:   opp.contactId,
            contact_name: opp.name ?? contact.name ?? 'Unknown',
            phone,
            firm:               pipeline.firm,
            pipeline_id:        pipeline.id,
            stage_id:           stage.id,
            stage_name:         stage.name,
            ghl_opportunity_id: opp.id ?? null,
            plan_date:          today,
            attempt_number:     i + 1,
            attempts_total:     slots.length,
            block:              slot.block,
            lead_timezone:      timezone,
            due_from:           slot.dueFrom.toISOString(),
            due_until:          slot.dueUntil.toISOString(),
            day_ends_at:        slot.dayEndsAt.toISOString(),
            priority,
            lang:               pipeline.lang,
            stage_changed_at:   stageChangedAt,
            /* Carryover is not a privilege. Each morning the day is planned
               fresh at whatever stage the lead is in now — being left over
               yesterday earns a lead nothing today. */
            is_carryover:       false,
            owner_rep:          null,
          }
          if (newCols) row.lead_created_at = leadCreatedAt
          toInsert.push(row)
        }
      }

      cursor   = data.meta?.startAfter   ?? null
      cursorId = data.meta?.startAfterId ?? null
      if (!cursor && !cursorId) break
    }
  }))

  // ── Write ────────────────────────────────────────────────────────────────
  const now = new Date().toISOString()

  /* A multi-row insert is one statement: one unique violation rolls back the
     whole chunk. That silently cost most of a day's queue once — 3,100 rows
     built, 775 landed, the sync still reporting success. A failed chunk is
     retried row by row so one bad row costs one lead, not five hundred. */
  let created = 0
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500)
    const { error } = await sb.from('dialer_attempts').insert(chunk)
    if (!error) { created += chunk.length; continue }
    console.error('[queue:plan] chunk of %d failed (%s) — retrying individually', chunk.length, error.code)
    for (const row of chunk) {
      const { error: rowErr } = await sb.from('dialer_attempts').insert(row)
      if (!rowErr) created++
      else if (rowErr.code !== '23505') console.error('[queue:plan] row failed', rowErr.code, row.contact_id)
    }
  }

  /* Grouped by the whole payload so rows sharing one go in a single
     statement. Leads that moved in the same sync tend to share a timestamp
     and a stage, so this stays a handful of requests rather than one a row. */
  const groups = new Map<string, { payload: Record<string, any>; ids: string[] }>()
  for (const u of toUpdate) {
    const payload: Record<string, any> = {
      stage_name: u.stage_name, stage_id: u.stage_id, priority: u.priority, updated_at: now,
    }
    if (u.lead_created_at) payload.lead_created_at = u.lead_created_at
    if (u.slot) {
      payload.due_from    = u.slot.dueFrom.toISOString()
      payload.due_until   = u.slot.dueUntil.toISOString()
      payload.day_ends_at = u.slot.dayEndsAt.toISOString()
      payload.block       = u.slot.block
      payload.attempts_total = u.attempts_total
    }
    const k = JSON.stringify(payload)
    if (!groups.has(k)) groups.set(k, { payload, ids: [] })
    groups.get(k)!.ids.push(u.id)
  }
  for (const g of groups.values()) {
    for (let i = 0; i < g.ids.length; i += 500) {
      await sb.from('dialer_attempts').update(g.payload).in('id', g.ids.slice(i, i + 500))
    }
  }

  for (let i = 0; i < toReactivate.length; i += 50) {
    await Promise.all(toReactivate.slice(i, i + 50).map(r =>
      sb.from('dialer_attempts').update({ ...r.fields, updated_at: now }).eq('id', r.id)))
  }

  /* Cancel planned calls for leads that have left the callable set.

     The most destructive thing the plan does, and it infers deletion from
     absence — so it only runs when the sweep is known to be whole. A partial
     sweep means "GHL did not answer", not "these leads are gone"; one
     truncated run once cancelled 3,206 of 3,328 attempts and left the floor
     with nothing to call. */
  let cancelled = 0
  if (sweepIncomplete) {
    console.warn('[queue:plan] sweep incomplete — skipping cancellation')
  } else {
    const pending = await fetchAll<{ id: string; contact_id: string }>(() => sb.from('dialer_attempts')
      .select('id, contact_id')
      .eq('plan_date', today)
      .eq('status', 'pending')
      .eq('is_callback', false))
    const gone = pending.filter(a => !seen.has(a.contact_id))
    const share = pending.length > 0 ? gone.length / pending.length : 0

    if (seen.size === 0 || (share > 0.5 && pending.length > 50)) {
      console.error('[queue:plan] refusing to cancel %d of %d (%d%%) — seen=%d, this looks like a failed sweep',
        gone.length, pending.length, Math.round(share * 100), seen.size)
    } else {
      for (let i = 0; i < gone.length; i += 500) {
        await sb.from('dialer_attempts')
          .update({ status: 'cancelled', updated_at: now })
          .in('id', gone.slice(i, i + 500).map(a => a.id))
      }
      cancelled = gone.length
    }
  }

  await syncCallbacksIntoQueue().catch(err => console.error('[queue:callbacks]', err))
  await fillAllReadyReps().catch(err => console.error('[queue:fill-all]', err))

  return { created, updated: toUpdate.length + toReactivate.length, cancelled, skipped }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Callbacks — promises, mirrored into the queue

   A callback is the one thing in the system with a time somebody committed
   to out loud. It used to live only in dialer_callbacks, which meant the
   queue's whole callback apparatus — top priority, owner exclusivity, the
   push into a rep's buffer at the promised minute — never fired, because no
   callback was ever a queue row. The rep had to remember to go and look.

   So every pending callback due today is mirrored into dialer_attempts as a
   row that outranks everything. dialer_callbacks stays the record of the
   promise; the queue row is how it reaches a rep. Completing either settles
   both.
   ═══════════════════════════════════════════════════════════════════════════ */
export async function syncCallbacksIntoQueue(): Promise<number> {
  const sb      = db()
  const today   = todayEastern()
  const newCols = await hasNewColumns()
  if (!newCols) return 0   // callback_id is how the two stay in step

  const dayEnd = new Date(`${today}T23:59:59-05:00`)

  const [{ data: due }, existingRows] = await Promise.all([
    sb.from('dialer_callbacks')
      .select('id, contact_id, contact_name, phone, firm, stage_name, callback_at, callback_context, owner_rep')
      .eq('status', 'pending')
      .lte('callback_at', dayEnd.toISOString()),
    fetchAll<{ callback_id: string | null }>(() => sb.from('dialer_attempts')
      .select('callback_id')
      .eq('plan_date', today)
      .eq('is_callback', true)),
  ])

  const mirrored = new Set((existingRows ?? []).map(r => r.callback_id).filter(Boolean) as string[])
  const rows = (due ?? []).filter(c => !mirrored.has(c.id)).map(c => {
    const at = new Date(c.callback_at)
    return {
      contact_id:   c.contact_id,
      contact_name: c.contact_name ?? 'Unknown',
      phone:        c.phone,
      firm:         c.firm ?? '',
      pipeline_id:  '',
      stage_id:     '',
      stage_name:   c.stage_name ?? 'Callback',
      plan_date:    today,
      attempt_number: 1,
      attempts_total: 1,
      block:        'morning',
      lead_timezone: 'America/Los_Angeles',
      due_from:     at.toISOString(),
      /* A promise does not expire at the end of an hour. The window stays
         open to the end of the calling day so a callback the floor could not
         reach at 4pm is still the top of the list at 5. */
      due_until:    dayEnd.toISOString(),
      day_ends_at:  dayEnd.toISOString(),
      priority:     rankOf({ stage_name: null, is_callback: true, lead_created_at: null, due_from: null, due_until: null }),
      status:       'pending',
      is_callback:  true,
      callback_at:  at.toISOString(),
      callback_context: c.callback_context ?? null,
      callback_id:  c.id,
      /* Exclusive to whoever made the promise. A lead rung by a stranger who
         says "you asked me to call" is worse than not calling at all. */
      owner_rep:    c.owner_rep ?? null,
      lang:         'en',
      is_carryover: false,
    }
  })

  if (!rows.length) return 0
  const { error } = await sb.from('dialer_attempts').insert(rows)
  if (error) {
    console.error('[queue:callbacks] insert failed', error.message)
    return 0
  }
  return rows.length
}

/* ═══════════════════════════════════════════════════════════════════════════
   Filters — which clients and which states the floor is working
   ═══════════════════════════════════════════════════════════════════════════ */

export interface StateFilter { mode: 'off' | 'include' | 'exclude'; states: string[] }
export interface FirmFilter  { mode: 'off' | 'include' | 'exclude'; firms:  string[] }

export const NO_STATE_FILTER: StateFilter = { mode: 'off', states: [] }
export const NO_FIRM_FILTER:  FirmFilter  = { mode: 'off', firms:  [] }

export async function getStateFilter(): Promise<StateFilter> {
  const { data, error } = await db().from('dialer_queue_settings')
    .select('state_filter_mode, state_filter_list').eq('id', 1).maybeSingle()
  if (error || !data) return NO_STATE_FILTER
  const states = (data.state_filter_list ?? []).map((s: string) => s.toUpperCase())
  const mode = (data.state_filter_mode ?? 'off') as StateFilter['mode']
  return mode === 'off' || states.length === 0 ? NO_STATE_FILTER : { mode, states }
}

export async function getFirmFilter(): Promise<FirmFilter> {
  const { data, error } = await db().from('dialer_queue_settings')
    .select('firm_filter_mode, firm_filter_list').eq('id', 1).maybeSingle()
  if (error || !data) return NO_FIRM_FILTER
  const firms = (data.firm_filter_list ?? []).map((f: string) => f.toLowerCase())
  const mode = (data.firm_filter_mode ?? 'off') as FirmFilter['mode']
  return mode === 'off' || firms.length === 0 ? NO_FIRM_FILTER : { mode, firms }
}

/* A lead's state is the firm's state, not the phone's. Reading the area code
   answers a different question — where the number was issued, not where the
   client is — and disagreed with the firm on 101 leads in a single day. */
export const FIRM_STATE: Record<string, string> = {
  lhp: 'CA', lhp_spanish: 'CA', jm: 'CA', fears: 'TX', fl: 'TX',
}

export function stateForLead(lead: { firm?: string | null }): string | null {
  return FIRM_STATE[String(lead.firm ?? '').toLowerCase()] ?? null
}

export function passesStateFilter(lead: { firm?: string | null }, f: StateFilter): boolean {
  if (f.mode === 'off' || f.states.length === 0) return true
  const state = stateForLead(lead)
  // A firm with no state is kept on exclude and dropped on include — "only
  // call CA" must not leak a client we cannot place.
  if (!state) return f.mode === 'exclude'
  return f.mode === 'include' ? f.states.includes(state) : !f.states.includes(state)
}

export function passesFirmFilter(firm: string | null | undefined, f: FirmFilter): boolean {
  if (f.mode === 'off' || f.firms.length === 0) return true
  const v = (firm ?? '').toLowerCase()
  return f.mode === 'include' ? f.firms.includes(v) : !f.firms.includes(v)
}

/* ═══════════════════════════════════════════════════════════════════════════
   SELECT — one pool, one order, one set of gates
   ═══════════════════════════════════════════════════════════════════════════ */

/** contact_id → when it was last dialled, for the contacts in play. */
export async function loadLastDialed(sb: any, contactIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (let i = 0; i < contactIds.length; i += 300) {
    const { data } = await sb.from('dialer_lead_state')
      .select('contact_id, last_dialed_at')
      .in('contact_id', contactIds.slice(i, i + 300))
    for (const row of data ?? []) {
      if (row.last_dialed_at) map.set(row.contact_id, Date.parse(row.last_dialed_at))
    }
  }
  return map
}

/** The one queue order. Admin list and rep buffer both come through here. */
export async function sortQueueCanonical(rows: Attempt[]): Promise<Attempt[]> {
  if (rows.length < 2) return rows
  const lastDialed = await loadLastDialed(db(), [...new Set(rows.map(r => r.contact_id))])
  return orderQueue(rows as any, lastDialed) as Attempt[]
}

/** @deprecated the row-level sort. orderQueue ranks whole leads — use that. */
export function orderByRecency(rows: Attempt[], lastDialed: Map<string, number>): Attempt[] {
  return [...rows].sort((a, b) => compare(a as any, b as any, lastDialed))
}

interface Candidate extends Attempt {}

/* Everything that could be dialled right now, in the order it should go out.

   Shared by both fill paths. They used to have a candidate query and a sort
   each — fillBuffer ranked whole leads, fillAllReadyReps ranked loose rows —
   so the rep's own poll and the background top-up handed out leads in
   different orders and neither matched the admin screen. */
async function candidatePool(sb: any, today: string): Promise<{
  rows: Candidate[]
  lastDialed: Map<string, number>
  activeContacts: Set<string>
}> {
  const [pending, active] = await Promise.all([
    fetchAll<Candidate>(() => sb.from('dialer_attempts')
      .select('*')
      .eq('status', 'pending')
      .eq('plan_date', today)
      .order('priority',   { ascending: false })
      .order('due_from',   { ascending: true })
      .order('id',         { ascending: true })),
    fetchAll<{ contact_id: string }>(() => sb.from('dialer_attempts')
      .select('contact_id')
      .eq('plan_date', today)
      .in('status', ['buffered', 'leased'])),
  ])

  const lastDialed = await loadLastDialed(sb, [...new Set(pending.map(a => a.contact_id))])
  return {
    rows: orderQueue(pending as any, lastDialed) as Candidate[],
    lastDialed,
    activeContacts: new Set(active.map(r => r.contact_id)),
  }
}

/** Every gate between a planned call and a rep, in one place. */
function eligibleFor(opts: {
  rep:            string
  repSpeaksSpanish: boolean
  pool:           Candidate[]
  lastDialed:     Map<string, number>
  activeContacts: Set<string>
  stateFilter:    StateFilter
  firmFilter:     FirmFilter
  now:            number
}): Candidate[] {
  const { rep, repSpeaksSpanish, pool, lastDialed, activeContacts, stateFilter, firmFilter, now } = opts

  /* Only the earliest unfinished attempt of a lead can be served. Calling
     someone's third slot before their second happened is not a schedule. */
  const lowest = new Map<string, number>()
  for (const a of pool) {
    if (a.is_callback) continue
    const cur = lowest.get(a.contact_id)
    if (cur === undefined || a.attempt_number < cur) lowest.set(a.contact_id, a.attempt_number)
  }

  return pool.filter(a => {
    if (activeContacts.has(a.contact_id)) return false
    if (dialedTooRecently(a as any, lastDialed, now)) return false
    // A callback belongs to the rep who promised it, and to nobody else.
    if (a.is_callback && a.owner_rep && a.owner_rep !== rep) return false
    // A callback is not callable before the minute it was promised for.
    if (a.is_callback && a.callback_at && Date.parse(a.callback_at) > now) return false
    if (a.lang === 'es' && !repSpeaksSpanish) return false
    // Both filters are exempt for callbacks: the promise was already made.
    if (!a.is_callback && !passesStateFilter(a, stateFilter)) return false
    if (!a.is_callback && !passesFirmFilter(a.firm, firmFilter)) return false
    if (!a.is_callback && a.attempt_number !== lowest.get(a.contact_id)) return false
    return true
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   SERVE — a rep holds five, exclusively
   ═══════════════════════════════════════════════════════════════════════════ */

/* Who may be handed leads at all. A rep who is not READY is not released
   mid-call — ON_CALL and WRAPUP keep what they hold — but nothing new is
   added, and going OFFLINE hands everything back.

   The old engine disagreed with itself here: fillBuffer ignored status
   entirely while fillAllReadyReps released anything held by a non-READY rep,
   so a paused rep's own poll kept refilling a buffer the background job kept
   emptying. */
const HOLDS_LEADS   = new Set(['READY', 'ON_CALL', 'WRAPUP'])
const RECEIVES_LEADS = new Set(['READY'])

async function repInfo(sb: any, rep: string): Promise<{ ok: boolean; spanish: boolean; status: string }> {
  const [{ data: user }, { data: st }] = await Promise.all([
    sb.from('dialer_users').select('role, active, spanish').eq('twilio_identity', rep).maybeSingle(),
    sb.from('dialer_rep_status').select('status').eq('rep_identity', rep).maybeSingle(),
  ])
  return {
    ok:      !!user && user.role === 'REP' && user.active === true,
    spanish: user?.spanish === true,
    status:  st?.status ?? 'OFFLINE',
  }
}

export async function fillBuffer(rep: string, count = BUFFER_SIZE): Promise<Attempt[]> {
  const sb    = db()
  const today = todayEastern()
  const now   = new Date()

  const who = await repInfo(sb, rep)
  if (!who.ok) return []
  if (!RECEIVES_LEADS.has(who.status)) return []

  const held = await fetchAll<Attempt>(() => sb.from('dialer_attempts')
    .select('*')
    .eq('plan_date', today)
    .in('status', ['buffered', 'leased'])
    .or(`buffered_for.eq.${rep},leased_by.eq.${rep}`))

  /* A buffered row whose day has ended is dead weight: it cannot be called
     but still counts toward the rep's five, so no replacement is ever
     fetched. That is the loop reps reported — the same handful of dead leads
     while a thousand callable ones waited. A missed slot is NOT dead: the
     schedule slipped, the lead is still worth calling. Only the end of the
     calling day retires a row. Leased rows are never touched; that call is
     in progress. */
  const stale = held.filter(a =>
    a.status === 'buffered' && a.day_ends_at && Date.parse(a.day_ends_at) <= now.getTime())
  if (stale.length) {
    await sb.from('dialer_attempts')
      .update({ status: 'pending', buffered_for: null, buffered_at: null })
      .in('id', stale.map(a => a.id))
  }

  const needed = count - (held.length - stale.length)
  if (needed <= 0) return []

  const [{ rows, lastDialed, activeContacts }, stateFilter, firmFilter] = await Promise.all([
    candidatePool(sb, today), getStateFilter(), getFirmFilter(),
  ])
  for (const a of stale) activeContacts.delete(a.contact_id)

  const eligible = eligibleFor({
    rep, repSpeaksSpanish: who.spanish, pool: rows, lastDialed, activeContacts,
    stateFilter, firmFilter, now: now.getTime(),
  })

  /* One slot per person per fill.

     A lead carries several attempts for the day, and nothing stopped a single
     fill handing a rep two or three of the same contact's slots at once — the
     redial gap is evaluated when the buffer is built, not between the calls
     inside it, so the rep then worked straight through them. One lead was
     rung six times in 31 minutes. */
  const seen = new Set<string>()
  const take: Candidate[] = []
  for (const a of eligible) {
    if (take.length >= needed) break
    if (seen.has(a.contact_id)) continue
    seen.add(a.contact_id)
    take.push(a)
  }
  if (!take.length) return []

  const nowIso = now.toISOString()
  const { data, error } = await sb.from('dialer_attempts')
    .update({ status: 'buffered', buffered_for: rep, buffered_at: nowIso, updated_at: nowIso })
    .in('id', take.map(a => a.id))
    .eq('status', 'pending')   // the race guard: only one rep can win a row
    .select()

  if (error) { console.error('[queue:fill]', error.message); return [] }
  return (data ?? []) as Attempt[]
}

/** Top every rep who can receive leads back up to `count`. */
export async function fillAllReadyReps(count = BUFFER_SIZE): Promise<Record<string, number>> {
  const sb    = db()
  const today = todayEastern()
  const now   = new Date()

  const [{ data: statuses }, { data: users }] = await Promise.all([
    sb.from('dialer_rep_status').select('rep_identity, status'),
    sb.from('dialer_users').select('twilio_identity, role, active, spanish'),
  ])

  const reps = new Map<string, { spanish: boolean; status: string }>()
  for (const u of users ?? []) {
    if (u.role !== 'REP' || !u.active) continue
    const status = (statuses ?? []).find(s => s.rep_identity === u.twilio_identity)?.status ?? 'OFFLINE'
    reps.set(u.twilio_identity, { spanish: u.spanish === true, status })
  }

  /* Reclaim anything held by somebody who should not be holding it: an
     identity that is not a rep at all, or a rep who has gone offline. The
     status write can be missed — a dropped request, a closed tab — and a
     lead locked to an absent rep is invisible to everyone else, because a
     buffered contact is excluded from every other fill. Reconciling here
     means the floor recovers whatever happened. */
  const buffered = await fetchAll<{ id: string; buffered_for: string | null }>(() =>
    sb.from('dialer_attempts').select('id, buffered_for').eq('plan_date', today).eq('status', 'buffered'))
  const orphaned = buffered
    .filter(a => !a.buffered_for || !HOLDS_LEADS.has(reps.get(a.buffered_for)?.status ?? 'OFFLINE'))
    .map(a => a.id)
  for (let i = 0; i < orphaned.length; i += 500) {
    await sb.from('dialer_attempts')
      .update({ status: 'pending', buffered_for: null, buffered_at: null, updated_at: now.toISOString() })
      .in('id', orphaned.slice(i, i + 500))
  }
  if (orphaned.length) console.warn('[queue:fill-all] reclaimed %d orphaned lead(s)', orphaned.length)

  const receiving = [...reps.entries()].filter(([, r]) => RECEIVES_LEADS.has(r.status))
  if (!receiving.length) return {}

  const assigned = await fetchAll<{ buffered_for: string | null; leased_by: string | null; status: string }>(() =>
    sb.from('dialer_attempts')
      .select('buffered_for, leased_by, status')
      .eq('plan_date', today)
      .in('status', ['buffered', 'leased']))
  const heldBy: Record<string, number> = {}
  for (const r of assigned) {
    const who = r.status === 'leased' ? r.leased_by : r.buffered_for
    if (who) heldBy[who] = (heldBy[who] ?? 0) + 1
  }

  const needs = receiving
    .map(([rep, r]) => ({ rep, spanish: r.spanish, needed: count - (heldBy[rep] ?? 0) }))
    .filter(r => r.needed > 0)
  if (!needs.length) return {}

  const [{ rows, lastDialed, activeContacts }, stateFilter, firmFilter] = await Promise.all([
    candidatePool(sb, today), getStateFilter(), getFirmFilter(),
  ])

  /* Round-robin, so a short pool is shared rather than given entirely to
     whoever is asked for first. `claimed` is global: one contact must not go
     to two reps any more than twice to one. */
  const claimed = new Set<string>()
  const plan: { id: string; rep: string }[] = []
  let placed = true
  while (placed) {
    placed = false
    for (const n of needs) {
      if (n.needed <= 0) continue
      const eligible = eligibleFor({
        rep: n.rep, repSpeaksSpanish: n.spanish, pool: rows, lastDialed,
        activeContacts, stateFilter, firmFilter, now: now.getTime(),
      })
      const pick = eligible.find(a => !claimed.has(a.contact_id))
      if (!pick) continue
      claimed.add(pick.contact_id)
      activeContacts.add(pick.contact_id)
      plan.push({ id: pick.id, rep: n.rep })
      n.needed--
      placed = true
    }
  }
  if (!plan.length) return {}

  const nowIso = now.toISOString()
  const byRep = new Map<string, string[]>()
  for (const p of plan) {
    const arr = byRep.get(p.rep) ?? []
    arr.push(p.id)
    byRep.set(p.rep, arr)
  }

  const result: Record<string, number> = {}
  await Promise.all([...byRep.entries()].map(async ([rep, ids]) => {
    const { data } = await sb.from('dialer_attempts')
      .update({ status: 'buffered', buffered_for: rep, buffered_at: nowIso, updated_at: nowIso })
      .in('id', ids).eq('status', 'pending').select('id')
    result[rep] = data?.length ?? 0
  }))

  await preemptForDueCallbacks().catch(err => console.error('[queue:preempt]', err))
  return result
}

/* A promise that comes due jumps the buffer.

   Ranking alone is not enough: the ladder is only consulted when a buffer
   refills, so a rep holding five leads at 3:58 would not see a 4:00 callback
   until they had worked through all five. By then the promise is an hour
   old. The same applies to an appointment reaching its slot — once the slot
   passes it is a missed appointment, top of nothing.

   So a time-bound lead entering its window is pushed into a rep's buffer,
   displacing their weakest-ranked lead back to the pool, where it is picked
   up again on the next fill having lost nothing. */
export async function preemptForDueCallbacks(): Promise<number> {
  const sb    = db()
  const today = todayEastern()
  const now   = new Date()
  const nowMs = now.getTime()

  const [pending, held, { data: users }, { data: statuses }] = await Promise.all([
    fetchAll<Attempt>(() => sb.from('dialer_attempts').select('*').eq('plan_date', today).eq('status', 'pending')),
    fetchAll<Attempt>(() => sb.from('dialer_attempts').select('*').eq('plan_date', today).eq('status', 'buffered')),
    sb.from('dialer_users').select('twilio_identity, role, active'),
    sb.from('dialer_rep_status').select('rep_identity, status'),
  ])

  const canHold = new Set((users ?? [])
    .filter(u => u.role === 'REP' && u.active)
    .map(u => u.twilio_identity)
    .filter(id => HOLDS_LEADS.has((statuses ?? []).find(s => s.rep_identity === id)?.status ?? 'OFFLINE')))
  if (!canHold.size) return 0

  const live = pending.filter(a => {
    if (a.is_callback) return a.callback_at ? Date.parse(a.callback_at) <= nowMs : false
    return String(a.stage_name).toLowerCase() === 'appointment scheduled'
      && inWindow(a.due_from, a.due_until, nowMs)
  })
  if (!live.length) return 0

  const busy = new Set(held.map(a => a.contact_id))
  const leased = await fetchAll<{ contact_id: string; leased_by: string }>(() =>
    sb.from('dialer_attempts').select('contact_id, leased_by').eq('plan_date', today).eq('status', 'leased'))
  for (const r of leased) busy.add(r.contact_id)

  const buffers = new Map<string, Attempt[]>()
  for (const rep of canHold) buffers.set(rep, [])
  for (const a of held) if (a.buffered_for && buffers.has(a.buffered_for)) buffers.get(a.buffered_for)!.push(a)
  const onCall: Record<string, number> = {}
  for (const r of leased) if (r.leased_by) onCall[r.leased_by] = (onCall[r.leased_by] ?? 0) + 1

  let moved = 0
  for (const due of live.sort((a, b) => String(a.due_from).localeCompare(String(b.due_from)))) {
    if (busy.has(due.contact_id)) continue

    /* A callback goes to the rep who promised it and nowhere else. Anything
       else goes to whoever is holding the weakest lead, so two appointments
       landing together do not both displace the same person. */
    const candidates = due.is_callback && due.owner_rep
      ? (buffers.has(due.owner_rep) ? [due.owner_rep] : [])
      : [...buffers.keys()]
    if (!candidates.length) continue

    let target: string | null = null
    let victim: Attempt | null = null
    for (const rep of candidates) {
      const buf = buffers.get(rep)!
      if (buf.length + (onCall[rep] ?? 0) < BUFFER_SIZE) { target = rep; victim = null; break }
      const worst = [...buf].sort((x, y) => rankOf(x as any, nowMs) - rankOf(y as any, nowMs))[0]
      if (!worst || rankOf(worst as any, nowMs) >= rankOf(due as any, nowMs)) continue
      if (!victim || rankOf(worst as any, nowMs) < rankOf(victim as any, nowMs)) { target = rep; victim = worst }
    }
    if (!target) continue

    const nowIso = now.toISOString()
    const { data: won } = await sb.from('dialer_attempts')
      .update({ status: 'buffered', buffered_for: target, buffered_at: nowIso, updated_at: nowIso })
      .eq('id', due.id).eq('status', 'pending').select('id')
    if (!won?.length) continue

    if (victim) {
      await sb.from('dialer_attempts')
        .update({ status: 'pending', buffered_for: null, buffered_at: null, updated_at: nowIso })
        .eq('id', victim.id).eq('status', 'buffered')
      buffers.set(target, buffers.get(target)!.filter(x => x.id !== victim!.id))
    }
    buffers.get(target)!.push(due)
    busy.add(due.contact_id)
    moved++
  }

  if (moved) console.log('[queue:preempt] %d time-bound lead(s) pushed into buffers', moved)
  return moved
}

/** Hand everything a rep holds back to the pool. */
export async function releaseBuffer(rep: string): Promise<void> {
  await db().from('dialer_attempts')
    .update({ status: 'pending', buffered_for: null, buffered_at: null, updated_at: new Date().toISOString() })
    .eq('buffered_for', rep)
    .eq('status', 'buffered')
    .eq('plan_date', todayEastern())
}

/* ═══════════════════════════════════════════════════════════════════════════
   The lease — a call in flight

   A row moves buffered → leased the moment it is dialled, and back again if
   the call never produces an outcome. This was written in the old engine and
   never reached: nothing called it, so every in-flight call still read as
   "buffered" and a rep who dialled and closed their tab held the lead until
   somebody noticed. The dial path now goes through claimForCall, and
   reapExpiredLeases returns anything abandoned.
   ═══════════════════════════════════════════════════════════════════════════ */

const LEASE_MS         = 5 * 60 * 1000
const LEASE_EXTEND_MS  = 15 * 60 * 1000

/** Mark an attempt as being called right now. Returns false if it was taken. */
export async function claimForCall(attemptId: string, rep: string): Promise<boolean> {
  const now = new Date()
  const { data } = await db().from('dialer_attempts')
    .update({
      status: 'leased', leased_by: rep, leased_at: now.toISOString(),
      lease_expires_at: new Date(now.getTime() + LEASE_MS).toISOString(),
      buffered_for: null, buffered_at: null, updated_at: now.toISOString(),
    })
    .eq('id', attemptId)
    .in('status', ['buffered', 'pending'])
    .select('id')
  return (data?.length ?? 0) > 0
}

export async function extendLease(attemptId: string): Promise<void> {
  await db().from('dialer_attempts')
    .update({ lease_expires_at: new Date(Date.now() + LEASE_EXTEND_MS).toISOString() })
    .eq('id', attemptId).eq('status', 'leased')
}

export async function releaseLease(attemptId: string): Promise<void> {
  await db().from('dialer_attempts')
    .update({
      status: 'pending', leased_by: null, leased_at: null,
      lease_expires_at: null, updated_at: new Date().toISOString(),
    })
    .eq('id', attemptId).eq('status', 'leased')
}

/** Return leads from calls that never finished. */
export async function reapExpiredLeases(): Promise<number> {
  const sb = db()
  const { data } = await sb.from('dialer_attempts')
    .update({
      status: 'pending', leased_by: null, leased_at: null,
      lease_expires_at: null, updated_at: new Date().toISOString(),
    })
    .eq('status', 'leased')
    .lt('lease_expires_at', new Date().toISOString())
    .select('id')
  if (data?.length) console.warn('[queue:lease] reclaimed %d abandoned call(s)', data.length)
  return data?.length ?? 0
}

/** The rep's next lead, leased and ready to dial. */
export async function getNextAttempt(rep: string): Promise<Attempt | null> {
  const sb    = db()
  const today = todayEastern()

  await fillBuffer(rep, BUFFER_SIZE)

  const buffered = await fetchAll<Attempt>(() => sb.from('dialer_attempts')
    .select('*')
    .eq('plan_date', today)
    .eq('status', 'buffered')
    .eq('buffered_for', rep))
  if (!buffered.length) return null

  const ordered = await sortQueueCanonical(buffered)
  for (const next of ordered) {
    if (await claimForCall(next.id, rep)) {
      const { data } = await sb.from('dialer_attempts').select('*').eq('id', next.id).single()
      return (data ?? next) as Attempt
    }
  }
  return null
}

/* ═══════════════════════════════════════════════════════════════════════════
   SETTLE — the outcome rewrites the lead's day
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DispositionOptions {
  repIdentity:      string
  callDuration:     number
  callbackAt?:      string
  callbackContext?: string
  callSid?:         string
  firm?:            string
  nqReason?:        string
}

/** Outcomes that end a lead's day. No Answer is absent on purpose — the
 *  whole point of a cadence is that not answering leaves the plan standing. */
const TERMINAL = new Set(['Callback', 'Qualified', 'Signed', 'MIA Reconnected', 'Not Qualified'])

export async function applyDisposition(
  attemptId: string,
  disposition: string,
  opts: DispositionOptions,
): Promise<void> {
  const sb  = db()
  const now = new Date()

  const { data: attempt } = await sb.from('dialer_attempts').select('*').eq('id', attemptId).single()
  if (!attempt) return

  const today = attempt.plan_date ?? todayEastern()
  const firm  = opts.firm || attempt.firm || ''
  const realConversation = opts.callDuration > 60 ||
    ['Callback', 'Qualified', 'Signed'].includes(disposition)

  await sb.from('dialer_attempts').update({
    status: 'completed', completed_by: opts.repIdentity, completed_at: now.toISOString(),
    disposition, call_sid: opts.callSid ?? null,
    leased_by: null, leased_at: null, lease_expires_at: null,
    buffered_for: null, buffered_at: null,
    updated_at: now.toISOString(),
  }).eq('id', attemptId)

  /* A callback row settles the promise it mirrors. Without this the queue row
     completes and dialer_callbacks still says pending, so the next plan
     mirrors it straight back in and the rep is told to make the call again. */
  if (attempt.is_callback && attempt.callback_id) {
    await sb.from('dialer_callbacks').update({
      status: 'completed', completed_at: now.toISOString(),
      completed_by: opts.repIdentity, disposition,
    }).eq('id', attempt.callback_id)
  }

  if (attempt.contact_id) {
    const { data: recent } = await sb.from('dialer_calls')
      .select('call_sid')
      .eq('contact_id', attempt.contact_id)
      .eq('rep_identity', opts.repIdentity)
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
    if (recent) {
      await sb.from('dialer_calls')
        .update({ disposition, nq_reason: opts.nqReason?.trim() || null })
        .eq('call_sid', recent.call_sid)
    }
  }

  const stateUpdate: Record<string, unknown> = {
    last_dialed_at: now.toISOString(), last_disposition: disposition, updated_at: now.toISOString(),
  }
  if (realConversation) {
    const { data: cur } = await sb.from('dialer_lead_state')
      .select('owner_rep').eq('contact_id', attempt.contact_id).maybeSingle()
    if (!cur?.owner_rep) {
      stateUpdate.owner_rep = opts.repIdentity
      stateUpdate.owner_set_at = now.toISOString()
    }
  }
  await sb.from('dialer_lead_state')
    .upsert({ contact_id: attempt.contact_id, ...stateUpdate }, { onConflict: 'contact_id' })

  // ── What happens to the rest of today ────────────────────────────────────
  if (TERMINAL.has(disposition)) {
    await cancelRemaining(sb, attempt.contact_id, today, attemptId)
  }

  switch (disposition) {
    case 'No Answer': {
      const { data: ls } = await sb.from('dialer_lead_state')
        .select('assigned_caller_id, sms_drip_active')
        .eq('contact_id', attempt.contact_id).maybeSingle()

      if (!ls?.assigned_caller_id) {
        const id = assignRandomCallerId(await getNumberPool())
        if (id) await sb.from('dialer_lead_state')
          .update({ assigned_caller_id: id, updated_at: now.toISOString() })
          .eq('contact_id', attempt.contact_id)
      }
      if (!ls?.sms_drip_active) {
        const { hasDripHistory, scheduleDrip } = await import('./sms-drip')
        if (!(await hasDripHistory(attempt.contact_id))) {
          scheduleDrip({
            contactId: attempt.contact_id, contactName: attempt.contact_name,
            phone: attempt.phone, firm: attempt.firm ?? null,
          }).catch(err => console.error('[sms-drip]', err))
        }
      }
      break
    }

    case 'Callback': {
      const at = opts.callbackAt ? new Date(opts.callbackAt) : new Date(now.getTime() + 4 * 3600_000)
      const { data: ls } = await sb.from('dialer_lead_state')
        .select('owner_rep').eq('contact_id', attempt.contact_id).maybeSingle()

      const { data: cb } = await sb.from('dialer_callbacks').insert({
        contact_id: attempt.contact_id, contact_name: attempt.contact_name,
        phone: attempt.phone, firm: attempt.firm, stage_name: attempt.stage_name,
        callback_at: at.toISOString(), callback_context: opts.callbackContext ?? null,
        source: 'disposition', owner_rep: ls?.owner_rep ?? opts.repIdentity,
      }).select('id').maybeSingle()

      /* Mirror it straight into the queue when it falls on today, so the rep
         does not have to remember it — it arrives at the promised minute. */
      if (cb?.id && at.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayEastern()) {
        await syncCallbacksIntoQueue().catch(err => console.error('[queue:callbacks]', err))
      }
      break
    }

    case 'Not Qualified':
      await sb.from('dialer_lead_state').upsert(
        { contact_id: attempt.contact_id, exhausted: true, updated_at: now.toISOString() },
        { onConflict: 'contact_id' })
      break
  }

  if (disposition !== 'No Answer' && attempt.contact_id) {
    const { data: call } = await sb.from('dialer_calls')
      .select('caller_id_used')
      .eq('contact_id', attempt.contact_id).eq('rep_identity', opts.repIdentity)
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
    if (call?.caller_id_used) {
      await sb.from('dialer_lead_state')
        .update({ assigned_caller_id: call.caller_id_used, updated_at: now.toISOString() })
        .eq('contact_id', attempt.contact_id)
    }
  }

  if (realConversation) {
    const { data: ls } = await sb.from('dialer_lead_state')
      .select('owner_rep').eq('contact_id', attempt.contact_id).maybeSingle()
    if (ls?.owner_rep) {
      await sb.from('dialer_attempts')
        .update({ owner_rep: ls.owner_rep, updated_at: now.toISOString() })
        .eq('contact_id', attempt.contact_id)
        .in('status', ['pending', 'buffered'])
        .eq('plan_date', today)
    }
  }

  await pushToGHL(sb, attempt, disposition, firm, opts).catch(err =>
    console.error('[queue:settle] GHL side-effects failed', err))

  // The slot this call vacated refills immediately.
  fillBuffer(opts.repIdentity, BUFFER_SIZE).catch(err => console.error('[queue:refill]', err))
}

async function cancelRemaining(sb: any, contactId: string, planDate: string, exceptId: string) {
  await sb.from('dialer_attempts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('contact_id', contactId)
    .eq('plan_date', planDate)
    .in('status', ['pending', 'buffered'])
    .eq('is_callback', false)
    .neq('id', exceptId)
}

/* Everything the outcome means outside the dialer: the GHL stage, the firm's
   tag, the drip, Slack, and the intake fill a signed case triggers. */
async function pushToGHL(
  sb: any, attempt: any, disposition: string, firm: string, opts: DispositionOptions,
) {
  const now = new Date()

  const STAGE: Record<string, string> = {
    'Not Qualified': 'Not Qualified', 'Qualified': 'Chase', 'Callback': 'Follow Up Required',
    'Signed': 'Signed/Sent', 'No Answer': 'No Response', 'MIA Reconnected': 'Signed/Sent',
  }
  const target = STAGE[disposition]

  // Only move to No Response on the first no-answer — after that it is
  // already there and the move is a write for nothing.
  let skip = false
  if (disposition === 'No Answer') {
    const { data: prev } = await sb.from('dialer_lead_state')
      .select('last_disposition').eq('contact_id', attempt.contact_id).maybeSingle()
    skip = prev?.last_disposition === 'No Answer'
  }

  if (target && attempt.ghl_opportunity_id && !skip) {
    await moveGHLStage(attempt.ghl_opportunity_id, attempt.pipeline_id, target)
      .catch(err => console.error('[queue:settle] stage move failed', err))
  }

  const TAGS: Record<string, Record<string, string>> = {
    lhp:   { Qualified: 'lhp - c', 'Not Qualified': 'lhp - nq', Callback: 'lhp - ap', 'No Answer': 'lhp - nr', Signed: 'lhp - ps', 'MIA Reconnected': 'lhp - ps' },
    fears: { Qualified: 'fl - c',  'Not Qualified': 'fl - nq',  Callback: 'fl - ap',  'No Answer': 'fl - nr',  Signed: 'fl - ps',  'MIA Reconnected': 'fl - ps'  },
    jm:    { Qualified: 'jm - c',  'Not Qualified': 'jm - nq',  Callback: 'jm - ap',  'No Answer': 'jm - nr',  Signed: 'jm - ps',  'MIA Reconnected': 'jm - ps'  },
  }
  const tag = TAGS[firm]?.[disposition]
  if (tag && attempt.contact_id) {
    await tagGHLContact(attempt.contact_id, [tag]).catch(err => console.error('[queue:settle] tag failed', err))
  }

  if (TERMINAL.has(disposition) && attempt.contact_id) {
    await sb.from('dialer_lead_state')
      .update({ sms_drip_active: false, updated_at: now.toISOString() })
      .eq('contact_id', attempt.contact_id)
    await sb.from('dialer_drip_queue')
      .update({ status: 'cancelled', updated_at: now.toISOString() })
      .eq('contact_id', attempt.contact_id).eq('status', 'pending')
  }

  const firmLabel = firm === 'lhp' ? 'LHP' : firm === 'fears' ? 'Fears' : firm.toUpperCase()
  const post = (url: string, lines: (string | null)[]) =>
    fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: lines.filter(Boolean).join(' — '),
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.filter(Boolean).join('\n') } }],
      }),
    }).catch(err => console.error('[queue:settle] slack failed', err))

  if (disposition === 'Not Qualified' && attempt.contact_id) {
    if (opts.nqReason) {
      const prefix = firm === 'lhp' ? 'lhp' : firm === 'jm' ? 'jm' : 'fl'
      await tagGHLContact(attempt.contact_id, [`${prefix} - nq - ${opts.nqReason}`]).catch(console.error)
    }
    const hook = (process.env.SLACK_NQ_WEBHOOK || '').trim().replace(/\\n$/, '')
    if (hook) await post(hook, [
      `*Not Qualified* — ${attempt.contact_name}`, `*Firm:* ${firmLabel}`,
      `*Phone:* ${attempt.phone}`, `*Rep:* ${opts.repIdentity}`,
      opts.nqReason ? `*Reason:* ${opts.nqReason}` : null,
      `*Stage:* ${attempt.stage_name || '—'}`,
    ])
  }

  if (['Qualified', 'Signed'].includes(disposition) && attempt.contact_id) {
    const hook = (process.env.SLACK_WEBHOOK_URL || '').trim().replace(/\\n$/, '')
    if (hook) await post(hook, [
      `${disposition === 'Signed' ? ':tada:' : ':white_check_mark:'} *${disposition}* — ${attempt.contact_name}`,
      `*Firm:* ${firmLabel}`, `*Phone:* ${attempt.phone}`,
      `*Rep:* ${opts.repIdentity}`, `*Stage:* ${attempt.stage_name || '—'}`,
    ])
  }

  if (['Signed', 'MIA Reconnected'].includes(disposition) && attempt.contact_id) {
    await sb.from('intake_fill_jobs').upsert({
      contact_id: attempt.contact_id, contact_name: attempt.contact_name,
      firm: firm || null, status: 'pending',
      scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      created_at: now.toISOString(),
    }, { onConflict: 'contact_id' }).catch((err: any) =>
      console.error('[queue:settle] intake fill schedule failed', err))
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Reset — a new day
   ═══════════════════════════════════════════════════════════════════════════ */

/* Nothing is carried. Yesterday's plan is closed out and today's is built
   from scratch at whatever stage each lead is in now, which is the whole
   reason carryover no longer jumps the ladder: a lead that went uncalled
   yesterday is simply planned again today on its own merits. */
export async function resetDay(): Promise<void> {
  const sb = db()
  const today = todayEastern()
  await sb.from('dialer_attempts')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .lt('plan_date', today)
    .in('status', ['pending', 'buffered', 'leased'])
  await sb.from('dialer_attempts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('plan_date', today)
    .in('status', ['pending', 'buffered', 'leased'])
    .eq('is_callback', false)
}

/* ═══════════════════════════════════════════════════════════════════════════
   GHL helpers
   ═══════════════════════════════════════════════════════════════════════════ */

async function moveGHLStage(opportunityId: string, pipelineId: string, stageName: string) {
  let pipelines
  try { pipelines = await getPipelines() }
  catch (err) { console.error('[ghl] pipelines failed', err); return }

  const pipeline = pipelines.find(p => p.id === pipelineId)
  if (!pipeline) return console.error('[ghl] pipeline not found', pipelineId)

  const stage = (pipeline.stages ?? []).find((s: any) => s.name.toLowerCase() === stageName.toLowerCase())
  if (!stage) return console.error('[ghl] stage not found', stageName)

  const res = await fetch(`https://services.leadconnectorhq.com/opportunities/${opportunityId}`, {
    method: 'PUT', headers: ghlHeaders(), body: JSON.stringify({ pipelineStageId: stage.id }),
  })
  if (!res.ok) console.error('[ghl] move failed', res.status)
}

async function tagGHLContact(contactId: string, tags: string[]) {
  const headers = ghlHeaders()
  const res = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, { headers })
  if (!res.ok) return
  const existing = (await res.json()).contact?.tags ?? []
  await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ tags: [...new Set([...existing, ...tags])] }),
  })
}

/** Used by the call-start endpoint to block a suppressed lead. */
export async function isLeadSuppressed(contactId: string): Promise<boolean> {
  const { data } = await db().from('dialer_lead_state')
    .select('suppressed').eq('contact_id', contactId).maybeSingle()
  return data?.suppressed === true
}

/** @deprecated the cap is enforced by fills counting what a rep holds. */
export async function enforceBufferCap(count = BUFFER_SIZE): Promise<number> {
  const sb    = db()
  const today = todayEastern()

  const held = await fetchAll<{ id: string; buffered_for: string | null; plan_date: string }>(() =>
    sb.from('dialer_attempts')
      .select('id, buffered_for, buffered_at, plan_date')
      .eq('status', 'buffered')
      .order('buffered_at', { ascending: true }))

  /* A buffered row from an earlier day belongs to a plan that is over. */
  const stale = held.filter(r => r.plan_date && r.plan_date !== today).map(r => r.id)
  for (let i = 0; i < stale.length; i += 500) {
    await sb.from('dialer_attempts')
      .update({ status: 'expired', buffered_for: null, buffered_at: null })
      .in('id', stale.slice(i, i + 500))
  }

  const byRep = new Map<string, string[]>()
  for (const r of held) {
    if (!r.buffered_for || r.plan_date !== today) continue
    const arr = byRep.get(r.buffered_for) ?? []
    arr.push(r.id)
    byRep.set(r.buffered_for, arr)
  }

  const { data: leased } = await sb.from('dialer_attempts')
    .select('leased_by').eq('plan_date', today).eq('status', 'leased')
  const onCall: Record<string, number> = {}
  for (const r of leased ?? []) if (r.leased_by) onCall[r.leased_by] = (onCall[r.leased_by] ?? 0) + 1

  const excess: string[] = []
  for (const [rep, ids] of byRep) {
    const room = Math.max(0, count - (onCall[rep] ?? 0))
    if (ids.length > room) excess.push(...ids.slice(room))
  }
  for (let i = 0; i < excess.length; i += 500) {
    await sb.from('dialer_attempts')
      .update({ status: 'pending', buffered_for: null, buffered_at: null, updated_at: new Date().toISOString() })
      .in('id', excess.slice(i, i + 500)).eq('status', 'buffered')
  }
  return excess.length + stale.length
}
