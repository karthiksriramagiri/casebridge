'use client'

import { useState, useEffect, useRef } from 'react'
import { useCall } from '../../_context/call'
import { useAuth } from '../../_context/auth'
import { StatusPill } from '../../_components/StatusPill'
import { MiniQueue } from '../../_components/MiniQueue'
import { DISPOSITIONS, type RepStatus, type Disposition, type Lead, type QueueLead } from '../../_types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ContactDetail {
  id: string; name: string; email: string; phone: string
  country: string; timezone: string; source: string; dateAdded: string
  tags: string[]; attributionSource: string
  customFields: Array<{ label: string; value: string }>
}

interface Campaign {
  id: string; name: string; firm: string; firmSlug: string
  pipelineId: string; stageId: string; stageName: string
  leadCount: number; position: number
}

interface GHLLead {
  id: string; name: string; phone: string; email: string
  company: string; contactId: string; tags: string[]; lastActivity: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function fmtTZ(iso: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true,
      month: 'short', day: 'numeric',
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString()
  }
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function MicIcon()     { return <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" /></svg> }
function MicOffIcon()  { return <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M13 6a3 3 0 00-5.91-.63L4.46 2.74A1 1 0 002.99 4.2l13 13a1 1 0 101.42-1.42l-1.84-1.83A6.965 6.965 0 0017 8a1 1 0 10-2 0c0 1.3-.46 2.49-1.21 3.42L12.41 10A3 3 0 0013 8V6z" clipRule="evenodd" /></svg> }
function PhoneOffIcon(){ return <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" /></svg> }
function PauseIcon()   { return <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg> }
function GridIcon()    { return <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> }
function PhoneInIcon() { return <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" /></svg> }

// ── Tag Editor ─────────────────────────────────────────────────────────────────

function TagEditor({ lead, onTagsChange }: { lead: Lead; onTagsChange: (tags: string[]) => void }) {
  const [tags,   setTags]   = useState<string[]>(lead.tags)
  const [input,  setInput]  = useState('')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => { setTags(lead.tags); setSaved(false) }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function syncToGHL(nextTags: string[]) {
    if (!lead.contactId) return
    setSaving(true); setSaved(false)
    try {
      const res = await fetch(`/api/dialer/contacts/${lead.contactId}/tags`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: nextTags }),
      })
      if (res.ok) { setSaved(true); onTagsChange(nextTags); setTimeout(() => setSaved(false), 2000) }
    } finally { setSaving(false) }
  }

  function addTag() {
    const tag = input.trim().toLowerCase().replace(/\s+/g, '-')
    if (!tag || tags.includes(tag)) { setInput(''); return }
    const next = [...tags, tag]; setTags(next); setInput(''); syncToGHL(next)
  }
  function removeTag(t: string) { const next = tags.filter(x => x !== t); setTags(next); syncToGHL(next) }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Tags</p>
        {saving && <span className="text-[10px] text-gray-400 animate-pulse">Saving…</span>}
        {saved  && <span className="text-[10px] text-green-600 dark:text-green-400">Saved ✓</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
        {tags.map(t => (
          <span key={t} className="group inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            {t}
            <button onClick={() => removeTag(t)} className="opacity-40 hover:opacity-100 transition-opacity leading-none">×</button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-gray-400">No tags</span>}
      </div>
      <div className="flex gap-1.5">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()}
          placeholder="Add tag…"
          className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600" />
        <button onClick={addTag} disabled={!input.trim()}
          className="rounded-md bg-cyan-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-40">Add</button>
      </div>
    </div>
  )
}

// ── DTMF Pad ───────────────────────────────────────────────────────────────────

const DTMF_KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],['*','0','#']]
function DtmfPad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {DTMF_KEYS.flat().map(k => (
        <button key={k} onClick={() => onKey(k)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-gray-100 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 active:bg-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
          {k}
        </button>
      ))}
    </div>
  )
}

// ── Disposition Modal ──────────────────────────────────────────────────────────

function DispositionModal({ lead, leadTimezone, onSubmit }: {
  lead: Lead
  leadTimezone: string
  onSubmit: (d: Disposition, callbackAt: string, stop: boolean, context?: string) => void
}) {
  const [selected,     setSelected]     = useState<Disposition | null>(null)
  const [callbackTime, setCallbackTime] = useState('')
  const [context,      setContext]      = useState('')

  const localEquivalent = callbackTime && leadTimezone
    ? (() => {
        try {
          return fmtTZ(callbackTime, leadTimezone)
        } catch { return '' }
      })()
    : ''

  const outsideHours = callbackTime && leadTimezone
    ? (() => {
        try {
          const f = new Intl.DateTimeFormat('en-US', {
            timeZone: leadTimezone, hour: 'numeric', minute: 'numeric', hour12: false
          })
          const parts = f.formatToParts(new Date(callbackTime))
          const h = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0')
          const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
          const t = h * 60 + m
          return t < 8 * 60 + 30 || t > 20 * 60 + 30
        } catch { return false }
      })()
    : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Disposition Call</h2>
          <p className="mt-0.5 text-sm text-gray-500">{lead.name} · {lead.phone}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          {DISPOSITIONS.map(d => (
            <button key={d.id} onClick={() => setSelected(d)}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-all ${d.color} ${selected?.id === d.id ? 'ring-2 ring-gray-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-gray-900' : 'opacity-80 hover:opacity-100'}`}>
              {d.label}
            </button>
          ))}
        </div>

        {selected?.category === 'CALLBACK' && (
          <div className="border-t border-gray-200 px-4 pb-4 space-y-2 dark:border-gray-800">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Callback time (your local time)
              {leadTimezone && <span className="ml-1 text-gray-400">— lead is in {leadTimezone}</span>}
            </label>
            <input type="datetime-local" value={callbackTime} onChange={e => setCallbackTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            {localEquivalent && (
              <p className="text-xs text-gray-500">
                In their timezone: <span className="font-medium text-gray-700 dark:text-gray-300">{localEquivalent}</span>
              </p>
            )}
            {outsideHours && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                ⚠ This time is outside the lead's calling hours (8:30am–8:30pm their time)
              </p>
            )}
            <input
              value={context} onChange={e => setContext(e.target.value)}
              placeholder="Callback notes (optional)…"
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
            />
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          <button disabled={!selected} onClick={() => selected && onSubmit(selected, callbackTime, true, context)}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><rect x="4" y="4" width="12" height="12" rx="1" /></svg>
            Stop
          </button>
          <button
            disabled={!selected || (selected.category === 'CALLBACK' && !callbackTime)}
            onClick={() => selected && onSubmit(selected, callbackTime, false, context)}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40">
            Submit →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Admin Lead Picker ──────────────────────────────────────────────────────────

function AdminLeadPicker({
  onCall,
  disabled,
  todayDisps,
}: {
  onCall: (lead: GHLLead, campaign: Campaign) => void
  disabled: boolean
  todayDisps: Array<{ lead: string; result: string; time: string; color: string }>
}) {
  const [campaigns,         setCampaigns]         = useState<Campaign[]>([])
  const [campaignsLoading,  setCampaignsLoading]  = useState(true)
  const [selectedCampaign,  setSelectedCampaign]  = useState<Campaign | null>(null)
  const [leads,             setLeads]             = useState<GHLLead[]>([])
  const [leadsLoading,      setLeadsLoading]      = useState(false)
  const [nextCursor,        setNextCursor]        = useState<string | null>(null)
  const [nextCursorId,      setNextCursorId]      = useState<string | null>(null)
  const [hasMore,           setHasMore]           = useState(false)
  const [loadingMore,       setLoadingMore]       = useState(false)
  const [manualDial,        setManualDial]        = useState('')

  // Fetch campaigns once
  useEffect(() => {
    setCampaignsLoading(true)
    fetch('/api/dialer/campaigns')
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns ?? []))
      .catch(() => {})
      .finally(() => setCampaignsLoading(false))
  }, [])

  // Fetch leads when campaign changes
  useEffect(() => {
    if (!selectedCampaign) { setLeads([]); setNextCursor(null); setNextCursorId(null); setHasMore(false); return }
    setLeadsLoading(true)
    fetch(`/api/dialer/leads?pipelineId=${selectedCampaign.pipelineId}&stageId=${selectedCampaign.stageId}&limit=20`)
      .then(r => r.json())
      .then(d => {
        setLeads(d.leads ?? [])
        setNextCursor(d.meta?.nextCursor ?? null)
        setNextCursorId(d.meta?.nextCursorId ?? null)
        setHasMore(d.meta?.hasMore ?? false)
      })
      .catch(() => {})
      .finally(() => setLeadsLoading(false))
  }, [selectedCampaign?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMore() {
    if (!selectedCampaign || !hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({
        pipelineId: selectedCampaign.pipelineId,
        stageId:    selectedCampaign.stageId,
        limit:      '20',
      })
      if (nextCursor)   params.set('cursor', nextCursor)
      if (nextCursorId) params.set('cursorId', nextCursorId)
      const d = await fetch(`/api/dialer/leads?${params}`).then(r => r.json())
      setLeads(prev => [...prev, ...(d.leads ?? [])])
      setNextCursor(d.meta?.nextCursor ?? null)
      setNextCursorId(d.meta?.nextCursorId ?? null)
      setHasMore(d.meta?.hasMore ?? false)
    } finally {
      setLoadingMore(false)
    }
  }

  const { placeCall: ctxPlaceCall, deviceReady, identity } = useCall()

  function handleManualDial() {
    if (!manualDial || !deviceReady) return
    ctxPlaceCall({
      id: 'manual', name: manualDial, phone: manualDial,
      email: '', company: '', source: 'manual',
      tags: [], lastActivity: new Date().toISOString(), contactId: '',
    })
    setManualDial('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Campaign selector */}
      <div className="border-b border-gray-200 px-4 pt-3 pb-3 dark:border-gray-800">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Pipeline Stage
        </label>
        {campaignsLoading ? (
          <div className="h-8 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
        ) : (
          <select
            value={selectedCampaign?.id ?? ''}
            onChange={e => {
              const c = campaigns.find(x => x.id === e.target.value) ?? null
              setSelectedCampaign(c)
            }}
            className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="">Select a stage…</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.leadCount})</option>
            ))}
          </select>
        )}
      </div>

      {/* Lead list */}
      <div className="flex-1 overflow-y-auto">
        {!selectedCampaign && (
          <p className="px-4 py-6 text-center text-xs text-gray-400">Select a stage to see leads.</p>
        )}
        {selectedCampaign && leadsLoading && (
          <div className="space-y-2 p-4">
            {[1,2,3,4,5].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />)}
          </div>
        )}
        {selectedCampaign && !leadsLoading && leads.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-gray-400">No leads in this stage.</p>
        )}
        {leads.map(lead => (
          <button
            key={lead.id}
            onClick={() => selectedCampaign && !disabled && onCall(lead, selectedCampaign)}
            disabled={disabled || !lead.phone}
            className="w-full border-b border-gray-100 px-4 py-2.5 text-left transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800/40 dark:hover:bg-gray-900"
          >
            <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{lead.name}</p>
            <p className="text-xs font-mono text-gray-500">{lead.phone || 'No phone'}</p>
            {lead.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {lead.tags.slice(0, 3).map(t => (
                  <span key={t} className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] text-gray-600 dark:bg-gray-700 dark:text-gray-400">{t}</span>
                ))}
              </div>
            )}
          </button>
        ))}
        {hasMore && (
          <div className="px-4 py-3">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-md border border-gray-300 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      {/* Manual dial */}
      <div className="border-t border-gray-200 p-3 dark:border-gray-800">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Manual dial</label>
        <div className="flex gap-1.5">
          <input
            value={manualDial}
            onChange={e => setManualDial(e.target.value)}
            placeholder="+1 (555) 000-0000"
            onKeyDown={e => e.key === 'Enter' && handleManualDial()}
            className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
          />
          <button
            onClick={handleManualDial}
            disabled={!deviceReady || !manualDial || disabled}
            className="rounded-md bg-cyan-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
          >
            Dial
          </button>
        </div>
      </div>

      {/* Today's calls */}
      <div className="max-h-44 overflow-y-auto border-t border-gray-200 dark:border-gray-800">
        <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Today ({todayDisps.length})</p>
        {todayDisps.map((d, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-1.5">
            <div>
              <p className="truncate text-xs text-gray-700 max-w-[140px] dark:text-gray-300">{d.lead}</p>
              <p className={`text-xs ${d.color}`}>{d.result}</p>
            </div>
            <span className="text-xs text-gray-400">{d.time}</span>
          </div>
        ))}
        {todayDisps.length === 0 && <p className="px-4 py-2 text-xs text-gray-400">No calls yet today.</p>}
      </div>
    </div>
  )
}

// ── Agent Page ─────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const {
    deviceReady, deviceError, callState, setCallState,
    currentLead, setCurrentLead, callDuration,
    muted, toggleMute, hangUp, sendDtmf,
    placeCall: ctxPlaceCall, identity, setIdentity,
  } = useCall()

  const { name: authName, identity: authIdentity, role, signOut } = useAuth()
  const isAdmin = role === 'ADMIN'

  useEffect(() => {
    if (authIdentity) setIdentity(authIdentity)
  }, [authIdentity]) // eslint-disable-line react-hooks/exhaustive-deps

  const [status,          setStatus]          = useState<RepStatus>('OFFLINE')
  const [held,            setHeld]            = useState(false)
  const [showDtmf,        setShowDtmf]        = useState(false)
  const [dtmfBuffer,      setDtmfBuffer]      = useState('')
  const [showDisposition, setShowDisposition] = useState(false)
  const [todayDisps,      setTodayDisps]      = useState<Array<{ lead: string; result: string; time: string; color: string }>>([])
  const [contactDetail,   setContactDetail]   = useState<ContactDetail | null>(null)
  const [contactLoading,  setContactLoading]  = useState(false)
  const [aiSummary,       setAiSummary]       = useState<string | null>(null)
  const [queueRefreshKey, setQueueRefreshKey] = useState(0)

  // Track current queue item for disposition reporting (reps only)
  const currentQueueLead = useRef<QueueLead | null>(null)
  const prevCallState    = useRef(callState)

  // Sync status with device ready
  useEffect(() => {
    if (deviceReady && status === 'OFFLINE') setStatus('READY')
    if (!deviceReady) setStatus('OFFLINE')
  }, [deviceReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ping rep status on change
  useEffect(() => {
    if (!identity) return
    fetch('/api/dialer/rep-status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity, status }),
    }).catch(() => {})
  }, [status, identity])

  // Detect call transitions
  useEffect(() => {
    if (prevCallState.current !== 'wrapup' && callState === 'wrapup') {
      setHeld(false); setShowDtmf(false); setDtmfBuffer('')
      setStatus('WRAPUP')
      setTimeout(() => setShowDisposition(true), 300)
    }
    if (callState === 'connected') setStatus('ON_CALL')
    if (callState === 'ringing')   setStatus('ON_CALL')
    prevCallState.current = callState
  }, [callState])

  // Load contact detail when lead changes
  useEffect(() => {
    const cid = currentLead?.contactId
    if (!cid) { setContactDetail(null); setAiSummary(null); return }
    setContactLoading(true)
    Promise.all([
      fetch(`/api/dialer/contacts/${cid}`).then(r => r.json()),
      fetch(`/api/dialer/leads-db/${cid}`).then(r => r.json()),
    ]).then(([cd, ld]) => {
      setContactDetail(cd.contact ?? null)
      setAiSummary(ld.aiSummary ?? null)
    }).catch(() => { setContactDetail(null); setAiSummary(null) })
      .finally(() => setContactLoading(false))
  }, [currentLead?.contactId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rep queue call handler
  async function handleQueueCall(ql: QueueLead) {
    if (!deviceReady || status !== 'READY') return
    currentQueueLead.current = ql
    const lead: Lead = {
      id:           ql.queueId,
      name:         ql.name,
      phone:        ql.phone,
      email:        '',
      company:      '',
      source:       ql.firm,
      tags:         [],
      lastActivity: new Date().toISOString(),
      contactId:    ql.contactId,
    }
    await ctxPlaceCall(lead, {
      firm:     ql.firm,
      campaign: ql.stageName,
      queueId:  ql.queueId,
    })
    // Refresh queue immediately so the called lead drops out and #6-10 slide in
    setQueueRefreshKey(k => k + 1)
  }

  // Admin lead call handler (no queue tracking)
  async function handleAdminCall(ghlLead: GHLLead, campaign: Campaign) {
    if (!deviceReady || status !== 'READY') return
    currentQueueLead.current = null
    const lead: Lead = {
      id:           ghlLead.id,
      name:         ghlLead.name,
      phone:        ghlLead.phone,
      email:        ghlLead.email,
      company:      ghlLead.company,
      source:       campaign.firmSlug,
      tags:         ghlLead.tags,
      lastActivity: ghlLead.lastActivity,
      contactId:    ghlLead.contactId,
    }
    await ctxPlaceCall(lead, {
      firm:       campaign.firmSlug,
      campaign:   campaign.stageName,
      campaignId: campaign.stageId,
    })
  }

  function onDtmfKey(key: string) { sendDtmf(key); setDtmfBuffer(b => b + key) }

  async function handleDisposition(d: Disposition, callbackTime: string, stop: boolean, context?: string) {
    const disposedLead = currentLead
    const ql           = currentQueueLead.current
    const duration     = callDuration

    setShowDisposition(false)
    setTodayDisps(prev => [{
      lead:   disposedLead?.name ?? '—',
      result: d.label,
      time:   new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      color:  d.category === 'POSITIVE' ? 'text-green-600 dark:text-green-400'
            : d.category === 'CALLBACK' ? 'text-blue-600 dark:text-blue-400'
            : 'text-red-600 dark:text-red-400',
    }, ...prev])

    setCurrentLead(null)
    setCallState('idle')
    setStatus('READY')
    currentQueueLead.current = null

    // Report disposition to queue engine (reps only, when called from queue)
    if (ql?.queueId) {
      const callbackAt = callbackTime ? new Date(callbackTime).toISOString() : undefined
      fetch('/api/dialer/queue/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId:         ql.queueId,
          disposition:     d.label,
          repIdentity:     identity,
          callDuration:    duration,
          callbackAt,
          callbackContext: context || undefined,
        }),
      }).catch(console.error).finally(() => {
        setQueueRefreshKey(k => k + 1)
      })
    } else {
      setQueueRefreshKey(k => k + 1)
    }
  }

  const leadTimezone = contactDetail?.timezone
    ?? (currentLead?.source === 'lhp' ? 'America/Los_Angeles' : 'America/Chicago')

  return (
    <div className="flex h-full">
      {/* ── Left rail ── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
        {isAdmin ? (
          /* Admin: campaign picker + GHL lead list */
          <AdminLeadPicker
            onCall={handleAdminCall}
            disabled={callState !== 'idle' || !deviceReady || status !== 'READY'}
            todayDisps={todayDisps}
          />
        ) : (
          /* Rep: managed queue */
          <>
            <div className="flex-1 min-h-0">
              <MiniQueue
                repIdentity={identity}
                disabled={callState !== 'idle' || !deviceReady || status !== 'READY'}
                onCall={handleQueueCall}
                refreshKey={queueRefreshKey}
                activeQueueId={currentQueueLead.current?.queueId ?? null}
              />
            </div>

            {/* Manual dial */}
            <div className="border-t border-gray-200 p-3 dark:border-gray-800">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Manual dial</label>
              <div className="flex gap-1.5">
                <input
                  onChange={e => {}}
                  placeholder="+1 (555) 000-0000"
                  onKeyDown={e => {
                    const val = (e.target as HTMLInputElement).value
                    if (e.key === 'Enter' && val && deviceReady && status === 'READY') {
                      ctxPlaceCall({ id: 'manual', name: val, phone: val, email: '', company: '', source: 'manual', tags: [], lastActivity: new Date().toISOString(), contactId: '' })
                    }
                  }}
                  className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                />
                <button
                  disabled={!deviceReady || status !== 'READY'}
                  onClick={e => {
                    const input = (e.currentTarget.previousElementSibling as HTMLInputElement)
                    if (input?.value) ctxPlaceCall({ id: 'manual', name: input.value, phone: input.value, email: '', company: '', source: 'manual', tags: [], lastActivity: new Date().toISOString(), contactId: '' })
                  }}
                  className="rounded-md bg-cyan-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-40">
                  Dial
                </button>
              </div>
            </div>

            {/* Today's calls */}
            <div className="max-h-44 overflow-y-auto border-t border-gray-200 dark:border-gray-800">
              <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Today ({todayDisps.length})</p>
              {todayDisps.map((d, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-1.5">
                  <div>
                    <p className="truncate text-xs text-gray-700 max-w-[140px] dark:text-gray-300">{d.lead}</p>
                    <p className={`text-xs ${d.color}`}>{d.result}</p>
                  </div>
                  <span className="text-xs text-gray-400">{d.time}</span>
                </div>
              ))}
              {todayDisps.length === 0 && <p className="px-4 py-2 text-xs text-gray-400">No calls yet today.</p>}
            </div>
          </>
        )}
      </div>

      {/* ── Center: softphone ── */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        {deviceError && (
          <div className="w-full max-w-sm rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
            ⚠ Twilio error: {deviceError}
          </div>
        )}
        {!deviceReady && !deviceError && (
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs text-gray-400 animate-pulse dark:border-gray-800 dark:bg-gray-900/60">
            Connecting to Twilio…
          </div>
        )}

        {/* Status bar */}
        <div className="flex w-full max-w-sm items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div>
            <p className="text-xs text-gray-500">Your status</p>
            <StatusPill status={status} size="lg" pulse />
          </div>
          <div className="flex gap-2">
            {(['READY', 'PAUSED'] as RepStatus[]).map(s => (
              <button key={s} onClick={() => { if (callState === 'idle' && deviceReady) setStatus(s) }}
                disabled={callState !== 'idle' || !deviceReady || status === s}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${status === s ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300'}`}>
                {s === 'READY' ? 'Ready' : 'Pause'}
              </button>
            ))}
          </div>
        </div>

