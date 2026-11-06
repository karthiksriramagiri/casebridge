import { createClient } from '@supabase/supabase-js'
import { VISUAL_HOOKS, VERBAL_HOOKS } from './hooks'

/* ═══════════════════════════════════════════════════════════════════════════
   Hook names, as they stand right now.

   `hooks.ts` is the baseline and stays the source of truth for everything
   that shipped with the code. `creative_hooks` holds the ones named from the
   Creative Center since, and is merged over the top — so a name added in the
   UI shows up without a deploy, and a database that is empty, unreachable or
   missing the table leaves the reports exactly as they were.

   Never throws. A failure here costs a hook its name, which the callers
   already handle by falling back to the raw code; it must not cost the page
   its data.
   ═══════════════════════════════════════════════════════════════════════════ */

export type HookKind = 'visual' | 'verbal'

export type LiveHooks = {
  visual: Record<string, string>
  verbal: Record<string, string>
  /** Only the ones added from the UI, for telling them apart in the editor. */
  custom: { code: string; name: string; kind: HookKind; createdAt: string | null }[]
}

/** Which half of the pair a code belongs to, read off its letter. */
export function kindOf(code: string): HookKind | null {
  const letter = code.trim().charAt(0).toUpperCase()
  if ('ACEGIK'.includes(letter)) return 'visual'
  if ('BDFHJL'.includes(letter)) return 'verbal'
  return null
}

export async function loadHooks(): Promise<LiveHooks> {
  const base: LiveHooks = {
    visual: { ...VISUAL_HOOKS },
    verbal: { ...VERBAL_HOOKS },
    custom: [],
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return base

  try {
    const db = createClient(url, key)
    const { data, error } = await db
      .from('creative_hooks')
      .select('code, name, kind, created_at')
      .order('created_at', { ascending: false })
      .limit(2000)

    /* The table may not exist yet — the migration is run by hand. That is a
       baseline, not a failure. */
    if (error || !data) return base

    for (const row of data) {
      const code = String(row.code || '').toUpperCase()
      const name = String(row.name || '').trim()
      if (!code || !name) continue
      const kind = (row.kind === 'verbal' || row.kind === 'visual' ? row.kind : kindOf(code)) as HookKind | null
      if (!kind) continue
      base[kind][code] = name
      base.custom.push({ code, name, kind, createdAt: row.created_at ?? null })
    }
  } catch {
    /* Unreachable database — same answer as an empty one. */
  }

  return base
}
