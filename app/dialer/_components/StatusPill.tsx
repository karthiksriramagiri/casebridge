'use client'

import { type RepStatus } from '../_types'
import { cn } from '@/lib/utils'

/* A rep's state, said the same way everywhere it appears.

   Five states, five places they show up — the floor, the admin floor, the
   queue, the agent page and the users table — and until now each page
   spelled them in its own colours. On the palette now, so "on a call" is
   the same blue on all five.

   ON_CALL is the only one that pulses. It is the only one that is true
   *right now* rather than a standing condition, and a floor manager
   scanning twenty cards needs the live ones to move. */

const STATUS: Record<RepStatus, { label: string; dot: string; chip: string }> = {
  OFFLINE: { label: 'Offline', dot: 'bg-muted-foreground/50', chip: 'bg-muted text-muted-foreground' },
  READY:   { label: 'Ready',   dot: 'bg-success',             chip: 'bg-success/15 text-success' },
  ON_CALL: { label: 'On call', dot: 'bg-primary',             chip: 'bg-accent text-accent-foreground' },
  PAUSED:  { label: 'Paused',  dot: 'bg-warning',             chip: 'bg-warning/20 text-foreground' },
  WRAPUP:  { label: 'Wrap-up', dot: 'bg-foreground/60',       chip: 'bg-secondary text-secondary-foreground' },
}

export function StatusPill({
  status, size = 'md', pulse = false,
}: {
  status: RepStatus
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
}) {
  const cfg = STATUS[status] ?? STATUS.OFFLINE
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full font-medium',
        cfg.chip,
        size === 'sm' ? 'gap-1.5 px-2 py-0.5 text-[11px]'
          : size === 'lg' ? 'gap-2 px-3 py-1.5 text-sm'
          : 'gap-1.5 px-2.5 py-1 text-xs',
      )}
    >
      <span
        className={cn(
          'rounded-full',
          cfg.dot,
          size === 'sm' ? 'size-1.5' : 'size-2',
          pulse && status === 'ON_CALL' && 'dl-live-dot',
        )}
        aria-hidden
      />
      {cfg.label}
    </span>
  )
}

export function StatusDot({ status, size = 'md' }: { status: RepStatus; size?: 'sm' | 'md' | 'lg' }) {
  const cfg = STATUS[status] ?? STATUS.OFFLINE
  return (
    <span
      className={cn('shrink-0 rounded-full', cfg.dot, size === 'sm' ? 'size-2' : size === 'lg' ? 'size-3.5' : 'size-2.5')}
      aria-hidden
    />
  )
}
