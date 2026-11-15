'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, Mic, MicOff, PhoneOff } from 'lucide-react'
import { useCall } from '../../_context/call'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   The live call, following you around the center.

   A rep on a call who walks to the Leads page to look something up must not
   lose the call controls, so this rides above every page except the one
   that already has them.

   It keeps its own colours rather than taking the palette's. Every other
   surface in the dialer is one of four greys; this is the only thing on
   screen that is happening *right now* and it has to be findable without
   being read. The three states are three colours for the same reason —
   ringing, connected and wrap-up need telling apart at a glance from across
   a room, which is where the floor manager usually is.
   ═══════════════════════════════════════════════════════════════════════════ */

function duration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function CallBar() {
  const pathname = usePathname()
  const { callState, currentLead, callDuration, hangUp, muted, toggleMute } = useCall()

  if (callState === 'idle' || pathname === '/dialer/agent') return null

  const tone =
    callState === 'ringing' ? 'bg-warning text-foreground'
    : callState === 'wrapup' ? 'bg-accent-foreground text-white'
    : 'bg-success text-white'

  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-50 flex h-11 items-center justify-between gap-3 px-4 shadow-lg',
        tone,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn('size-2 shrink-0 rounded-full bg-current', callState !== 'wrapup' && 'dl-live-dot')} aria-hidden />
        <span className="truncate text-sm font-semibold">{currentLead?.name ?? 'Unknown'}</span>
        {currentLead?.phone && (
          <span className="hidden font-mono text-xs opacity-75 sm:inline">{currentLead.phone}</span>
        )}
        <span className="text-xs font-medium opacity-80">
          {callState === 'ringing' ? 'Ringing…'
            : callState === 'wrapup' ? 'Wrap-up needed'
            : duration(callDuration)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {callState === 'connected' && (
          <button
            type="button"
            onClick={toggleMute}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              muted ? 'bg-black/25' : 'bg-black/10 hover:bg-black/20',
            )}
          >
            {muted ? <MicOff className="size-3.5" aria-hidden /> : <Mic className="size-3.5" aria-hidden />}
            {muted ? 'Unmute' : 'Mute'}
          </button>
        )}
        <Link
          href="/dialer/agent"
          className="flex items-center gap-1.5 rounded-md bg-black/10 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-black/20"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Return to call</span>
          <span className="sm:hidden">Back</span>
        </Link>
        {callState !== 'wrapup' && (
          <button
            type="button"
            onClick={hangUp}
            className="flex items-center gap-1.5 rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            <PhoneOff className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Hang up</span>
          </button>
        )}
      </div>
    </div>
  )
}
