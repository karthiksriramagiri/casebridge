'use client'

import { useState, useEffect, useCallback } from 'react'

interface QueueItem {
  id:                 string
  contact_name:       string
  phone:              string
  firm:               string
  stage_name:         string
  priority:           number
  last_called_at:     string | null
  callback_at:        string | null
  callback_for_rep:   string | null
  owner_rep_identity: string | null
  locked_by:          string | null
  exhausted:          boolean
  last_disposition:   string | null
  added_at:           string
}

// How many times per day each stage is called
const DAILY_LIMIT: Record<string, number> = {
  'contract sent':         4,
  'chase':                 4,
  'follow up required':    4,
  'no response':           4,
  'appointment scheduled': 1, // only at exact callback time
}
function getDailyLimit(stage: string) { return DAILY_LIMIT[stage.toLowerCase()] ?? 3 }

interface Summary {
  total: number; active: number; exhausted: number; locked: number; callbacks: number
  byFirm: { lhp: number; fears: number }
}

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears' }

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  })
}

// Expand the unique lead list into a flat list of every planned call today.
// Ordered by round (1st call for all leads, then 2nd call, etc.) within each
// round sorted by priority → last_called_at.
function buildCallList(items: QueueItem[]): Array<QueueItem & { callNumber: number }> {
  const active = items.filter(i => !i.exhausted)
  const maxRounds = Math.max(...active.map(i => getDailyLimit(i.stage_name)), 0)
  const result: Array<QueueItem & { callNumber: number }> = []
  for (let round = 1; round <= maxRounds; round++) {
    const eligible = active.filter(i => getDailyLimit(i.stage_name) >= round)
    // Already sorted by server: priority ASC, last_called_at ASC NULLS FIRST
    for (const item of eligible) {
      result.push({ ...item, callNumber: round })
    }
  }
  return result
}

export default function QueueAdminPage() {
  const [items,   setItems]   = useState<QueueItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [firm,    setFirm]    = useState('')
  const [show,    setShow]    = useState<'active' | 'exhausted' | 'all'>('active')
  const [search,  setSearch]  = useState('')

  const fetchQueue = useCallback(async () => {
    const params = new URLSearchParams()
    if (firm) params.set('firm', firm)
    if (show !== 'all') params.set('exhausted', show === 'exhausted' ? 'true' : 'false')
    params.set('limit', '5000')
    const res  = await fetch(`/api/dialer/queue/admin?${params}`)
    const data = await res.json()
    setItems(data.items ?? [])
    setSummary(data.summary ?? null)
    setLoading(false)
  }, [firm, show])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  async function handleSync() {
    setSyncing(true)
    await fetch('/api/dialer/queue/sync', { method: 'POST' })
    await fetchQueue()
    setSyncing(false)
  }

  // Expand to full call list, then apply search
  const callList = buildCallList(items)
  const filtered = callList.filter(item =>
    !search ||
    item.contact_name.toLowerCase().includes(search.toLowerCase()) ||
    item.phone.includes(search)
  )

  const totalPlannedCalls = items
    .filter(i => !i.exhausted)
    .reduce((sum, i) => sum + getDailyLimit(i.stage_name), 0)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Calling Queue</h1>
            <p className="text-sm text-gray-500">All planned calls for today</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}>
              <path fillRule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 01.908-.417A6 6 0 118 2v1z" clipRule="evenodd" />
              <path d="M8 4.466V.534a.25.25 0 01.41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 018 4.466z" />
            </svg>
            {syncing ? 'Syncing…' : 'Sync from GHL'}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-3 gap-0 border-b border-gray-200 dark:border-gray-800 sm:grid-cols-6">
          {[
            { label: 'Unique Leads',   value: summary.total },
            { label: 'Active',         value: summary.active,       accent: true },
            { label: 'Total Calls',    value: totalPlannedCalls,    accent: true },
            { label: 'Callbacks',      value: summary.callbacks,    accent: summary.callbacks > 0 },
            { label: 'Locked',         value: summary.locked },
            { label: 'LHP / Fears',    value: `${summary.byFirm.lhp} / ${summary.byFirm.fears}` },
          ].map(({ label, value, accent }) => (
            <div key={label} className="border-r border-gray-200 bg-white px-4 py-3 last:border-r-0 dark:border-gray-800 dark:bg-gray-950">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
              <p className={`text-xl font-bold tabular-nums ${accent ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-900 dark:text-white'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-800 dark:bg-gray-950">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or phone…"
          className="w-48 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
        />
        <select value={firm} onChange={e => setFirm(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white">
          <option value="">All firms</option>
          <option value="lhp">Larry H. Parker</option>
          <option value="fears">Fears Law</option>
        </select>
        <div className="flex rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden">
          {(['active', 'exhausted', 'all'] as const).map(s => (
            <button key={s} onClick={() => setShow(s)}
              className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors ${show === s ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white' : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'}`}>
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} calls</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400 animate-pulse">Loading queue…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-400">Queue is empty</p>
              <p className="mt-1 text-xs text-gray-400">Click "Sync from GHL" to populate</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
              <tr>
                {['#', 'Lead', 'Firm / Stage', 'Call', 'Last Called', 'Callback', 'Owner', 'Locked By', 'Last Disposition'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr key={`${item.id}-${item.callNumber}`}
                  className={`border-b border-gray-50 hover:bg-gray-50/50 dark:border-gray-800/50 dark:hover:bg-gray-800/20 ${item.locked_by ? 'bg-green-50/30 dark:bg-green-950/10' : ''}`}>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-gray-400 w-10">{idx + 1}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-800 dark:text-gray-200">{item.contact_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.phone}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-700 dark:text-gray-300">{FIRM_LABEL[item.firm] ?? item.firm}</p>
                    <p className="text-xs text-gray-400">{item.stage_name}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {item.callNumber}/{getDailyLimit(item.stage_name)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {item.last_called_at ? fmtTime(item.last_called_at) : <span className="text-green-600 dark:text-green-400 font-medium">New</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {item.callback_at ? (
                      <div>
                        <p className="text-blue-600 dark:text-blue-400">{fmtTime(item.callback_at)}</p>
                        {item.callback_for_rep && <p className="text-gray-400">for {item.callback_for_rep}</p>}
                      </div>
                    ) : <span className="text-gray-300 dark:text-gray-700">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {item.owner_rep_identity ?? <span className="text-gray-300 dark:text-gray-700">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {item.locked_by
                      ? <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-950/50 dark:text-green-400">🔒 {item.locked_by}</span>
                      : <span className="text-gray-300 dark:text-gray-700">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {item.last_disposition ?? <span className="text-gray-300 dark:text-gray-700">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
