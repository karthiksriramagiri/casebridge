'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '../_lib/supabase'
import type { QueueLead } from '../_types'
import { rankLabel } from '../_lib/queue-rules'

interface Props {
  repIdentity:    string
  disabled:       boolean
  onCall:         (lead: QueueLead) => void
  onSelect?:      (lead: QueueLead) => void
  refreshKey?:    number
  activeQueueId?: string | null
  selectedId?:    string | null
}

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears', jm: 'J&M' }

function fmtTime(iso: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
}

function ordinal(n: number) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/* Why this lead, and not another one.

   It used to read the stage and a block name, which told a rep what the
   database called the row rather than why it was in front of them. The tier
   is the answer to that question — "New lead" and "Appointment now" are
   worth saying out loud, and they are exactly the ones the stage name hid. */
function reasonLine(lead: any): string {
  if (lead.isCallback && lead.callbackAt) {
    return `Callback · promised ${fmtTime(lead.callbackAt, lead.timezone)}`
  }
  const tier = rankLabel({
    stage_name:      lead.stageName ?? lead.stage_name ?? null,
    is_callback:     lead.is_callback ?? false,
    lead_created_at: lead.lead_created_at ?? null,
    due_from:        lead.due_from ?? null,
    due_until:       lead.due_until ?? null,
  })
  const attempt = lead.attempt_number && lead.attempts_total
    ? `${ordinal(lead.attempt_number)} of ${lead.attempts_total}`
    : ''
  // Only name the stage when the tier is not already saying it.
  const stage = tier === lead.stageName ? '' : lead.stageName
  return [tier, stage, attempt].filter(Boolean).join(' · ')
}

function LeadRow({ lead, position, repIdentity, selected, onClick }: {
  lead: any
  position: number   // 1-based position in the rep's queue
  repIdentity: string
  selected?: boolean
  onClick?: () => void
}) {
  const isNext = position === 1
  return (
    <div
      onClick={onClick}
      className={`border-b border-border px-4 py-2.5 cursor-pointer transition-colors
      ${selected ? 'bg-accent/40 border-l-2 border-l-cyan-500' : ''}
      ${!selected && isNext ? 'border-l-2 border-l-green-500 bg-success/15/30' : ''}
      ${!selected && lead.is_carryover ? 'bg-warning/20/20' : ''}
      ${!selected ? 'hover:bg-muted/50' : ''}
    `}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold
            ${isNext ? 'bg-success text-white' : 'bg-muted text-muted-foreground'}`}>
            {position}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="truncate text-sm font-medium text-foreground">{lead.name}</p>
            {isNext && (
              <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">Next</span>
            )}
            {lead.isCallback && (
              <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-primary">CB</span>
            )}
            {lead.is_carryover && (
              <span className="shrink-0 rounded-full bg-warning/20 px-1.5 py-0.5 text-[9px] font-bold text-warning">carried</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono">{lead.phone}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground truncate">{reasonLine(lead)}</p>
          {lead.ownerRepIdentity && lead.ownerRepIdentity !== repIdentity && (
            <p className="mt-0.5 text-[10px] text-warning">
              Owner: {lead.ownerRepIdentity} (offline)
            </p>
          )}
        </div>
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground mt-0.5">{FIRM_LABEL[lead.firm] ?? lead.firm}</span>
      </div>
    </div>
  )
}

export function MiniQueue({ repIdentity, disabled, onCall, onSelect, refreshKey, activeQueueId, selectedId }: Props) {
  const [leads,   setLeads]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const dbRef = useRef<ReturnType<typeof createClient> | null>(null)

  const fetchQueue = useCallback(async () => {
    if (!repIdentity) return
    try {
      const res  = await fetch(`/api/dialer/queue/next?rep=${encodeURIComponent(repIdentity)}&count=5`)
      const data = await res.json()
      setLeads((data.leads ?? []).map((item: any) => ({
        queueId:          item.id ?? item.queueId,
        contactId:        item.contact_id ?? item.contactId,
        name:             item.contact_name ?? item.name,
        phone:            item.phone,
        firm:             item.firm,
        stageName:        item.stage_name ?? item.stageName,
        timezone:         item.lead_timezone ?? item.timezone ?? 'America/Los_Angeles',
        isCallback:       !!(item.is_callback && item.callback_at &&
                            new Date(item.callback_at) <= new Date(Date.now() + 60_000)),
        callbackAt:       item.callback_at ?? item.callbackAt,
        callbackContext:  null,
        ownerRepIdentity: item.owner_rep ?? item.ownerRepIdentity,
        priority:         item.priority,
        attempt_number:   item.attempt_number,
        attempts_total:   item.attempts_total,
        is_carryover:     item.is_carryover,
        status:           item.status,
      })))
    } catch (e) {
      console.error('[MiniQueue] fetch error', e)
    } finally {
      setLoading(false)
    }
  }, [repIdentity])

  // Initial load + Supabase Realtime subscription
  useEffect(() => {
    if (!repIdentity) return
    setLoading(true)
    fetchQueue()

    const db = createClient()
    dbRef.current = db

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const channel = db.channel(`mini-queue-${repIdentity}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'dialer_attempts',
        filter: `plan_date=eq.${today}`,
      }, () => {
        // Any attempt inserted/changed/deleted today — re-fetch this rep's buffer
        fetchQueue()
      })
      .subscribe()

    // Fallback poll every 10s
    const poll = setInterval(fetchQueue, 10_000)

    return () => {
      db.removeChannel(channel)
      clearInterval(poll)
    }
  }, [fetchQueue, repIdentity])

  // External refresh trigger (e.g. after placing a call)
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) fetchQueue()
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleLeads = activeQueueId ? leads.filter(l => l.queueId !== activeQueueId) : leads
  const callbacks    = visibleLeads.filter(l => l.isCallback)
  const regular      = visibleLeads.filter(l => !l.isCallback)
  const ordered      = [...callbacks, ...regular]  // callbacks always first
  const next         = ordered[0] ?? null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            My Queue
            {!loading && <span className="ml-1 text-muted-foreground">({ordered.length}/5)</span>}
            {loading  && <span className="animate-pulse text-muted-foreground"> loading…</span>}
          </p>
          {/* Live indicator */}
          <span className="flex items-center gap-1 text-[10px] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* Call Next */}
      <div className="px-4 py-3 border-b border-border">
        <button
          onClick={() => next && !disabled && onCall(next as QueueLead)}
          disabled={!next || disabled}
          className="w-full rounded-lg bg-success py-2 text-sm font-semibold text-white transition-colors hover:bg-success disabled:cursor-not-allowed disabled:opacity-40">
          {next ? 'Call Next' : 'Queue empty'}
        </button>
      </div>

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto">
        {ordered.length === 0 && !loading ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">No leads in queue.</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Leads will appear here as they become due.</p>
          </div>
        ) : (
          ordered.map((lead, i) => (
            <LeadRow
              key={lead.queueId}
              lead={lead}
              position={i + 1}
              repIdentity={repIdentity}
              selected={lead.queueId === selectedId}
              onClick={() => onSelect?.(lead as QueueLead)}
            />
          ))
        )}
      </div>
    </div>
  )
}
