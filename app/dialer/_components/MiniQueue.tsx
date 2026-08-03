'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '../_lib/supabase'
import type { QueueLead } from '../_types'

interface Props {
  repIdentity:    string
  disabled:       boolean
  onCall:         (lead: QueueLead) => void
  onSelect?:      (lead: QueueLead) => void
  refreshKey?:    number
  activeQueueId?: string | null
  selectedId?:    string | null
}

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears' }

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

function reasonLine(lead: any): string {
  if (lead.isCallback && lead.callbackAt) {
    return `Callback ${fmtTime(lead.callbackAt, lead.timezone)}`
  }
  const blockLabel  = (lead.block ?? '').charAt(0).toUpperCase() + (lead.block ?? '').slice(1)
  const attemptText = lead.attempt_number && lead.attempts_total
    ? `${ordinal(lead.attempt_number)} call of ${lead.attempts_total}`
    : ''
  const carryText = lead.is_carryover ? ' · carried over' : ''
  const parts = [lead.stageName, attemptText ? `— ${attemptText}` : '', blockLabel ? `(${blockLabel})` : '', carryText].filter(Boolean)
  return parts.join(' ')
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
      className={`border-b border-gray-100 px-4 py-2.5 dark:border-gray-800/40 cursor-pointer transition-colors
      ${selected ? 'bg-cyan-50/40 border-l-2 border-l-cyan-500 dark:bg-cyan-950/20' : ''}
      ${!selected && isNext ? 'border-l-2 border-l-green-500 bg-green-50/30 dark:bg-green-950/10' : ''}
      ${!selected && lead.is_carryover ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''}
      ${!selected ? 'hover:bg-gray-50 dark:hover:bg-gray-900/50' : ''}
    `}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold
            ${isNext ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
            {position}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{lead.name}</p>
            {isNext && (
              <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700 dark:bg-green-950/50 dark:text-green-400">Next</span>
            )}
            {lead.isCallback && (
              <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">CB</span>
            )}
            {lead.is_carryover && (
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">carried</span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono">{lead.phone}</p>
          <p className="mt-0.5 text-[10px] text-gray-400 truncate">{reasonLine(lead)}</p>
          {lead.ownerRepIdentity && lead.ownerRepIdentity !== repIdentity && (
            <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              Owner: {lead.ownerRepIdentity} (offline)
            </p>
          )}
        </div>
        <span className="shrink-0 text-[10px] font-medium text-gray-400 mt-0.5">{FIRM_LABEL[lead.firm] ?? lead.firm}</span>
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
        block:            item.block,
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
      <div className="border-b border-gray-200 px-4 pt-3 pb-2 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            My Queue
            {!loading && <span className="ml-1 text-gray-400">({ordered.length}/5)</span>}
            {loading  && <span className="animate-pulse text-gray-400"> loading…</span>}
          </p>
          {/* Live indicator */}
          <span className="flex items-center gap-1 text-[10px] text-green-500">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* Call Next */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => next && !disabled && onCall(next as QueueLead)}
          disabled={!next || disabled}
          className="w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40">
          {next ? 'Call Next' : 'Queue empty'}
        </button>
      </div>

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto">
        {ordered.length === 0 && !loading ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-gray-400">No leads in queue.</p>
            <p className="mt-1 text-[10px] text-gray-400">Leads will appear here as they become due.</p>
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
