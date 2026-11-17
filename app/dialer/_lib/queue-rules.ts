/* ═══════════════════════════════════════════════════════════════════════════
   What the floor calls, in what order, and when.

   Every decision about priority and scheduling lives in this file and nothing
   in it touches the database or the network. The engine reads these rules; it
   does not have opinions of its own. That separation is the point — the old
   engine carried its ladder in three places (a stage map, a rank function and
   two different sort comparators) and they had drifted apart, so the order on
   the admin screen was not the order leads went out in.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── What we call ────────────────────────────────────────────────────────────

/* Every stage the queue will dial. Anything not named here is invisible to
   the floor — not ranked low, not present.

   Not Qualified and Signed/Sent are deliberately absent: one has been ruled
   out, the other is done. Pending Send and Replacement are absent too; they
   are states the back office moves through, not conversations to have. */
export const CALLABLE_STAGES = [
  'new lead',
  'appointment scheduled',
  'mia',
  'contract sent',
  'chase',
  'follow up required',
  'no response',
] as const

export type CallableStage = typeof CALLABLE_STAGES[number]

const CALLABLE = new Set<string>(CALLABLE_STAGES)

export function isCallableStage(stageName: string | null | undefined): boolean {
  return CALLABLE.has(String(stageName ?? '').trim().toLowerCase())
}

// ─── The ladder ──────────────────────────────────────────────────────────────

/* The order the floor works, highest first.

     callback            a named rep promised a named person a time
     fresh               anything that arrived in the last 48 hours
     appointment (live)  a booked slot, during the slot
     mia                 a signed case that has gone dark
     contract sent       paperwork out, not back
     chase               qualified, working toward signature
     new lead            never reached, now older than 48 hours
     follow up required  — and an appointment whose slot was missed
     no response         never picked up

   Gaps of 100 so a tier can be inserted later without renumbering. */
export const RANK = {
  CALLBACK:         1000,
  FRESH:             900,
  APPOINTMENT_LIVE:  800,
  MIA:               700,
  CONTRACT_SENT:     600,
  CHASE:             500,
  NEW_LEAD:          400,
  FOLLOW_UP:         300,
  NO_RESPONSE:       200,
} as const

const STAGE_RANK: Record<string, number> = {
  'appointment scheduled': RANK.APPOINTMENT_LIVE,
  'mia':                   RANK.MIA,
  'contract sent':         RANK.CONTRACT_SENT,
  'chase':                 RANK.CHASE,
  'new lead':              RANK.NEW_LEAD,
  'follow up required':    RANK.FOLLOW_UP,
  'no response':           RANK.NO_RESPONSE,
}

/* A missed appointment is a follow-up.

   Ranked at the top unconditionally, every appointment in the pipeline sat
   above every contract sent all day — including ones whose slot had passed
   hours earlier. The qualifier is the whole point: an appointment outranks
   everything DURING ITS SLOT. Once the slot is gone it was missed, and a
   missed appointment is chased like a follow-up rather than shouting from
   the top of the page for the rest of the day. */
export const APPOINTMENT_MISSED_RANK = RANK.FOLLOW_UP

/* How long a lead counts as fresh.

   Speed to lead is the whole game, so for two days a new lead outranks every
   case we already have and is called every two hours — six times across a
   full calling day. After that it is worked on its stage's own merits. */
export const FRESH_WINDOW_HOURS = 48
export const FRESH_GAP_MINUTES  = 120

/* Being new is not enough on its own — the lead also has to be unworked.

   Freshness answers "nobody has got hold of this person yet", and the only
   two stages that still mean that are the one a lead lands in and the one it
   falls to when it does not pick up. The moment a rep has actually spoken to
   someone and moved them to Chase, Follow Up, Contract Sent, an appointment
   or MIA, the lead has been worked: it is a case now, and it ranks as the
   case it is. Without this a signed-in-the-morning Contract Sent sat at the
   very top of the floor's list all day on the strength of having arrived
   recently, which is the opposite of what the fresh tier is for. */
const FRESH_STAGES = new Set(['new lead', 'no response'])