        {/* Call card */}
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {callState === 'idle' ? (
            <div className="flex flex-col items-center gap-3 py-10 px-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600">
                <PhoneInIcon />
              </div>
              <p className="text-sm text-gray-500">
                {deviceReady
                  ? isAdmin ? 'Ready — pick a lead from the left' : 'Ready — use the queue on the left'
                  : 'Initialising device…'}
              </p>
            </div>
          ) : (
            <>
              <div className={`rounded-t-xl px-5 py-4 ${callState === 'ringing' ? 'bg-amber-50 dark:bg-amber-950/50' : callState === 'wrapup' ? 'bg-violet-50 dark:bg-violet-950/50' : 'bg-cyan-50 dark:bg-cyan-950/50'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{currentLead?.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{currentLead?.phone}</p>
                    {currentQueueLead.current && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {currentQueueLead.current.stageName} · {currentQueueLead.current.firm.toUpperCase()}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {callState === 'ringing'   && <span className="text-xs font-medium text-amber-600 dark:text-amber-400 animate-pulse">Ringing…</span>}
                    {callState === 'connected' && <span className="text-xl font-mono font-bold text-cyan-700 dark:text-cyan-300">{fmtDuration(callDuration)}</span>}
                    {callState === 'wrapup'    && <span className="text-xs font-medium text-violet-600 dark:text-violet-400">Wrap-up</span>}
                  </div>
                </div>
                {currentQueueLead.current?.isCallback && (
                  <div className="mt-2 rounded-md bg-blue-100 px-2.5 py-1.5 text-xs text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                    📅 Callback — {currentQueueLead.current.callbackContext || 'scheduled callback'}
                  </div>
                )}
              </div>

              {callState !== 'wrapup' && (
                <div className="px-5 py-4">
                  <div className="mb-4 flex items-center justify-center gap-3">
                    <button onClick={toggleMute}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${muted ? 'border-red-300 bg-red-50 text-red-500 dark:border-red-500 dark:bg-red-900/50 dark:text-red-400' : 'border-gray-300 bg-gray-100 text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {muted ? <MicOffIcon /> : <MicIcon />}
                    </button>
                    <button onClick={() => setHeld(h => !h)}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${held ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-500 dark:bg-amber-900/50 dark:text-amber-400' : 'border-gray-300 bg-gray-100 text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                      <PauseIcon />
                    </button>
                    <button onClick={() => setShowDtmf(d => !d)}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${showDtmf ? 'border-cyan-300 bg-cyan-50 text-cyan-600 dark:border-cyan-500 dark:bg-cyan-900/50 dark:text-cyan-400' : 'border-gray-300 bg-gray-100 text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                      <GridIcon />
                    </button>
                    <button onClick={hangUp}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-colors hover:bg-red-500">
                      <PhoneOffIcon />
                    </button>
                  </div>
                  {showDtmf && (
                    <div className="flex flex-col items-center gap-2">
                      <input readOnly value={dtmfBuffer} placeholder="—"
                        className="w-full rounded border border-gray-300 bg-gray-50 px-3 py-1.5 text-center font-mono text-sm text-cyan-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-cyan-300" />
                      <DtmfPad onKey={onDtmfKey} />
                    </div>
                  )}
                  {held && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400">
                      Call is on hold
                    </div>
                  )}
                </div>
              )}
              {callState === 'wrapup' && (
                <div className="px-5 py-6 text-center">
                  <p className="text-sm text-gray-500">Select a disposition to continue…</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* AI Case Summary */}
        <div className="w-full max-w-sm rounded-xl border border-cyan-200 bg-white shadow-sm dark:border-cyan-900 dark:bg-gray-900">
          <div className="border-b border-cyan-100 px-4 py-2.5 dark:border-cyan-900/60">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Case Summary</p>
          </div>
          <div className="px-4 py-3 max-h-48 overflow-y-auto">
            {contactLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />)}
              </div>
            ) : aiSummary ? (
              <ul className="space-y-1.5">
                {aiSummary.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean).map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs italic text-gray-400 dark:text-gray-600">
                {currentLead ? 'Generating summary…' : 'Select a lead to see their case summary.'}
              </p>
            )}
          </div>
        </div>

        {/* Identity */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Signed in as</span>
          <span className="font-medium text-gray-600 dark:text-gray-300">{authName}</span>
          <span>·</span>
          <span className={deviceReady ? 'text-green-600 dark:text-green-500' : 'text-gray-400'}>
            {deviceReady ? '● device ready' : '○ not registered'}
          </span>
          <span>·</span>
          <button onClick={signOut} className="text-gray-400 hover:text-red-400 transition-colors">Sign out</button>
        </div>
      </div>

      {/* ── Right rail: Lead Detail ── */}
      <div className="w-72 shrink-0 border-l border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950 overflow-y-auto">
        {currentLead ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Lead Detail</p>
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400">Live</span>
            </div>

            <div className="space-y-2.5">
              {([
                ['Name',     currentLead.name],
                ['Phone',    currentLead.phone],
                ['Country',  contactDetail?.country],
                ['Timezone', contactDetail?.timezone],
                ['Added',    contactDetail?.dateAdded ? new Date(contactDetail.dateAdded).toLocaleDateString() : ''],
                ['Via',      contactDetail?.attributionSource],
              ] as [string, string | undefined][]).map(([label, value]) => value ? (
                <div key={label}>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200 break-words">{value}</p>
                </div>
              ) : null)}
            </div>

            <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
              <TagEditor key={currentLead.id} lead={currentLead} onTagsChange={() => {}} />
            </div>

            <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Case Summary</p>
              {contactLoading ? (
                <div className="space-y-1.5">
                  {[1,2,3].map(i => <div key={i} className="h-3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />)}
                </div>
              ) : aiSummary ? (
                <ul className="space-y-1.5">
                  {aiSummary.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean).map((line, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs italic text-gray-400 dark:text-gray-600">No summary yet.</p>
              )}
            </div>

            <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Notes</p>
              <textarea placeholder="Add call notes…" rows={3}
                className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 placeholder-gray-400 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-600" />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center p-4">
            <p className="text-xs text-gray-400">Lead details appear here<br />while on a call.</p>
          </div>
        )}
      </div>

      {showDisposition && currentLead && (
        <DispositionModal
          lead={currentLead}
          leadTimezone={leadTimezone}
          onSubmit={handleDisposition}
        />
      )}
    </div>
  )
}
