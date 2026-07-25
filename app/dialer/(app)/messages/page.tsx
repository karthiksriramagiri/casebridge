'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Conversation {
  leadPhone:   string
  contactId:   string | null
  contactName: string | null
  firm:        string | null
  lastMessage: string | null
  lastAt:      string
  unreadCount: number
  direction:   string
  hasMessages: boolean
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
  if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const isThisYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(!isThisYear ? { year: 'numeric' } : {}) })
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
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

interface GHLContact {
  id:    string
  name:  string
  phone: string
  email: string
  tags:  string[]
}

function NewConvoModal({ onClose, onStart }: {
  onClose: () => void
  onStart: (phone: string, name: string, contactId: string) => void
}) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<GHLContact[]>([])
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState<GHLContact | null>(null)
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

  function pick(c: GHLContact) {
    setSelected(c)
    setQuery(c.name)
    setResults([])
  }

  function submit() {
    if (!selected) return
    onStart(selected.phone, selected.name, selected.id)
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
                    className="flex w-full flex-col px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</span>
                    <span className="font-mono text-xs text-gray-400">{c.phone}</span>
                    {c.email && <span className="truncate text-xs text-gray-400">{c.email}</span>}
                  </button>
                ))}
              </div>
            )}
            {!loading && query.trim() && results.length === 0 && !selected && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <p className="text-xs text-gray-400">No leads found in GHL.</p>
              </div>
            )}
          </div>

          {selected && (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2.5 dark:border-cyan-800 dark:bg-cyan-950/30">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{selected.name}</p>
              <p className="font-mono text-xs text-gray-500">{selected.phone}</p>
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
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convoLoading, setConvoLoading]   = useState(true)
  const [selected, setSelected]           = useState<Conversation | null>(null)
  const [messages, setMessages]           = useState<Message[]>([])
  const [msgLoading, setMsgLoading]       = useState(false)
  const [draft, setDraft]                 = useState('')
  const [sending, setSending]             = useState(false)
  const [search, setSearch]               = useState('')
  const [showNew, setShowNew]             = useState(false)
  const [identity]                        = useState('agent')

  const bottomRef   = useRef<HTMLDivElement>(null)
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

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
    try {
      const res  = await fetch(`/api/dialer/sms/thread?phone=${encodeURIComponent(convo.leadPhone)}`)
      const data = await res.json()
      setMessages(data.messages ?? [])
      // Mark as read in local state
      setConversations(prev =>
        prev.map(c => c.leadPhone === convo.leadPhone ? { ...c, unreadCount: 0 } : c)
      )
    } catch (err) {
      console.error('[messages] thread error', err)
    } finally {
      setMsgLoading(false)
    }
  }

  // Start a new conversation with a known GHL lead
  function startNew(phone: string, name: string, contactId: string) {
    const convo: Conversation = {
      leadPhone:   phone,
      contactId:   contactId,
      contactName: name || null,
      firm:        null,
      lastMessage: null,
      lastAt:      new Date().toISOString(),
      unreadCount: 0,
      direction:   'outbound',
      hasMessages: false,
    }
    setConversations(prev => [convo, ...prev.filter(c => c.leadPhone !== phone)])
    setSelected(convo)
    setMessages([])
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
      from_number:  process.env.NEXT_PUBLIC_TWILIO_NUMBER ?? '',
      to_number:    selected.leadPhone,
      body,
      status:       'sending',
      media_url:    null,
      contact_id:   selected.contactId,
      contact_name: selected.contactName,
      rep_identity: identity,
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
          repIdentity: identity,
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
          onStart={(phone, name, contactId) => startNew(phone, name, contactId)}
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
                key={convo.leadPhone}
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
            <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-3.5 dark:border-gray-800">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {(selected.contactName || selected.leadPhone).charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {selected.contactName || fmtPhone(selected.leadPhone)}
                </p>
                <p className="text-xs font-mono text-gray-400">{fmtPhone(selected.leadPhone)}</p>
              </div>
              {selected.firm && (
                <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium ${FIRM_PILL[selected.firm] ?? 'bg-gray-100 text-gray-500'}`}>
                  {selected.firm}
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgLoading && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-xs text-gray-400 animate-pulse">Loading…</p>
                </div>
              )}

              {!msgLoading && messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="text-xs text-gray-400">No messages yet.<br />Send the first one below.</p>
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

            {/* Send box */}
            <div className="border-t border-gray-200 p-3 dark:border-gray-800">
              <div className="flex items-end gap-2">
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
