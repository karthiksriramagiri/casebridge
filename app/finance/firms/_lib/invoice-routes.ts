/** URL segment uses inv-1, inv-2; DB uses INV-1, INV-2 */
export function invoiceCodeFromRouteSegment(segment: string): string {
  const s = decodeURIComponent(segment).trim()
  const m = /^inv-(\d+)$/i.exec(s)
  if (m) return `INV-${m[1]}`
  const u = s.toUpperCase()
  if (/^INV-\d+$/.test(u)) return u
  return s
}

export function invoicePathSegment(code: string): string {
  const m = /^INV-(\d+)$/i.exec(code.trim())
  if (m) return `inv-${m[1]}`
  return encodeURIComponent(code.trim().toLowerCase().replace(/\s+/g, '-'))
}
