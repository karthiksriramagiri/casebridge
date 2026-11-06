'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* A property, the way Notion lays one out: a muted icon and label in a fixed
   left column, the value in the right, and the whole row quiet until you are
   over it.

   The point of the fixed column is scanability — a reader going down the page
   reads a straight edge of labels rather than chasing values that start at a
   different x every line, which is what a wall of chips does. */
export function PropertyRow({
  icon: Icon, label, children, align = 'center',
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
  /** `start` for a value that can wrap to several lines. */
  align?: 'center' | 'start'
}) {
  return (
    <div className={cn('group grid grid-cols-[150px_minmax(0,1fr)] gap-2 rounded-md px-2 py-1 hover:bg-muted/50', align === 'start' ? 'items-start' : 'items-center')}>
      <div className={cn('flex min-w-0 items-center gap-2 text-sm text-muted-foreground', align === 'start' && 'pt-1.5')}>
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  )
}

/* A value that is not set. Shown rather than hidden: an empty property is
   information — it says the brief is incomplete — and a row that disappears
   when empty cannot be clicked to fill it in. */
export function Empty({ children = 'Empty' }: { children?: React.ReactNode }) {
  return <span className="text-sm text-muted-foreground/60">{children}</span>
}
