// GHL custom-field types and their allowed values.
//
// GHL silently DROPS a write whose value doesn't fit the field's type: free
// text into a NUMERICAL field, or anything outside the option list on a
// RADIO/SINGLE_OPTIONS field, just vanishes with a 200 response. That is why
// "Passengers in vehicle" (NUMERICAL) stayed blank while the run reported it
// as written.

import { GHL_BASE, GHL_LOCATION_ID, ghlHeaders } from './ghl-fields'

export interface GhlFieldDef {
  id: string
  name: string
  dataType: string
  options: string[]
}

const TTL_MS = 60 * 60 * 1000
let cache: { at: number; defs: Record<string, GhlFieldDef> } | null = null

export async function getFieldDefs(): Promise<Record<string, GhlFieldDef>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.defs
  const res = await fetch(
    `${GHL_BASE}/locations/${GHL_LOCATION_ID}/customFields`,
    { headers: ghlHeaders('sendcase'), cache: 'no-store' }
  )
  if (!res.ok) return cache?.defs ?? {}
  const data = await res.json()
  const list: any[] = data.customFields ?? data.customField ?? []
  const defs: Record<string, GhlFieldDef> = {}
  for (const f of list) {
    if (!f?.id) continue
    defs[f.id] = {
      id: f.id,
      name: f.name ?? '',
      dataType: f.dataType ?? 'TEXT',
      options: Array.isArray(f.picklistOptions) ? f.picklistOptions.map(String) : [],
    }
  }
  cache = { at: Date.now(), defs }
  return defs
}

export interface CoerceResult {
  ok: boolean
  value?: string
  reason?: string
}

/**
 * Fit an extracted value to what the field will actually accept.
 * Returns ok:false rather than writing something GHL will throw away.
 */
export function coerceValue(def: GhlFieldDef | undefined, raw: string): CoerceResult {
  const value = String(raw ?? '').trim()
  if (!value) return { ok: false, reason: 'empty' }
  if (!def) return { ok: true, value }

  switch (def.dataType) {
    case 'NUMERICAL': {
      // "None - client was alone" -> 0 ; "two passengers" -> 2
      const lower = value.toLowerCase()
      if (/\b(none|no one|nobody|alone|zero|by (him|her|my)self)\b/.test(lower)) {
        return { ok: true, value: '0' }
      }
      const words: Record<string, string> = {
        one: '1', two: '2', three: '3', four: '4', five: '5',
        six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
      }
      for (const [w, n] of Object.entries(words)) {
        if (new RegExp(`\\b${w}\\b`).test(lower)) return { ok: true, value: n }
      }
      const digits = value.match(/-?\d+(\.\d+)?/)
      if (digits) return { ok: true, value: digits[0] }
      return { ok: false, reason: `not numeric: "${value.slice(0, 40)}"` }
    }

    case 'DATE': {
      const iso = value.match(/\d{4}-\d{2}-\d{2}/)
      if (iso) return { ok: true, value: iso[0] }
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) {
        return { ok: true, value: parsed.toISOString().slice(0, 10) }
      }
      return { ok: false, reason: `not a date: "${value.slice(0, 40)}"` }
    }

    case 'RADIO':
    case 'SINGLE_OPTIONS':
    case 'CHECKBOX': {
      if (!def.options.length) return { ok: true, value }
      const lower = value.toLowerCase()
      const exact = def.options.find((o) => o.toLowerCase() === lower)
      if (exact) return { ok: true, value: exact }
      // "Yes - ambulance came" -> "Yes"
      const prefix = def.options.find((o) => lower.startsWith(o.toLowerCase()))
      if (prefix) return { ok: true, value: prefix }
      const contains = def.options.find((o) => lower.includes(o.toLowerCase()))
      if (contains && contains.length > 2) return { ok: true, value: contains }
      if (/^(yes|yeah|yep|correct|true)\b/.test(lower)) {
        const y = def.options.find((o) => o.toLowerCase() === 'yes')
        if (y) return { ok: true, value: y }
      }
      if (/^(no|nope|none|false)\b/.test(lower)) {
        const n = def.options.find((o) => o.toLowerCase() === 'no')
        if (n) return { ok: true, value: n }
      }
      return {
        ok: false,
        reason: `"${value.slice(0, 40)}" is not one of [${def.options.join(' | ')}]`,
      }
    }

    default:
      return { ok: true, value }
  }
}

/** Constraint lines for the prompt, so the model answers in accepted terms. */
export function describeConstraints(
  defs: Record<string, GhlFieldDef>,
  fieldIds: string[]
): string {
  const lines: string[] = []
  for (const id of fieldIds) {
    const d = defs[id]
    if (!d) continue
    if (d.options.length) {
      lines.push(`- "${id}" (${d.name}): MUST be exactly one of: ${d.options.join(' | ')}`)
    } else if (d.dataType === 'NUMERICAL') {
      lines.push(`- "${id}" (${d.name}): MUST be a plain number (use 0 for none)`)
    } else if (d.dataType === 'DATE') {
      lines.push(`- "${id}" (${d.name}): MUST be YYYY-MM-DD`)
    }
  }
  return lines.join('\n')
}
