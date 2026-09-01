'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../_context/auth'

// ── Types ───────────────────────────────────────────────────────────────────────

interface Template {
  id: number
  name: string
}

interface Contact {
  contactId: string
  name: string
  phone: string
  firm: string
}

interface Passenger {
  name: string
  phone: string
  dob: string
}

interface SubmissionRecord {
  id: string
  submission_id: number | null
  template_name: string | null
  contact_name: string
  phone: string | null
  firm: string | null
  date_of_loss: string | null
  city_of_accident: string | null
  passenger_count: number
  sent_by: string | null
  created_at: string
}

// ── Icons ───────────────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
)

const DocIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
  </svg>
)

const XIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
)

const CheckCircle = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-green-500">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
)

// ── Page ────────────────────────────────────────────────────────────────────────

export default function DocuSealPage() {
  const { name: authName, identity: authIdentity } = useAuth()

  // Templates
  const [templates, setTemplates] = useState<Template[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)

  // Contact search
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Manual entry (when contact not in system)
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('+1')
  const [manualEmail, setManualEmail] = useState('')

  // Required fields
  const [dob, setDob] = useState('')
  const [dol, setDol] = useState('')
  const [city, setCity] = useState('')

  // Passengers
  const [passengers, setPassengers] = useState<Passenger[]>([])

  // Send state
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [history, setHistory] = useState<SubmissionRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  // Load templates + history on mount
  useEffect(() => {
    fetch('/api/dialer/docuseal/templates')
      .then(r => r.json())
      .then(d => {
        setTemplates(d.templates ?? [])
        if (d.templates?.length === 1) setSelectedTemplate(d.templates[0])
      })
      .catch(console.error)
      .finally(() => setTemplatesLoading(false))

    fetch('/api/dialer/docuseal/history')
      .then(r => r.json())
      .then(d => setHistory(d.submissions ?? []))
      .catch(console.error)
      .finally(() => setHistoryLoading(false))
  }, [])

  // Debounced contact search
  function handleSearch(q: string) {
    setSearch(q)
    if (searchRef.current) clearTimeout(searchRef.current)
    if (q.trim().length < 2) { setContacts([]); return }
    setSearching(true)
    searchRef.current = setTimeout(() => {
      fetch(`/api/dialer/docuseal/contacts?q=${encodeURIComponent(q.trim())}`)
        .then(r => r.json())
        .then(d => setContacts(d.contacts ?? []))
        .catch(console.error)
        .finally(() => setSearching(false))
    }, 300)
  }

  function selectContact(c: Contact) {
    setSelectedContact(c)
    setSearch('')
    setContacts([])
    setManualMode(false)
  }

  function clearContact() {
    setSelectedContact(null)
    setManualMode(false)
    setManualName('')
    setManualPhone('+1')
    setManualEmail('')
  }

  function addPassenger() {
    setPassengers(prev => [...prev, { name: '', phone: '+1', dob: '' }])
  }

  function updatePassenger(i: number, field: keyof Passenger, val: string) {
    setPassengers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }

  function removePassenger(i: number) {
    setPassengers(prev => prev.filter((_, idx) => idx !== i))
  }

  const contactName = manualMode ? manualName : selectedContact?.name ?? ''
  const contactPhone = manualMode ? manualPhone : selectedContact?.phone ?? ''
  const contactEmail = manualMode ? manualEmail : ''
  const contactId = manualMode ? '' : selectedContact?.contactId ?? ''

  const canSend =
    selectedTemplate &&
    contactName.trim() &&
    dob &&
    dol &&
    city.trim() &&
    !sending

  async function handleSend() {
    if (!canSend) return
    setSending(true)
    try {
      const body: any = {
        templateId: selectedTemplate!.id,
        templateName: selectedTemplate!.name,
        contactId: contactId || undefined,
        fullName: contactName,
        phone: contactPhone,
        email: contactEmail,
        dateOfAccident: dol,
        dateOfBirth: dob,
        cityOfAccident: city,
        firm: selectedContact?.firm || '',
        skipTag: !contactId,
        sentBy: authIdentity || authName || '',
      }

      // Add passengers if any
      const validPassengers = passengers.filter(p => p.name.trim())
      if (validPassengers.length > 0) {
        body.passengers = validPassengers.map(p => ({
          name: p.name,
          phone: p.phone,
          dob: p.dob,
          dateOfAccident: dol,
          cityOfAccident: city,
        }))
      }

      const res = await fetch('/api/dialer/docuseal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')

      setSent(true)

      // Refresh history from DB
      fetch('/api/dialer/docuseal/history')
        .then(r => r.json())
        .then(d => setHistory(d.submissions ?? []))
        .catch(console.error)

      // Reset form after 3 seconds
      setTimeout(() => {
        setSent(false)
        clearContact()
        setDob('')
        setDol('')
        setCity('')
        setPassengers([])
      }, 3000)
    } catch (e) {
      console.error('[DocuSeal] send error', e)
      alert('Failed to send DocuSeal — check console')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* ── Left: Send Form ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-6 py-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Send DocuSeal</h1>
            <p className="text-xs text-gray-500 mt-0.5">Select a contact and template, fill in the required details, and send.</p>
          </div>

          {/* ── Template picker ── */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Template
            </label>
            {templatesLoading ? (
              <div className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
            ) : templates.length === 0 ? (
              <p className="text-xs text-red-500">No templates found in DocuSeal</p>
            ) : (
              <select
                value={selectedTemplate?.id ?? ''}
                onChange={e => {
                  const t = templates.find(t => t.id === Number(e.target.value))
                  setSelectedTemplate(t ?? null)
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="">Select a template…</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* ── Contact search ── */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Contact
            </label>

            {selectedContact && !manualMode ? (
              <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/50 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/20">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedContact.name}</p>
                  <p className="text-xs font-mono text-gray-500">{selectedContact.phone}</p>
                  {selectedContact.firm && (
                    <span className="mt-1 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {selectedContact.firm}
                    </span>
                  )}
                </div>
                <button onClick={clearContact} className="rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <XIcon />
                </button>
              </div>
            ) : manualMode ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Manual Entry</p>
                  <button onClick={clearContact} className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Full Name *</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Phone</label>
                    <input
                      type="tel"
                      value={manualPhone}
                      onChange={e => setManualPhone(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Email</label>
                    <input
                      type="email"
                      value={manualEmail}
                      onChange={e => setManualEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <svg viewBox="0 0 20 20" fill="currentColor"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => handleSearch(e.target.value)}
                    placeholder="Search by name or phone…"
                    className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  />
                </div>

                {/* Search results dropdown */}
                {(contacts.length > 0 || searching) && search.length >= 2 && (
                  <div className="relative z-10">
                    <div className="absolute left-0 right-0 top-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                      {searching && (
                        <div className="px-4 py-3 text-xs text-gray-400 animate-pulse">Searching…</div>
                      )}
                      {contacts.map(c => (
                        <button
                          key={c.contactId}
                          onClick={() => selectContact(c)}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.name}</p>
                            <p className="text-xs font-mono text-gray-500">{c.phone}</p>
                          </div>
                          {c.firm && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              {c.firm}
                            </span>
                          )}
                        </button>
                      ))}
                      {!searching && contacts.length === 0 && search.length >= 2 && (
                        <div className="px-4 py-3 text-xs text-gray-400">No contacts found</div>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setManualMode(true)}
                  className="mt-2 text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Or enter contact details manually
                </button>
              </div>
            )}
          </div>

          {/* ── Required fields ── */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4 dark:border-gray-700 dark:bg-gray-900">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Required Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Date of Loss (DOL)</label>
                <input
                  type="date"
                  value={dol}
                  onChange={e => setDol(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Date of Birth (DOB)</label>
                <input
                  type="date"
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">City of Accident</label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="e.g. Los Angeles"
                className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
            </div>
          </div>

          {/* ── Passengers ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Passengers {passengers.length > 0 && `(${passengers.length})`}
              </p>
              <button
                onClick={addPassenger}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
              >
                <PlusIcon /> Add Passenger
              </button>
            </div>

            {passengers.length > 0 && (
              <div className="space-y-3">
                {passengers.map((p, i) => (
                  <div key={i} className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-2 dark:border-orange-900 dark:bg-orange-950/20">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase text-orange-600 dark:text-orange-400">
                        Passenger {i + 1}
                      </p>
                      <button onClick={() => removePassenger(i)} className="text-gray-400 hover:text-red-500">
                        <XIcon />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Name *</label>
                        <input
                          type="text"
                          value={p.name}
                          onChange={e => updatePassenger(i, 'name', e.target.value)}
                          placeholder="Full name"
                          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-orange-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Phone</label>
                        <input
                          type="tel"
                          value={p.phone}
                          onChange={e => updatePassenger(i, 'phone', e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 focus:border-orange-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">DOB</label>
                        <input
                          type="date"
                          value={p.dob}
                          onChange={e => updatePassenger(i, 'dob', e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 focus:border-orange-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Send button ── */}
          {sent ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 py-3 dark:border-green-900 dark:bg-green-950/30">
              <CheckCircle />
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">DocuSeal sent successfully</p>
            </div>
          ) : (
            <button
              disabled={!canSend}
              onClick={handleSend}
              className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending…' : 'Send DocuSeal'}
            </button>
          )}

          {/* Validation hints */}
          {!canSend && !sent && (
            <div className="text-xs text-gray-400 space-y-0.5">
              {!selectedTemplate && <p>Select a template</p>}
              {!contactName.trim() && <p>Select or enter a contact</p>}
              {!dol && <p>Enter date of loss</p>}
              {!dob && <p>Enter date of birth</p>}
              {!city.trim() && <p>Enter city of accident</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Sent history ── */}
      <div className="w-80 shrink-0 border-l border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950 overflow-y-auto">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Sent History {history.length > 0 && `(${history.length})`}
          </p>
        </div>

        {historyLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />)}
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <span className="text-gray-300 dark:text-gray-700"><DocIcon /></span>
            <p className="mt-2 text-xs text-gray-400">No documents sent yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {history.map(h => (
              <div key={h.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{h.contact_name}</p>
                    <p className="text-xs text-gray-500 truncate">{h.template_name ?? `Template #${h.submission_id}`}</p>
                  </div>
                  {h.firm && (
                    <span className="shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      {h.firm}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-400">
                  <span>{new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span>{new Date(h.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  {h.sent_by && <span>by {h.sent_by}</span>}
                  {h.passenger_count > 0 && <span>+{h.passenger_count} pax</span>}
                </div>
                {(h.phone || h.city_of_accident) && (
                  <div className="mt-0.5 flex items-center gap-3 text-[10px] text-gray-400">
                    {h.phone && <span className="font-mono">{h.phone}</span>}
                    {h.city_of_accident && <span>{h.city_of_accident}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
