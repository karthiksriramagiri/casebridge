'use client'

import { useState, useEffect } from 'react'

interface WorkerStats {
  workerName: string
  slack: { count: number; avgFmt: string; medFmt: string; under90: number; pctUnder90: number }
  call:  { count: number; avgFmt: string; medFmt: string; under90: number; pctUnder90: number }
}

export default function ResponseTimesPage() {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<WorkerStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/teams/admin/response-times?days=${days}`)
      .then(r => r.json())
      .then(d => { setData(d.workers || []); setLoading(false) })
  }, [days])

  function pctColor(pct: number) {
    if (pct >= 80) return 'text-green-700'
    if (pct >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Response Times</h1>
            <p className="text-gray-500 text-sm mt-1">How fast workers react to new leads (Slack) and log calls (Queue)</p>
          </div>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-16">Loading…</p>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400 text-sm">No response data yet.</p>
            <p className="text-gray-400 text-xs mt-2">Data appears once workers start reacting to Slack messages and logging calls.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.map(w => (
              <div key={w.workerName} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">{w.workerName}</h2>
                </div>
                <div className="grid grid-cols-2 divide-x divide-gray-100">
                  {/* Slack reaction */}
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Slack Reaction</p>
                    {w.slack.count === 0 ? (
                      <p className="text-sm text-gray-400">No data</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Avg</span>
                          <span className="font-semibold text-gray-900">{w.slack.avgFmt}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Median</span>
                          <span className="font-semibold text-gray-900">{w.slack.medFmt}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Under 90s</span>
                          <span className={`font-bold ${pctColor(w.slack.pctUnder90)}`}>
                            {w.slack.under90}/{w.slack.count} ({w.slack.pctUnder90}%)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* GHL call */}
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Call Queue Response</p>
                    {w.call.count === 0 ? (
                      <p className="text-sm text-gray-400">No data</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Avg</span>
                          <span className="font-semibold text-gray-900">{w.call.avgFmt}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Median</span>
                          <span className="font-semibold text-gray-900">{w.call.medFmt}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Under 90s</span>
                          <span className={`font-bold ${pctColor(w.call.pctUnder90)}`}>
                            {w.call.under90}/{w.call.count} ({w.call.pctUnder90}%)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
