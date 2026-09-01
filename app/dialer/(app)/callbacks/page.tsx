'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../_context/auth'
import { useCall } from '../../_context/call'
import type { Lead } from '../../_types'

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

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears', jm: 'J&M' }
const FIRM_TZ: Record<string, string> = { lhp: 'America/Los_Angeles', fears: 'America/Chicago', jm: 'America/Los_Angeles' }
const FIRM_TZ_LABEL: Record<string, string> = { lhp: 'PT', fears: 'CT', jm: 'PT' }

const SOURCE_LABEL: Record<string, string> = { ghl: 'GHL', disposition: 'Dialer', manual: 'Manual' }
const SOURCE_PILL: Record<string, string> = {
  ghl:         'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  disposition: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400',
  manual:      'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Callbacks</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pending.length} upcoming · {completed.length} completed</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
        >
          + Add Callback
        </button>
      </div>

      {/* Add Callback Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Schedule Callback</h3>

          {/* Contact search */}
          {!selectedContact ? (
            <div className="relative">
              <label className="block text-xs font-medium text-gray-500 mb-1">Search Lead</label>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type name or phone number…"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                autoFocus
              />
              {searching && (
                <p className="mt-1 text-xs text-gray-400">Searching…</p>
              )}
              {results.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 max-h-48 overflow-y-auto">
                  {results.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedContact(c); setSearch(''); setResults([]); setCbTime(nowPlusTwoInTz(FIRM_TZ[c.firm ?? 'lhp'] ?? 'America/Los_Angeles')) }}
                      className="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.phone}</p>
                      </div>
                      {c.firm && (
                        <span className="text-[10px] font-semibold text-gray-400 uppercase">
                          {FIRM_LABEL[c.firm] ?? c.firm}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {search.length >= 2 && !searching && results.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">No leads found</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2.5 dark:border-cyan-800 dark:bg-cyan-950/30">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedContact.name}</p>
                <p className="text-xs text-gray-500">{selectedContact.phone} {selectedContact.firm && `· ${FIRM_LABEL[selectedContact.firm] ?? selectedContact.firm}`}</p>
              </div>
              <button
                onClick={() => setSelectedContact(null)}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Change
              </button>
            </div>
          )}

          {/* Time + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Callback Time ({FIRM_TZ_LABEL[selectedContact?.firm ?? 'lhp'] ?? 'PT'})
              </label>
              <input
                type="datetime-local"
                value={cbTime}
                onChange={e => setCbTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={cbNotes}
                onChange={e => setCbNotes(e.target.value)}
                placeholder="e.g. Call back after 2pm…"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowForm(false); setSelectedContact(null); setSearch('') }}
              className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={submitCallback}
              disabled={!selectedContact || !cbTime || submitting}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {submitting ? 'Scheduling…' : 'Schedule Callback'}
            </button>
          </div>
        </div>
      )}

      {/* Upcoming Callbacks */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Upcoming</h3>
        </div>
        {loading ? (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-gray-50 dark:bg-gray-800/50" />)}
          </div>
        ) : pending.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No upcoming callbacks</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-gray-800">
                {['Lead', 'Phone', 'Firm', 'Scheduled', 'Source', 'Notes', 'Assigned To', ''].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {pending.map(cb => {
                const isPast = new Date(cb.callback_at).getTime() < now
                return (
                  <tr key={cb.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{cb.contact_name}</td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">{cb.phone}</td>
                    <td className="px-5 py-3">
                      <span className="text-[10px] font-semibold uppercase text-gray-400">{cb.firm ? (FIRM_LABEL[cb.firm] ?? cb.firm) : '—'}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div>
                        <span className={`text-xs font-medium ${isPast ? 'text-red-500' : 'text-cyan-600 dark:text-cyan-400'}`}>
                          {fmtRelative(cb.callback_at)}
                        </span>
                        <p className="text-[10px] text-gray-400">{fmtTime(cb.callback_at, cb.firm)} {cb.firm ? (FIRM_TZ_LABEL[cb.firm] ?? 'ET') : 'ET'}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${SOURCE_PILL[cb.source] ?? SOURCE_PILL.manual}`}>
                        {SOURCE_LABEL[cb.source] ?? cb.source}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                      {cb.callback_context ? stripHtml(cb.callback_context) : '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{cb.owner_rep || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCall(cb)}
                          disabled={!deviceReady || callState !== 'idle'}
                          className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                          </svg>
                          Call
                        </button>
                        <button
                          onClick={() => cancelCallback(cb.id)}
                          className="rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-400 hover:border-red-300 hover:text-red-500 dark:border-gray-700 dark:hover:border-red-800 dark:hover:text-red-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Completed Callbacks */}
      {completed.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Completed</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-gray-800">
                {['Lead', 'Phone', 'Firm', 'Scheduled', 'Source', 'Completed', 'Result', 'Rep'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {completed.map(cb => (
                <tr key={cb.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 opacity-60">
                  <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{cb.contact_name}</td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{cb.phone}</td>
                  <td className="px-5 py-3">
                    <span className="text-[10px] font-semibold uppercase text-gray-400">{cb.firm ? (FIRM_LABEL[cb.firm] ?? cb.firm) : '—'}</span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{fmtTime(cb.callback_at, cb.firm)} {cb.firm ? (FIRM_TZ_LABEL[cb.firm] ?? 'ET') : 'ET'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${SOURCE_PILL[cb.source] ?? SOURCE_PILL.manual}`}>
                      {SOURCE_LABEL[cb.source] ?? cb.source}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{cb.completed_at ? fmtTime(cb.completed_at, cb.firm) : '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      cb.status === 'cancelled' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                    }`}>
                      {cb.status === 'cancelled' ? 'Cancelled' : cb.disposition ?? 'Called'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{cb.completed_by || cb.owner_rep || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
