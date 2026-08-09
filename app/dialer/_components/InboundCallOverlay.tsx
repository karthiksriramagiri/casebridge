'use client'

import { useState, useEffect } from 'react'
import { useCall } from '../_context/call'
import { useAuth } from '../_context/auth'
import { useInboundRingtone } from '../_lib/ringtone'
import type { Lead } from '../_types'

interface InboundCall {
  id: string
  call_sid: string
  conference_name: string
  caller_phone: string
  dialed_number: string | null
  contact_id: string | null
  contact_name: string | null
  firm: string | null
  status: string
}

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears' }

export function InboundCallOverlay() {
  const { deviceReady, callState, answerInbound } = useCall()
  const { identity } = useAuth()

  const [inboundCalls, setInboundCalls] = useState<InboundCall[]>([])
  const [answering, setAnswering] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Poll inbound calls API (same source as DialerNav badge — always works)
  useEffect(() => {
    async function fetchRinging() {
      try {
        const res = await fetch('/api/dialer/inbound-calls')
        const data = await res.json()
        setInboundCalls(data.ringing ?? [])
      } catch { /* ignore */ }
    }
    fetchRinging()
    const t = setInterval(fetchRinging, 3000)
    return () => clearInterval(t)
  }, [])

  // Ringtone — only for non-dismissed calls when idle
  const activeCalls = inboundCalls.filter(c => !dismissed.has(c.call_sid))
  useInboundRingtone(activeCalls, callState)

  async function handleAnswer(call: InboundCall) {
    if (callState !== 'idle' || !deviceReady || answering) return
    setAnswering(call.call_sid)
    try {
      const res = await fetch('/api/dialer/call/answer-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSid: call.call_sid, repIdentity: identity }),
      })
      const data = await res.json()
      if (data.error) {
        setInboundCalls(prev => prev.filter(c => c.call_sid !== call.call_sid))
        return
      }
      const lead: Lead = {
        id:           call.call_sid,
        name:         data.contactName || data.callerPhone || 'Inbound call',
        phone:        data.callerPhone,
        email:        '',
        company:      '',
        source:       data.firm || 'inbound',
        tags:         [],
        lastActivity: new Date().toISOString(),
        contactId:    data.contactId || '',
      }
      await answerInbound(data.confName, lead)
      setInboundCalls(prev => prev.filter(c => c.call_sid !== call.call_sid))
    } catch (err) {
      console.error('[inbound-overlay] answer error', err)
    } finally {
      setAnswering(null)
    }
  }

  async function handleReject(call: InboundCall) {
    setRejecting(call.call_sid)
    try {
      await fetch('/api/dialer/call/reject-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSid: call.call_sid, callerPhone: call.caller_phone }),
      })
      setInboundCalls(prev => prev.filter(c => c.call_sid !== call.call_sid))
    } catch (err) {
      console.error('[inbound-overlay] reject error', err)
    } finally {
      setRejecting(null)
    }
  }

  function handleDismiss(callSid: string) {
    setDismissed(prev => new Set(prev).add(callSid))
  }

  // Only show overlay for non-dismissed calls when rep is idle
  const visible = activeCalls.filter(() => callState === 'idle')
  if (visible.length === 0) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex flex-col gap-4 w-full max-w-md px-4">
        {visible.map(call => (
          <div
            key={call.call_sid}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          >
            {/* Pulsing icon + label */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className="relative mb-4">
                <span className="absolute inset-0 animate-ping rounded-full bg-green-400/40" />
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/60">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-green-600 dark:text-green-400">
                    <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 01.97-.27c1.12.36 2.33.56 3.62.56a1 1 0 011 1V20a1 1 0 01-1 1C10.07 21 3 13.93 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.28.2 2.5.56 3.62a1 1 0 01-.27.97l-2.17 2.2z" />
                  </svg>
                </span>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-green-600 dark:text-green-400 mb-1">
                Incoming Call
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {call.contact_name || call.caller_phone}
              </p>
              <p className="text-sm font-mono text-gray-500 mt-0.5">{call.caller_phone}</p>
              {call.firm && (
                <p className="mt-1 text-xs text-gray-400">{FIRM_LABEL[call.firm] ?? call.firm}</p>
              )}
              {call.dialed_number && (
                <p className="mt-1 text-xs text-gray-400">Calling: <span className="font-mono">{call.dialed_number}</span></p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                disabled={rejecting === call.call_sid}
                onClick={() => handleReject(call)}
                className="flex-1 rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50 disabled:opacity-40"
              >
                Reject
              </button>
              <button
                disabled={!deviceReady || answering === call.call_sid}
                onClick={() => handleAnswer(call)}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white shadow-lg transition-all hover:bg-green-500 hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                {answering === call.call_sid ? 'Connecting...' : 'Answer'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