/** Is this lead inside its first 48 hours AND still unworked? */
export function isFresh(
  leadCreatedAt: string | Date | null | undefined,
  stageName?: string | null,
  now = Date.now(),
): boolean {
  if (!leadCreatedAt) return false
  /* Called with no stage — scheduling, which asks only about age. */
  if (stageName !== undefined && !FRESH_STAGES.has(String(stageName ?? '').trim().toLowerCase())) {
    return false
  }
  const t = leadCreatedAt instanceof Date ? leadCreatedAt.getTime() : Date.parse(leadCreatedAt)
  if (!Number.isFinite(t)) return false
  return now - t < FRESH_WINDOW_HOURS * 3_600_000
}

/** Is this slot open right now? */
export function inWindow(
  dueFrom: string | Date | null | undefined,
  dueUntil: string | Date | null | undefined,
  now = Date.now(),
): boolean {
  const f = dueFrom instanceof Date ? dueFrom.getTime() : Date.parse(String(dueFrom ?? ''))
  const u = dueUntil instanceof Date ? dueUntil.getTime() : Date.parse(String(dueUntil ?? ''))
  if (!Number.isFinite(f) || !Number.isFinite(u)) return false
  return now >= f && now < u
}

/** The minimum shape the ladder needs to rank something. */
export interface Rankable {
  stage_name:      string | null
  is_callback:     boolean | null
  lead_created_at: string | null
  due_from:        string | null
  due_until:       string | null
}

/* Where this row sits on the ladder. First match wins.

   An appointment is never "fresh". It is a booked event — called at its time,
   once — and giving a same-day appointment the fresh treatment would put one
   lead in seven consecutive slots at the very top of the floor's list. */
export function rankOf(a: Rankable, now = Date.now()): number {
  if (a.is_callback) return RANK.CALLBACK

  const stage = String(a.stage_name ?? '').trim().toLowerCase()

  if (stage === 'appointment scheduled') {
    return inWindow(a.due_from, a.due_until, now) ? RANK.APPOINTMENT_LIVE : APPOINTMENT_MISSED_RANK
  }

  if (isFresh(a.lead_created_at, stage, now)) return RANK.FRESH

  return STAGE_RANK[stage] ?? RANK.NO_RESPONSE
}

/** What to show a rep for why this lead is in front of them. */
export function rankLabel(a: Rankable, now = Date.now()): string {
  const r = rankOf(a, now)
  if (r === RANK.CALLBACK)         return 'Callback'
  if (r === RANK.FRESH)            return 'New lead'
  if (r === RANK.APPOINTMENT_LIVE) return 'Appointment now'
  const stage = String(a.stage_name ?? '').trim()
  if (stage.toLowerCase() === 'appointment scheduled') return 'Missed appointment'
  return stage || 'Lead'
}

// ─── Ordering ────────────────────────────────────────────────────────────────

/* A lead that was just dialled is not dialled again for this long, whatever
   the schedule says. It matches the fresh cadence, so the hardest-chased lead
   in the system sets the floor for everything else. Callbacks are exempt —
   a promised time is a promise. */
export const MIN_REDIAL_GAP_MS = 2 * 60 * 60 * 1000

export interface Sortable extends Rankable {
  id:              string
  contact_id:      string
  attempt_number:  number | null
  stage_changed_at: string | null
}

const ms = (v: string | null | undefined): number => {
  const t = Date.parse(String(v ?? ''))
  return Number.isFinite(t) ? t : 0
}

/* The one comparator. Most significant first:

     1. the ladder
     2. a slot that is open right now, over one that has passed
     3. freshest first — whoever moved most recently
     4. never called, over already called
     5. waiting longest since their last call
     6. earliest unfinished attempt, then earliest slot

   The ladder comes before the open-slot test on purpose. A missed slot is a
   schedule that slipped, not a demotion: a brand-new lead whose 2pm slot went
   by is still a brand-new lead, and must not fall behind a no-response that
   happens to be inside its window. Openness breaks ties within a tier, which
   is where it belongs. */
