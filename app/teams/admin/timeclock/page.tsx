'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import { PageBody, PageHeader } from '@/app/teams/_components/shared'

interface TimeEntry {
  id: string
  profile_id: string
  date: string
  clock_in: string
  clock_out: string | null
  note: string | null
}

interface WorkerRow {
  profileId: string
  name: string
  hourlyRate: number
  entries: TimeEntry[]
}

function fmtTime(iso: string) {
  return format(parseISO(iso), 'h:mm a')
}

function calcHours(entries: TimeEntry[], now: Date): number {
  return entries.reduce((total, e) => {
    const end = e.clock_out ? parseISO(e.clock_out) : now
    const mins = differenceInMinutes(end, parseISO(e.clock_in))
    return total + Math.max(0, mins) / 60
  }, 0)
}

export default function TimeclockPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [editRate, setEditRate] = useState<{ profileId: string; name: string; current: number } | null>(null)
  const [editRateVal, setEditRateVal] = useState('')
  const [rateSaving, setRateSaving] = useState(false)

  // Tick clock every minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/metrics/time-entries?date=${date}`)
    const data = await res.json()
    setWorkers(data.workers || [])
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  async function clockIn(profileId: string) {
    setActionLoading(profileId + ':in')
    await fetch('/api/metrics/time-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId, date }),
    })
    await load()
    setActionLoading(null)
  }

  async function clockOut(entryId: string, profileId: string) {
    setActionLoading(profileId + ':out')
    await fetch('/api/metrics/time-entries', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entryId }),
    })
    await load()
    setActionLoading(null)
  }

  async function deleteEntry(entryId: string, profileId: string) {
    if (!confirm('Delete this time entry?')) return
    setActionLoading(entryId + ':del')
    await fetch(`/api/metrics/time-entries?id=${entryId}`, { method: 'DELETE' })
    await load()
    setActionLoading(null)
  }

  async function saveRate() {
    if (!editRate) return
    const val = parseFloat(editRateVal)
    if (isNaN(val) || val < 0) return
    setRateSaving(true)
    await fetch('/api/metrics/workers/hourly-rate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: editRate.profileId, hourly_rate: val }),
    })
    setRateSaving(false)
    setEditRate(null)
    load()
  }

  const totalHours = workers.reduce((s, w) => s + calcHours(w.entries, now), 0)

  return (
    <>
      <PageHeader
        title="Timeclock"
        description="Daily clock-in · clock-out for all workers"
        actions={
          <>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => setDate(new Date().toISOString().slice(0, 10))}
            className="text-sm text-primary hover:text-primary font-medium"
          >
            Today
          </button>
          </>
        }
      />
      <PageBody>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Workers</p>
          <p className="text-2xl font-bold text-foreground">{workers.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Clocked In</p>
          <p className="text-2xl font-bold text-success">
            {workers.filter(w => w.entries.some(e => !e.clock_out)).length}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total Hours Today</p>
          <p className="text-2xl font-bold text-foreground">{totalHours.toFixed(1)}h</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : workers.length === 0 ? (
        <div className="bg-card rounded-xl border border-border px-6 py-12 text-center">
          <p className="text-muted-foreground">No workers found. Add reps in the Reps tab first.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workers.map(worker => {
            const openEntry = worker.entries.find(e => !e.clock_out)
            const hoursToday = calcHours(worker.entries, now)
            const earnedToday = hoursToday * worker.hourlyRate
            const isActingIn = actionLoading === worker.profileId + ':in'
            const isActingOut = actionLoading === worker.profileId + ':out'

            return (
              <div key={worker.profileId} className="bg-card rounded-xl border border-border px-5 py-4">
                {/* Worker row */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Status dot */}
                      <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${openEntry ? 'bg-success' : 'bg-border'}`} />
                      <span className="font-bold text-foreground">{worker.name}</span>
                      {openEntry && (
                        <span className="text-xs bg-success/10 text-success border border-success/30 rounded-full px-2 py-0.5 font-medium">
                          Clocked in {fmtTime(openEntry.clock_in)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                      <span>{hoursToday > 0 ? `${hoursToday.toFixed(2)}h today` : 'No time logged'}</span>
                      <button
                        onClick={() => { setEditRate({ profileId: worker.profileId, name: worker.name, current: worker.hourlyRate }); setEditRateVal(String(worker.hourlyRate)) }}
                        className="text-primary hover:text-primary text-xs font-medium"
                      >
                        ${worker.hourlyRate.toFixed(2)}/hr
                      </button>
                      {earnedToday > 0 && (
                        <span className="text-muted-foreground">${earnedToday.toFixed(2)} earned today</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {openEntry ? (
                      <button
                        onClick={() => clockOut(openEntry.id, worker.profileId)}
                        disabled={isActingOut}
                        className="text-sm bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/15 font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isActingOut ? '…' : 'Clock Out'}
                      </button>
                    ) : (
                      <button
                        onClick={() => clockIn(worker.profileId)}
                        disabled={isActingIn}
                        className="text-sm bg-success/10 border border-success/30 text-success hover:bg-success/10 font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isActingIn ? '…' : 'Clock In'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Time entries for this day */}
                {worker.entries.length > 0 && (
                  <div className="mt-3 pl-5 space-y-1">
                    {worker.entries.map(entry => {
                      const end = entry.clock_out ? parseISO(entry.clock_out) : now
                      const mins = Math.max(0, differenceInMinutes(end, parseISO(entry.clock_in)))
                      const hrs = (mins / 60).toFixed(2)
                      const isDel = actionLoading === entry.id + ':del'

                      return (
                        <div key={entry.id} className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-mono">{fmtTime(entry.clock_in)}</span>
                          <span className="text-muted-foreground/50">→</span>
                          <span className="font-mono">{entry.clock_out ? fmtTime(entry.clock_out) : <span className="text-success font-semibold">now</span>}</span>
                          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-medium">{hrs}h</span>
                          {entry.note && <span className="text-muted-foreground italic">{entry.note}</span>}
                          <button
                            onClick={() => deleteEntry(entry.id, worker.profileId)}
                            disabled={isDel}
                            className="text-destructive/70 hover:text-destructive ml-auto transition-colors disabled:opacity-40"
                            title="Delete entry"
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Edit Hourly Rate Modal */}
      {editRate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-xs p-5">
            <h2 className="text-base font-semibold text-foreground mb-1">Hourly Rate</h2>
            <p className="text-sm text-muted-foreground mb-4">{editRate.name}</p>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <input
                type="number"
                step="0.50"
                min="0"
                value={editRateVal}
                onChange={e => setEditRateVal(e.target.value)}
                className="w-full border border-border rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">/hr</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveRate}
                disabled={rateSaving}
                className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold rounded-lg py-2.5 transition-colors"
              >
                {rateSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setEditRate(null)}
                className="flex-1 border border-border hover:bg-muted/50 text-foreground/90 text-sm font-medium rounded-lg py-2.5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </PageBody>
    </>
  )
}
