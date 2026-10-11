// Block definitions and UTC window computation for the CaseBridge Dialer.
// All block times are in LEAD-LOCAL time; this module converts them to UTC.

export type BlockName = 'morning' | 'afternoon' | 'evening' | 'night'

interface BlockDef {
  startH: number   // hour (24h)
  startM: number   // minute
  endH:   number
  endM:   number
}

export const BLOCK_DEFS: Record<BlockName, BlockDef> = {
  morning:   { startH:  8, startM: 30, endH: 11, endM: 30 },
  afternoon: { startH: 11, startM: 30, endH: 14, endM: 30 },
  evening:   { startH: 14, startM: 30, endH: 17, endM: 30 },
  night:     { startH: 17, startM: 30, endH: 20, endM: 30 },
}

// Which blocks to use based on calls_per_day
export const BLOCKS_BY_COUNT: Record<number, BlockName[]> = {
  1: ['morning'],
  2: ['morning', 'evening'],
  3: ['morning', 'afternoon', 'evening'],
  4: ['morning', 'afternoon', 'evening', 'night'],
  6: ['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'night'],
}

// Convert a wall-clock time in `timezone` on `localDateStr` (YYYY-MM-DD)
// to a UTC Date. Works correctly across DST boundaries.
function wallClockToUTC(localDateStr: string, h: number, m: number, timezone: string): Date {
  // Build an ISO-like string in the local timezone and parse it
  const pad = (n: number) => String(n).padStart(2, '0')
  const localIso = `${localDateStr}T${pad(h)}:${pad(m)}:00`

  // Use Intl to find the UTC offset at this wall-clock moment in this zone
  // Technique: format a known UTC time and compare to what the zone shows
  const probe = new Date(`${localIso}Z`) // treats as UTC temporarily

  // Find the actual UTC time by iterating (handles DST gaps/overlaps)
  // We use a small binary-search-free approach: compute offset from the probe
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(d)

  // Parse formatter output (MM/DD/YYYY, HH:MM:SS)
  const parse = (s: string) => {
    const [datePart, timePart] = s.split(', ')
    const [mo, dy, yr] = datePart.split('/')
    const [hh, mm, ss] = timePart.split(':')
    return new Date(Date.UTC(+yr, +mo - 1, +dy, +hh === 24 ? 0 : +hh, +mm, +ss))
  }

  // Compute the UTC time that corresponds to localIso in timezone
  // by finding the offset: utcTime - localWallClock = offset
  const probeLocal = parse(fmt(probe))
  const offsetMs   = probe.getTime() - probeLocal.getTime()
  return new Date(probe.getTime() + offsetMs)
}

export interface BlockWindow {
  block:     BlockName
  dueFrom:   Date   // UTC
  dueUntil:  Date   // UTC
  dayEndsAt: Date   // night block close = 8:30 PM local → UTC
}

// Compute UTC windows for the given blocks on localDateStr in the lead's timezone.
export function blockWindows(
  localDateStr: string,
  blocks: BlockName[],
  timezone: string
): BlockWindow[] {
  const nightDef = BLOCK_DEFS.night
  const dayEndsAt = wallClockToUTC(localDateStr, nightDef.endH, nightDef.endM, timezone)

  return blocks.map(block => {
    const def = BLOCK_DEFS[block]
    return {
      block,
      dueFrom:   wallClockToUTC(localDateStr, def.startH, def.startM, timezone),
      dueUntil:  wallClockToUTC(localDateStr, def.endH,   def.endM,   timezone),
      dayEndsAt,
    }
  })
}

/* Priority by stage (higher = called sooner).

   The ladder the floor works to:

     appointment scheduled   — at the appointed time
     contract sent
     chase
     [ today's leads ]       — a TIER, not a stage; see TODAY_RANK below
     follow up required
     no response             — newest first, nothing older than 21 days

   "Today's leads" cuts across stages — a lead that arrived today may be in
   No Response, Chase or Follow Up — so it cannot live in this map. It is
   computed per row in queue-engine and slotted between chase and follow-up,
   and the ladder is first-match-wins: a chase lead that arrived today ranks
   as chase, because chase sits higher. */
export const STAGE_PRIORITY: Record<string, number> = {
  'appointment scheduled': 600,
  // MIA was not named in the ladder. Left above contract sent, where it has
  // always been, rather than silently demoted.
  'mia':                   550,
  'contract sent':         500,
  'chase':                 400,
  'follow up required':    200,
  'no response':           100,
}

/** The tier today's leads occupy — between chase and follow up required. */
export const TODAY_RANK = 300

/* An appointment outranks everything DURING ITS SLOT and not otherwise.
   Ranked top unconditionally it simply floods the list: every appointment in
   the pipeline sat above every contract sent all day, including ones whose
   slot had passed hours earlier. Once the slot is gone the appointment was
   missed, so it is chased like a follow-up rather than shouting from the top
   of the page. */
export const APPOINTMENT_MISSED_RANK = 200

/** Is this attempt inside its own calling window right now? */
export function inWindow(dueFrom: string | null, dueUntil: string | null, now = Date.now()): boolean {
  if (!dueFrom || !dueUntil) return false
  const f = Date.parse(dueFrom), u = Date.parse(dueUntil)
  return Number.isFinite(f) && Number.isFinite(u) && now >= f && now < u
}

export function stagePriority(stageName: string): number {
  return STAGE_PRIORITY[stageName.toLowerCase()] ?? 100
}

/* No Response is worked newest first, and a lead that has sat there for three
   weeks is not worth a rep's time against one from this morning. */
export const NR_MAX_AGE_DAYS = 21

/* Today's leads are chased hard: six attempts, an hour and a half apart,
   starting when the lead landed rather than at a fixed block boundary. A lead
   that arrives at 2pm should be called at 2pm, not held until the evening
   block opens. */
export const TODAY_ATTEMPTS = 6
export const TODAY_GAP_MINUTES = 90

/** Six windows at 90-minute spacing from `addedAt`, clipped to the calling day. */
export function todayWindows(addedAt: Date, dayEndsAt: Date): { dueFrom: Date; dueUntil: Date }[] {
  const out: { dueFrom: Date; dueUntil: Date }[] = []
  const gapMs = TODAY_GAP_MINUTES * 60 * 1000
  for (let i = 0; i < TODAY_ATTEMPTS; i++) {
    const dueFrom = new Date(addedAt.getTime() + i * gapMs)
    if (dueFrom >= dayEndsAt) break
    out.push({ dueFrom, dueUntil: new Date(Math.min(dueFrom.getTime() + gapMs, dayEndsAt.getTime())) })
  }
  return out
}

// Is the lead currently within 8:30 AM–8:30 PM in their local timezone?
export function isWithinCallingHours(timezone: string): boolean {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', minute: 'numeric', hour12: false,
    })
    const parts = fmt.formatToParts(new Date())
    const h = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0')
    const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
    const t = h * 60 + m
    return t >= 8 * 60 + 30 && t <= 20 * 60 + 30
  } catch {
    return true
  }
}

// Format a block window for display (lead-local time, e.g. "Morning · 8:30–11:30 AM PT")
export function formatBlockWindow(
  block: BlockName,
  dueFrom: string,
  dueUntil: string,
  timezone: string
): string {
  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso))

  const labels: Record<BlockName, string> = {
    morning:   'Morning',
    afternoon: 'Afternoon',
    evening:   'Evening',
    night:     'Night',
  }

  const tzAbbr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, timeZoneName: 'short',
  }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? ''

  return `${labels[block]} · ${fmtTime(dueFrom)}–${fmtTime(dueUntil)} ${tzAbbr}`
}
