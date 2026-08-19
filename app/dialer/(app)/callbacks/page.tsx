'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../_context/auth'

interface Callback {
  id: string
  contact_id: string
  contact_name: string
  phone: string
  firm: string
  stage_name: string
  callback_at: string | null
  callback_context: string | null
  owner_rep: string | null
  status: string
  completed_at: string | null
  disposition: string | null
  plan_date: string
  created_at: string
}

interface ContactResult {
  id: string
  name: string
  phone: string
  firm: string | null
}

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears', jm: 'J&M' }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
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
  const [callbacks, setCallbacks] = useState<Callback[]>([])
  const [loading, setLoading] = useState(true)

  // Add callback form
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ContactResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null)
  const [cbTime, setCbTime] = useState(() => {
    const d = new Date(Date.now() + 2 * 3600 * 1000)
    d.setMinutes(0, 0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [cbNotes, setCbNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const searchTimeout = useRef<NodeJS.Timeout>()

  async function fetchCallbacks() {
    const res = await fetch('/api/dialer/callbacks')
    const data = await res.json()
    setCallbacks(data.callbacks ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchCallbacks() }, [])

  // Debounced contact search
  useEffect(() => {
    if (!search.trim() || search.length < 2) { setResults([]); return }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const res = await fetch(`/api/dialer/contacts/search?q=${encodeURIComponent(search.trim())}`)
      const data = await res.json()
      setResults(data.contacts ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(searchTimeout.current)
  }, [search])

  async function submitCallback() {
    if (!selectedContact || !cbTime) return
    setSubmitting(true)
    await fetch('/api/dialer/callbacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: selectedContact.id,
        callback_at: new Date(cbTime).toISOString(),
        callback_context: cbNotes || null,
        rep_identity: identity || null,
      }),
    })
    setShowForm(false)
    setSelectedContact(null)
    setSearch('')
    setCbNotes('')
    setCbTime(() => {
      const d = new Date(Date.now() + 2 * 3600 * 1000)
      d.setMinutes(0, 0, 0)
      return d.toISOString().slice(0, 16)
    })
    setSubmitting(false)
    fetchCallbacks()
  }

  const now = Date.now()
  const pending = callbacks.filter(c => c.status === 'pending' || c.status === 'buffered' || c.status === 'leased')
  const completed = callbacks.filter(c => c.status === 'completed' || c.status === 'cancelled')

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Callbacks</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pending.length} upcoming · {completed.length} completed today</p>
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
                      onClick={() => { setSelectedContact(c); setSearch(''); setResults([]) }}
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Callback Time (your local time)</label>
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
                {['Lead', 'Phone', 'Firm', 'Stage', 'Scheduled', 'Notes', 'Assigned To', 'Status'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {pending.map(cb => {
                const isPast = cb.callback_at && new Date(cb.callback_at).getTime() < now
                return (
                  <tr key={cb.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{cb.contact_name}</td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">{cb.phone}</td>
                    <td className="px-5 py-3">
                      <span className="text-[10px] font-semibold uppercase text-gray-400">{FIRM_LABEL[cb.firm] ?? cb.firm}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{cb.stage_name}</td>
                    <td className="px-5 py-3">
                      {cb.callback_at && (
                        <div>
                          <span className={`text-xs font-medium ${isPast ? 'text-red-500' : 'text-cyan-600 dark:text-cyan-400'}`}>
                            {fmtRelative(cb.callback_at)}
                          </span>
                          <p className="text-[10px] text-gray-400">{fmtTime(cb.callback_at)} ET</p>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                      {cb.callback_context || '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{cb.owner_rep || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        cb.status === 'leased' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                        : cb.status === 'buffered' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                        : isPast ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                        : 'bg-gray-100 text-gray-500'
                      }`}>
                        {cb.status === 'leased' ? 'On Call' : cb.status === 'buffered' ? 'Buffered' : isPast ? 'Overdue' : 'Scheduled'}
                      </span>
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Completed Today</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-gray-800">
                {['Lead', 'Phone', 'Firm', 'Scheduled', 'Completed', 'Disposition', 'Rep'].map(h => (
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
                    <span className="text-[10px] font-semibold uppercase text-gray-400">{FIRM_LABEL[cb.firm] ?? cb.firm}</span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{cb.callback_at ? fmtTime(cb.callback_at) : '—'}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{cb.completed_at ? fmtTime(cb.completed_at) : '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      cb.disposition === 'Qualified' ? 'bg-green-100 text-green-700'
                      : cb.disposition === 'Signed' ? 'bg-emerald-100 text-emerald-700'
                      : cb.status === 'cancelled' ? 'bg-gray-100 text-gray-500'
                      : 'bg-gray-100 text-gray-600'
                    }`}>
                      {cb.status === 'cancelled' ? 'Cancelled' : cb.disposition ?? '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{cb.owner_rep || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
