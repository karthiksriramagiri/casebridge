'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useCall } from '../../_context/call'
import type { Lead as CallLead } from '../../_types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Campaign {
  id:         string
  name:       string
  firm:       string
  firmSlug:   string
  pipelineId: string
  stageId:    string
  stageName:  string
  position:   number
  leadCount:  number
}

interface Lead {
  id:           string
  name:         string
  phone:        string
  email:        string
  company:      string
  source:       string
  tags:         string[]
  lastActivity: string
  contactId:    string
}

interface CallRecord {
  call_sid:      string
  call_status:   string | null
  disposition:   string | null
  duration:      number | null
  started_at:    string | null
  ended_at:      string | null
  recording_url: string | null
  rep_identity:  string | null
  firm:          string | null
  stage_name:    string | null
  transcripts:   TranscriptRecord[]
}

interface TranscriptRecord {
  id:           string
  call_sid:     string
  status:       string
  full_text:    string | null
  summary:      string | null
  utterances:   Utterance[] | null
  completed_at: string | null
}

interface Utterance {
  speaker:    string
  start:      number
  end:        number
  transcript: string
}

interface ContactDetail {
  id:                string
  name:              string
  email:             string
  phone:             string
  country:           string
  timezone:          string
  source:            string
  dateAdded:         string
  tags:              string[]
  attributionSource: string
  customFields:      Array<{ label: string; value: string }>
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDuration(sec: number | null) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function fmtDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function callStatusColor(status: string | null) {
  switch (status) {
    case 'completed':  return 'text-green-600 dark:text-green-400'
    case 'no-answer':  return 'text-yellow-600 dark:text-yellow-400'
    case 'busy':       return 'text-orange-500 dark:text-orange-400'
    case 'failed':     return 'text-red-600 dark:text-red-400'
    default:           return 'text-gray-400'
  }
}

const FIRM_COLORS: Record<string, string> = {
  'lhp':    'bg-blue-600',
  'fears':  'bg-purple-600',
  'jm': 'bg-emerald-600',
}
const FIRM_PILL: Record<string, string> = {
  'lhp':    'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  'lhp_s':  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400',
  'fears':  'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  'jm': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const ChevronDown = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 20 20" fill="currentColor"
    className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>
    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
)
const PhoneIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
  </svg>
)
const PlayIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
  </svg>
)
const MicIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
  </svg>
)
const XIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
)

// ── Transcript viewer ──────────────────────────────────────────────────────────

