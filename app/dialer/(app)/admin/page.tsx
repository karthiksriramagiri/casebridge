'use client'

import { useState, useEffect, useRef } from 'react'
import { useCall } from '../../_context/call'
import { StatusPill } from '../../_components/StatusPill'
import type { RepStatus } from '../../_types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface RepData {
  identity:       string
  name:           string
  initials:       string
  status:         RepStatus
  conferenceName: string | null
  repCallSid:     string | null
  contactName:    string | null
  contactId:      string | null
  firm:           string | null
  campaign:       string | null
  callStartedAt:  string | null
  totalCalls:     number
  connectedCalls: number
  connectRate:    number
  avgDuration:    number
}

interface FloorStats {
  onCall:         number
  active:         number
  totalDials:     number
  totalConnected: number
  avgConnectRate: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDuration(sec: number) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function elapsed(startedAt: string | null): number {
  if (!startedAt) return 0
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const EarIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
  </svg>
)
const MicIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
  </svg>
)
const PhoneIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
  </svg>
)
const PhoneOffIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06L6.25 7.3A10.19 10.19 0 002 16.5a.75.75 0 001.5 0 8.69 8.69 0 013.7-7.17l1.95 1.95A6.74 6.74 0 008 14.5a.75.75 0 001.5 0c0-1.23.33-2.38.91-3.37l1.56 1.56A5.23 5.23 0 0011 14.5a.75.75 0 001.5 0c0-.76.15-1.48.43-2.14l2.33 2.33A.75.75 0 0016.5 16H18a.75.75 0 00.75-.75v-1.5a.75.75 0 00-.75-.75h-.58L3.28 2.22zM18 5.5a.75.75 0 00-1.5 0 8.69 8.69 0 01-2.09 5.64l1.08 1.08A10.18 10.18 0 0018 5.5z" clipRule="evenodd" />
  </svg>
)

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm dark:bg-gray-900 ${accent ? 'border-cyan-300 dark:border-cyan-700' : 'border-gray-200 dark:border-gray-800'}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1.5 text-3xl font-bold tabular-nums ${accent ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ── Monitor Panel ─────────────────────────────────────────────────────────────

function MonitorPanel({ rep, onJoin, onLeave, monitoring }: {
  rep: RepData
  monitoring: { repIdentity: string; mode: string } | null
  onJoin: (confName: string, mode: 'listen' | 'whisper' | 'barge', coachSid?: string) => void
  onLeave: () => void
}) {
  if (rep.status !== 'ON_CALL' || !rep.conferenceName) {
    return <span className="text-xs text-gray-400">Not on a call</span>
  }

  const isMe = monitoring?.repIdentity === rep.identity
  if (isMe) {
    return (
      <button onClick={onLeave}
        className="flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-400">
        <PhoneOffIcon /> Leave call
      </button>
    )
  }

  return (
    <div className="flex gap-1.5">
      {([
        { mode: 'listen',  label: 'Listen',  icon: <EarIcon />,  cls: 'text-cyan-700 bg-cyan-50 border-cyan-200 hover:bg-cyan-100 dark:text-cyan-300 dark:bg-cyan-950/40 dark:border-cyan-800' },
        { mode: 'whisper', label: 'Whisper', icon: <MicIcon />,  cls: 'text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100 dark:text-violet-300 dark:bg-violet-950/40 dark:border-violet-800' },
        { mode: 'barge',   label: 'Barge',   icon: <PhoneIcon />, cls: 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800' },
      ] as const).map(({ mode, label, icon, cls }) => (
        <button key={mode}
          onClick={() => onJoin(rep.conferenceName!, mode, mode === 'whisper' ? rep.repCallSid ?? undefined : undefined)}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${cls}`}>
          {icon} {label}
        </button>
      ))}
    </div>
  )
}

// ── Rep Card ──────────────────────────────────────────────────────────────────

const BORDER: Record<string, string> = {
  OFFLINE: 'border-gray-200 dark:border-gray-800',
  READY:   'border-green-300 dark:border-green-700',
  ON_CALL: 'border-cyan-400 dark:border-cyan-600',
  PAUSED:  'border-amber-300 dark:border-amber-700',
  WRAPUP:  'border-violet-300 dark:border-violet-700',
}

function RepCard({ rep, monitoring, onJoin, onLeave }: {
  rep: RepData
  monitoring: { repIdentity: string; mode: string } | null
  onJoin: (confName: string, mode: 'listen' | 'whisper' | 'barge', coachSid?: string) => void
  onLeave: () => void
}) {
  const [tick, setTick] = useState(0)
  const isMonitored = monitoring?.repIdentity === rep.identity

  useEffect(() => {
    if (rep.status !== 'ON_CALL') return
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [rep.status])

  const callElapsed = rep.status === 'ON_CALL' ? elapsed(rep.callStartedAt) + tick * 0 : 0
  // tick forces re-render, elapsed() recalculates each time
  const liveElapsed = rep.status === 'ON_CALL' ? elapsed(rep.callStartedAt) : null

  return (
    <div className={`rounded-2xl border-2 bg-white shadow-sm dark:bg-gray-900 transition-all ${BORDER[rep.status]} ${isMonitored ? 'ring-2 ring-violet-400 ring-offset-2 dark:ring-offset-gray-950' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between p-5 pb-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${
            rep.status === 'ON_CALL' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300' :
            rep.status === 'READY'   ? 'bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300' :
            'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            {rep.initials}
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{rep.name}</p>
            <StatusPill status={rep.status as RepStatus} size="sm" pulse />
          </div>
        </div>
        {rep.status === 'ON_CALL' && liveElapsed !== null && (
          <div className="text-right">
            <span className="font-mono text-xl font-bold text-cyan-600 dark:text-cyan-400">
              {fmtDuration(liveElapsed)}
            </span>
            <p className="text-[10px] text-gray-400">live</p>
          </div>
        )}
      </div>

      {/* Active call info */}
      {rep.status === 'ON_CALL' && rep.contactName && (
        <div className="mx-4 mb-3 rounded-lg bg-cyan-50 px-3 py-2.5 dark:bg-cyan-950/30">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-cyan-900 dark:text-cyan-100">{rep.contactName}</p>
              {rep.firm && <p className="text-xs text-cyan-700 dark:text-cyan-400">{rep.firm}</p>}
              {rep.campaign && <p className="truncate text-[10px] text-cyan-600/70 dark:text-cyan-500/70">{rep.campaign}</p>}
            </div>
            <span className="mt-0.5 flex h-2 w-2 shrink-0 rounded-full bg-green-400 animate-pulse" />
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
        <div className="px-3 py-3 text-center">
          <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{rep.totalCalls}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Dials</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className={`text-lg font-bold tabular-nums ${rep.connectRate >= 30 ? 'text-green-600 dark:text-green-400' : rep.connectRate >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
            {rep.totalCalls > 0 ? rep.connectRate + '%' : '—'}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Connect</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{rep.connectedCalls > 0 ? fmtDuration(rep.avgDuration) : '—'}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Avg dur</p>
        </div>
      </div>

      {/* Monitor buttons */}
      <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
        <MonitorPanel rep={rep} monitoring={monitoring} onJoin={onJoin} onLeave={onLeave} />
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LiveFloorPage() {
  const { deviceReady, joinConference, hangUp, callState } = useCall()

  const [reps,       setReps]       = useState<RepData[]>([])
  const [stats,      setStats]      = useState<FloorStats | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [monitoring, setMonitoring] = useState<{ repIdentity: string; mode: string } | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  async function fetchFloor() {
    const res = await fetch('/api/dialer/live-floor')
    const data = await res.json()
    setReps(data.reps ?? [])
    setStats(data.stats ?? null)
    setLastUpdate(new Date())
    setLoading(false)
  }

  useEffect(() => {
    fetchFloor()
    const t = setInterval(fetchFloor, 5000)
    return () => clearInterval(t)
  }, [])

  // Clear monitoring state when not on a call
  useEffect(() => {
    if (callState === 'idle') setMonitoring(null)
  }, [callState])

  async function handleJoin(confName: string, mode: 'listen' | 'whisper' | 'barge', coachSid?: string, repIdentity?: string) {
    if (!deviceReady) return
    await joinConference(confName, mode, coachSid)
    if (repIdentity) setMonitoring({ repIdentity, mode })
  }

  function handleLeave() {
    hangUp()
    setMonitoring(null)
  }

  const onCall  = stats?.onCall   ?? 0
  const active  = stats?.active   ?? 0
  const total   = stats?.totalDials ?? 0
  const connect = stats?.avgConnectRate ?? 0

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Live Floor</h1>
            <p className="text-sm text-gray-500">
              {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {monitoring && (
              <div className="flex items-center gap-2 rounded-lg bg-violet-100 px-3 py-2 dark:bg-violet-950/40">
                <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
                <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
                  Monitoring: {monitoring.mode}
                </span>
              </div>
            )}
            <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${deviceReady ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}>
              <span className={`h-2 w-2 rounded-full ${deviceReady ? 'bg-green-500' : 'bg-gray-400'}`} />
              {deviceReady ? 'Device ready' : 'Connecting…'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KPICard label="On Call Now"   value={onCall}             sub={`of ${reps.length} reps`} accent={onCall > 0} />
          <KPICard label="Active Reps"   value={active}             sub="ready or on call" />
          <KPICard label="Dials Today"   value={total}              sub="all reps combined" />
          <KPICard label="Connect Rate"  value={total > 0 ? connect + '%' : '—'} sub="answered / dialed" />
        </div>

        {/* Reps breakdown table */}
        {!loading && reps.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Rep Overview</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Rep', 'Status', 'Current Call', 'Dials', 'Connected', 'Connect %', 'Avg Duration'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reps.map(rep => (
                  <tr key={rep.identity} className="border-b border-gray-50 hover:bg-gray-50/50 dark:border-gray-800/50 dark:hover:bg-gray-800/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{rep.initials}</div>
                        <span className="font-medium text-gray-800 dark:text-gray-200">{rep.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={rep.status as RepStatus} size="sm" /></td>
                    <td className="px-4 py-3 max-w-[180px]">
                      {rep.status === 'ON_CALL' && rep.contactName
                        ? <div>
                            <p className="truncate font-medium text-cyan-700 dark:text-cyan-300">{rep.contactName}</p>
                            {rep.firm && <p className="text-xs text-gray-400">{rep.firm}</p>}
                          </div>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-800 dark:text-gray-200">{rep.totalCalls}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-800 dark:text-gray-200">{rep.connectedCalls}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">
                      <span className={rep.connectRate >= 30 ? 'text-green-600 dark:text-green-400' : rep.connectRate >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}>
                        {rep.totalCalls > 0 ? rep.connectRate + '%' : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-800 dark:text-gray-200">{rep.connectedCalls > 0 ? fmtDuration(rep.avgDuration) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Rep cards grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {reps.map(rep => (
              <RepCard
                key={rep.identity}
                rep={rep}
                monitoring={monitoring}
                onJoin={(confName, mode, coachSid) => handleJoin(confName, mode, coachSid, rep.identity)}
                onLeave={handleLeave}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