export function compare(
  a: Sortable,
  b: Sortable,
  lastDialed: Map<string, number>,
  now = Date.now(),
): number {
  const flag = (v: unknown) => (v ? 1 : 0)
  const aDialed = lastDialed.get(a.contact_id)
  const bDialed = lastDialed.get(b.contact_id)

  return (
    rankOf(b, now) - rankOf(a, now) ||
    flag(inWindow(b.due_from, b.due_until, now)) - flag(inWindow(a.due_from, a.due_until, now)) ||
    (ms(b.lead_created_at) || ms(b.stage_changed_at)) - (ms(a.lead_created_at) || ms(a.stage_changed_at)) ||
    (aDialed === undefined ? 0 : 1) - (bDialed === undefined ? 0 : 1) ||
    (aDialed ?? 0) - (bDialed ?? 0) ||
    (a.attempt_number ?? 0) - (b.attempt_number ?? 0) ||
    ms(a.due_from) - ms(b.due_from) ||
    String(a.id).localeCompare(String(b.id))
  )
}

/* Order whole leads, not loose rows.

   A lead carries several attempts for the day and only one of them — the
   earliest still unfinished — can actually be dialled. Ranking each row on
   its own put a lead's second attempt at position 5 while the first, the
   only servable one, sat at 93: the floor read position 5 and could not call
   it. The lead moves as a unit, its servable attempt decides where it lands,
   and counting down the list counts down real people. */
export function orderQueue<T extends Sortable & { status?: string | null }>(
  rows: T[],
  lastDialed: Map<string, number>,
  now = Date.now(),
): T[] {
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const key = r.is_callback ? `cb:${r.id}` : `c:${r.contact_id}`
    const g = groups.get(key)
    if (g) g.push(r)
    else groups.set(key, [r])
  }

  const ranked = [...groups.values()].map(g => {
    const byAttempt = [...g].sort((x, y) => (x.attempt_number ?? 0) - (y.attempt_number ?? 0))
    const head = byAttempt.find(r => r.status === 'pending') ?? byAttempt[0]
    return { head, rows: [head, ...byAttempt.filter(r => r !== head)] }
  })

  ranked.sort((x, y) => compare(x.head, y.head, lastDialed, now))
  return ranked.flatMap(r => r.rows)
}

