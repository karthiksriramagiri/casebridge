'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

/* Priority, as five stars.

   A number from 1 to 5 would be quicker to build and slower to read — on a
   board you are scanning, filled stars register without being counted. The
   control is a radio group rather than five buttons so the keyboard moves
   through it as one field. */

export const PRIORITY_LABELS: Record<number, string> = {
  5: 'Highest',
  4: 'High',
  3: 'Normal',
  2: 'Low',
  1: 'Lowest',
}

export function PriorityStars({
  value, onChange, size = 'md', id,
}: {
  value: number
  /** Omitted on a card, where the stars are a label rather than a control. */
  onChange?: (v: number) => void
  size?: 'sm' | 'md'
  id?: string
}) {
  const px = size === 'sm' ? 'size-3' : 'size-4'
  const stars = [1, 2, 3, 4, 5]

  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-0.5" title={`${PRIORITY_LABELS[value] ?? 'Normal'} priority`}>
        {stars.map((n) => (
          <Star
            key={n}
            aria-hidden
            className={cn(px, n <= value ? 'fill-warning text-warning' : 'text-muted-foreground/30')}
          />
        ))}
        <span className="sr-only">{PRIORITY_LABELS[value] ?? 'Normal'} priority</span>
      </span>
    )
  }

  return (
    <div id={id} role="radiogroup" aria-label="Priority" className="flex items-center gap-1">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} — ${PRIORITY_LABELS[n]}`}
          title={PRIORITY_LABELS[n]}
          onClick={() => onChange(n)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Star
            aria-hidden
            className={cn('size-5', n <= value ? 'fill-warning text-warning' : 'text-muted-foreground/40')}
          />
        </button>
      ))}
      <span className="pl-1.5 text-xs text-muted-foreground">{PRIORITY_LABELS[value]}</span>
    </div>
  )
}
