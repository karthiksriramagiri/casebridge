'use client'

import { useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/app/creative/_ui/input'
import { RANGES } from '@/app/creative/_lib/metrics'
import type { RangeKey } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/creative/_ui/select'
import { FIRMS, firmName } from '@/app/_metrics/firms'

/* The firm filter, one definition for every page that has one.

   `firms` is the list actually present in the data rather than the full
   roster, so a firm with nothing running today is not offered as a filter
   that would empty the page. Ordered by the canonical FIRMS list, which
   keeps a firm and its Spanish board next to each other. */
export function FirmSelect({
  value, onChange, firms,
}: {
  value: string
  onChange: (v: string) => void
  firms: readonly string[]
}) {
  const order = (code: string) => {
    const i = FIRMS.findIndex((f) => f.code === code)
    return i === -1 ? FIRMS.length : i
  }
  const sorted = [...new Set(firms)].sort((a, b) => order(a) - order(b) || a.localeCompare(b))
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-56 bg-card" aria-label="Firm">
        <SelectValue>{(v: string) => (v === 'all' ? 'All firms' : firmName(v))}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All firms</SelectItem>
        {sorted.map((f) => (
          <SelectItem key={f} value={f}>
            {firmName(f)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b bg-card px-6 py-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function RangeSelect({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RangeKey)}>
      <SelectTrigger className="w-48 bg-card" aria-label="Date range">
        <SelectValue>{(v: string) => RANGES.find((r) => r.key === v)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {RANGES.map((r) => (
          <SelectItem key={r.key} value={r.key}>
            {r.label}
            {r.key !== 'today' && r.key !== 'yest' && r.key !== 'ty' && (
              <span className="text-xs text-muted-foreground"> (incl. today)</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function StatCard({
  label, value, hint, tone, onClick,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'good' | 'bad'
  /* Given when the figure is a list of people. The card becomes a button and
     opens them, the same way the matching cell in the table does — the totals
     row is where you look first, so it should answer first. */
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-xl font-semibold tabular-nums',
          tone === 'good' && 'text-success',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  )

  if (!onClick) {
    return <div className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3">{body}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {body}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   The creative still.

   Served through /api/creative/thumb rather than straight off Meta's URL.
   Meta returns two shapes of link and the browser can only render one: the
   high-resolution `facebook.com/ads/image/?d=…` form answers with a 302 to a
   signed CDN URL that a cross-origin <img> will not follow. The proxy follows
   it server-side and streams the bytes back same-origin, so the src a row
   holds is a stable ad id instead of a link that expires.

   The gradient VID/IMG tile is kept as the fallback — an ad whose creative
   has no still (and a 404 from the proxy) still needs something in the slot.
   Lazy so a 171-row table does not open 171 image requests at once.
   ═══════════════════════════════════════════════════════════════════════════ */

const THUMB_SIZE = {
  sm: 'size-9 text-[9px] rounded-md',
  lg: 'size-28 text-sm rounded-lg',
} as const

export function Thumb({
  c,
  size = 'sm',
}: {
  c: { adId: string; id: string; account?: string; format: 'Video' | 'Image' }
  size?: keyof typeof THUMB_SIZE
}) {
  const [failed, setFailed] = useState(false)
  const hue = (parseInt(c.id.replace(/\D/g, '') || '0', 10) * 47) % 360
  const box = `shrink-0 overflow-hidden ${THUMB_SIZE[size]}`

  // No account means a creative that did not come from Meta — nothing to ask
  // the proxy for, so go straight to the tile.
  if (failed || !c.account) {
    return (
      <div
        aria-hidden
        className={cn(box, 'flex items-center justify-center font-bold text-white')}
        style={{ background: `linear-gradient(135deg, oklch(0.6 0.15 ${hue}), oklch(0.45 0.12 ${(hue + 40) % 360}))` }}
      >
        {c.format === 'Video' ? 'VID' : 'IMG'}
      </div>
    )
  }

  return (
    <img
      src={`/api/creative/thumb?id=${encodeURIComponent(c.adId)}&account=${encodeURIComponent(c.account)}${size === 'sm' ? '&size=sm' : ''}`}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(box, 'bg-muted object-cover')}
    />
  )
}

/* The search box, one definition for every list in the center.

   Every page here is a list of ads, briefs or tasks, and on all of them the
   same question gets asked: where is this one. Each page had to answer it
   its own way or not at all, so the same search was a text box on one page,
   a filter row on another, and scrolling on the rest.

   What it searches is the page's business — it takes `onChange` and nothing
   else — but it looks and reads the same everywhere, and it always filters
   what is SHOWN rather than what is counted. The totals above a list are
   the day's work; a search is someone looking for a row.

   `matchesQuery` beside it is the matching rule, so "LHP" finds the same
   rows on every page and nobody re-implements case folding. */
export function SearchBox({
  value, onChange, placeholder = 'Search', label, className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** What is being searched, for screen readers — "Search the kill list". */
  label: string
  className?: string
}) {
  return (
    <div className={cn('relative w-full max-w-xs', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pl-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          title="Clear search"
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

/* Does this row match what was typed?

   Fields are whatever the page thinks identifies a row — a name, a batch, a
   firm, an id. Anything undefined is skipped rather than matched, so a row
   missing a field is not found by searching for nothing. An empty query
   matches everything, which is what makes the caller read as a plain filter. */
export function matchesQuery(query: string, fields: (string | null | undefined)[]) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((f) => (f ?? '').toLowerCase().includes(q))
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'blue' | 'red' | 'green' | 'amber' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'blue' && 'bg-accent text-accent-foreground',
        tone === 'red' && 'bg-destructive/10 text-destructive',
        tone === 'green' && 'bg-success/15 text-success',
        tone === 'amber' && 'bg-warning/20 text-foreground',
      )}
    >
      {children}
    </span>
  )
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
