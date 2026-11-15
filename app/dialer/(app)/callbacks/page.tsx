'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../_context/auth'
import { useCall } from '../../_context/call'
import type { Lead } from '../../_types'
import { Phone, Plus } from 'lucide-react'
import { Button } from '@/app/_ui/button'
import {
  Card, CardHeader, PageBody, PageHeader, Pill, Table, TableWrap, Td, Th,
} from '../../_components/ui/shell'

interface Callback {
  id: string
  contact_id: string
  contact_name: string
  phone: string
  firm: string | null
  stage_name: string | null
  callback_at: string
  callback_context: string | null
  source: string
  owner_rep: string | null
  status: string
  completed_at: string | null
  completed_by: string | null
  disposition: string | null
  created_at: string
}

interface ContactResult {
  id: string
  name: string
  phone: string
  firm: string | null
}

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', lhp_s: 'LHP (ES)', fears: 'Fears', jm: 'J&M' }
const FIRM_TZ: Record<string, string> = { lhp: 'America/Los_Angeles', lhp_s: 'America/Los_Angeles', fears: 'America/Chicago', jm: 'America/Los_Angeles' }
const FIRM_TZ_LABEL: Record<string, string> = { lhp: 'PT', lhp_s: 'PT', fears: 'CT', jm: 'PT' }

const SOURCE_LABEL: Record<string, string> = { ghl: 'GHL', disposition: 'Dialer', manual: 'Manual' }
/* Where the callback came from. GHL used an orange borrowed from
   nowhere; it is amber now, the palette's own. */
const SOURCE_TONE: Record<string, 'amber' | 'blue' | 'muted'> = {
  ghl: 'amber', disposition: 'blue', manual: 'muted',
}

function wallClockToUTC(localStr: string, tz: string): string {
  const probe = new Date(localStr + ':00Z')
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(probe)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0'
  const probeLocal = new Date(Date.UTC(+get('year'), +get('month') - 1, +get('day'), +(get('hour') === '24' ? '0' : get('hour')), +get('minute'), +get('second')))
  const offsetMs = probe.getTime() - probeLocal.getTime()
  return new Date(probe.getTime() + offsetMs).toISOString()
}

function nowPlusTwoInTz(tz: string): string {
  const future = new Date(Date.now() + 2 * 3600 * 1000)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const s = fmt.format(future).replace(', ', 'T').replace(/\s/g, '')
  return s.slice(0, 16)
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim()
}

