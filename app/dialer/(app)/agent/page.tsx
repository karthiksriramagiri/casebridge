'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../_lib/supabase'
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tags</p>
        {saving && <span className="text-[10px] text-muted-foreground animate-pulse">Saving…</span>}
        {saved  && <span className="text-[10px] text-success">Saved ✓</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
        {tags.map(t => (
          <span key={t} className="group inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
            {t}
            <button onClick={() => removeTag(t)} className="opacity-40 hover:opacity-100 transition-opacity leading-none">×</button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags</span>}
      </div>
      <div className="flex gap-1.5">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()}
          placeholder="Add tag…"
          className="flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
        <button onClick={addTag} disabled={!input.trim()}
          className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary disabled:opacity-40">Add</button>
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
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-input bg-muted text-sm font-semibold text-foreground transition-colors hover:bg-muted active:bg-muted-foreground/30">
          {k}
        </button>
      ))}
    </div>
  )
}

// ── Disposition Modal ──────────────────────────────────────────────────────────

function DispositionModal({ lead, leadTimezone, firm, stageName, onSubmit, onCallAgain }: {
  lead: Lead
  leadTimezone: string
  firm: string
  stageName: string
  onSubmit: (d: Disposition, callbackAt: string, stop: boolean, context?: string, nqReason?: string) => void
  onCallAgain: () => void
}) {
  const [selected,     setSelected]     = useState<Disposition | null>(null)
  // Default callback to 2 hours from now (prevents accidental wrong-date entries)
  const [callbackTime, setCallbackTime] = useState(() => {
    const d = new Date(Date.now() + 2 * 3600 * 1000)
    d.setMinutes(0, 0, 0)
    return d.toISOString().slice(0, 16)   // "YYYY-MM-DDTHH:MM" for datetime-local
  })
  const [context,      setContext]      = useState('')
  const [nqReason,     setNqReason]     = useState('')

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
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Disposition Call</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{lead.name} · {lead.phone}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          {DISPOSITIONS.filter(d => {
            const isMIA = stageName.toLowerCase() === 'mia'
            if (d.label === 'MIA Reconnected') return isMIA
            return true
          }).map(d => (
            <button key={d.id} onClick={() => setSelected(d)}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-all ${d.color} ${selected?.id === d.id ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card' : 'opacity-80 hover:opacity-100'}`}>
              {d.label}
            </button>
          ))}
        </div>

        {selected?.category === 'CALLBACK' && (
          <div className="border-t border-border px-4 pb-4 space-y-2">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Callback time (your local time)
              {leadTimezone && <span className="ml-1 text-muted-foreground">— lead is in {leadTimezone}</span>}
            </label>
            <input type="datetime-local" value={callbackTime} onChange={e => setCallbackTime(e.target.value)}
              className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
            {localEquivalent && (
              <p className="text-xs text-muted-foreground">
                In their timezone: <span className="font-medium text-foreground">{localEquivalent}</span>
              </p>
            )}
            {outsideHours && (
              <p className="rounded-lg border border-warning/40 bg-warning/20 px-3 py-2 text-xs text-warning">
                ⚠ This time is outside the lead's calling hours (8:30am–8:30pm their time)
              </p>
            )}
            <input
              value={context} onChange={e => setContext(e.target.value)}
              placeholder="Callback notes (optional)…"
              className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
        )}

        {selected?.requiresReason && (
          <div className="border-t border-border px-4 pb-4 space-y-2">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Reason for not qualifying
            </label>
            <input
              value={nqReason} onChange={e => setNqReason(e.target.value)}
              placeholder="Enter reason…"
              className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            disabled={!selected || (selected.category === 'CALLBACK' && !callbackTime) || (selected.requiresReason && !nqReason.trim())}
            onClick={() => selected && onSubmit(selected, callbackTime, true, context, nqReason)}
            className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><rect x="4" y="4" width="12" height="12" rx="1" /></svg>
            Stop
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onCallAgain}
              className="flex items-center gap-1.5 rounded-lg border border-success/40 px-3 py-2 text-sm font-medium text-success transition-colors hover:bg-success/15">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" /></svg>
              Call Again
            </button>
            <button
              disabled={!selected || (selected.category === 'CALLBACK' && !callbackTime) || (selected.requiresReason && !nqReason.trim())}
              onClick={() => selected && onSubmit(selected, callbackTime, false, context, nqReason)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40">
              Submit & Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Admin Lead Picker ──────────────────────────────────────────────────────────

// ── Rep Lead Browser (collapsible, bottom of left rail) ──────────────────────

function RepLeadBrowser({
  onCall,
  disabled,
}: {
  onCall: (lead: GHLLead, campaign: Campaign) => void
  disabled: boolean
}) {
  const [open,              setOpen]              = useState(true)
  const [campaigns,         setCampaigns]         = useState<Campaign[]>([])
  const [campaignsLoading,  setCampaignsLoading]  = useState(false)
  const [selectedCampaign,  setSelectedCampaign]  = useState<Campaign | null>(null)
  const [leads,             setLeads]             = useState<GHLLead[]>([])
  const [leadsLoading,      setLeadsLoading]      = useState(false)
  const [nextCursor,        setNextCursor]        = useState<string | null>(null)
  const [nextCursorId,      setNextCursorId]      = useState<string | null>(null)
  const [hasMore,           setHasMore]           = useState(false)
  const [loadingMore,       setLoadingMore]       = useState(false)
  const [search,            setSearch]            = useState('')

  // Fetch campaigns on mount
  useEffect(() => {
    if (campaigns.length > 0) return
    setCampaignsLoading(true)
    fetch('/api/dialer/campaigns')
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns ?? []))
      .catch(() => {})
      .finally(() => setCampaignsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch leads when campaign changes
  useEffect(() => {
    if (!selectedCampaign) { setLeads([]); return }
    setLeadsLoading(true)
    setSearch('')
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

  const filtered = search
    ? leads.filter(l => l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search))
    : leads

  return (
    <div className="border-t border-border">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-muted transition-colors"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Browse Leads</p>
        <svg
          viewBox="0 0 20 20" fill="currentColor"
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="flex flex-col" style={{ maxHeight: '50vh' }}>
          {/* Stage picker */}
          <div className="px-4 pb-2">
            {campaignsLoading ? (
              <div className="h-7 animate-pulse rounded-md bg-muted" />
            ) : (
              <select
                value={selectedCampaign?.id ?? ''}
                onChange={e => setSelectedCampaign(campaigns.find(x => x.id === e.target.value) ?? null)}
                className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Select a stage…</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.leadCount})</option>
                ))}
              </select>
            )}
          </div>

          {/* Search within stage */}
          {selectedCampaign && !leadsLoading && leads.length > 0 && (
            <div className="px-4 pb-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          )}

          {/* Lead list */}
          <div className="flex-1 overflow-y-auto">
            {!selectedCampaign && (
              <p className="px-4 py-4 text-center text-xs text-muted-foreground">Select a stage to browse leads.</p>
            )}
            {selectedCampaign && leadsLoading && (
              <div className="space-y-2 p-4">
                {[1,2,3].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}
              </div>
            )}
            {selectedCampaign && !leadsLoading && filtered.length === 0 && (
              <p className="px-4 py-4 text-center text-xs text-muted-foreground">
                {search ? 'No matches.' : 'No leads in this stage.'}
              </p>
            )}
            {filtered.map(lead => (
              <button
                key={lead.id}
                onClick={() => selectedCampaign && !disabled && onCall(lead, selectedCampaign)}
                disabled={disabled || !lead.phone}
                className="w-full border-b border-border px-4 py-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <p className="truncate text-xs font-medium text-foreground">{lead.name}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{lead.phone || 'No phone'}</p>
              </button>
            ))}
            {hasMore && !search && (
              <div className="px-4 py-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full rounded-md border border-input py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Admin Lead Picker ───────────────────────────────────────────────────────

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
      <div className="border-b border-border px-4 pt-3 pb-3">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pipeline Stage
        </label>
        {campaignsLoading ? (
          <div className="h-8 animate-pulse rounded-md bg-muted" />
        ) : (
          <select
            value={selectedCampaign?.id ?? ''}
            onChange={e => {
              const c = campaigns.find(x => x.id === e.target.value) ?? null
              setSelectedCampaign(c)
            }}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
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
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">Select a stage to see leads.</p>
        )}
        {selectedCampaign && leadsLoading && (
          <div className="space-y-2 p-4">
            {[1,2,3,4,5].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}
          </div>
        )}
        {selectedCampaign && !leadsLoading && leads.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">No leads in this stage.</p>
        )}
        {leads.map(lead => (
          <button
            key={lead.id}
            onClick={() => selectedCampaign && !disabled && onCall(lead, selectedCampaign)}
            disabled={disabled || !lead.phone}
            className="w-full border-b border-border px-4 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <p className="truncate text-sm font-medium text-foreground">{lead.name}</p>
            <p className="text-xs font-mono text-muted-foreground">{lead.phone || 'No phone'}</p>
            {lead.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {lead.tags.slice(0, 3).map(t => (
                  <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{t}</span>
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
              className="w-full rounded-md border border-input py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>

      {/* Manual dial */}
      <div className="border-t border-border p-3">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Manual dial</label>
        <div className="flex gap-1.5">
          <input
            value={manualDial}
            onChange={e => setManualDial(e.target.value)}
            placeholder="+1 (555) 000-0000"
            onKeyDown={e => e.key === 'Enter' && handleManualDial()}
            className="flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            onClick={handleManualDial}
            disabled={!deviceReady || !manualDial || disabled}
            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary disabled:opacity-40"
          >
            Dial
          </button>
        </div>
      </div>

      {/* Today's calls */}
      <div className="max-h-44 overflow-y-auto border-t border-border">
        <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Today ({todayDisps.length})</p>
        {todayDisps.map((d, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-1.5">
            <div>
              <p className="truncate text-xs text-foreground max-w-[140px]">{d.lead}</p>
              <p className={`text-xs ${d.color}`}>{d.result}</p>
            </div>
            <span className="text-xs text-muted-foreground">{d.time}</span>
          </div>
        ))}
        {todayDisps.length === 0 && <p className="px-4 py-2 text-xs text-muted-foreground">No calls yet today.</p>}
      </div>
    </div>
  )
}

// ── Agent Page ─────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const {
    deviceReady, deviceError, callState, setCallState,
    currentLead, setCurrentLead, callDuration,
    muted, toggleMute, hangUp, sendDtmf, callerIdUsed, customerCallSid,
    placeCall: ctxPlaceCall,
    identity, setIdentity,
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
  const [contactDetail,     setContactDetail]     = useState<ContactDetail | null>(null)
  const [contactLoading,    setContactLoading]    = useState(false)
  const [aiSummary,         setAiSummary]         = useState<string | null>(null)
  const [selectedQueueLead, setSelectedQueueLead] = useState<QueueLead | null>(null)
  const [queueRefreshKey, setQueueRefreshKey] = useState(0)
  const [answeredBy,        setAnsweredBy]        = useState<string | null>(null)
  const autoDialStopped = useRef(false)
  const statusRef       = useRef(status)
  const deviceReadyRef  = useRef(deviceReady)
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { deviceReadyRef.current = deviceReady }, [deviceReady])
  const [showDocuseal,      setShowDocuseal]      = useState(false)
  const [docusealSending,   setDocusealSending]   = useState(false)
  const [docusealSent,      setDocusealSent]      = useState(false)
  const [dsFirm,            setDsFirm]            = useState('')
  const [dsAccidentDate,    setDsAccidentDate]    = useState('')
  const [dsAccidentCity,    setDsAccidentCity]    = useState('')
  const [dsDob,             setDsDob]             = useState('')
  const [showPassenger,     setShowPassenger]     = useState(false)
  const [passengerSending,  setPassengerSending]  = useState(false)
  const [passengerSent,     setPassengerSent]     = useState(false)
  const [pName,             setPName]             = useState('')
  const [pPhone,            setPPhone]            = useState('+1')
  const [pDob,              setPDob]              = useState('')
  const [pAccidentDate,     setPAccidentDate]     = useState('')
  const [pAccidentCity,     setPAccidentCity]     = useState('')

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
    // Buffer fill is handled by fillAllReadyReps (admin page on-mount)
    // and fillBuffer in the disposition route (per-call top-up).
    // Do NOT call refill here — it races with disposition and causes double-assignment.
  }, [status, identity])

  // Set OFFLINE when tab/browser closes
  useEffect(() => {
    if (!identity) return
    function handleUnload() {
      navigator.sendBeacon('/api/dialer/rep-status', JSON.stringify({ identity, status: 'OFFLINE' }))
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [identity])

  // Keepalive: refresh rep-status updated_at every 60s so live-floor knows we're alive
  useEffect(() => {
    if (!identity || status === 'OFFLINE') return
    const interval = setInterval(() => {
      fetch('/api/dialer/rep-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, status }),
      }).catch(() => {})
    }, 60_000)
    return () => clearInterval(interval)
  }, [identity, status])

  // Detect call transitions
  useEffect(() => {
    if (prevCallState.current !== 'wrapup' && callState === 'wrapup') {
      setHeld(false); setShowDtmf(false); setDtmfBuffer('')
      setStatus('WRAPUP')
      setTimeout(() => setShowDisposition(true), 300)

      // Poll for AI summary — recording → Deepgram → Claude takes ~30-60s
      const cid = currentLead?.contactId
      if (cid) {
        let attempts = 0
        const poll = setInterval(() => {
          attempts++
          fetch(`/api/dialer/leads-db/${cid}`).then(r => r.json()).then(d => {
            if (d.aiSummary) { setAiSummary(d.aiSummary); clearInterval(poll) }
          }).catch(() => {})
          if (attempts >= 6) clearInterval(poll) // stop after ~60s
        }, 10_000)
        return () => clearInterval(poll)
      }
    }
    if (callState === 'connected') setStatus('ON_CALL')
    if (callState === 'ringing')   { setStatus('ON_CALL'); setAnsweredBy(null) }
    if (callState === 'idle')      setAnsweredBy(null)
    prevCallState.current = callState
  }, [callState]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to AMD (Answering Machine Detection) results via active session updates
  useEffect(() => {
    if (!identity || callState === 'idle') return
    const db = createClient()
    const channel = db.channel(`amd-${identity}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'dialer_active_sessions',
        filter: `rep_identity=eq.${identity}`,
      }, (payload) => {
        const ab = (payload.new as any)?.answered_by
        if (ab) setAnsweredBy(ab)
      })
      .subscribe()
    return () => { db.removeChannel(channel) }
  }, [identity, callState])

  // Load contact detail when lead changes (active call or selected from queue)
  const detailContactId = currentLead?.contactId ?? selectedQueueLead?.contactId
  useEffect(() => {
    if (!detailContactId) { setContactDetail(null); setAiSummary(null); return }
    setContactLoading(true)
    setShowDocuseal(false); setDocusealSent(false); setDsAccidentDate(''); setDsAccidentCity(''); setDsDob('')
    setShowPassenger(false); setPassengerSent(false); setPName(''); setPPhone('+1'); setPDob(''); setPAccidentDate(''); setPAccidentCity('')
    Promise.all([
      fetch(`/api/dialer/contacts/${detailContactId}`).then(r => r.json()),
      fetch(`/api/dialer/leads-db/${detailContactId}`).then(r => r.json()),
    ]).then(([cd, ld]) => {
      setContactDetail(cd.contact ?? null)
      setAiSummary(ld.aiSummary ?? null)
    }).catch(() => { setContactDetail(null); setAiSummary(null) })
      .finally(() => setContactLoading(false))
  }, [detailContactId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rep queue call handler
  async function handleQueueCall(ql: QueueLead) {
    if (!deviceReady || status !== 'READY') return
    autoDialStopped.current = false   // reset — auto-dial continues unless they click Stop
    setSelectedQueueLead(null)
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

  async function handleDisposition(d: Disposition, callbackTime: string, stop: boolean, context?: string, nqReason?: string) {
    const disposedLead = currentLead
    const ql           = currentQueueLead.current
    const duration     = callDuration

    setShowDisposition(false)
    setTodayDisps(prev => [{
      lead:   disposedLead?.name ?? '—',
      result: d.label,
      time:   new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }),
      color:  d.category === 'POSITIVE' ? 'text-success'
            : d.category === 'CALLBACK' ? 'text-primary'
            : 'text-destructive',
    }, ...prev])

    setCurrentLead(null)
    setCallState('idle')
    setStatus('READY')
    currentQueueLead.current = null

    // Track whether rep clicked Stop
    autoDialStopped.current = stop

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
          firm:            ql.firm || undefined,
          nqReason:        nqReason?.trim() || undefined,
        }),
      }).catch(console.error).finally(() => {
        setQueueRefreshKey(k => k + 1)
        if (!stop) setTimeout(() => autoDialNext(), 1500)
      })
    } else {
      setQueueRefreshKey(k => k + 1)
      if (!stop) setTimeout(() => autoDialNext(), 1500)
    }
  }

  // Auto-dial: fetch the next buffered lead and call it
  // Uses refs to avoid stale closures from setTimeout in handleDisposition
  async function autoDialNext() {
    if (autoDialStopped.current || !deviceReadyRef.current || statusRef.current !== 'READY') return
    try {
      const repId = authIdentity || identity
      const res  = await fetch(`/api/dialer/queue/next?rep=${encodeURIComponent(repId)}&count=5`)
      const data = await res.json()
      const leads = data.leads ?? []
      if (leads.length === 0) return
      const item = leads[0]
      const ql: QueueLead = {
        queueId:          item.id ?? item.queueId,
        contactId:        item.contact_id ?? item.contactId,
        name:             item.contact_name ?? item.name,
        phone:            item.phone,
        firm:             item.firm,
        stageName:        item.stage_name ?? item.stageName,
        timezone:         item.lead_timezone ?? item.timezone ?? 'America/Los_Angeles',
        isCallback:       false,
        callbackAt:       item.callback_at ?? null,
        callbackContext:  null,
        ownerRepIdentity: item.owner_rep ?? null,
        priority:         item.priority,
      }
      autoDialStopped.current = false
      setSelectedQueueLead(null)
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
      setQueueRefreshKey(k => k + 1)
    } catch { /* queue empty or error — just stop */ }
  }

  // ── Call checklist state ──
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})

  // Reset checklist when a new call starts
  useEffect(() => {
    if (callState === 'ringing') {
      setChecklist({})
    }
  }, [callState])

  function toggleCheck(key: string) {
    setChecklist(prev => {
      const next = { ...prev, [key]: !prev[key] }
      // Send Slack notification when "Connected" is checked
      if (key === 'connected' && next.connected) {
        const firm = currentQueueLead.current?.firm ?? currentLead?.source ?? ''
        const firmLabel = firm === 'lhp' ? 'LHP' : firm === 'lhp_s' ? 'LHP (ES)' : firm === 'jm' ? 'J&M' : firm === 'fears' ? 'Fears' : firm.toUpperCase()
        const stage = currentQueueLead.current?.stageName ?? ''
        fetch('/api/dialer/slack-connected', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repName: authName,
            leadName: currentLead?.name ?? 'Unknown',
            phone: currentLead?.phone ?? '',
            firm: firmLabel,
            stage,
            duration: callDuration,
          }),
        }).catch(console.error)
      }
      // Persist checklist to DB
      if (customerCallSid && currentLead?.contactId) {
        fetch('/api/dialer/call-checklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callSid: customerCallSid,
            contactId: currentLead.contactId,
            repIdentity: authIdentity || identity,
            checklist: next,
          }),
        }).catch(console.error)
      }
      return next
    })
  }

  const leadTimezone = contactDetail?.timezone
    ?? (['lhp', 'lhp_s', 'jm'].includes(currentLead?.source ?? '') ? 'America/Los_Angeles' : 'America/Chicago')

  return (
    /* Three rails: the queue, the phone, the lead.

       The phone is the middle one and the widest because it is the only
       part a rep looks at while talking. The queue on the left answers
       "who is next" and the detail on the right answers "who is this" —
       both are read between calls, not during one.

       `h-dvh` rather than `h-full`: the shell is a flex row now, and a
       percentage height inside it resolved to nothing, which is what
       collapsed the three rails into a stack. */
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      {/* ── Left rail: what to call ── */}
      <div className="flex w-full shrink-0 flex-col border-b border-border bg-muted/50 md:h-full md:w-72 md:border-b-0 md:border-r">
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
                repIdentity={authIdentity || identity}
                disabled={callState !== 'idle' || !deviceReady || status !== 'READY'}
                onCall={handleQueueCall}
                onSelect={(ql) => setSelectedQueueLead(ql)}
                selectedId={selectedQueueLead?.queueId ?? null}
                refreshKey={queueRefreshKey}
                activeQueueId={currentQueueLead.current?.queueId ?? null}
              />
            </div>

            {/* Manual dial */}
            <div className="border-t border-border p-3">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Manual dial</label>
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
                  className="flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <button
                  disabled={!deviceReady || status !== 'READY'}
                  onClick={e => {
                    const input = (e.currentTarget.previousElementSibling as HTMLInputElement)
                    if (input?.value) ctxPlaceCall({ id: 'manual', name: input.value, phone: input.value, email: '', company: '', source: 'manual', tags: [], lastActivity: new Date().toISOString(), contactId: '' })
                  }}
                  className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary disabled:opacity-40">
                  Dial
                </button>
              </div>
            </div>

            {/* Today's calls */}
            <div className="max-h-44 overflow-y-auto border-t border-border">
              <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Today ({todayDisps.length})</p>
              {todayDisps.map((d, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-1.5">
                  <div>
                    <p className="truncate text-xs text-foreground max-w-[140px]">{d.lead}</p>
                    <p className={`text-xs ${d.color}`}>{d.result}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{d.time}</span>
                </div>
              ))}
              {todayDisps.length === 0 && <p className="px-4 py-2 text-xs text-muted-foreground">No calls yet today.</p>}
            </div>

            {/* Browse all leads */}
            <RepLeadBrowser
              onCall={handleAdminCall}
              disabled={callState !== 'idle' || !deviceReady || status !== 'READY'}
            />
          </>
        )}
      </div>

      {/* ── Center: the phone ── */}
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6">
        {deviceError && (
          <div className="w-full max-w-sm rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            ⚠ Twilio error: {deviceError}
          </div>
        )}
        {!deviceReady && !deviceError && (
          <div className="w-full max-w-sm rounded-lg border border-border bg-card px-4 py-2 text-xs text-muted-foreground animate-pulse">
            Connecting to Twilio…
          </div>
        )}

        {/* Status bar */}
        <div className="flex w-full max-w-sm items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground">Your status</p>
            <StatusPill status={status} size="lg" pulse />
          </div>
          <div className="flex gap-2">
            {(['READY', 'PAUSED'] as RepStatus[]).map(s => (
              <button key={s} onClick={() => { if (callState === 'idle' && deviceReady) setStatus(s) }}
                disabled={callState !== 'idle' || !deviceReady || status === s}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${status === s ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30'}`}>
                {s === 'READY' ? 'Ready' : 'Pause'}
              </button>
            ))}
          </div>
        </div>

        {/* Call card */}
        <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-lg">
          {callState === 'idle' ? (
            <div className="flex flex-col items-center gap-3 py-10 px-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
                <PhoneInIcon />
              </div>
              <p className="text-sm text-muted-foreground">
                {deviceReady
                  ? isAdmin ? 'Ready — pick a lead from the left' : 'Ready — use the queue on the left'
                  : 'Initialising device…'}
              </p>
            </div>
          ) : (
            <>
              <div className={`rounded-t-xl px-5 py-4 ${callState === 'ringing' ? 'bg-warning/20' : callState === 'wrapup' ? 'bg-accent' : 'bg-accent'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-semibold text-foreground">{currentLead?.name}</p>
                    <p className="text-sm text-muted-foreground">{currentLead?.phone}</p>
                    {currentQueueLead.current && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {currentQueueLead.current.stageName} · {currentQueueLead.current.firm.toUpperCase()}
                      </p>
                    )}
                    {callerIdUsed && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Calling from: <span className="font-mono">{callerIdUsed}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {callState === 'ringing'   && <span className="text-xs font-medium text-warning animate-pulse">Ringing…</span>}
                    {callState === 'connected' && <span className="text-xl font-mono font-bold text-primary">{fmtDuration(callDuration)}</span>}
                    {callState === 'wrapup'    && <span className="text-xs font-medium text-primary">Wrap-up</span>}
                  </div>
                </div>
                {currentQueueLead.current?.isCallback && (
                  <div className="mt-2 rounded-md bg-accent px-2.5 py-1.5 text-xs text-primary">
                    📅 Callback — {currentQueueLead.current.callbackContext || 'scheduled callback'}
                  </div>
                )}
                {answeredBy && answeredBy.startsWith('machine') && (
                  <div className="mt-2 rounded-md bg-warning/20 px-2.5 py-1.5 text-xs font-medium text-warning">
                    📠 Voicemail detected
                  </div>
                )}
              </div>

              {/* ── Call Checklist ── */}
              {callState !== 'wrapup' && (
                <div className="px-5 py-3 border-t border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Call Checklist</p>
                  <div className="space-y-1.5">
                    {[
                      { key: 'connected', label: 'Connected' },
                      { key: 'accident', label: 'Did you ask how the accident happened?' },
                      { key: 'fault', label: 'Did you ask who is at fault?' },
                      { key: 'insurance', label: 'Did you ask about insurance?' },
                      { key: 'pains', label: 'Did you ask if the PC has pains?' },
                      ...((currentLead?.source === 'fears') ? [{ key: 'treat', label: 'Did you ask if the PC is willing to treat? (TX only)' }] : []),
                    ].map(item => (
                      <label key={item.key} className="flex items-start gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={!!checklist[item.key]}
                          onChange={() => toggleCheck(item.key)}
                          className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                        />
                        <span className={`text-xs transition-colors ${checklist[item.key] ? 'text-success line-through' : 'text-foreground'}`}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {callState !== 'wrapup' && (
                <div className="px-5 py-4">
                  <div className="mb-4 flex items-center justify-center gap-3">
                    <button onClick={toggleMute}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${muted ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-input bg-muted text-muted-foreground hover:border-input hover:text-foreground'}`}>
                      {muted ? <MicOffIcon /> : <MicIcon />}
                    </button>
                    <button onClick={() => setHeld(h => !h)}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${held ? 'border-warning/40 bg-warning/20 text-warning' : 'border-input bg-muted text-muted-foreground hover:border-input hover:text-foreground'}`}>
                      <PauseIcon />
                    </button>
                    <button onClick={() => setShowDtmf(d => !d)}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${showDtmf ? 'border-primary bg-accent text-primary' : 'border-input bg-muted text-muted-foreground hover:border-input hover:text-foreground'}`}>
                      <GridIcon />
                    </button>
                    <button onClick={hangUp}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-white shadow-lg transition-colors hover:bg-destructive">
                      <PhoneOffIcon />
                    </button>
                  </div>
                  {showDtmf && (
                    <div className="flex flex-col items-center gap-2">
                      <input readOnly value={dtmfBuffer} placeholder="—"
                        className="w-full rounded border border-input bg-muted/50 px-3 py-1.5 text-center font-mono text-sm text-primary" />
                      <DtmfPad onKey={onDtmfKey} />
                    </div>
                  )}
                  {held && (
                    <div className="mt-3 rounded-lg border border-warning/40 bg-warning/20 px-3 py-2 text-center text-xs font-medium text-warning">
                      Call is on hold
                    </div>
                  )}
                </div>
              )}
              {callState === 'wrapup' && (
                <div className="px-5 py-6 text-center">
                  <p className="text-sm text-muted-foreground">Select a disposition to continue…</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* AI Case Summary */}
        <div className="w-full max-w-sm rounded-xl border border-primary bg-card shadow-sm">
          <div className="border-b border-primary/30 px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Case Summary</p>
          </div>
          <div className="px-4 py-3 max-h-48 overflow-y-auto">
            {contactLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-3 animate-pulse rounded bg-muted" />)}
              </div>
            ) : aiSummary ? (
              <ul className="space-y-1.5">
                {aiSummary.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean).map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                {currentLead ? 'Generating summary…' : 'Select a lead to see their case summary.'}
              </p>
            )}
          </div>
        </div>

        {/* Identity */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Signed in as</span>
          <span className="font-medium text-muted-foreground">{authName}</span>
          <span>·</span>
          <span className={deviceReady ? 'text-success' : 'text-muted-foreground'}>
            {deviceReady ? '● device ready' : '○ not registered'}
          </span>
          <span>·</span>
          <button onClick={signOut} className="text-muted-foreground hover:text-destructive transition-colors">Sign out</button>
        </div>
      </div>

      {/* ── Right rail: who it is ── */}
      <div className="w-full shrink-0 overflow-y-auto border-t border-border bg-muted/50 md:h-full md:w-80 md:border-t-0 md:border-l">
        {(currentLead || selectedQueueLead) ? (() => {
          const isLive = !!currentLead
          const displayName  = currentLead?.name  ?? selectedQueueLead?.name  ?? ''
          const displayPhone = currentLead?.phone ?? selectedQueueLead?.phone ?? ''
          const displayFirm  = selectedQueueLead?.firm ?? currentLead?.source ?? ''
          const displayStage = selectedQueueLead?.stageName ?? ''
          const displayTz    = contactDetail?.timezone ?? selectedQueueLead?.timezone ?? ''
          return (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lead Detail</p>
                {isLive && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-primary">Live</span>
                )}
                {!isLive && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Preview</span>
                )}
              </div>

              {/* ── Send Docuseal ── */}
              {!showDocuseal && !docusealSent && (
                <button
                  onClick={() => { setShowDocuseal(true); setDocusealSent(false); setDsFirm('') }}
                  className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary active:bg-primary">
                  Send Docuseal
                </button>
              )}
              {docusealSent && (
                <div className="rounded-lg border border-success/40 bg-success/15 px-3 py-2 text-center">
                  <p className="text-xs font-medium text-success">Docuseal sent &amp; tagged</p>
                </div>
              )}
              {showDocuseal && !docusealSent && !dsFirm && (
                <div className="rounded-lg border border-primary bg-accent/50 p-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Select Firm</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { key: 'lhp',     label: 'Larry H. Parker' },
                      { key: 'lhp_s',   label: 'LHP Spanish' },
                      { key: 'jm',      label: 'Jacoby & Meyers' },
                      { key: 'cowen',   label: 'Cowen Law' },
                      { key: 'fears',   label: 'Fears Law' },
                      { key: 'bernard', label: 'Bernard Law' },
                      { key: 'eb',      label: 'EB Agreement' },
                    ] as const).map(f => (
                      <button key={f.key} onClick={() => setDsFirm(f.key)}
                        className="rounded-md border border-input px-2 py-2 text-xs font-medium text-foreground hover:bg-accent hover:border-primary hover:text-primary transition-colors">
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setShowDocuseal(false); setDsFirm('') }}
                    className="w-full rounded-md border border-input py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted mt-1">
                    Cancel
                  </button>
                </div>
              )}
              {showDocuseal && !docusealSent && dsFirm && (
                <div className="rounded-lg border border-primary bg-accent/50 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Docuseal Details</p>
                    <button onClick={() => setDsFirm('')} className="text-[10px] text-primary hover:text-primary">Change firm</button>
                  </div>
                  <p className="text-xs font-medium text-foreground">
                    {({ lhp: 'Larry H. Parker', lhp_s: 'LHP Spanish', jm: 'Jacoby & Meyers', cowen: 'Cowen Law', fears: 'Fears Law', bernard: 'Bernard Law', eb: 'EB Agreement' } as Record<string, string>)[dsFirm] ?? dsFirm}
                  </p>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Date of Accident</label>
                    <input
                      type="date"
                      value={dsAccidentDate}
                      onChange={e => setDsAccidentDate(e.target.value)}
                      className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">City of Accident</label>
                    <input
                      type="text"
                      value={dsAccidentCity}
                      onChange={e => setDsAccidentCity(e.target.value)}
                      placeholder="e.g. Los Angeles"
                      className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Date of Birth</label>
                    <input
                      type="date"
                      value={dsDob}
                      onChange={e => setDsDob(e.target.value)}
                      className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setShowDocuseal(false); setDsFirm(''); setDsAccidentDate(''); setDsAccidentCity(''); setDsDob('') }}
                      className="flex-1 rounded-md border border-input py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                      Cancel
                    </button>
                    <button
                      disabled={!dsAccidentDate || !dsAccidentCity || !dsDob || docusealSending}
                      onClick={async () => {
                        const cId = currentLead?.contactId ?? selectedQueueLead?.contactId
                        if (!cId) return
                        setDocusealSending(true)
                        try {
                          const res = await fetch('/api/dialer/docuseal/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              contactId:      cId,
                              fullName:       displayName,
                              phone:          displayPhone,
                              email:          contactDetail?.email ?? '',
                              dateOfAccident: dsAccidentDate,
                              dateOfBirth:    dsDob,
                              cityOfAccident: dsAccidentCity,
                              firm:           dsFirm,
                              existingTags:   contactDetail?.tags ?? [],
                              sentBy:         authIdentity || authName || '',
                            }),
                          })
                          const data = await res.json()
                          if (!res.ok) throw new Error(data.error || 'Send failed')
                          if (contactDetail && data.tags) setContactDetail({ ...contactDetail, tags: data.tags })
                          setShowDocuseal(false)
                          setDocusealSent(true)
                          setDsFirm(''); setDsAccidentDate(''); setDsAccidentCity(''); setDsDob('')
                        } catch (e) {
                          console.error('[Docuseal] send error', e)
                          alert('Failed to send DocuSeal — check console')
                        } finally {
                          setDocusealSending(false)
                        }
                      }}
                      className="flex-1 rounded-md bg-primary py-1.5 text-xs font-semibold text-white hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed">
                      {docusealSending ? 'Sending…' : 'Submit'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Add Passenger (separate from Docuseal) ── */}
              {!showPassenger && !passengerSent && (
                <button
                  onClick={() => { setShowPassenger(true); setPassengerSent(false) }}
                  className="w-full rounded-lg border border-primary py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-accent active:bg-accent">
                  Add Passenger
                </button>
              )}
              {passengerSent && (
                <div className="rounded-lg border border-success/40 bg-success/15 px-3 py-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-success">Passenger contract sent</p>
                  <button onClick={() => { setPassengerSent(false) }}
                    className="text-[10px] text-success hover:text-success">Send Another</button>
                </div>
              )}
              {showPassenger && !passengerSent && (
                <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-600">Passenger Details</p>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Name</label>
                    <input type="text" value={pName} placeholder="Full Name"
                      onChange={e => setPName(e.target.value)}
                      className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-orange-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Phone Number</label>
                    <input type="tel" value={pPhone} placeholder="+1"
                      onChange={e => setPPhone(e.target.value)}
                      className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-orange-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Date of Accident</label>
                    <input type="date" value={pAccidentDate}
                      onChange={e => setPAccidentDate(e.target.value)}
                      className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground focus:border-orange-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">City of Accident</label>
                    <input type="text" value={pAccidentCity} placeholder="e.g. Los Angeles"
                      onChange={e => setPAccidentCity(e.target.value)}
                      className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-orange-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Date of Birth</label>
                    <input type="date" value={pDob}
                      onChange={e => setPDob(e.target.value)}
                      className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground focus:border-orange-500 focus:outline-none" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setShowPassenger(false); setPName(''); setPPhone('+1'); setPDob(''); setPAccidentDate(''); setPAccidentCity('') }}
                      className="flex-1 rounded-md border border-input py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                      Cancel
                    </button>
                    <button
                      disabled={!pName || !pPhone || !pAccidentDate || !pAccidentCity || !pDob || passengerSending}
                      onClick={async () => {
                        const firm = displayFirm.toLowerCase()
                        setPassengerSending(true)
                        try {
                          const res = await fetch('/api/dialer/docuseal/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              contactId:      currentLead?.contactId ?? selectedQueueLead?.contactId ?? 'passenger',
                              fullName:       pName,
                              phone:          pPhone,
                              email:          '',
                              dateOfAccident: pAccidentDate,
                              dateOfBirth:    pDob,
                              cityOfAccident: pAccidentCity,
                              firm:           firm,
                              skipTag:        true,
                            }),
                          })
                          const data = await res.json()
                          if (!res.ok) throw new Error(data.error || 'Send failed')
                          setShowPassenger(false)
                          setPassengerSent(true)
                          setPName(''); setPPhone('+1'); setPDob(''); setPAccidentDate(''); setPAccidentCity('')
                        } catch (e) {
                          console.error('[Passenger] send error', e)
                          alert('Failed to send passenger contract — check console')
                        } finally {
                          setPassengerSending(false)
                        }
                      }}
                      className="flex-1 rounded-md bg-orange-600 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed">
                      {passengerSending ? 'Sending…' : 'Send Contract'}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                {([
                  ['Name',     displayName],
                  ['Phone',    displayPhone],
                  ['Firm',     displayFirm ? displayFirm.toUpperCase() : ''],
                  ['Stage',    displayStage],
                  ['Country',  contactDetail?.country],
                  ['Timezone', displayTz],
                  ['Email',    contactDetail?.email],
                  ['Added',    contactDetail?.dateAdded ? new Date(contactDetail.dateAdded).toLocaleDateString() : ''],
                  ['Via',      contactDetail?.attributionSource],
                ] as [string, string | undefined][]).map(([label, value]) => value ? (
                  <div key={label}>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="text-sm text-foreground break-words">{value}</p>
                  </div>
                ) : null)}
              </div>

              {/* GHL Tags */}
              <div className="border-t border-border pt-3">
                {isLive && currentLead ? (
                  <TagEditor key={currentLead.id} lead={currentLead} onTagsChange={() => {}} />
                ) : (
                  <>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags</p>
                    {contactLoading ? (
                      <div className="flex flex-wrap gap-1">
                        {[1,2,3].map(i => <div key={i} className="h-5 w-14 animate-pulse rounded-full bg-muted" />)}
                      </div>
                    ) : (contactDetail?.tags ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {contactDetail!.tags.map((tag, i) => (
                          <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{tag}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">No tags</p>
                    )}
                  </>
                )}
              </div>

              {/* Custom Fields */}
              {(contactDetail?.customFields ?? []).length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Custom Fields</p>
                  <div className="space-y-1.5">
                    {contactDetail!.customFields.map((cf, i) => (
                      <div key={i}>
                        <p className="text-[10px] font-medium text-muted-foreground">{cf.label}</p>
                        <p className="text-xs text-foreground break-words">{cf.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Case Summary */}
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-primary">Case Summary</p>
                {contactLoading ? (
                  <div className="space-y-1.5">
                    {[1,2,3].map(i => <div key={i} className="h-3 animate-pulse rounded bg-muted" />)}
                  </div>
                ) : aiSummary ? (
                  <ul className="space-y-1.5">
                    {aiSummary.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean).map((line, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs italic text-muted-foreground">No summary yet.</p>
                )}
              </div>

              {/* Notes — only during active call */}
              {isLive && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
                  <textarea placeholder="Add call notes…" rows={3}
                    className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                </div>
              )}
            </div>
          )
        })() : (
          <div className="flex h-full flex-col items-center justify-center text-center p-4">
            <p className="text-xs text-muted-foreground">Click a lead in your queue<br />to preview their details.</p>
          </div>
        )}
      </div>

      {showDisposition && currentLead && (
        <DispositionModal
          lead={currentLead}
          leadTimezone={leadTimezone}
          firm={currentQueueLead.current?.firm ?? ''}
          stageName={currentQueueLead.current?.stageName ?? ''}
          onSubmit={handleDisposition}
          onCallAgain={() => {
            const lead = currentLead
            const ql = currentQueueLead.current
            setShowDisposition(false)
            setCallState('idle')
            if (lead) {
              ctxPlaceCall(lead, ql ? {
                firm:     ql.firm,
                campaign: ql.stageName,
                queueId:  ql.queueId,
              } : undefined)
            }
          }}
        />
      )}
    </div>
  )
}
