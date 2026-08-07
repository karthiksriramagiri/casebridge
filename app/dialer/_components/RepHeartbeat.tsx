'use client'

import { useEffect } from 'react'
import { useAuth } from '../_context/auth'

// Sends a heartbeat every 30s so we can track device type + active/idle time per rep
export function RepHeartbeat() {
  const { identity, role } = useAuth()

  useEffect(() => {
    if (!identity || role !== 'REP') return

    function sendHeartbeat() {
      fetch('/api/dialer/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity,
          screenWidth:  window.innerWidth,
          screenHeight: window.innerHeight,
        }),
      }).catch(() => {})
    }

    // Send immediately on mount
    sendHeartbeat()

    const interval = setInterval(sendHeartbeat, 30_000)
    return () => clearInterval(interval)
  }, [identity])

  return null
}
