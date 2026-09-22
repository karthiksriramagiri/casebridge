import { venuAdmin } from './auth'
import type { NuanceScenario } from './nuance-scenarios'

/**
 * How often each kind of scenario comes up, tunable from /venu/admin.
 *
 * A setter drilling qualification should mostly be telling qualified car
 * accidents apart from car accidents that die — so those two carry the weight
 * by default. The rest stay reachable rather than being cut, because the book
 * is the curriculum and a rep should still meet a dog bite occasionally.
 */
export interface DrawWeights {
  qualified: number
  carNotQualified: number
  escalateOther: number
  /** Multiplier applied to anything that is not a motor-vehicle case. */
  nonCarMultiplier: number
  /** Multiplier applied to cases that turn on which state it happened in. */
  stateRuleMultiplier: number
}

export const DEFAULT_WEIGHTS: DrawWeights = {
  qualified: 3,
  carNotQualified: 3,
  escalateOther: 0.6,
  nonCarMultiplier: 0.35,
  stateRuleMultiplier: 0.25,
}

export const WEIGHT_FIELDS: { key: keyof DrawWeights; label: string; help: string }[] = [
  { key: 'qualified', label: 'Qualified cases', help: 'Cases the book says to take. The bread and butter.' },
  { key: 'carNotQualified', label: 'Car accident rejections', help: 'Car cases that die. The other half of the judgement.' },
  { key: 'escalateOther', label: 'Escalate / conditional', help: 'Real, but edge cases — federal, government, screen-first.' },
  { key: 'nonCarMultiplier', label: 'Not a car accident ×', help: 'Multiplier for slip & fall, premises, dog bites, weather.' },
  { key: 'stateRuleMultiplier', label: 'State-rule cases ×', help: 'Multiplier for out-of-state and state-specific cases.' },
]

export const NON_CAR_CATEGORIES = new Set([
  'Slip & Fall',
  'Premise Liability',
  'Dog Bites & Non-Bite Dog Injuries',
  'Natural Occurrences',
])

const STATE_RULE_CATEGORIES = new Set([
  'Prop 213 & State-Specific Rules',
  'Minors (By State)',
])

export function isStateRule(s: NuanceScenario): boolean {
  return (
    STATE_RULE_CATEGORIES.has(s.category) ||
    /out-of-state|out of state|another state/i.test(s.title)
  )
}

export function weightFor(s: NuanceScenario, w: DrawWeights): number {
  const car = !NON_CAR_CATEGORIES.has(s.category)
  let weight: number

  if (s.disposition === 'qualified') weight = w.qualified
  else if (s.disposition === 'not_qualified') weight = car ? w.carNotQualified : w.qualified * 0.15
  else weight = w.escalateOther

  if (!car) weight *= w.nonCarMultiplier
  if (isStateRule(s)) weight *= w.stateRuleMultiplier

  return Math.max(0, weight)
}

/** Which row of the admin breakdown a scenario belongs to. */
export function bucketOf(s: NuanceScenario): string {
  if (isStateRule(s)) return 'State-rule / out-of-state'
  if (NON_CAR_CATEGORIES.has(s.category)) return 'Not a car accident'
  if (s.disposition === 'qualified') return 'Car accident — qualified'
  if (s.disposition === 'not_qualified') return 'Car accident — not qualified'
  return 'Car accident — escalate / other'
}

export const BUCKET_ORDER = [
  'Car accident — qualified',
  'Car accident — not qualified',
  'Car accident — escalate / other',
  'State-rule / out-of-state',
  'Not a car accident',
]

// Cached so the draw does not hit the database on every session start.
let cache: { value: DrawWeights; at: number } | null = null
const TTL_MS = 30_000

export async function loadWeights(): Promise<DrawWeights> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  try {
    const { data } = await venuAdmin()
      .from('venu_settings').select('value').eq('key', 'draw_weights').single()
    const value = { ...DEFAULT_WEIGHTS, ...(data?.value ?? {}) } as DrawWeights
    cache = { value, at: Date.now() }
    return value
  } catch {
    // Settings table missing or unreachable — the drill still has to work.
    return DEFAULT_WEIGHTS
  }
}

export async function saveWeights(weights: DrawWeights, userId: string) {
  const { error } = await venuAdmin().from('venu_settings').upsert({
    key: 'draw_weights',
    value: weights,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  })
  if (error) throw new Error(error.message)
  cache = { value: weights, at: Date.now() }
}
