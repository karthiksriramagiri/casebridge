import twilio from 'twilio'
import { extractAreaCode, AREA_CODE_STATE } from './area-codes'

// ── Types ──────────────────────────────────────────────────────────────────
export interface PoolNumber {
  phoneNumber: string   // E.164: +1XXXXXXXXXX
  areaCode:    string   // 3-digit area code
  state:       string | null  // 2-letter US state abbreviation
}

// ── In-memory cache (15-min TTL) ───────────────────────────────────────────
let cachedPool: PoolNumber[] = []
let cacheExpiry = 0
const CACHE_TTL_MS = 15 * 60 * 1000

export async function getNumberPool(): Promise<PoolNumber[]> {
  if (Date.now() < cacheExpiry && cachedPool.length > 0) return cachedPool

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
    )
    const numbers = await client.incomingPhoneNumbers.list({ limit: 1000 })

    cachedPool = numbers
      .filter(n => n.phoneNumber.startsWith('+1'))
      .map(n => {
        const ac = extractAreaCode(n.phoneNumber)
        return {
          phoneNumber: n.phoneNumber,
          areaCode:    ac ?? '',
          state:       ac ? (AREA_CODE_STATE[ac] ?? null) : null,
        }
      })
      .filter(n => n.areaCode !== '')

    cacheExpiry = Date.now() + CACHE_TTL_MS
    console.log(`[number-pool] cached ${cachedPool.length} numbers from Twilio`)
  } catch (err) {
    console.error('[number-pool] failed to fetch from Twilio', err)
    // Return stale cache if available, empty otherwise
  }

  return cachedPool
}

// ── Caller ID selection (pure function) ────────────────────────────────────
export function selectCallerId(
  leadPhone: string,
  lastDisposition: string | null,
  assignedCallerId: string | null,
  pool: PoolNumber[],
): string {
  const fallback = process.env.TWILIO_CALLER_ID || '+12137344168'

  // Rule 1: NR leads use their assigned persistent number
  if (lastDisposition === 'No Answer' && assignedCallerId) {
    return assignedCallerId
  }

  if (pool.length === 0) return fallback

  const leadAC = extractAreaCode(leadPhone)
  if (!leadAC) {
    return pool[Math.floor(Math.random() * pool.length)].phoneNumber
  }

  // Rule 2: Exact area code match
  const exactMatches = pool.filter(n => n.areaCode === leadAC)
  if (exactMatches.length > 0) {
    return exactMatches[Math.floor(Math.random() * exactMatches.length)].phoneNumber
  }

  // Rule 3: Same-state fallback
  const leadState = AREA_CODE_STATE[leadAC] ?? null
  if (leadState) {
    const stateMatches = pool.filter(n => n.state === leadState)
    if (stateMatches.length > 0) {
      return stateMatches[Math.floor(Math.random() * stateMatches.length)].phoneNumber
    }
  }

  // Rule 4: Random from pool
  return pool[Math.floor(Math.random() * pool.length)].phoneNumber
}

// ── Assign a random persistent number for NR leads ─────────────────────────
export function assignRandomCallerId(pool: PoolNumber[]): string | null {
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)].phoneNumber
}
