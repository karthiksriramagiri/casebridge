'use client'

import { useState, useEffect } from 'react'
import { useCall } from '../../_context/call'
import { useAuth } from '../../_context/auth'
import { useInboundRingtone } from '../../_lib/ringtone'
import { createClient } from '../../_lib/supabase'
import { Phone, X } from 'lucide-react'
import {
  Card, CardHeader, EmptyState, PageBody, PageHeader, Pill, Table, TableWrap, Td, Th,
} from '../../_components/ui/shell'
import type { Lead } from '../../_types'
import { FIRM_LABEL } from '@/app/dialer/_lib/firms'

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



function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' })
}

function elapsed(created: string): string {
  const secs = Math.floor((Date.now() - new Date(created).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

/* What happened to the call, in the palette's own tones. Rejected was the
   one borrowed colour on this page — orange, from nowhere — and is amber
   now like every other "needs a look" state in the product. */
const STATUS_TONE: Record<string, 'green' | 'blue' | 'red' | 'amber' | 'muted'> = {
  ringing: 'green', answered: 'blue', missed: 'red', rejected: 'amber', completed: 'muted',
}

function StatusBadge({ status }: { status: string }) {
  return <Pill tone={STATUS_TONE[status] ?? 'muted'}>{status}</Pill>
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
    <>
      <PageHeader
        title="Inbound Calls"
        description={loading ? 'Loading…' : `${ringing.length} ringing · ${history.length} today`}
        actions={
          ringing.length > 0 ? (
            <Pill tone="green">
              <span className="dl-live-dot size-1.5 rounded-full bg-success" aria-hidden />
              {ringing.length} incoming
            </Pill>
          ) : (
            <Pill tone={deviceReady ? 'muted' : 'amber'}>
              {deviceReady ? 'Device ready' : 'Device not registered'}
            </Pill>
          )
        }
      />

      <PageBody>
        {/* Ringing now — the only thing on this page that is urgent, so it
            is the only thing above the fold and the only thing that moves. */}
        {ringing.length > 0 && (
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ringing now ({ringing.length})
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ringing.map((call) => (
                <Card key={call.id} className="border-success/50">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <Pill tone="green">
                        <span className="dl-live-dot size-1.5 rounded-full bg-success" aria-hidden />
                        Incoming
                      </Pill>
                      <p className="mt-2 truncate text-lg font-semibold">
                        {call.contact_name || call.caller_phone}
                      </p>
                      <p className="font-mono text-sm text-muted-foreground">{call.caller_phone}</p>
                      <dl className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        {call.firm && <div>{FIRM_LABEL[call.firm] ?? call.firm}</div>}
                        {call.dialed_number && (
                          <div>Dialled <span className="font-mono">{call.dialed_number}</span></div>
                        )}
                        <div>Ringing for <LiveTimer created={call.created_at} /></div>
                      </dl>
                    </div>

                    {/* Answer is the large one. A missed call costs a case;
                        a rejected one costs a second of someone's time. */}
                    <div className="flex shrink-0 flex-col items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Answer ${call.contact_name || call.caller_phone}`}
                        disabled={callState !== 'idle' || !deviceReady || answering === call.call_sid}
                        onClick={() => handleAnswer(call)}
                        className="flex size-12 items-center justify-center rounded-full bg-success text-white shadow-sm transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                      >
                        <Phone className="size-5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Reject ${call.contact_name || call.caller_phone}`}
                        disabled={rejecting === call.call_sid}
                        onClick={() => handleReject(call)}
                        className="flex size-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {ringing.length === 0 && !loading && (
          <EmptyState title="Nothing ringing">
            Incoming calls appear here the moment someone dials in.
          </EmptyState>
        )}

        <Card>
          <CardHeader
            title="Today's inbound"
            note={history.length > 0 ? `${history.length} call${history.length === 1 ? '' : 's'}` : undefined}
          />
          {history.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No inbound calls today.</p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Time</Th><Th>Caller</Th><Th>Phone</Th><Th>Firm</Th>
                    <Th>Status</Th><Th>Answered by</Th><Th align="right">Waited</Th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((call) => {
                    /* How long the caller held: to the answer if someone
                       picked up, to the end if nobody did. */
                    const waited = call.answered_at
                      ? Math.floor((new Date(call.answered_at).getTime() - new Date(call.created_at).getTime()) / 1000)
                      : call.ended_at
                        ? Math.floor((new Date(call.ended_at).getTime() - new Date(call.created_at).getTime()) / 1000)
                        : null
                    return (
                      <tr key={call.id} className="hover:bg-muted/40">
                        <Td className="tabular-nums text-muted-foreground">{fmtTime(call.created_at)}</Td>
                        <Td className="max-w-[180px] truncate font-medium">
                          {call.contact_name || call.caller_phone}
                        </Td>
                        <Td className="font-mono text-xs text-muted-foreground">{call.caller_phone}</Td>
                        <Td className="text-muted-foreground">
                          {call.firm ? (FIRM_LABEL[call.firm] ?? call.firm) : '—'}
                        </Td>
                        <Td><StatusBadge status={call.status} /></Td>
                        <Td className="capitalize text-muted-foreground">{call.answered_by || '—'}</Td>
                        <Td align="right" className="text-muted-foreground">
                          {waited !== null ? `${waited}s` : '—'}
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </PageBody>
    </>
  )
}
