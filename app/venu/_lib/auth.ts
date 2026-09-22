import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSbClient } from '@supabase/supabase-js'

export interface VenuUser {
  id: string
  name: string
  role: 'admin' | 'rep'
  /** Track permissions, assigned by an admin on /venu/admin. */
  setter: boolean
  closer: boolean
}

/**
 * Short-lived cache of resolved users, keyed by the exact auth cookie.
 *
 * Every /api/venu route authenticates, and a single conversational turn hits
 * three of them (stt → turn → tts). Each uncached resolve costs a round trip to
 * Supabase Auth plus a profiles query — roughly 200ms that the rep spends
 * waiting in silence, three times per turn. The TTL is deliberately short so a
 * revoked session or a permission change takes effect within a minute.
 */
const userCache = new Map<string, { user: VenuUser; expires: number }>()
/** Serve from cache up to this age. */
const USER_FRESH_MS = 60_000
/** Beyond this, block and re-resolve. Between the two we serve stale and
 *  refresh in the background — a mid-call expiry otherwise costs the rep a
 *  quarter second of silence in the middle of a conversation. */
const USER_STALE_MS = 15 * 60_000

const refreshing = new Set<string>()

/** Current Teams user, or null. /venu shares the Teams auth session. */
export async function getVenuUser(): Promise<VenuUser | null> {
  const cookieStore = await cookies()
  const cacheKey = cookieStore
    .getAll()
    .filter((c) => c.name.startsWith('sb-'))
    .map((c) => `${c.name}=${c.value}`)
    .join(';')

  if (cacheKey) {
    const hit = userCache.get(cacheKey)
    if (hit) {
      const age = Date.now() - (hit.expires - USER_FRESH_MS)
      if (age < USER_FRESH_MS) return hit.user
      if (age < USER_STALE_MS) {
        // Stale but usable: hand it back now, refresh behind the call.
        if (!refreshing.has(cacheKey)) {
          refreshing.add(cacheKey)
          void resolveUser()
            .then((fresh) => {
              if (fresh) userCache.set(cacheKey, { user: fresh, expires: Date.now() + USER_FRESH_MS })
              else userCache.delete(cacheKey)
            })
            .catch(() => {})
            .finally(() => refreshing.delete(cacheKey))
        }
        return hit.user
      }
      userCache.delete(cacheKey)
    }
  }

  const resolved = await resolveUser()
  if (!resolved) return null

  if (cacheKey) {
    userCache.set(cacheKey, { user: resolved, expires: Date.now() + USER_FRESH_MS })
    if (userCache.size > 200) {
      for (const [k, v] of userCache) if (v.expires + USER_STALE_MS < Date.now()) userCache.delete(k)
    }
  }

  return resolved
}

async function resolveUser(): Promise<VenuUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, venu_setter, venu_closer')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  return {
    id: user.id,
    name: profile?.name || user.email?.split('@')[0] || 'Rep',
    role: isAdmin ? 'admin' : 'rep',
    // Admins can always take a call — that is how they review the drills.
    setter: isAdmin || profile?.venu_setter === true,
    closer: isAdmin || profile?.venu_closer === true,
  }
}

export function venuAdmin() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** The Deepgram key in .env is quoted and carries a trailing newline — trim it. */
export function deepgramKey(): string {
  return (process.env.DEEPGRAM_API_KEY ?? '').trim().replace(/^"|"$/g, '').trim()
}

/**
 * PostgREST returns an embedded one-to-one relation as an object, not an array
 * — venu_scores.session_id is UNIQUE, so it collapses. Indexing it with [0]
 * silently yields undefined, which is how every score on the calls list showed
 * up as a dash. Normalise at every read site.
 */
export function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