/** Dialled too recently to dial again. Callbacks are promises, so exempt. */
export function dialedTooRecently(
  a: { contact_id: string; is_callback: boolean | null },
  lastDialed: Map<string, number>,
  now = Date.now(),
): boolean {
  if (a.is_callback) return false
  const last = lastDialed.get(a.contact_id)
  return last !== undefined && now - last < MIN_REDIAL_GAP_MS
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

/* The calling day, in the lead's own local time. Nobody is rung before 8:30
   in the morning or after 8:30 at night wherever they live. */
export const DAY_START_H = 8,  DAY_START_M = 30
export const DAY_END_H   = 20, DAY_END_M   = 30

/* How many times a lead in each stage is called per day, once it is no longer
   fresh. The database table dialer_cadence_rules can override any of these;
   this is what applies when it has nothing to say. */
export const DEFAULT_CADENCE: Record<string, number> = {
  'appointment scheduled': 1,
  'mia':                   6,
  'contract sent':         2,
  'chase':                 3,
  'new lead':              4,
  'follow up required':    3,
  'no response':           4,
}

/* Turn a wall-clock time in some timezone into the UTC instant it names.

   Formats a probe instant in the target zone, measures how far that is from
   the same numbers read as UTC, and shifts by the difference. Correct across
   daylight-saving boundaries, which a fixed offset is not. */
export function wallClockToUTC(dateStr: string, h: number, m: number, timezone: string): Date {
  const pad = (n: number) => String(n).padStart(2, '0')
  const probe = new Date(`${dateStr}T${pad(h)}:${pad(m)}:00Z`)
  const shown = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(probe)
  const [datePart, timePart] = shown.split(', ')
  const [mo, dy, yr] = datePart.split('/')
  const [hh, mi, ss] = timePart.split(':')
  const asUtc = Date.UTC(+yr, +mo - 1, +dy, +hh === 24 ? 0 : +hh, +mi, +ss)
  return new Date(probe.getTime() + (probe.getTime() - asUtc))
}

export interface Slot {
  dueFrom:   Date
  dueUntil:  Date
  dayEndsAt: Date
}

/* Today's calling slots for one lead.

   Two schedules, and which one applies is decided by age alone:

   FRESH — inside 48 hours of arriving. A slot every two hours, counted from
   the minute the lead landed rather than from a fixed boundary, so a lead
   that arrives at 2:10pm is called at 2:10, not held until some block opens.
   On the second day it picks up at 8:30am and keeps the two-hour beat until
   the 48 hours are up.

   SETTLED — older than that. Its stage's calls-per-day, spread evenly across
   the calling day. Four calls land every three hours, six every two; the
   spacing falls out of the count instead of being hand-mapped onto named
   blocks, which is how the old six-call cadence ended up with two slots
   stacked on the same window.

   A slot runs until the next one starts, and the last runs to the end of the
   day — so a slot nobody worked stays visible rather than evaporating. */
export function slotsForDay(opts: {
  planDate:      string          // YYYY-MM-DD, the lead's local day
  timezone:      string
  callsPerDay:   number
  leadCreatedAt: Date | null     // when the lead first arrived
  stageName?:    string | null   // decides fresh the same way the ladder does
  now?:          Date
}): Slot[] {
  const { planDate, timezone, callsPerDay, leadCreatedAt, stageName } = opts

  const dayStart = wallClockToUTC(planDate, DAY_START_H, DAY_START_M, timezone)
  const dayEnd   = wallClockToUTC(planDate, DAY_END_H,   DAY_END_M,   timezone)
  if (dayEnd <= dayStart) return []

  /* No block label. The day used to be carved into four named parts and
     every slot tagged with the one it fell in, which meant a lead's time was
     described twice — once as a clock range, once as a word that only
     approximated it. A slot every two hours does not land in four buckets,
     so the word had stopped agreeing with the times beside it. The range is
     the whole truth; the label was noise on top of it. */
  const build = (starts: Date[]): Slot[] =>
    starts.map((dueFrom, i) => ({
      dueFrom,
      dueUntil:  starts[i + 1] ?? dayEnd,
      dayEndsAt: dayEnd,
    }))

  // ── Fresh: every two hours, for as long as the lead is still fresh ──────
  /* The same test the ladder uses, stage included. Scheduling and ranking
     have to agree: a lead given the two-hour cadence but ranked as Contract
     Sent would be planned for six calls it would never climb high enough to
     receive. */
  if (leadCreatedAt && isFresh(leadCreatedAt, stageName, dayStart.getTime())) {
    const gapMs    = FRESH_GAP_MINUTES * 60_000
    const freshEnd = leadCreatedAt.getTime() + FRESH_WINDOW_HOURS * 3_600_000
    const stop     = Math.min(dayEnd.getTime(), freshEnd)

    /* Counted from arrival on the day it arrives, so a lead that lands at
       2:10pm is called at 2:10 rather than waiting for a boundary. On every
       following day the beat restarts at 8:30 — anchoring it to the original
       minute would hand a 2:10pm lead a 10:10am first call the next morning
       and silently give away the first two hours of the day. */
    const anchor = Math.max(leadCreatedAt.getTime(), dayStart.getTime())
    const starts: Date[] = []
    for (let t = anchor; t < stop; t += gapMs) starts.push(new Date(t))
    if (starts.length) return build(starts)
    /* Arrived after the calling day closed — nothing today; tomorrow's plan
       picks it up at 8:30. */
    if (leadCreatedAt.getTime() >= dayEnd.getTime()) return []
  }

  // ── Settled: N calls spread evenly across the calling day ───────────────
  const n = Math.max(1, Math.min(8, Math.round(callsPerDay)))
  const span = dayEnd.getTime() - dayStart.getTime()
  const step = span / n
  const starts = Array.from({ length: n }, (_, i) => new Date(dayStart.getTime() + i * step))
  return build(starts)
}

/* A lead that has sat untouched in its stage this long is not worth a rep's
   time against one from this morning, so it never reaches the queue at all.
   Dropped at plan time rather than filtered at serve time, where it would
   still be counted and shown. */
export const MAX_LEAD_AGE_DAYS = 21

/** The Eastern calendar date. Every plan_date in the system is one of these. */
export const QUEUE_TZ = 'America/New_York'
export function queueToday(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: QUEUE_TZ })
}

/** A slot as a rep reads it — lead-local, e.g. "2:10–4:10 PM PT". */
export function formatSlot(dueFrom: string, dueUntil: string, timezone: string): string {
  try {
    const t = (iso: string) => new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso))
    const zone = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? ''
    return `${t(dueFrom)}–${t(dueUntil)} ${zone}`.trim()
  } catch {
    return ''
  }
}
