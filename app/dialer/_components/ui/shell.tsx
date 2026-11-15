'use client'

import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/app/_ui/input'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   The dialer's page vocabulary.

   Every page here was built on its own: one wrote its heading as an h1 in a
   padded div, the next as an h2 inside a card, a third had none. Same for
   the figure strips, the empty states and the status chips — five spellings
   of the same four things, which is why the center never looked like one
   product even though it always was one.

   These are those four things, said once. They are deliberately the same
   shapes the Creative Center uses, because a rep moving between the two
   should not have to learn a second set of conventions.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The band at the top of a page: what this is, and what can be done to it. */
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

/** One figure, and what qualifies it. */
export function StatCard({
  label, value, hint, tone, onClick,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'good' | 'bad' | 'warn'
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
  const className = 'flex flex-col gap-0.5 rounded-lg border bg-card px-4 py-3 text-left'
  if (!onClick) return <div className={className}>{body}</div>
  return (
    <button type="button" onClick={onClick} className={cn(className, 'transition-colors hover:border-primary/40 hover:bg-muted/50')}>
      {body}
    </button>
  )
}

/** A card: the one surface every list, table and form sits on. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('overflow-hidden rounded-lg border bg-card', className)}>{children}</section>
}

export function CardHeader({ title, note, actions }: { title: ReactNode; note?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
      <span className="text-sm font-semibold">{title}</span>
      <div className="flex items-center gap-2">
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
        {actions}
      </div>
    </div>
  )
}

/* A status chip. The tones are the dialer's own vocabulary — a rep is
   available, on a call, wrapping up or away — mapped onto the palette so
   the same state is the same colour on every page it appears. */
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

/** Nothing here — said in a way that distinguishes "none" from "broken". */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}

export function SearchBox({
  value, onChange, placeholder = 'Search', label, className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** What is being searched, for screen readers. */
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
        className="bg-card pl-8"
      />
    </div>
  )
}

/** Does any of these fields contain what was typed. */
export function matchesQuery(query: string, fields: (string | null | undefined)[]) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((f) => (f ?? '').toLowerCase().includes(q))
}

/* The page body: one padded column under the header, so every page has the
   same gutter and the same rhythm between its sections. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-4 p-6', className)}>{children}</div>
}

/** A table that scrolls sideways inside its card rather than the page. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="w-full border-collapse text-sm">{children}</table>
}

export function Th({ children, className, align }: { children?: ReactNode; className?: string; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b bg-muted/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({ children, className, align }: { children?: ReactNode; className?: string; align?: 'right' }) {
  return (
    <td className={cn('border-b px-3 py-2', align === 'right' && 'text-right tabular-nums', className)}>{children}</td>
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
