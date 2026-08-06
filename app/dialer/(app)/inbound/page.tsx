'use client'

import { useState, useEffect } from 'react'
import { useCall } from '../../_context/call'
import { useAuth } from '../../_context/auth'
import { useInboundRingtone } from '../../_lib/ringtone'
import { createClient } from '../../_lib/supabase'
import type { Lead } from '../../_types'

interface InboundCall {
  id: string
  call_sid: string
  conference_name: string
  caller_phone: string
  contact_id: string | null
  contact_name: string | null
  firm: string | null
  status: string
  answered_by: string | null
  created_at: string
  answered_at: string | null
  ended_at: string | null
}

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears' }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

function elapsed(created: string): string {
  const secs = Math.floor((Date.now() - new Date(created).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ringing:   'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
    answered:  'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400',
    missed:    'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400',
    completed: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${styles[status] ?? styles.completed}`}>
      {status}
    </span>
  )
}

// ── Live elapsed timer for ringing calls ──
function LiveTimer({ created }: { created: string }) {
  const [display, setDisplay] = useState(elapsed(created))
  useEffect(() => {
    const t = setInterval(() => setDisplay(elapsed(created)), 1000)
    return () => clearInterval(t)
  }, [created])
  return <span className="tabular-nums">{display}</span>
}

export default function InboundCallsPage() {
  const { deviceReady, answerInbound, callState } = useCall()
  const { identity } = useAuth()

  const [ringing, setRinging]     = useState<InboundCall[]>([])
  const [history, setHistory]     = useState<InboundCall[]>([])
  const [loading, setLoading]     = useState(true)
  const [answering, setAnswering] = useState<string | null>(null)

  // Ringtone (suppressed when rep is on a call) + browser notifications
  useInboundRingtone(ringing, callState)

  async function fetchData() {
    try {
      const res  = await fetch('/api/dialer/inbound-calls')
      const data = await res.json()
      setRinging(data.ringing ?? [])
      setHistory(data.history ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  // Initial load + Realtime subscription
  useEffect(() => {
    fetchData()

    const db = createClient()
    const channel = db.channel('inbound-page')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'dialer_inbound_queue',
      }, () => {
        fetchData()
      })
      .subscribe()

    // Also poll every 5s as fallback
    const poll = setInterval(fetchData, 5000)

    return () => {
      db.removeChannel(channel)
      clearInterval(poll)
    }
  }, [])

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
        fetchData() // refresh — call was grabbed by someone else
        return
      }
      // Build lead and join conference via device.connect()
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
    } catch (err) {
      console.error('[inbound] answer error', err)
    } finally {
      setAnswering(null)
      fetchData()
    }
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Inbound Calls</h1>
            <p className="text-xs text-gray-400">
              {loading ? 'Loading…' : `${ringing.length} ringing · ${history.length} today`}
            </p>
          </div>
          {ringing.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 dark:bg-green-950/40">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
              </span>
              <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                {ringing.length} incoming
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Ringing calls — hero cards */}
        {ringing.length > 0 && (
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Ringing Now ({ringing.length})
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ringing.map(call => (
                <div key={call.id} className="rounded-xl border-2 border-green-400 bg-white p-5 shadow-lg dark:border-green-600 dark:bg-gray-900">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="relative flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
                        </span>
                        <span className="text-xs font-bold uppercase text-green-600 dark:text-green-400">Incoming</span>
                      </div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {call.contact_name || call.caller_phone}
                      </p>
                      <p className="text-sm font-mono text-gray-500">{call.caller_phone}</p>
                      {call.firm && (
                        <p className="mt-1 text-xs text-gray-400">{FIRM_LABEL[call.firm] ?? call.firm}</p>
                      )}
                      <p className="mt-2 text-xs text-gray-400">
                        Ringing for <LiveTimer created={call.created_at} />
                      </p>
                    </div>
                    <button
                      disabled={callState !== 'idle' || !deviceReady || answering === call.call_sid}
                      onClick={() => handleAnswer(call)}
                      className="rounded-full bg-green-600 p-4 text-white shadow-lg transition-all hover:bg-green-500 hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No ringing */}
        {ringing.length === 0 && !loading && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-900">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-gray-400">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No incoming calls right now.</p>
            <p className="mt-1 text-xs text-gray-400">Calls will appear here in real-time when someone dials in.</p>
          </div>
        )}

        {/* Today's history */}
        {history.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Today's Inbound History</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Time', 'Caller', 'Phone', 'Firm', 'Status', 'Answered By', 'Wait Time'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(call => {
                  const waitSecs = call.answered_at
                    ? Math.floor((new Date(call.answered_at).getTime() - new Date(call.created_at).getTime()) / 1000)
                    : call.ended_at
                      ? Math.floor((new Date(call.ended_at).getTime() - new Date(call.created_at).getTime()) / 1000)
                      : null

                  return (
                    <tr key={call.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                      <td className="px-4 py-3 text-gray-500 tabular-nums">{fmtTime(call.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 max-w-[160px] truncate">
                        {call.contact_name || call.caller_phone}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{call.caller_phone}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {call.firm ? (FIRM_LABEL[call.firm] ?? call.firm) : '—'}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={call.status} /></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {call.answered_by
                          ? <span className="capitalize">{call.answered_by}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-500">
                        {waitSecs !== null ? `${waitSecs}s` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
