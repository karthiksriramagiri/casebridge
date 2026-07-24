'use client'

import { type RepStatus } from '../_types'

const STATUS_CONFIG: Record<RepStatus, { label: string; dot: string; text: string; bg: string }> = {
  OFFLINE: { label: 'Offline',  dot: 'bg-gray-400 dark:bg-gray-600',    text: 'text-gray-600 dark:text-gray-400',    bg: 'bg-gray-100 dark:bg-gray-800/60' },
  READY:   { label: 'Ready',    dot: 'bg-green-500 dark:bg-green-400',   text: 'text-green-700 dark:text-green-300',  bg: 'bg-green-50 dark:bg-green-950/60' },
  ON_CALL: { label: 'On Call',  dot: 'bg-cyan-500 dark:bg-cyan-400',     text: 'text-cyan-700 dark:text-cyan-300',    bg: 'bg-cyan-50 dark:bg-cyan-950/60' },
  PAUSED:  { label: 'Paused',   dot: 'bg-amber-500 dark:bg-amber-400',   text: 'text-amber-700 dark:text-amber-300',  bg: 'bg-amber-50 dark:bg-amber-950/60' },
  WRAPUP:  { label: 'Wrap-up',  dot: 'bg-violet-500 dark:bg-violet-400', text: 'text-violet-700 dark:text-violet-300',bg: 'bg-violet-50 dark:bg-violet-950/60' },
}

interface Props {
  status: RepStatus
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
}

export function StatusPill({ status, size = 'md', pulse = false }: Props) {
  const cfg = STATUS_CONFIG[status]
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1.5' : size === 'lg' ? 'text-sm px-3 py-1.5 gap-2' : 'text-xs px-2.5 py-1 gap-1.5'
  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${cfg.bg} ${cfg.text} ${sizeClasses}`}>
      <span className={`${dotSize} rounded-full ${cfg.dot} ${pulse && status === 'ON_CALL' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  )
}

export function StatusDot({ status, size = 'md' }: { status: RepStatus; size?: 'sm' | 'md' | 'lg' }) {
  const cfg = STATUS_CONFIG[status]
  const dotSize = size === 'sm' ? 'h-2 w-2' : size === 'lg' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'
  return <span className={`${dotSize} rounded-full ${cfg.dot} shrink-0`} />
}
