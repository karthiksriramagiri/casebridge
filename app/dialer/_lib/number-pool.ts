import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { extractAreaCode, AREA_CODE_STATE } from './area-codes'

// ── Types ──────────────────────────────────────────────────────────────────
export interface PoolNumber {
  phoneNumber: string   // E.164: +1XXXXXXXXXX
  areaCode:    string   // 3-digit area code
  state:       string | null  // 2-letter US state abbreviation
  firm:        string | null  // firm slug from dialer_number_firms
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
    const [numbers, firmMap] = await Promise.all([
      client.incomingPhoneNumbers.list({ limit: 1000 }),
      loadFirmAssignments(),
    ])

    cachedPool = numbers
      .filter(n => n.phoneNumber.startsWith('+1'))
      .map(n => {
        const ac = extractAreaCode(n.phoneNumber)
        return {
          phoneNumber: n.phoneNumber,
          areaCode:    ac ?? '',
          state:       ac ? (AREA_CODE_STATE[ac] ?? null) : null,
          firm:        firmMap[n.phoneNumber] ?? null,
        }
      })
      .filter(n => n.areaCode !== '')

    cacheExpiry = Date.now() + CACHE_TTL_MS
    console.log(`[number-pool] cached ${cachedPool.length} numbers (${Object.keys(firmMap).length} firm-assigned)`)
  } catch (err) {
    console.error('[number-pool] failed to fetch from Twilio', err)
    // Return stale cache if available, empty otherwise
  }

  return cachedPool
}

// Load firm assignments from Supabase
async function loadFirmAssignments(): Promise<Record<string, string>> {
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data } = await db.from('dialer_number_firms').select('phone_number, firm')
    const map: Record<string, string> = {}
    for (const row of (data || [])) {
      map[row.phone_number] = row.firm
    }
    return map
  } catch {
    return {}
  }
}

// ── Caller ID selection (pure function) ────────────────────────────────────
export function selectCallerId(
  leadPhone: string,
  lastDisposition: string | null,
  assignedCallerId: string | null,
  pool: PoolNumber[],
  firm?: string | null,
): string {
  const fallback = process.env.TWILIO_CALLER_ID || '+12137344168'

  // Rule 1: NR leads use their assigned persistent number
  if (lastDisposition === 'No Answer' && assignedCallerId) {
    return assignedCallerId
  }

  // Firm-scoped pool: only use numbers assigned to this firm
  // If no numbers are assigned to the firm, fall back to unassigned numbers
  let firmPool = pool
  if (firm) {
    const assigned = pool.filter(n => n.firm === firm)
    if (assigned.length > 0) {
      firmPool = assigned
    } else {
      // Fall back to numbers with no firm assignment (shared pool)
      firmPool = pool.filter(n => !n.firm)
      if (firmPool.length === 0) firmPool = pool
    }
  }

  if (firmPool.length === 0) return fallback

  const leadAC = extractAreaCode(leadPhone)
  if (!leadAC) {
    return firmPool[Math.floor(Math.random() * firmPool.length)].phoneNumber
  }

  // Rule 2: Exact area code match within firm pool
  const exactMatches = firmPool.filter(n => n.areaCode === leadAC)
  if (exactMatches.length > 0) {
    return exactMatches[Math.floor(Math.random() * exactMatches.length)].phoneNumber
  }

  // Rule 3: Same-state fallback within firm pool
  const leadState = AREA_CODE_STATE[leadAC] ?? null
  if (leadState) {
    const stateMatches = firmPool.filter(n => n.state === leadState)
    if (stateMatches.length > 0) {
      return stateMatches[Math.floor(Math.random() * stateMatches.length)].phoneNumber
    }
  }

  // Rule 4: Random from firm pool
  return firmPool[Math.floor(Math.random() * firmPool.length)].phoneNumber
}

// ── Assign a random persistent number for NR leads ─────────────────────────
export function assignRandomCallerId(pool: PoolNumber[]): string | null {
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)].phoneNumber
}
