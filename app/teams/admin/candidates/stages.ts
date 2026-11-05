/* The onboarding pipeline, in order.

   Two stages move themselves — booking the call and starting module 2 — and
   the rest are an admin's call. `auto` is here so the board can say which is
   which rather than leaving someone to wonder why a card moved on its own. */

export const STAGES = [
  { key: 'credentials_created', label: 'Credentials Created', auto: true,
    hint: 'A login exists. Everyone starts here.' },
  { key: 'booked_call',         label: 'Booked Call',         auto: true,
    hint: 'Moves here when they book the call.' },
  { key: 'nuance_book',         label: 'Nuance Book',         auto: true,
    hint: 'Moves here when they finish the call and module 2 starts.' },
  { key: 'call_practice',       label: 'Call Practice',       auto: false, hint: '' },
  { key: 'exam_prep',           label: 'Exam Prep',           auto: false, hint: '' },
  { key: 'ready_kickoff',       label: 'Ready for Kickoff',   auto: false, hint: '' },
  { key: 'live',                label: 'Live',                auto: false, hint: '' },
] as const

export type StageKey = typeof STAGES[number]['key']

export const FIRST_STAGE: StageKey = 'credentials_created'
export const STAGE_KEYS = STAGES.map(s => s.key) as StageKey[]
export const STAGE_LABEL: Record<string, string> =
  Object.fromEntries(STAGES.map(s => [s.key, s.label]))

/** Position in the ladder; -1 for anything unrecognised. */
export function stageIndex(key: string | null | undefined): number {
  return STAGE_KEYS.indexOf((key || FIRST_STAGE) as StageKey)
}

/** Automation only ever moves a rep forward — never back past an admin's call. */
export function advanceOnly(current: string | null | undefined, target: StageKey): StageKey | null {
  const now = stageIndex(current)
  const next = stageIndex(target)
  return next > now ? target : null
}
