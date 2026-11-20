/* The firm, as the floor reads it.

   This map lived in seven files — the callbacks page, the queue admin, the
   admin dashboard, inbound, the live floor, MiniQueue and the inbound
   overlay — each a separate `Record<string, string>` with the same three
   entries. Adding a firm meant finding all seven, and missing one showed
   the rep a raw slug where every other screen showed a name.

   One list. A firm the map does not know falls back to its code in upper
   case, which is wrong-looking enough to notice and harmless enough to
   ship. */
const LABELS: Record<string, string> = {
  lhp:   'LHP',
  lhp_s: 'LHP (ES)',
  jm:    'J&M',
  fears: 'Fears',
  fl:    'Fears',
  blg:   'BLG',
}

export function firmLabel(slug: string | null | undefined): string {
  const key = String(slug ?? '').trim().toLowerCase()
  if (!key) return '—'
  return LABELS[key] ?? key.toUpperCase()
}

/** The same map, for the handful of places that want it as an object. */
export const FIRM_LABEL: Record<string, string> = LABELS
