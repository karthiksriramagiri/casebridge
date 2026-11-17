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
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-muted-foreground">
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
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-success">
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
  /* Closed on a phone, where it sits below the form; the lg styles above
     ignore this and keep the rail permanently open. */
  const [historyOpen, setHistoryOpen] = useState(false)

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
    /* Stacked until there is room for two columns.

       Side by side, the history rail takes a fixed 320px out of whatever is
       left — which on a phone is the whole screen, squeezing the form that
       is the actual point of the page into a strip too narrow to type in.
       Below lg the rail moves underneath and collapses. */
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* ── Send form ── */}
      <div className="min-w-0 flex-1 lg:overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          {/* Header */}
          <div>
            <h1 className="text-lg font-bold text-foreground">Send DocuSeal</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Select a contact and template, fill in the required details, and send.</p>
          </div>

          {/* ── Template picker ── */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Template
            </label>
            {templatesLoading ? (
              <div className="h-10 animate-pulse rounded-lg bg-muted" />
            ) : templates.length === 0 ? (
              <p className="text-xs text-destructive">No templates found in DocuSeal</p>
            ) : (
              <select
                value={selectedTemplate?.id ?? ''}
                onChange={e => {
                  const t = templates.find(t => t.id === Number(e.target.value))
                  setSelectedTemplate(t ?? null)
                }}
                className="w-full rounded-lg border border-input bg-card px-3 py-3 sm:py-2.5 text-base sm:text-sm text-foreground focus:border-primary focus:outline-none"
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
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Contact
            </label>

            {selectedContact && !manualMode ? (
              <div className="flex items-center justify-between rounded-lg border border-primary bg-accent/50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedContact.name}</p>
                  <p className="text-xs font-mono text-muted-foreground">{selectedContact.phone}</p>
                  {selectedContact.firm && (
                    <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {selectedContact.firm}
                    </span>
                  )}
                </div>
                <button
                  onClick={clearContact}
                  aria-label="Clear selected contact"
                  className="-mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <XIcon />
                </button>
              </div>
            ) : manualMode ? (
              <div className="rounded-lg border border-border bg-muted/50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Manual Entry</p>
                  <button onClick={clearContact} className="text-[10px] text-muted-foreground hover:text-muted-foreground">Cancel</button>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Full Name *</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    autoComplete="name"
                    autoCapitalize="words"
                    placeholder="John Doe"
                    className="w-full rounded-md border border-input bg-card px-2.5 py-3 sm:py-2.5 sm:py-1.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Phone</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={manualPhone}
                      onChange={e => setManualPhone(e.target.value)}
                      className="w-full rounded-md border border-input bg-card px-2.5 py-3 sm:py-2.5 sm:py-1.5 text-base sm:text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Email</label>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      value={manualEmail}
                      onChange={e => setManualEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full rounded-md border border-input bg-card px-2.5 py-3 sm:py-2.5 sm:py-1.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <svg viewBox="0 0 20 20" fill="currentColor"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => handleSearch(e.target.value)}
                    type="search"
                    enterKeyHint="search"
                    autoCapitalize="words"
                    autoCorrect="off"
                    placeholder="Search by name or phone…"
                    className="w-full rounded-lg border border-input bg-card py-3 sm:py-2.5 pl-9 pr-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                {/* Search results dropdown */}
                {(contacts.length > 0 || searching) && search.length >= 2 && (
                  <div className="relative z-10">
                    <div className="absolute left-0 right-0 top-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                      {searching && (
                        <div className="px-4 py-3 text-xs text-muted-foreground animate-pulse">Searching…</div>
                      )}
                      {contacts.map(c => (
                        <button
                          key={c.contactId}
                          onClick={() => selectContact(c)}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted/50"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">{c.name}</p>
                            <p className="text-xs font-mono text-muted-foreground">{c.phone}</p>
                          </div>
                          {c.firm && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              {c.firm}
                            </span>
                          )}
                        </button>
                      ))}
                      {!searching && contacts.length === 0 && search.length >= 2 && (
                        <div className="px-4 py-3 text-xs text-muted-foreground">No contacts found</div>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setManualMode(true)}
                  className="-ml-2 mt-1 rounded-md px-2 py-2 text-xs font-medium text-primary hover:bg-accent/50"
                >
                  Or enter contact details manually
                </button>
              </div>
            )}
          </div>

          {/* ── Required fields ── */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Required Details</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Date of Loss (DOL)</label>
                <input
                  type="date"
                  value={dol}
                  onChange={e => setDol(e.target.value)}
                  className="w-full rounded-md border border-input bg-card px-2.5 py-3 sm:py-2 text-base sm:text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Date of Birth (DOB)</label>
                <input
                  type="date"
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  className="w-full rounded-md border border-input bg-card px-2.5 py-3 sm:py-2 text-base sm:text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">City of Accident</label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                autoComplete="address-level2"
                autoCapitalize="words"
                placeholder="e.g. Los Angeles"
                className="w-full rounded-md border border-input bg-card px-2.5 py-3 sm:py-2 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* ── Passengers ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Passengers {passengers.length > 0 && `(${passengers.length})`}
              </p>
              <button
                onClick={addPassenger}
                className="-mr-2 flex items-center gap-1 rounded-md px-2 py-2 text-xs font-medium text-primary hover:bg-accent/50"
              >
                <PlusIcon /> Add Passenger
              </button>
            </div>

            {passengers.length > 0 && (
              <div className="space-y-3">
                {passengers.map((p, i) => (
                  <div key={i} className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase text-orange-600">
                        Passenger {i + 1}
                      </p>
                      <button
                        onClick={() => removePassenger(i)}
                        aria-label={`Remove passenger ${i + 1}`}
                        className="-mr-1 grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:text-destructive"
                      >
                        <XIcon />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Name *</label>
                        <input
                          type="text"
                          value={p.name}
                          onChange={e => updatePassenger(i, 'name', e.target.value)}
                          autoCapitalize="words"
                          placeholder="Full name"
                          className="w-full rounded-md border border-input bg-card px-2 py-3 sm:py-2.5 sm:py-1.5 text-base sm:text-xs text-foreground placeholder:text-muted-foreground focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Phone</label>
                        <input
                          type="tel"
                          value={p.phone}
                          inputMode="tel"
                          onChange={e => updatePassenger(i, 'phone', e.target.value)}
                          className="w-full rounded-md border border-input bg-card px-2 py-3 sm:py-2.5 sm:py-1.5 text-base sm:text-xs text-foreground focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">DOB</label>
                        <input
                          type="date"
                          value={p.dob}
                          onChange={e => updatePassenger(i, 'dob', e.target.value)}
                          className="w-full rounded-md border border-input bg-card px-2 py-3 sm:py-2.5 sm:py-1.5 text-base sm:text-xs text-foreground focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Send ──

              Pinned to the bottom of the viewport on a phone. The form runs
              past a screen and a half once passengers are added, so an
              inline button sits below the fold for the whole of the filling
              in — the rep types the last field and then has to go looking
              for the thing that sends it. On a wide screen the form fits and
              it goes back to being an ordinary button.

              `sticky` rather than `fixed` so it cannot cover the history
              below it, and pb-safe keeps it clear of the home indicator. */}
          <div className="sticky bottom-0 -mx-4 border-t border-border bg-card/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            {sent ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-success/40 bg-success/15 py-3">
                <CheckCircle />
                <p className="text-sm font-semibold text-success">DocuSeal sent successfully</p>
              </div>
            ) : (
              <button
                disabled={!canSend}
                onClick={handleSend}
                className="w-full rounded-lg bg-primary py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary active:bg-primary disabled:cursor-not-allowed disabled:opacity-40 sm:py-3 sm:text-sm"
              >
                {sending ? 'Sending…' : 'Send DocuSeal'}
              </button>
            )}

            {/* What is still missing. One line on a phone — a stacked list
                of five hints pushes the button off the screen it is pinned
                to. The full list still shows once there is room. */}
            {!canSend && !sent && (() => {
              const missing = [
                !selectedTemplate && 'a template',
                !contactName.trim() && 'a contact',
                !dol && 'date of loss',
                !dob && 'date of birth',
                !city.trim() && 'city of accident',
              ].filter(Boolean) as string[]
              if (missing.length === 0) return null
              return (
                <>
                  <p className="mt-2 text-xs text-muted-foreground lg:hidden">
                    Still needed: {missing.join(', ')}
                  </p>
                  <div className="mt-2 hidden space-y-0.5 text-xs text-muted-foreground lg:block">
                    {missing.map(m => <p key={m}>Enter {m}</p>)}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </div>

      {/* ── Sent history ──

          A rail on a wide screen, a collapsed section underneath the form on
          a phone. It is reference material: useful to confirm something went
          out, never the reason the page was opened. Open by default it would
          be a long list standing between the rep and the form. */}
      <div className="w-full shrink-0 border-t border-border bg-muted/50 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0">
        <button
          onClick={() => setHistoryOpen(o => !o)}
          aria-expanded={historyOpen}
          className="flex w-full items-center justify-between gap-2 border-b border-border px-4 py-3 text-left lg:pointer-events-none lg:cursor-default"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sent History {history.length > 0 && `(${history.length})`}
          </p>
          <svg
            viewBox="0 0 20 20" fill="currentColor" aria-hidden
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform lg:hidden ${historyOpen ? 'rotate-180' : ''}`}
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        <div className={historyOpen ? '' : 'hidden lg:block'}>
        {historyLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <span className="text-muted-foreground"><DocIcon /></span>
            <p className="mt-2 text-xs text-muted-foreground">No documents sent yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {history.map(h => (
              <div key={h.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{h.contact_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{h.template_name ?? `Template #${h.submission_id}`}</p>
                  </div>
                  {h.firm && (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      {h.firm}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>{new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span>{new Date(h.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  {h.sent_by && <span>by {h.sent_by}</span>}
                  {h.passenger_count > 0 && <span>+{h.passenger_count} pax</span>}
                </div>
                {(h.phone || h.city_of_accident) && (
                  <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground">
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
    </div>
  )
}
