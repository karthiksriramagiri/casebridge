'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCall } from '../_context/call'

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const PhoneOffIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
  </svg>
)
const MicOffIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path fillRule="evenodd" d="M13 6a3 3 0 00-5.91-.63L4.46 2.74A1 1 0 002.99 4.2l13 13a1 1 0 101.42-1.42l-1.84-1.83A6.965 6.965 0 0017 8a1 1 0 10-2 0c0 1.3-.46 2.49-1.21 3.42L12.41 10A3 3 0 0013 8V6z" clipRule="evenodd" />
  </svg>
)
const MicIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
  </svg>
)
const ArrowLeftIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
  </svg>
)

export function FloatingCallBar() {
  const pathname = usePathname()
  const { callState, currentLead, callDuration, hangUp, muted, toggleMute } = useCall()

  // Only show when on a call and not already on the agent page
  if (callState === 'idle' || pathname === '/dialer/agent') return null

  const bg =
    callState === 'ringing' ? 'bg-amber-600' :
    callState === 'wrapup'  ? 'bg-violet-700' :
                              'bg-cyan-700'

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 text-white shadow-xl ${bg}`}
      style={{ height: '44px' }}>
      {/* Left: status + lead */}
      <div className="flex items-center gap-3">
        <span className={`h-2 w-2 rounded-full ${
          callState === 'connected' ? 'bg-green-300 animate-pulse' :
          callState === 'ringing'   ? 'bg-amber-300 animate-pulse' :
                                      'bg-violet-300'
        }`} />
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{currentLead?.name ?? 'Unknown'}</span>
          {currentLead?.phone && (
            <span className="font-mono text-xs opacity-70">{currentLead.phone}</span>
          )}
        </div>
        <span className="text-xs opacity-60">·</span>
        <span className="text-xs font-medium opacity-80">
          {callState === 'ringing' ? 'Ringing…' :
           callState === 'wrapup'  ? 'Wrap-up needed' :
           fmtDuration(callDuration)}
        </span>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        {callState === 'connected' && (
          <button
            onClick={toggleMute}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              muted ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            {muted ? <MicOffIcon /> : <MicIcon />}
            {muted ? 'Unmute' : 'Mute'}
          </button>
        )}

        <Link
          href="/dialer/agent"
          className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/20"
        >
          <ArrowLeftIcon />
          Return to call
        </Link>

        {callState !== 'wrapup' && (
          <button
            onClick={hangUp}
            className="flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-red-400"
          >
            <PhoneOffIcon />
            Hang up
          </button>
        )}
      </div>
    </div>
  )
}
