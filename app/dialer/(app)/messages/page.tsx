'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../_context/auth'
import { useCall } from '../../_context/call'
import type { Lead } from '../../_types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Conversation {
  leadPhone:       string
  contactId:       string | null
  contactName:     string | null
  firm:            string | null
  lastMessage:     string | null
  lastAt:          string
  unreadCount:     number
  direction:       string
  hasMessages:     boolean
  smsDisposition:  string | null
  smsBotActive:    boolean
}

interface Message {
  id:           string
  direction:    'inbound' | 'outbound'
  from_number:  string
  to_number:    string
  body:         string
  status:       string
  media_url:    string | null
  contact_id:   string | null
  contact_name: string | null
  rep_identity: string | null
  firm:         string | null
  read:         boolean
  created_at:   string
}

interface SearchContact {
  id:    string
  name:  string
  phone: string
  firm:  string | null
}

// ── Quick-reply templates ───────────────────────────────────────────────────────

interface Template {
  id:       string
  label:    string
  icon:     string
  message:  string // {NAME} = lead first name, {REP} = rep name
  group:    'flow' | 'additional'
  step?:    number // ordering within the flow
}

// ── Qualification flow (sent in order as lead responds) ─────────────────────
const FLOW_TEMPLATES: Template[] = [
  {
    id:      'intro',
    label:   '1. Intro',
    icon:    '👋',
    group:   'flow',
    step:    1,
    message: `Hi {NAME}! 👋👋 It's William from Accident Support Desk, I was looking over your accident info and it looks very similar to another accident we just settled for a pretty significant amount. I think we can help show you how to do the same, just had a few quick questions for us to understand the situation a bit better. We can handle this over text message real quick, should only take a minute. Do you remember the date of the accident?`,
  },
  {
    id:      'dol',
    label:   '2. Date of Loss',
    icon:    '📅',
    group:   'flow',
    step:    2,
    message: `Do you remember the exact date of the accident? 📅 The more specific the better — it helps us figure out where you stand with your claim!`,
  },
  {
    id:      'whatHappened',
    label:   '3. What Happened',
    icon:    '💥',
    group:   'flow',
    step:    3,
    message: `Understood! Can you give me a quick rundown of what happened? 🙏`,
  },
  {
    id:      'police',
    label:   '4. Police on Scene',
    icon:    '🚔',
    group:   'flow',
    step:    4,
    message: `Got it! Did the police come to the scene and was a report filed? 🚔`,
  },
  {
    id:      'insurance',
    label:   '5. Insurance',
    icon:    '📋',
    group:   'flow',
    step:    5,
    message: `Was the other driver insured? And do you have your own auto insurance? 📋`,
  },
  {
    id:      'feeling',
    label:   '6. How Are You Feeling',
    icon:    '🤕',
    group:   'flow',
    step:    6,
    message: `How have you been feeling since the accident? Any pain, soreness, headaches? 🤕`,
  },
  {
    id:      'treatment',
    label:   '7. Treatment',
    icon:    '🏥',
    group:   'flow',
    step:    7,
    message: `Have you seen any doctors or gotten any treatment since the accident? 🏥`,
  },
  {
    id:      'attorney',
    label:   '8. Attorney',
    icon:    '⚖️',
    group:   'flow',
    step:    8,
    message: `Have you worked with a personal injury attorney before or is this your first time? ⚖️`,
  },
  {
    id:      'explainProcess',
    label:   '9. Explain Process',
    icon:    '✅',
    group:   'flow',
    step:    9,
    message: `Based on everything you've told me, you definitely have a case worth pursuing! 💰 The next step is connecting you with one of our Specialists who will walk you through your options and put together a gameplan for you. The call takes about 10-15 minutes, no cost or obligation. What time works best for a quick call? 📞`,
  },
]

