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
  dialed_number: string | null
  contact_id: string | null
  contact_name: string | null
  firm: string | null
  status: string
  answered_by: string | null
  created_at: string
  answered_at: string | null
  ended_at: string | null
}

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears', jm: 'J&M' }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' })
}

function elapsed(created: string): string {
  const secs = Math.floor((Date.now() - new Date(created).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ringing:   'bg-success/15 text-success',
    answered:  'bg-accent text-primary',
    missed:    'bg-destructive/10 text-destructive',
    rejected:  'bg-orange-100 text-orange-600',
    completed: 'bg-muted text-muted-foreground',
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
  const [rejecting, setRejecting] = useState<string | null>(null)

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

  async function handleReject(call: InboundCall) {
    setRejecting(call.call_sid)
    try {
      await fetch('/api/dialer/call/reject-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSid: call.call_sid, callerPhone: call.caller_phone }),
      })
    } catch (err) {
      console.error('[inbound] reject error', err)
    } finally {
      setRejecting(null)
      fetchData()
    }
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-muted">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Inbound Calls</h1>
            <p className="text-xs text-muted-foreground">
              {loading ? 'Loading…' : `${ringing.length} ringing · ${history.length} today`}
            </p>
          </div>
          {ringing.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-success/15 px-3 py-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
              </span>
              <span className="text-xs font-semibold text-success">
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
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ringing Now ({ringing.length})
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ringing.map(call => (
                <div key={call.id} className="rounded-xl border-2 border-success/40 bg-card p-5 shadow-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="relative flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
                        </span>
                        <span className="text-xs font-bold uppercase text-success">Incoming</span>
                      </div>
                      <p className="text-lg font-bold text-foreground">
                        {call.contact_name || call.caller_phone}
                      </p>
                      <p className="text-sm font-mono text-muted-foreground">{call.caller_phone}</p>
                      {call.firm && (
                        <p className="mt-1 text-xs text-muted-foreground">{FIRM_LABEL[call.firm] ?? call.firm}</p>
                      )}
                      {call.dialed_number && (
                        <p className="mt-1 text-xs text-muted-foreground">Calling: <span className="font-mono">{call.dialed_number}</span></p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Ringing for <LiveTimer created={call.created_at} />
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        disabled={callState !== 'idle' || !deviceReady || answering === call.call_sid}
                        onClick={() => handleAnswer(call)}
                        className="rounded-full bg-success p-4 text-white shadow-lg transition-all hover:bg-success hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                      </button>
                      <button
                        disabled={rejecting === call.call_sid}
                        onClick={() => handleReject(call)}
                        className="rounded-full bg-destructive p-3 text-white shadow-lg transition-all hover:bg-destructive hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No ringing */}
        {ringing.length === 0 && !loading && (
          <div className="rounded-xl border border-dashed border-input bg-card px-6 py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-muted-foreground">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground">No incoming calls right now.</p>
            <p className="mt-1 text-xs text-muted-foreground">Calls will appear here in real-time when someone dials in.</p>
          </div>
        )}

        {/* Today's history */}
        {history.length > 0 && (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border px-5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Today's Inbound History</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Time', 'Caller', 'Phone', 'Firm', 'Status', 'Answered By', 'Wait Time'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
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
                    <tr key={call.id} className="border-b border-border hover:bg-muted/50/50">
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{fmtTime(call.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[160px] truncate">
                        {call.contact_name || call.caller_phone}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{call.caller_phone}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {call.firm ? (FIRM_LABEL[call.firm] ?? call.firm) : '—'}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={call.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {call.answered_by
                          ? <span className="capitalize">{call.answered_by}</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
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
