'use client'

import { useState, useEffect } from 'react'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'

interface WorkerStats {
  workerName: string
  slack: { count: number; medFmt: string; under90: number; pctUnder90: number }
  call:  { count: number; medFmt: string; under90: number; pctUnder90: number }
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
    if (pct >= 80) return 'text-success'
    if (pct >= 50) return 'text-warning'
    return 'text-destructive'
  }

  return (
    <>
      <PageHeader
        title="Response Times"
        description="How fast workers react to a new lead in Slack, and how fast they log the call."
        actions={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Date range"
            className="rounded-md border bg-card px-3 py-1.5 text-sm"
          >
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        }
      />
      <PageBody>

        {loading ? (
          <p className="text-muted-foreground text-center py-16">Loading…</p>
        ) : data.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <p className="text-muted-foreground text-sm">No response data yet.</p>
            <p className="text-muted-foreground text-xs mt-2">Data appears once workers start reacting to Slack messages and logging calls.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.map(w => (
              <div key={w.workerName} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-3 bg-muted/40 border-b border-border">
                  <h2 className="font-semibold text-foreground">{w.workerName}</h2>
                </div>
                <div className="grid grid-cols-2 divide-x divide-border">
                  {/* Slack reaction */}
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Slack Reaction</p>
                    {w.slack.count === 0 ? (
                      <p className="text-sm text-muted-foreground">No data</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Median</span>
                          <span className="font-semibold text-foreground">{w.slack.medFmt}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Under 90s</span>
                          <span className={`font-bold ${pctColor(w.slack.pctUnder90)}`}>
                            {w.slack.under90}/{w.slack.count} ({w.slack.pctUnder90}%)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* GHL call */}
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Call Queue Response</p>
                    {w.call.count === 0 ? (
                      <p className="text-sm text-muted-foreground">No data</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Median</span>
                          <span className="font-semibold text-foreground">{w.call.medFmt}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Under 90s</span>
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
      </PageBody>
    </>
  )
}