// ── Additional prompts (not part of the flow) ───────────────────────────────
const ADDITIONAL_TEMPLATES: Template[] = [
  {
    id:      'call1hr',
    label:   'Call in 1 Hour',
    icon:    '⏰',
    group:   'additional',
    message: `Hey {NAME}! Your call with our Specialist is coming up in about an hour 📞 They'll be calling from a local number so keep an eye out!`,
  },
  {
    id:      'call15min',
    label:   'Call in 15 Min',
    icon:    '🔔',
    group:   'additional',
    message: `Hey {NAME}! Your Specialist call is in about 15 minutes 🔔 They'll be calling from a local number!`,
  },
  {
    id:      'cantConnect',
    label:   "Couldn't Connect",
    icon:    '📵',
    group:   'additional',
    message: `Hey {NAME}, we just tried reaching you but couldn't get connected 🙏 What time works best for us to try again? 📞`,
  },
  {
    id:      'cmReachOut',
    label:   'Case Manager Follow-up',
    icon:    '📲',
    group:   'additional',
    message: `Hey {NAME}, your Case Manager has been trying to reach you but hasn't been able to get connected 📲 Can you let us know a good time to call?`,
  },
]

const ALL_TEMPLATES = [...FLOW_TEMPLATES, ...ADDITIONAL_TEMPLATES]

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtPhone(p: string) {
  const d = p.replace(/\D/g, '')
  if (d.length === 11 && d[0] === '1') {
    return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  }
  return p
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
  const isThisYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles', ...(!isThisYear ? { year: 'numeric' } : {}) })
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  })
}

function firstName(full: string | null | undefined): string {
  if (!full) return 'there'
  return full.split(' ')[0] || 'there'
}

// ── SMS Dispositions (matches call dispositions) ─────────────────────────────

import { DISPOSITIONS } from '../../_types'
import type { Disposition } from '../../_types'

const DISP_PILL_COLORS: Record<string, string> = {
  'Qualified':     'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  'Not Qualified': 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  'Callback':      'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  'No Answer':     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  'Signed':        'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  'DNC':           'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
}

const FIRM_PILL: Record<string, string> = {
  'Larry H. Parker': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  'Fears Law':       'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const SendIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
  </svg>
)

const MsgIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
    <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
)

// ── New conversation modal ─────────────────────────────────────────────────────

