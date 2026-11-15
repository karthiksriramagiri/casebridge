'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { Input } from '@/app/teams/_ui/input'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   The Team Center's building blocks.

   Every page here was previously drawing its own version of the same four
   things — a title, a row of figures, a status chip, an empty list — in raw
   Tailwind greys, which is why no two pages agreed on a heading size or a
   border colour. These are those four things, once.

   Deliberately generic. The Creative Center's equivalents carry its own
   subject matter (ad thumbnails, firm pickers, lifetime ranges) and none of
   that belongs here: the Team Center tracks people, shifts and training, not
   creatives. What is shared is the shape and the palette, not the features.
   ═══════════════════════════════════════════════════════════════════════════ */

/* The band at the top of every page: what this page is, and the controls that
   act on the whole of it. Sits on `bg-card` against the page's `--background`
   so the boundary between chrome and content needs no shadow to read. */
export function PageHeader({
  title, description, actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
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

/* The page body. A plain wrapper, but having one means every page in the
   center has the same gutter and the same rhythm between its sections —
   which is most of what made the old pages look unrelated to each other. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-5 p-6', className)}>{children}</div>
}

/* A titled block within a page. `actions` sits on the same line as the
   heading so a section's controls never drift into the page's. */
export function Section({
  title, description, actions, children, className,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/* A white surface with a border. The default container for anything that is
   not a bare table. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border bg-card', className)}>{children}</div>
}

/* One figure, labelled. `tone` is for a number that is good or bad in itself
   — hours over, a quiz failed — and should be left off anything neutral,
   because a page where every figure is coloured says nothing with colour. */
export function StatCard({
  label, value, hint, tone, onClick,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'good' | 'bad' | 'warn'
  /** Given when the figure stands for a list worth opening. The card becomes
      a button — the totals row is where you look first, so it answers first. */
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
          tone === 'warn' && 'text-warning',
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

/* A row of figures. Three up on a laptop, two on a phone — the figures in
   this center come in threes and fours, not sixes. */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>
  )
}

/* A status, as a chip. The tones are meanings rather than colours so a page
   says `tone="bad"` and cannot decide that red means something else here. */
export function Pill({
  children, tone = 'muted',
}: {
  children: ReactNode
  tone?: 'muted' | 'blue' | 'red' | 'green' | 'amber'
}) {
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

/* A person, as a circle and a name. The Team Center is a list of people more
   often than it is a list of anything else. */
export function Person({
  name, meta, className,
}: {
  name: string | null | undefined
  meta?: ReactNode
  className?: string
}) {
  const label = (name ?? '').trim()
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
        {label ? label.charAt(0) : '·'}
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate font-medium">{label || 'Unnamed'}</p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
    </div>
  )
}

/* The search box, one definition for every list in the center.

   What it searches is the page's business — it takes `onChange` and nothing
   else — but it looks and reads the same everywhere, and it always filters
   what is SHOWN rather than what is counted. The totals above a list are the
   period's record; a search is someone looking for a row.

   `matchesQuery` beside it is the matching rule, so nobody re-implements
   case folding and a name finds the same rows on every page. */
export function SearchBox({
  value, onChange, placeholder = 'Search', label, className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** What is being searched, for screen readers — "Search the rep list". */
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

/* Does this row match what was typed? Fields are whatever the page thinks
   identifies a row — a name, an email, a firm. Anything undefined is skipped
   rather than matched, so a row missing a field is not found by searching for
   nothing. An empty query matches everything, which is what lets the caller
   read as a plain filter. */
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

/* A table in a card, scrolling inside its own box.

   Horizontal overflow is the table's problem, not the page's: a rep list with
   nine columns must not make the whole center scroll sideways on a laptop. */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card', className)}>
      <div className="max-h-[70vh] overflow-auto">
        <table className="tc-table">{children}</table>
      </div>
    </div>
  )
}

/* A row of figures that is loading. Pages in this center fetch on mount and
   most of them used to show nothing at all until the data landed, which reads
   as broken rather than as busy. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-muted', className)} />
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

/* The intake / creative switch.

   Modules, Exams and Programs are each split by programme, and each drew its
   own copy of this switch — three sets of nearly identical markup that had
   already drifted on padding and on which colour marked the creative side.
   One definition, so the switch cannot mean two different things in two
   places, and the creative half keeps its own token (see teams.css).

   Two call styles, because the pages genuinely differ: Modules and Exams hold
   the programme in state, while Programs is a server component that reads it
   off the query string and so must switch by navigating. Pass `onChange` for
   the first and `hrefFor` for the second. */
export function TeamToggle({
  value, onChange, hrefFor,
}: {
  value: string
  onChange?: (team: 'intake' | 'creative') => void
  hrefFor?: (team: 'intake' | 'creative') => string
}) {
  const TEAMS: { key: 'intake' | 'creative'; label: string; active: string }[] = [
    { key: 'intake', label: 'Intake', active: 'text-primary' },
    { key: 'creative', label: 'Creative', active: 'text-team-creative' },
  ]

  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {TEAMS.map(({ key, label, active }) => {
        const className = cn(
          'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
          value === key ? `bg-card ${active}` : 'text-muted-foreground hover:text-foreground',
        )
        return hrefFor ? (
          <Link key={key} href={hrefFor(key)} aria-current={value === key ? 'page' : undefined} className={className}>
            {label}
          </Link>
        ) : (
          <button
            key={key}
            type="button"
            onClick={() => onChange?.(key)}
            aria-pressed={value === key}
            className={className}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