function TranscriptViewer({ tx }: { tx: TranscriptRecord }) {
  const [open, setOpen] = useState(false)

  if (tx.status === 'pending') {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400 dark:border-gray-800 dark:bg-gray-900">
        <MicIcon /> Processing…
      </div>
    )
  }
  if (tx.status === 'failed' || !tx.full_text) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-500 dark:border-red-900 dark:bg-red-950/20">
        Transcript unavailable
      </div>
    )
  }

  const utterances = tx.utterances ?? []

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <button onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/40 rounded-lg">
        <span className="flex items-center gap-1.5">
          <MicIcon />
          {utterances.length > 0 ? `${utterances.length} utterances` : 'Transcript'}
          {tx.completed_at && <span className="font-normal text-gray-400">· {fmtDate(tx.completed_at)}</span>}
        </span>
        <ChevronDown open={open} />
      </button>
      {open && (
        <div className="border-t border-gray-100 px-3 py-3 dark:border-gray-800">
          {utterances.length > 0 ? (
            <div className="space-y-2">
              {utterances.map((u, i) => (
                <div key={i} className={`flex gap-2 text-xs ${u.speaker !== 'Agent' ? 'flex-row-reverse' : ''}`}>
                  <span className={`shrink-0 self-start rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    u.speaker === 'Agent'
                      ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400'
                      : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400'
                  }`}>{u.speaker}</span>
                  <p className={`flex-1 leading-relaxed text-gray-700 dark:text-gray-300 ${u.speaker !== 'Agent' ? 'text-right' : ''}`}>
                    {u.transcript}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="whitespace-pre-wrap font-mono text-xs text-gray-500">{tx.full_text}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Lead detail panel ──────────────────────────────────────────────────────────

function LeadDetail({
  lead,
  firmSlug,
  stageName,
  onClose,
  onCall,
  calling,
}: {
  lead: Lead
  firmSlug: string
  stageName: string
  onClose: () => void
  onCall: () => void
  calling: boolean
}) {
  const [contact, setContact]       = useState<ContactDetail | null>(null)
  const [calls, setCalls]           = useState<CallRecord[]>([])
  const [aiSummary, setAiSummary]   = useState<string | null>(null)
  const [aiUpdatedAt, setAiUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    setLoading(true)
    setAiSummary(null)
    setAiUpdatedAt(null)

    if (lead.contactId) {
      Promise.all([
        fetch(`/api/dialer/contacts/${lead.contactId}`)
          .then(r => r.json()).then(d => setContact(d.contact ?? null)),
        fetch(`/api/dialer/leads-db/${lead.contactId}`)
          .then(r => r.json()).then(d => {
            setCalls(d.calls ?? [])
            setAiSummary(d.aiSummary ?? null)
            setAiUpdatedAt(d.aiUpdatedAt ?? null)
          }),
      ]).catch(console.error).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [lead.contactId])

  const totalCalls     = calls.length
  const connected      = calls.filter(c => c.call_status === 'completed').length
  const totalSec       = calls.reduce((s, c) => s + (c.duration ?? 0), 0)
  const txCount        = calls.reduce((s, c) => s + c.transcripts.filter(t => t.status === 'completed').length, 0)

  const displayTags = contact?.tags ?? lead.tags ?? []

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">
              {contact?.name ?? lead.name}
            </h2>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${FIRM_PILL[firmSlug] ?? 'bg-gray-100 text-gray-600'}`}>
              {firmSlug === 'lhp' ? 'Larry H. Parker' : firmSlug === 'lhp_s' ? 'LHP (Spanish)' : firmSlug === 'jm' ? 'J&M' : 'Fears Law'}
            </span>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {stageName}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            {(contact?.phone ?? lead.phone) && <span className="font-mono">{contact?.phone ?? lead.phone}</span>}
            {(contact?.email ?? lead.email) && <span className="truncate">{contact?.email ?? lead.email}</span>}
          </div>
          {displayTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {displayTags.map(t => (
                <span key={t} className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="ml-3 flex items-center gap-1.5 shrink-0">
          <button
            onClick={onCall}
            disabled={calling || !lead.phone}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PhoneIcon />
            {calling ? 'Calling…' : 'Call'}
          </button>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200">
            <XIcon />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-4 gap-2">
            {([
              ['Calls',       totalCalls],
              ['Connected',   connected],
              ['Talk time',   fmtDuration(totalSec)],
              ['Transcripts', txCount],
            ] as [string, string | number][]).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
                <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>

          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />)}
            </div>
          )}

          {/* AI Case Summary — always visible */}
          {!loading && (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 dark:border-cyan-900 dark:bg-cyan-950/20">
              <div className="flex items-center justify-between border-b border-cyan-100 px-4 py-2.5 dark:border-cyan-900">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
                  Case Summary
                </p>
                {aiUpdatedAt && (
                  <p className="text-[10px] text-cyan-600/60 dark:text-cyan-500/50">
                    Updated {fmtDate(aiUpdatedAt)}
                  </p>
                )}
              </div>
              {aiSummary ? (
                <ul className="px-4 py-3 space-y-1.5">
                  {aiSummary
                    .split('\n')
                    .map(line => line.replace(/^•\s*/, '').trim())
                    .filter(Boolean)
                    .map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                        {line}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm italic text-gray-400 dark:text-gray-600">
                  No contact has been made yet — a summary will appear here after the first connected call.
                </p>
              )}
            </div>
          )}

          {/* Case Info (GHL custom fields) */}
          {!loading && contact && contact.customFields.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <p className="border-b border-gray-100 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-800">
                Case Info
              </p>
              <div className="px-4 py-3 pb-4 grid grid-cols-2 gap-x-6 gap-y-3">
                {contact.customFields.map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
                    <p className="text-sm text-gray-800 break-words dark:text-gray-200">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Call history */}
          {!loading && (
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Call History {totalCalls > 0 && `(${totalCalls})`}
              </p>
              {calls.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400 dark:border-gray-800">
                  No calls recorded yet
                </p>
              ) : (
                <div className="space-y-3">
                  {calls.map(call => (
                    <div key={call.call_sid} className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <PhoneIcon />
                          <span className={`text-xs font-semibold capitalize ${callStatusColor(call.call_status)}`}>
                            {call.call_status ?? 'unknown'}
                          </span>
                          {call.disposition && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                              {call.disposition}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-xs text-gray-600 dark:text-gray-300">{fmtDuration(call.duration)}</p>
                          <p className="text-[10px] text-gray-400">{fmtTime(call.started_at)}</p>
                        </div>
                      </div>
                      {call.rep_identity && (
                        <p className="border-t border-gray-100 px-4 py-1.5 text-[10px] capitalize text-gray-400 dark:border-gray-800">
                          Rep: {call.rep_identity}
                        </p>
                      )}
                      {call.recording_url && (
                        <div className="border-t border-gray-100 px-4 py-2 dark:border-gray-800">
                          <audio
                            controls
                            className="w-full h-8"
                            src={`/api/dialer/recording?url=${encodeURIComponent(call.recording_url)}`}
                          />
                        </div>
                      )}
                      {call.transcripts.length > 0 && (
                        <div className="border-t border-gray-100 px-4 py-2 space-y-2 dark:border-gray-800">
                          {call.transcripts.map(tx => <TranscriptViewer key={tx.id} tx={tx} />)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Stage section ──────────────────────────────────────────────────────────────

function StageSection({
  stage,
  isSelected,
  onSelect,
}: {
  stage: Campaign
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
        isSelected
          ? 'bg-gray-200 text-gray-900 font-semibold dark:bg-gray-800 dark:text-white'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200'
      }`}
    >
      <span className="truncate">{stage.stageName}</span>
      {stage.leadCount > 0 && (
        <span className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
          isSelected
            ? 'bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
            : 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
        }`}>
          {stage.leadCount}
        </span>
      )}
    </button>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { deviceReady, placeCall, callState } = useCall()
  const [campaigns, setCampaigns]       = useState<Campaign[]>([])
  const [campsLoading, setCampsLoading] = useState(true)
  const [openFirms, setOpenFirms]       = useState<Set<string>>(new Set(['lhp', 'lhp_s', 'fears', 'jm']))
  const [selectedStage, setSelectedStage] = useState<Campaign | null>(null)
  const [leads, setLeads]               = useState<Lead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(false)
  const [leadsTotal, setLeadsTotal]     = useState(0)
  const [nextCursor, setNextCursor]     = useState<string | null>(null)
  const [nextCursorId, setNextCursorId] = useState<string | null>(null)
  const [loadingMore, setLoadingMore]   = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [search, setSearch]             = useState('')
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load campaigns
  useEffect(() => {
    fetch('/api/dialer/campaigns')
      .then(r => r.json())
      .then(d => {
        const list: Campaign[] = d.campaigns ?? []
        list.sort((a, b) => a.position - b.position)
        setCampaigns(list)
        const first = list.find(c => c.leadCount > 0)
        if (first) setSelectedStage(first)
      })
      .catch(console.error)
      .finally(() => setCampsLoading(false))
  }, [])

  const fetchLeads = useCallback((stage: Campaign, q: string, append = false, cursor = '', cursorId = '') => {
    if (!append) { setLeadsLoading(true); setLeads([]) }
    else setLoadingMore(true)

    const params = new URLSearchParams({ pipelineId: stage.pipelineId, stageId: stage.stageId, limit: '50' })
    if (q)        params.set('search', q)
    if (cursor)   params.set('cursor', cursor)
    if (cursorId) params.set('cursorId', cursorId)

    fetch(`/api/dialer/leads?${params}`)
      .then(r => r.json())
      .then(d => {
        setLeads(prev => append ? [...prev, ...(d.leads ?? [])] : (d.leads ?? []))
        setLeadsTotal(d.meta?.total ?? 0)
        setNextCursor(d.meta?.nextCursor ?? null)
        setNextCursorId(d.meta?.nextCursorId ?? null)
      })
      .catch(console.error)
      .finally(() => { setLeadsLoading(false); setLoadingMore(false) })
  }, [])

  // Reload when stage changes
  useEffect(() => {
    if (!selectedStage) return
    setSelectedLead(null)
    setSearch('')
    fetchLeads(selectedStage, '')
  }, [selectedStage?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search — re-fetches from server on every keystroke (after 300ms)
  function handleSearch(q: string) {
    setSearch(q)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    if (!selectedStage) return
    searchDebounce.current = setTimeout(() => fetchLeads(selectedStage, q), 300)
  }

  function loadMore() {
    if (!selectedStage || !nextCursor || loadingMore) return
    fetchLeads(selectedStage, search, true, nextCursor, nextCursorId ?? '')
  }

  // Group campaigns by firm
  const firms = Array.from(new Set(campaigns.map(c => c.firmSlug)))
  const byFirm: Record<string, Campaign[]> = {}
  for (const c of campaigns) {
    if (!byFirm[c.firmSlug]) byFirm[c.firmSlug] = []
    byFirm[c.firmSlug].push(c)
  }

  const filteredLeads = leads

  function toggleFirm(slug: string) {
    setOpenFirms(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  return (
    <div className="flex h-full">

      {/* ── Column 1: Firm / stage nav ── */}
      <div className="w-52 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950 overflow-y-auto flex">
        <div className="border-b border-gray-200 px-3 py-3 dark:border-gray-800">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">All Leads</p>
        </div>

        {campsLoading && (
          <div className="p-3 space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-6 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />)}
          </div>
        )}

        <div className="flex-1 p-2 space-y-3">
          {firms.map(slug => {
            const firmCamps = byFirm[slug] ?? []
            const firmName  = firmCamps[0]?.firm ?? slug
            const open      = openFirms.has(slug)
            const dot       = FIRM_COLORS[slug] ?? 'bg-gray-400'

            return (
              <div key={slug}>
                <button
                  onClick={() => toggleFirm(slug)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                  <span className="flex-1 truncate">{firmName}</span>
                  <ChevronDown open={open} />
                </button>

                {open && (
                  <div className="mt-0.5 ml-4 space-y-0.5">
                    {firmCamps.map(stage => (
                      <StageSection
                        key={stage.id}
                        stage={stage}
                        isSelected={selectedStage?.id === stage.id}
                        onSelect={() => setSelectedStage(stage)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Column 2: Lead list ── */}
      <div className={`flex flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 transition-all ${selectedLead ? 'w-64 shrink-0' : 'flex-1'}`}>
        {/* Stage header */}
        {selectedStage ? (
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedStage.stageName}</p>
                <p className="text-[11px] text-gray-400">
                  {selectedStage.firm} · {selectedStage.leadCount} leads
                  {search && leadsTotal !== selectedStage.leadCount && ` · ${leadsTotal} match`}
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative mt-2">
              <svg viewBox="0 0 20 20" fill="currentColor"
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <input
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Filter…"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-7 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
              />
            </div>
          </div>
        ) : (
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <p className="text-sm text-gray-400">Select a stage</p>
          </div>
        )}

        {/* Lead rows */}
        <div className="flex-1 overflow-y-auto">
          {leadsLoading && (
            <div className="p-3 space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          )}

          {!leadsLoading && filteredLeads.length === 0 && (
            <div className="flex h-40 items-center justify-center text-center">
              <p className="text-xs text-gray-400">
                {search ? `No results for "${search}"` : 'No leads in this stage.'}
              </p>
            </div>
          )}

          {filteredLeads.map((lead, i) => (
            <button
              key={lead.id}
              onClick={() => setSelectedLead(lead)}
              className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-800/40 dark:hover:bg-gray-900/50 ${
                selectedLead?.id === lead.id
                  ? 'border-l-2 border-l-cyan-500 bg-cyan-50/60 dark:bg-cyan-950/20'
                  : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{lead.name}</p>
                  <p className="font-mono text-xs text-gray-500">{lead.phone}</p>
                  {lead.email && !selectedLead && (
                    <p className="truncate text-xs text-gray-400">{lead.email}</p>
                  )}
                  {lead.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {lead.tags.slice(0, 2).map(t => (
                        <span key={t} className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-500">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-gray-400">{i + 1}</span>
              </div>
            </button>
          ))}

          {/* Load more */}
          {nextCursor && !search && (
            <div className="px-4 py-3 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-900"
              >
                {loadingMore ? 'Loading…' : `Load more (${leadsTotal - leads.length} remaining)`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Column 3: Lead detail ── */}
      {selectedLead && selectedStage && (
        <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950">
          <LeadDetail
            lead={selectedLead}
            firmSlug={selectedStage.firmSlug}
            stageName={selectedStage.stageName}
            onClose={() => setSelectedLead(null)}
            calling={callState !== 'idle'}
            onCall={() => {
              if (!deviceReady || callState !== 'idle' || !selectedLead.phone) return
              const callLead: CallLead = {
                id:           selectedLead.id,
                name:         selectedLead.name,
                phone:        selectedLead.phone,
                email:        selectedLead.email,
                company:      selectedLead.company,
                source:       selectedStage.firmSlug,
                tags:         selectedLead.tags,
                lastActivity: selectedLead.lastActivity,
                contactId:    selectedLead.contactId,
              }
              placeCall(callLead, {
                firm:       selectedStage.firmSlug,
                campaign:   selectedStage.stageName,
                campaignId: selectedStage.stageId,
              })
            }}
          />
        </div>
      )}
    </div>
  )
}