function NewConvoModal({ onClose, onStart }: {
  onClose: () => void
  onStart: (phone: string, name: string, contactId: string, firm: string | null) => void
}) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<SearchContact[]>([])
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState<SearchContact | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onQueryChange(q: string) {
    setQuery(q)
    setSelected(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!q.trim()) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res  = await fetch(`/api/dialer/contacts/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setResults(data.contacts ?? [])
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }, 350)
  }

  function pick(c: SearchContact) {
    setSelected(c)
    setQuery(c.name)
    setResults([])
  }

  function submit() {
    if (!selected) return
    onStart(selected.phone, selected.name, selected.id, selected.firm)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">New Message</h2>
          <p className="mt-0.5 text-xs text-gray-400">Search for a lead by name or phone</p>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative">
            <input
              autoFocus
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="Search leads…"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
            />
            {loading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 animate-pulse">
                Searching…
              </span>
            )}
            {results.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                {results.map(c => (
                  <button
                    key={c.id}
                    onClick={() => pick(c)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <div className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">{c.name}</span>
                      <span className="font-mono text-xs text-gray-400">{fmtPhone(c.phone)}</span>
                    </div>
                    {c.firm && (
                      <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${FIRM_PILL[c.firm] ?? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {c.firm}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {!loading && query.trim() && results.length === 0 && !selected && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <p className="text-xs text-gray-400">No leads found.</p>
              </div>
            )}
          </div>

          {selected && (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2.5 dark:border-cyan-800 dark:bg-cyan-950/30">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{selected.name}</p>
              <p className="font-mono text-xs text-gray-500">{fmtPhone(selected.phone)}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button onClick={submit} disabled={!selected}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-40">
              Open Chat
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { name: authName, identity } = useAuth()
  const { deviceReady, callState, placeCall } = useCall()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convoLoading, setConvoLoading]   = useState(true)
  const [selected, setSelected]           = useState<Conversation | null>(null)
  const [messages, setMessages]           = useState<Message[]>([])
  const [msgLoading, setMsgLoading]       = useState(false)
  const [draft, setDraft]                 = useState('')
  const [sending, setSending]             = useState(false)
  const [search, setSearch]               = useState('')
  const [showDisposition, setShowDisposition] = useState(false)
  const [savingSettings, setSavingSettings]   = useState(false)
  const [dispSelection,  setDispSelection]    = useState<Disposition | null>(null)
  const [dispNqReason,   setDispNqReason]     = useState('')
  const [dispCbTime,     setDispCbTime]       = useState('')
  const [dispNotes,      setDispNotes]        = useState('')
  const [showNew, setShowNew]             = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  // Resolve the rep display name for templates
  const repName = authName || identity || 'William'

  // Load conversation list
  const loadConversations = useCallback(async () => {
    try {
      const res  = await fetch('/api/dialer/sms/conversations')
      const data = await res.json()
      setConversations(data.conversations ?? [])
    } catch (err) {
      console.error('[messages] conversations error', err)
    } finally {
      setConvoLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConversations()
    // Poll every 10s for new messages
    pollRef.current = setInterval(async () => {
      loadConversations()
      // Also refresh open thread
      if (selectedRef.current) {
        const res  = await fetch(`/api/dialer/sms/thread?phone=${encodeURIComponent(selectedRef.current.leadPhone)}`)
        const data = await res.json()
        setMessages(data.messages ?? [])
      }
    }, 10_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadConversations])

  // Load thread when conversation selected
  async function openThread(convo: Conversation) {
    setSelected(convo)
    setMessages([])
    setMsgLoading(true)
    setShowTemplates(false)
    try {
      const res  = await fetch(`/api/dialer/sms/thread?phone=${encodeURIComponent(convo.leadPhone)}`)
      const data = await res.json()
      const msgs = data.messages ?? [] as Message[]
      setMessages(msgs)
      // Resolve contact name from messages if missing
      const resolvedName = convo.contactName || msgs.find((m: Message) => m.contact_name)?.contact_name || null
      setConversations(prev =>
        prev.map(c => c.leadPhone === convo.leadPhone
          ? { ...c, unreadCount: 0, contactName: resolvedName ?? c.contactName }
          : c
        )
      )
      if (resolvedName && !convo.contactName) {
        setSelected(s => s && s.leadPhone === convo.leadPhone ? { ...s, contactName: resolvedName } : s)
      }
    } catch (err) {
      console.error('[messages] thread error', err)
    } finally {
      setMsgLoading(false)
    }
  }

  // Start a new conversation
  function startNew(phone: string, name: string, contactId: string, firm: string | null) {
    const convo: Conversation = {
      leadPhone:       phone,
      contactId:       contactId,
      contactName:     name || null,
      firm:            firm ?? null,
      lastMessage:     null,
      lastAt:          new Date().toISOString(),
      unreadCount:     0,
      direction:       'outbound',
      hasMessages:     false,
      smsDisposition:  null,
      smsBotActive:    false,
    }
    setConversations(prev => [convo, ...prev.filter(c => c.leadPhone !== phone)])
    setSelected(convo)
    setMessages([])
  }

  // Apply a template — fill the draft with the template text
  function applyTemplate(tpl: Template) {
    const leadName = firstName(selected?.contactName)
    const filled = tpl.message
      .replace(/\{NAME\}/g, leadName)
      .replace(/\{REP\}/g, repName)
    setDraft(filled)
    setShowTemplates(false)
  }

  // Save SMS disposition or bot toggle for the selected contact
  async function updateLeadSettings(updates: { smsDisposition?: string | null; smsBotActive?: boolean; nqReason?: string; callbackAt?: string; notes?: string }) {
    if (!selected?.contactId) return
    setSavingSettings(true)
    try {
      await fetch('/api/dialer/sms/lead-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: selected.contactId, ...updates }),
      })
      // Update local state
      const patch: Partial<Conversation> = {}
      if (updates.smsDisposition !== undefined) patch.smsDisposition = updates.smsDisposition
      if (updates.smsBotActive !== undefined) patch.smsBotActive = updates.smsBotActive
      setSelected(s => s ? { ...s, ...patch } : s)
      setConversations(prev =>
        prev.map(c => c.contactId === selected.contactId ? { ...c, ...patch } : c)
      )
    } catch (err) {
      console.error('[messages] save settings error', err)
    } finally {
      setSavingSettings(false)
      setShowDisposition(false)
      setDispSelection(null)
      setDispNqReason('')
      setDispCbTime('')
      setDispNotes('')
    }
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!draft.trim() || !selected || sending) return
    const body = draft.trim()
    setDraft('')
    setSending(true)

    // Optimistic update
    const optimistic: Message = {
      id:           `tmp-${Date.now()}`,
      direction:    'outbound',
      from_number:  '',
      to_number:    selected.leadPhone,
      body,
      status:       'sending',
      media_url:    null,
      contact_id:   selected.contactId,
      contact_name: selected.contactName,
      rep_identity: identity || authName,
      firm:         selected.firm,
      read:         true,
      created_at:   new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    try {
      await fetch('/api/dialer/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:          selected.leadPhone,
          body,
          repIdentity: identity || authName,
          contactId:   selected.contactId,
          contactName: selected.contactName,
          firm:        selected.firm,
        }),
      })
      // Refresh thread
      const res  = await fetch(`/api/dialer/sms/thread?phone=${encodeURIComponent(selected.leadPhone)}`)
      const data = await res.json()
      setMessages(data.messages ?? [])
      loadConversations()
    } catch (err) {
      console.error('[messages] send error', err)
    } finally {
      setSending(false)
    }
  }

  const filtered = search
    ? conversations.filter(c =>
        (c.contactName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        c.leadPhone.includes(search)
      )
    : conversations

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0)

  return (
    <div className="flex h-full">
      {showNew && (
        <NewConvoModal
          onClose={() => setShowNew(false)}
          onStart={(phone, name, contactId, firm) => startNew(phone, name, contactId, firm)}
        />
      )}

      {/* ── Left: conversation list ── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
        {/* Header */}
        <div className="border-b border-gray-200 px-3 py-3 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Messages
              {totalUnread > 0 && (
                <span className="ml-1.5 rounded-full bg-cyan-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {totalUnread}
                </span>
              )}
            </p>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <PlusIcon /> New
            </button>
          </div>
          <div className="relative">
            <svg viewBox="0 0 20 20" fill="currentColor"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-7 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {convoLoading && (
            <div className="space-y-1 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
              ))}
            </div>
          )}

          {!convoLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
              <MsgIcon />
              <p className="text-xs text-gray-400">
                {search ? 'No leads match.' : 'No leads found. Start by making some calls first.'}
              </p>
            </div>
          )}

          {filtered.map(convo => {
            const isActive = selected?.leadPhone === convo.leadPhone
            const name     = convo.contactName || fmtPhone(convo.leadPhone)
            return (
              <button
                key={convo.contactId || convo.leadPhone}
                onClick={() => openThread(convo)}
                className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-100 dark:border-gray-800/40 dark:hover:bg-gray-900/60 ${
                  isActive ? 'border-l-2 border-l-cyan-500 bg-cyan-50/60 dark:bg-cyan-950/20' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* Avatar */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`truncate text-sm ${convo.unreadCount > 0 ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-200'}`}>
                        {name}
                      </p>
                      <span className="shrink-0 text-[10px] text-gray-400">{fmtTime(convo.lastAt)}</span>
                    </div>
                    {convo.lastMessage != null ? (
                      <p className={`truncate text-xs ${convo.unreadCount > 0 ? 'text-gray-700 dark:text-gray-300 font-medium' : 'text-gray-400'}`}>
                        {convo.direction === 'outbound' && <span className="text-gray-300 dark:text-gray-600">You: </span>}
                        {convo.lastMessage}
                      </p>
                    ) : (
                      <p className="text-xs italic text-gray-500 dark:text-gray-600">No messages yet</p>
                    )}
                    <div className="mt-1 flex items-center gap-1.5">
                      {convo.firm && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${FIRM_PILL[convo.firm] ?? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {convo.firm}
                        </span>
                      )}
                      {convo.smsDisposition && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${DISP_PILL_COLORS[convo.smsDisposition] ?? 'bg-gray-100 text-gray-600'}`}>
                          {convo.smsDisposition}
                        </span>
                      )}
                      {convo.smsBotActive && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400">
                          Bot
                        </span>
                      )}
                      {convo.unreadCount > 0 && (
                        <span className="rounded-full bg-cyan-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {convo.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right: chat thread ── */}
      <div className="flex flex-1 flex-col bg-white dark:bg-gray-950">
        {selected ? (
          <>
            {/* Thread header */}
            {(() => {
              const resolvedName = selected.contactName
                || messages.find(m => m.contact_name)?.contact_name
                || null
              const displayName = resolvedName || fmtPhone(selected.leadPhone)
              const currentDispColor = DISP_PILL_COLORS[selected.smsDisposition ?? ''] ?? ''

              return (
                <div className="border-b border-gray-200 dark:border-gray-800">
                  {/* Disposition modal */}
                  {showDisposition && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
                          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Disposition</h2>
                          <p className="mt-0.5 text-sm text-gray-500">{displayName} · {fmtPhone(selected.leadPhone)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 p-4">
                          {DISPOSITIONS.map(d => (
                            <button key={d.id} onClick={() => setDispSelection(d)}
                              className={`rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-all ${d.color} ${dispSelection?.id === d.id ? 'ring-2 ring-gray-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-gray-900' : 'opacity-80 hover:opacity-100'}`}>
                              {d.label}
                            </button>
                          ))}
                        </div>

                        {/* Callback time picker */}
                        {dispSelection?.category === 'CALLBACK' && (
                          <div className="border-t border-gray-200 px-4 pb-4 space-y-2 dark:border-gray-800">
                            <label className="mb-1.5 block text-xs font-medium text-gray-500">
                              Callback time (your local time)
                            </label>
                            <input type="datetime-local" value={dispCbTime} onChange={e => setDispCbTime(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input
                              value={dispNotes} onChange={e => setDispNotes(e.target.value)}
                              placeholder="Callback notes (optional)…"
                              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                            />
                          </div>
                        )}

                        {/* NQ reason */}
                        {dispSelection?.requiresReason && (
                          <div className="border-t border-gray-200 px-4 pb-4 space-y-2 dark:border-gray-800">
                            <label className="mb-1.5 block text-xs font-medium text-gray-500">
                              Reason for not qualifying
                            </label>
                            <input
                              value={dispNqReason} onChange={e => setDispNqReason(e.target.value)}
                              placeholder="Enter reason…"
                              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                          <button
                            onClick={() => { setShowDisposition(false); setDispSelection(null); setDispNqReason(''); setDispCbTime(''); setDispNotes('') }}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800">
                            Cancel
                          </button>
                          {selected.smsDisposition && (
                            <button
                              onClick={() => updateLeadSettings({ smsDisposition: null })}
                              disabled={savingSettings}
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                              Clear
                            </button>
                          )}
                          <button
                            disabled={!dispSelection || (dispSelection.category === 'CALLBACK' && !dispCbTime) || (dispSelection.requiresReason && !dispNqReason.trim()) || savingSettings}
                            onClick={() => dispSelection && updateLeadSettings({
                              smsDisposition: dispSelection.label,
                              nqReason: dispNqReason.trim() || undefined,
                              callbackAt: dispCbTime ? new Date(dispCbTime).toISOString() : undefined,
                              notes: dispNotes.trim() || undefined,
                            })}
                            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40">
                            {savingSettings ? 'Saving…' : 'Submit'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top row: name + actions */}
                  <div className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {displayName}
                        </p>
                        {resolvedName && (
                          <p className="text-xs font-mono text-gray-400">{fmtPhone(selected.leadPhone)}</p>
                        )}
                      </div>
                      {selected.firm && (
                        <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium ${FIRM_PILL[selected.firm] ?? 'bg-gray-100 text-gray-500'}`}>
                          {selected.firm}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Disposition button */}
                      <button
                        onClick={() => { setShowDisposition(true); setDispSelection(null); setDispNqReason(''); setDispCbTime(''); setDispNotes('') }}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          currentDispColor
                            ? `${currentDispColor} border-transparent`
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                        }`}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                          <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        {selected.smsDisposition || 'Disposition'}
                      </button>

                      {/* Bot toggle */}
                      {selected.contactId && (
                        <button
                          onClick={() => updateLeadSettings({ smsBotActive: !selected.smsBotActive })}
                          disabled={savingSettings}
                          title={selected.smsBotActive ? 'Bot is ON — click to turn off' : 'Bot is OFF — click to turn on'}
                          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                            selected.smsBotActive
                              ? 'border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400'
                              : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700'
                          }`}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                          </svg>
                          Bot {selected.smsBotActive ? 'ON' : 'OFF'}
                        </button>
                      )}

                      {/* Call button */}
                      <button
                        disabled={!deviceReady || callState !== 'idle'}
                        onClick={() => {
                          const lead: Lead = {
                            id:           selected.contactId || selected.leadPhone,
                            name:         displayName,
                            phone:        selected.leadPhone,
                            email:        '',
                            company:      '',
                            source:       selected.firm || '',
                            tags:         [],
                            lastActivity: new Date().toISOString(),
                            contactId:    selected.contactId || '',
                          }
                          placeCall(lead, { firm: selected.firm ?? undefined })
                        }}
                        title="Call this contact"
                        className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-40 disabled:hover:bg-green-600"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        Call
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgLoading && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-xs text-gray-400 animate-pulse">Loading…</p>
                </div>
              )}

              {!msgLoading && messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="text-xs text-gray-400">No messages yet.<br />Use a quick reply or type a message below.</p>
                </div>
              )}

              {messages.map((msg, i) => {
                const isOut = msg.direction === 'outbound'
                // Show date separator if different day from previous message
                const showDate = i === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[i-1].created_at).toDateString()

                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex items-center gap-2 py-1">
                        <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
                        <span className="text-[10px] text-gray-400">{fmtFull(msg.created_at)}</span>
                        <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
                      </div>
                    )}
                    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        isOut
                          ? 'rounded-br-sm bg-cyan-600 text-white'
                          : 'rounded-bl-sm bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}>
                        {msg.media_url && (
                          <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
                            className={`mb-1.5 block text-xs underline ${isOut ? 'text-cyan-200' : 'text-cyan-600 dark:text-cyan-400'}`}>
                            View attachment
                          </a>
                        )}
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                        <div className={`mt-1 flex items-center gap-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
                          <span className={`text-[10px] ${isOut ? 'text-cyan-200' : 'text-gray-400'}`}>
                            {fmtTime(msg.created_at)}
                          </span>
                          {isOut && (
                            <span className={`text-[10px] ${
                              msg.status === 'delivered' ? 'text-cyan-200' :
                              msg.status === 'failed'    ? 'text-red-300'  :
                              'text-cyan-300/60'
                            }`}>
                              · {msg.status}
                            </span>
                          )}
                          {isOut && msg.rep_identity && (
                            <span className="text-[10px] text-cyan-200/70 capitalize">· {msg.rep_identity}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* ── Template picker + Send box ── */}
            <div className="border-t border-gray-200 dark:border-gray-800">
              {/* Quick replies */}
              {showTemplates && (
                <div className="max-h-72 overflow-y-auto border-b border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900">
                  {/* Qualification Flow */}
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Qualification Flow</p>
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    {FLOW_TEMPLATES.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => applyTemplate(tpl)}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-cyan-300 hover:bg-cyan-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/30"
                      >
                        <span className="text-sm">{tpl.icon}</span>
                        <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate">{tpl.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Additional */}
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Additional</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ADDITIONAL_TEMPLATES.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => applyTemplate(tpl)}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-violet-300 hover:bg-violet-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-violet-700 dark:hover:bg-violet-950/30"
                      >
                        <span className="text-sm">{tpl.icon}</span>
                        <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate">{tpl.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3">
                <div className="flex items-end gap-2">
                  {/* Template toggle button */}
                  <button
                    onClick={() => setShowTemplates(v => !v)}
                    title="Quick replies"
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                      showTemplates
                        ? 'border-cyan-300 bg-cyan-50 text-cyan-600 dark:border-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400'
                        : 'border-gray-300 bg-gray-50 text-gray-400 hover:border-gray-400 hover:text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500 dark:hover:text-gray-400'
                    }`}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4.5 w-4.5">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>

                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!draft.trim() || sending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 transition-colors"
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-700">
              <MsgIcon />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Your messages</p>
              <p className="mt-1 text-xs text-gray-400">Select a conversation or start a new one.</p>
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
            >
              <PlusIcon /> New Message
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
