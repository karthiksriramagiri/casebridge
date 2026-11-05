/* Invoice codes in the database are not URL-safe.

   They arrive as "INV-1", and sometimes as "INV - 7" with stray spaces, so a
   code cannot simply be dropped into a path. The URL carries the tidy form and
   this converts back, tolerating both spellings — matching on digits rather
   than on exact text, because a lookup that fails on a space produces an
   invoice page that says "not found" about an invoice that plainly exists. */

export function invoicePathSegment(code: string): string {
  const m = /^INV\s*-\s*(\d+)$/i.exec(code.trim())
  if (m) return `inv-${m[1]}`
  return encodeURIComponent(code.trim().toLowerCase().replace(/\s+/g, '-'))
}

/** Does this URL segment name this invoice code? */
export function segmentMatchesCode(segment: string, code: string): boolean {
  return invoicePathSegment(code) === segment.trim().toLowerCase()
}

export function invoiceCodeFromRouteSegment(segment: string): string {
  const s = decodeURIComponent(segment).trim()
  const m = /^inv-(\d+)$/i.exec(s)
  if (m) return `INV-${m[1]}`
  const u = s.toUpperCase()
  if (/^INV\s*-\s*\d+$/.test(u)) return u
  return s
}
