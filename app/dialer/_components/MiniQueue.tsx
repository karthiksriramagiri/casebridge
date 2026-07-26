'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { QueueLead } from '../_types'

interface Props {
  repIdentity:   string
  disabled:      boolean
  onCall:        (lead: QueueLead) => void
  refreshKey?:   number
  activeQueueId?: string | null  // currently-being-called lead — hidden from list
}

const FIRM_LABEL: Record<string, string> = {
  lhp:   'LHP',
  fears: 'Fears',
}

function fmtCallbackTime(iso: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour:     'numeric',
      minute:   '2-digit',
      hour12:   true,
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
}

function CallbackBadge({ lead }: { lead: QueueLead }) {
  if (!lead.isCallback || !lead.callbackAt) return null
  const time = fmtCallbackTime(lead.callbackAt, lead.timezone)
  const late  = new Date(lead.callbackAt) < new Date()
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${late ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400'}`}>
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
        <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm7.25-3.75a.75.75 0 011.5 0V8a.75.75 0 01-.22.53l-2.5 2.5a.75.75 0 01-1.06-1.06L7.25 7.94V4.25z" clipRule="evenodd" />
      </svg>
      {late ? `LATE · ${time}` : `CB ${time}`}
    </span>
  )
}

export function MiniQueue({ repIdentity, disabled, onCall, refreshKey, activeQueueId }: Props) {
  const [leads,   setLeads]   = useState<QueueLead[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchQueue = useCallback(async () => {
    if (!repIdentity) return
    try {
      const res  = await fetch(`/api/dialer/queue/next?rep=${encodeURIComponent(repIdentity)}&count=10`)
      const data = await res.json()
      setLeads((data.leads ?? []).map((item: any) => ({
        queueId:          item.id,
        contactId:        item.contact_id,
        name:             item.contact_name,
        phone:            item.phone,
        firm:             item.firm,
        stageName:        item.stage_name,
        timezone:         item.timezone,
        isCallback:       !!item.callback_at && new Date(item.callback_at) <= new Date(Date.now() + 60 * 1000),
        callbackAt:       item.callback_at,
        callbackContext:  item.callback_context,
        ownerRepIdentity: item.owner_rep_identity,
        priority:         item.priority,
      })))
      setLastFetch(new Date())
    } catch (e) {
      console.error('[MiniQueue] fetch error', e)
    } finally {
      setLoading(false)
    }
  }, [repIdentity])

  // Initial fetch + polling every 30s
  useEffect(() => {
    fetchQueue()
    intervalRef.current = setInterval(fetchQueue, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchQueue])

  // Refresh when parent increments refreshKey (after disposition)
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) fetchQueue()
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/dialer/queue/sync', { method: 'POST' })
      await fetchQueue()
    } finally {
      setSyncing(false)
    }
  }

  const visibleLeads = activeQueueId ? leads.filter(l => l.queueId !== activeQueueId) : leads
  const next = visibleLeads[0] ?? null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 pt-3 pb-2 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Queue {!loading && <span className="text-gray-400">({visibleLeads.length})</span>}
            {loading && <span className="animate-pulse text-gray-400">loading…</span>}
          </p>
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Sync from GHL"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`}>
              <path fillRule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 01.908-.417A6 6 0 118 2v1z" clipRule="evenodd" />
              <path d="M8 4.466V.534a.25.25 0 01.41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 018 4.466z" />
            </svg>
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
        {lastFetch && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            Updated {lastFetch.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
          </p>
        )}
      </div>

      {/* Call Next button */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => next && !disabled && onCall(next)}
          disabled={!next || disabled}
          className="w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {next ? `Call Next — ${next.name.split(' ')[0]}` : 'Queue empty'}
        </button>
      </div>

      {/* Lead list */}
      <div className="flex-1 overflow-y-auto">
        {visibleLeads.length === 0 && !loading ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-gray-400">No leads available.</p>
            <p className="mt-1 text-[10px] text-gray-400">Sync from GHL or check calling hours.</p>
          </div>
        ) : (
          visibleLeads.map((lead, i) => (
            <div
              key={lead.queueId}
              className={`w-full border-b border-gray-100 px-4 py-2.5 dark:border-gray-800/40 ${i === 0 ? 'border-l-2 border-l-green-500 bg-green-50/30 dark:bg-green-950/10' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{lead.name}</p>
                    {i === 0 && <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700 dark:bg-green-950/50 dark:text-green-400">Next</span>}
                  </div>
                  <p className="text-xs text-gray-500 font-mono">{lead.phone}</p>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-400">{FIRM_LABEL[lead.firm] ?? lead.firm}</span>
                    <span className="text-[10px] text-gray-300 dark:text-gray-700">·</span>
                    <span className="text-[10px] text-gray-400">{lead.stageName}</span>
                  </div>
                  {lead.isCallback && (
                    <div className="mt-1">
                      <CallbackBadge lead={lead} />
                      {lead.callbackContext && (
                        <p className="mt-0.5 text-[10px] text-gray-400 truncate">{lead.callbackContext}</p>
                      )}
                    </div>
                  )}
                  {lead.ownerRepIdentity && lead.ownerRepIdentity !== repIdentity && (
                    <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                      Owner: {lead.ownerRepIdentity} (offline)
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-gray-400 mt-0.5">{i + 1}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
