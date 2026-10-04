/* ═══════════════════════════════════════════════════════════════════════════
   Notion mirror for creative assignments

   The board at /creative/assignments is the system of record — it is what the
   Creative Center reads, sorts and drags. Notion is where the freelance
   creative already works, so every card is mirrored into a Notion database
   instead of asking him to live in two tools.

   Mirroring is one-way and best-effort by design. A Notion outage, a revoked
   token or a renamed property must never fail the request that created the
   brief: the board keeps working and the mirror catches up on the next edit.
   With NOTION_TOKEN or NOTION_ASSIGNMENTS_DB unset the whole module is inert,
   which is how it ships before the workspace is connected.

   Properties are matched by name against the database's actual schema rather
   than assumed, because the database belongs to someone else — a column that
   is missing or renamed is skipped, not an error.
   ═══════════════════════════════════════════════════════════════════════════ */

const API = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

const clean = (v: string | undefined) => (v ?? '').trim().replace(/\\n$/, '')

export const notionToken = () => clean(process.env.NOTION_TOKEN)
export const notionDb = () => clean(process.env.NOTION_ASSIGNMENTS_DB).replace(/-/g, '')

export function notionConfigured(): boolean {
  return !!notionToken() && !!notionDb()
}

async function notion(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || `Notion ${res.status}`)
  return json
}

/* The database's own property names and types, cached for the life of the
   server process. Schemas change about never, and reading it on every card
   edit would double the number of Notion calls. */
let schemaCache: { at: number; props: Record<string, { name: string; type: string }> } | null = null
const SCHEMA_TTL = 10 * 60 * 1000

async function schema() {
  if (schemaCache && Date.now() - schemaCache.at < SCHEMA_TTL) return schemaCache.props
  const db = await notion(`/databases/${notionDb()}`)
  const props: Record<string, { name: string; type: string }> = {}
  for (const [name, def] of Object.entries<any>(db.properties || {})) {
    props[name.toLowerCase()] = { name, type: def.type }
  }
  schemaCache = { at: Date.now(), props }
  return props
}

/** The database's title property, whatever it happens to be called. */
function titleProp(props: Record<string, { name: string; type: string }>) {
  return Object.values(props).find(p => p.type === 'title')?.name ?? 'Name'
}

/* The brief fields worth carrying across, in the order a human would read
   them. The left side is the Notion column name we look for (case-insensitive,
   first match wins) — aliases cover the obvious spellings so a database that
   says "Owner" instead of "Assignee" still lines up. */
const FIELDS: Array<{ aliases: string[]; value: (b: MirrorBrief) => any }> = [
  { aliases: ['status', 'stage'],              value: b => b.statusLabel },
  { aliases: ['assignee', 'owner', 'creator'], value: b => b.assigneeName },
  { aliases: ['ad type', 'type', 'format'],    value: b => b.ad_type },
  { aliases: ['language', 'lang'],             value: b => b.language },
  { aliases: ['due date', 'due', 'deadline'],  value: b => b.due_date },
  { aliases: ['must launch', 'priority'],      value: b => b.must_launch },
  { aliases: ['brief', 'notes', 'description'],value: b => b.brief },
  { aliases: ['benchmark', 'reference', 'ref'],value: b => b.benchmark_url },
  { aliases: ['deliverable', 'asset', 'file'], value: b => b.deliverable_url },
  { aliases: ['board link', 'casebridge', 'link'], value: b => b.boardUrl },
]

export type MirrorBrief = {
  id: string
  title: string
  statusLabel: string
  ad_type?: string | null
  language?: string | null
  assigneeName?: string | null
  due_date?: string | null
  must_launch?: boolean | null
  brief?: string | null
  benchmark_url?: string | null
  deliverable_url?: string | null
  boardUrl?: string
}

/** Shape one value for whatever Notion type the column turned out to be. */
function asProperty(type: string, value: any): any | null {
  if (value == null || value === '') return null
  const text = String(value)
  switch (type) {
    case 'title':       return { title: [{ text: { content: text.slice(0, 2000) } }] }
    case 'rich_text':   return { rich_text: [{ text: { content: text.slice(0, 2000) } }] }
    case 'select':      return { select: { name: text.slice(0, 100) } }
    case 'status':      return { status: { name: text.slice(0, 100) } }
    case 'multi_select':return { multi_select: [{ name: text.slice(0, 100) }] }
    case 'date':        return { date: { start: text } }
    case 'checkbox':    return { checkbox: !!value }
    case 'url':         return { url: text }
    case 'number':      return { number: Number(value) }
    case 'people':      return null   // needs Notion user ids, which we do not have
    default:            return null
  }
}

async function propertiesFor(b: MirrorBrief) {
  const props = await schema()
  const out: Record<string, any> = {}
  out[titleProp(props)] = { title: [{ text: { content: (b.title || 'Untitled').slice(0, 2000) } }] }

  for (const field of FIELDS) {
    const match = field.aliases.map(a => props[a]).find(Boolean)
    if (!match || match.type === 'title') continue
    const shaped = asProperty(match.type, field.value(b))
    if (shaped) out[match.name] = shaped
  }
  return out
}

/** Create the Notion page for a brief. Returns its page id, or null if the
    mirror is off or Notion refused — the caller treats either the same way. */
export async function createAssignment(b: MirrorBrief): Promise<string | null> {
  if (!notionConfigured()) return null
  try {
    const page = await notion('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: notionDb() },
        properties: await propertiesFor(b),
      }),
    })
    return page?.id ?? null
  } catch (err) {
    console.error('[notion:create]', (err as Error).message)
    return null
  }
}

/** Push a brief's current state onto the page it already has. */
export async function updateAssignment(pageId: string, b: MirrorBrief): Promise<boolean> {
  if (!notionConfigured() || !pageId) return false
  try {
    await notion(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: await propertiesFor(b) }),
    })
    return true
  } catch (err) {
    console.error('[notion:update]', (err as Error).message)
    return false
  }
}

/** Notion has no delete — a removed card is archived, which is what the UI
    there shows as deleted and what keeps the page recoverable. */
export async function archiveAssignment(pageId: string): Promise<boolean> {
  if (!notionConfigured() || !pageId) return false
  try {
    await notion(`/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) })
    return true
  } catch (err) {
    console.error('[notion:archive]', (err as Error).message)
    return false
  }
}

/** Confirms the token can actually see the database, for the settings check. */
export async function notionCheck(): Promise<{ ok: boolean; db?: string; properties?: string[]; error?: string }> {
  if (!notionConfigured()) {
    return { ok: false, error: 'NOTION_TOKEN and NOTION_ASSIGNMENTS_DB are not set.' }
  }
  try {
    const db = await notion(`/databases/${notionDb()}`)
    const title = (db.title || []).map((t: any) => t.plain_text).join('') || '(untitled)'
    return { ok: true, db: title, properties: Object.keys(db.properties || {}) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
