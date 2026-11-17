/* ═══════════════════════════════════════════════════════════════════════════
   Who is on the floor, and when the board may be chased.

   Two clocks, and they are deliberately different ones:

     shifts        Eastern. The reps' own hours, as they were given.
     call window   Pacific. When a lead may be rung — the same 9-to-9 the
                   dialer works to, because it is the lead's day that
                   decides whether a call is welcome, not the rep's.

   Keeping them in the timezone each was stated in is the point. Converting
   the shifts to Pacific once, by hand, would be correct for half the year:
   Eastern and Pacific do not change over on the same instant, and for two
   weeks in March and one in November the offset between them is not five
   hours. Both are resolved against a real timezone, every time.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SHIFT_TZ  = 'America/New_York'
export const WINDOW_TZ = 'America/Los_Angeles'

/* Nothing is sent outside this, whoever is on shift. Pacific, inclusive of
   9am and exclusive of 9pm. */
export const WINDOW_FROM_HOUR = 9
export const WINDOW_TO_HOUR   = 21

export interface Shift {
  /** Matches `profiles.name`, which is how the Slack id is found. */
  name:  string
  /** Eastern, 24h. `to` may be smaller than `from` — see Pablo. */
  from:  number
  to:    number
}

/* The floor's hours, Eastern.

   Change them here. There is no admin screen for this yet, and a table with
   four rows that only an engineer edits is a worse place to look than a file
   that says what it is. */
export const SHIFTS: Shift[] = [
  { name: 'Camilo',   from:  6, to: 16 },   //  6am – 4pm
  { name: 'Ziyad',    from:  7, to: 17 },   //  7am – 5pm
  { name: 'Mauricio', from: 10, to: 18 },   // 10am – 6pm
  { name: 'Pablo',    from: 17, to:  2 },   //  5pm – 2am, over midnight
]

/** The hour-of-day, 0-23, that an instant falls on in some timezone. */
export function hourIn(at: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false })
    .formatToParts(at).find(p => p.type === 'hour')?.value ?? '0'
  return Number(h) % 24
}

/** Is this shift covering the given Eastern hour? */
export function covers(shift: Shift, hourEastern: number): boolean {
  /* A shift that ends on a smaller number than it starts has run past
     midnight, so the two halves are tested separately. Pablo's 5pm-2am is
     the whole reason this is not a single comparison. */
  return shift.from <= shift.to
    ? hourEastern >= shift.from && hourEastern < shift.to
    : hourEastern >= shift.from || hourEastern < shift.to
}

/** Everyone on shift at this instant. */
export function onShiftAt(at: Date): Shift[] {
  const h = hourIn(at, SHIFT_TZ)
  return SHIFTS.filter(s => covers(s, h))
}

/** May MIA calls go out at all right now? */
export function inCallWindow(at: Date): boolean {
  const h = hourIn(at, WINDOW_TZ)
  return h >= WINDOW_FROM_HOUR && h < WINDOW_TO_HOUR
}

/* Whose hour it is.

   Random among whoever is on, as asked. Seeded by the hour rather than left
   to Math.random so that a cron that fires twice — a retry, an overlapping
   invocation — names the same person both times instead of handing the hour
   to two different reps.

   The seed is the Pacific date and hour, which is also what the window is
   measured in, so the two cannot disagree about which hour this is. */
export function pickForHour(candidates: Shift[], at: Date): Shift | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const stamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: WINDOW_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).format(at)

  let seed = 0
  for (const ch of stamp) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  /* Sorted first: SHIFTS order is editorial and must not decide the draw. */
  const pool = [...candidates].sort((a, b) => a.name.localeCompare(b.name))
  return pool[seed % pool.length]
}