function fmtTime(iso: string, firm?: string | null) {
  const tz = firm ? (FIRM_TZ[firm] ?? 'America/New_York') : 'America/New_York'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz,
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtRelative(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  const mins = Math.round(diff / 60000)
  if (mins < -60) return fmtTime(iso)
  if (mins < 0) return `${Math.abs(mins)}m ago`
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.round(mins / 60)
  return `in ${hrs}h`
}

export default function CallbacksPage() {
  const { identity } = useAuth()
  const { deviceReady, placeCall, callState } = useCall()
  const [callbacks, setCallbacks] = useState<Callback[]>([])
  const [loading, setLoading] = useState(true)

  // Add callback form
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ContactResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null)
  const [cbTime, setCbTime] = useState(() => nowPlusTwoInTz('America/Los_Angeles'))
  const [cbNotes, setCbNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const searchTimeout = useRef<NodeJS.Timeout>(null)

  async function fetchCallbacks() {
    const res = await fetch('/api/dialer/callbacks')
    const data = await res.json()
    setCallbacks(data.callbacks ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchCallbacks() }, [])

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(fetchCallbacks, 30_000)
    return () => clearInterval(t)
  }, [])

  // Debounced contact search
  useEffect(() => {
    if (!search.trim() || search.length < 2) { setResults([]); return }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const res = await fetch(`/api/dialer/contacts/search?q=${encodeURIComponent(search.trim())}`)
      const data = await res.json()
      setResults(data.contacts ?? [])
      setSearching(false)
    }, 300)
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [search])

  async function submitCallback() {
    if (!selectedContact || !cbTime) return
    setSubmitting(true)
    const firmTz = FIRM_TZ[selectedContact.firm ?? 'lhp'] ?? 'America/Los_Angeles'
    const utcIso = wallClockToUTC(cbTime, firmTz)
    await fetch('/api/dialer/callbacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: selectedContact.id,
        callback_at: utcIso,
        callback_context: cbNotes || null,
        rep_identity: identity || null,
      }),
    })
    setShowForm(false)
    setSelectedContact(null)
    setSearch('')
    setCbNotes('')
    setCbTime(nowPlusTwoInTz('America/Los_Angeles'))
    setSubmitting(false)
    fetchCallbacks()
  }

  function handleCall(cb: Callback) {
    if (!deviceReady || callState !== 'idle' || !cb.phone) return
    const lead: Lead = {
      id:           cb.id,
      name:         cb.contact_name,
      phone:        cb.phone,
      email:        '',
      company:      '',
      source:       cb.firm ?? '',
      tags:         [],
      lastActivity: new Date().toISOString(),
      contactId:    cb.contact_id,
    }
    placeCall(lead, {
      firm:     cb.firm ?? undefined,
      campaign: cb.stage_name ?? 'Callback',
    })
    // Mark as completed
    fetch('/api/dialer/callbacks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: cb.id,
        status: 'completed',
        completed_by: identity,
        disposition: 'Called',
      }),
    }).then(() => fetchCallbacks()).catch(console.error)
  }

  async function cancelCallback(id: string) {
    await fetch('/api/dialer/callbacks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'cancelled', completed_by: identity }),
    })
    fetchCallbacks()
  }

  const now = Date.now()
  const pending = callbacks.filter(c => c.status === 'pending')
  const completed = callbacks.filter(c => c.status === 'completed' || c.status === 'cancelled')

  return (
    <>
      <PageHeader
        title="Callbacks"
        description={`${pending.length} upcoming · ${completed.length} completed`}
        actions={
          <Button onClick={() => setShowForm(!showForm)} variant={showForm ? 'outline' : 'default'}>
            {showForm ? 'Cancel' : <><Plus aria-hidden /> Add callback</>}
          </Button>
        }
      />
      <PageBody>

      {/* Add Callback Form */}
      {showForm && (
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold">Schedule a callback</h2>

          {/* Contact search */}
          {!selectedContact ? (
            <div className="relative">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Search Lead</label>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type name or phone number…"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                autoFocus
              />
              {searching && (
                <p className="mt-1 text-xs text-muted-foreground">Searching…</p>
              )}
              {results.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                  {results.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedContact(c); setSearch(''); setResults([]); setCbTime(nowPlusTwoInTz(FIRM_TZ[c.firm ?? 'lhp'] ?? 'America/Los_Angeles')) }}
                      className="w-full px-4 py-2.5 text-left hover:bg-muted/50 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                      {c.firm && (
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                          {FIRM_LABEL[c.firm] ?? c.firm}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {search.length >= 2 && !searching && results.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">No leads found</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-primary bg-accent px-4 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">{selectedContact.name}</p>
                <p className="text-xs text-muted-foreground">{selectedContact.phone} {selectedContact.firm && `· ${FIRM_LABEL[selectedContact.firm] ?? selectedContact.firm}`}</p>
              </div>
              <button
                onClick={() => setSelectedContact(null)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Change
              </button>
            </div>
          )}

          {/* Time + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Callback Time ({FIRM_TZ_LABEL[selectedContact?.firm ?? 'lhp'] ?? 'PT'})
              </label>
              <input
                type="datetime-local"
                value={cbTime}
                onChange={e => setCbTime(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (optional)</label>
              <input
                type="text"
                value={cbNotes}
                onChange={e => setCbNotes(e.target.value)}
                placeholder="e.g. Call back after 2pm…"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowForm(false); setSelectedContact(null); setSearch('') }}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={submitCallback}
              disabled={!selectedContact || !cbTime || submitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50"
            >
              {submitting ? 'Scheduling…' : 'Schedule Callback'}
            </button>
          </div>
        </Card>
      )}

      {/* Upcoming — what is still owed. A callback past its time is the one
          thing on this page that needs acting on, so it reads red. */}
      <Card>
        <CardHeader title="Upcoming" note={pending.length > 0 ? `${pending.length} owed` : undefined} />
        {loading ? (
          <div className="divide-y">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse bg-muted/50" />)}
          </div>
        ) : pending.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <TableWrap>
          <Table>
            <thead>
              <tr>
                {['Lead', 'Phone', 'Firm', 'Scheduled', 'Source', 'Notes', 'Assigned to', ''].map((h) => (
                  <Th key={h}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pending.map(cb => {
                const isPast = new Date(cb.callback_at).getTime() < now
                return (
                  <tr key={cb.id} className="hover:bg-muted/40">
                    <Td className="font-medium">{cb.contact_name}</Td>
                    <Td className="font-mono text-xs text-muted-foreground">{cb.phone}</Td>
                    <Td className="text-xs uppercase text-muted-foreground">{cb.firm ? (FIRM_LABEL[cb.firm] ?? cb.firm) : '—'}</Td>
                    <Td>
                      <div>
                        <span className={`text-xs font-medium ${isPast ? 'text-destructive' : 'text-primary'}`}>
                          {fmtRelative(cb.callback_at)}
                        </span>
                        <p className="text-[11px] text-muted-foreground">{fmtTime(cb.callback_at, cb.firm)} {cb.firm ? (FIRM_TZ_LABEL[cb.firm] ?? 'ET') : 'ET'}</p>
                      </div>
                    </Td>
                    <Td><Pill tone={SOURCE_TONE[cb.source] ?? 'muted'}>{SOURCE_LABEL[cb.source] ?? cb.source}</Pill></Td>
                    <Td className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {cb.callback_context ? stripHtml(cb.callback_context) : '—'}
                    </Td>
                    <Td className="text-xs text-muted-foreground">{cb.owner_rep || '—'}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => handleCall(cb)}
                          disabled={!deviceReady || callState !== 'idle'}
                          title={!deviceReady ? 'Device not ready' : callState !== 'idle' ? 'Already on a call' : `Call ${cb.contact_name}`}
                        >
                          <Phone aria-hidden /> Call
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => cancelCallback(cb.id)}>Cancel</Button>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          </TableWrap>
        )}
      </Card>

      {/* Completed — kept, and dimmed. What was promised and done is the
          answer to "did anyone call them back". */}
      {completed.length > 0 && (
        <Card>
          <CardHeader title="Completed" note={`${completed.length}`} />
          <TableWrap>
          <Table>
            <thead>
              <tr>
                {['Lead', 'Phone', 'Firm', 'Scheduled', 'Source', 'Completed', 'Result', 'Rep'].map((h) => (
                  <Th key={h}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {completed.map((cb) => (
                <tr key={cb.id} className="text-muted-foreground hover:bg-muted/40">
                  <Td className="font-medium text-foreground/70">{cb.contact_name}</Td>
                  <Td className="font-mono text-xs">{cb.phone}</Td>
                  <Td className="text-xs uppercase">{cb.firm ? (FIRM_LABEL[cb.firm] ?? cb.firm) : '—'}</Td>
                  <Td className="text-xs">{fmtTime(cb.callback_at, cb.firm)} {cb.firm ? (FIRM_TZ_LABEL[cb.firm] ?? 'ET') : 'ET'}</Td>
                  <Td><Pill tone={SOURCE_TONE[cb.source] ?? 'muted'}>{SOURCE_LABEL[cb.source] ?? cb.source}</Pill></Td>
                  <Td className="text-xs">{cb.completed_at ? fmtTime(cb.completed_at, cb.firm) : '—'}</Td>
                  <Td>
                    <Pill tone={cb.status === 'cancelled' ? 'muted' : 'green'}>
                      {cb.status === 'cancelled' ? 'Cancelled' : cb.disposition ?? 'Called'}
                    </Pill>
                  </Td>
                  <Td className="text-xs">{cb.completed_by || cb.owner_rep || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          </TableWrap>
        </Card>
      )}
      </PageBody>
    </>
  )
}
