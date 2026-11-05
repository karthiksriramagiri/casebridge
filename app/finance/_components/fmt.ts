/* One place for money and percentages, so a figure reads the same everywhere. */

export const usd = (n: number | null | undefined, cents = false) =>
  n == null ? '—' : n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
  })

export const pct = (n: number | null | undefined, dp = 1) =>
  n == null ? '—' : `${n.toFixed(dp)}%`

export const num = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US')

export const day = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const dayShort = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Sign-aware class for a figure that can go either way. */
export const tone = (n: number | null | undefined) =>
  n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : ''
