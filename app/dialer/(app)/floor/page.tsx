'use client'

import React, { useState, useEffect } from 'react'
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
  contactPhone:   string | null
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
  if (!sec) return '--'
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function elapsed(startedAt: string | null): number {
  if (!startedAt) return 0
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
}

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears', jm: 'J&M' }

// ── Icons ──────────────────────────────────────────────────────────────────────

const EarIcon   = () => <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" /></svg>
const MicIcon   = () => <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" /></svg>
const PhoneIcon = () => <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" /></svg>
const PhoneOffIcon = () => <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06L6.25 7.3A10.19 10.19 0 002 16.5a.75.75 0 001.5 0 8.69 8.69 0 013.7-7.17l1.95 1.95A6.74 6.74 0 008 14.5a.75.75 0 001.5 0c0-1.23.33-2.38.91-3.37l1.56 1.56A5.23 5.23 0 0011 14.5a.75.75 0 001.5 0c0-.76.15-1.48.43-2.14l2.33 2.33A.75.75 0 0016.5 16H18a.75.75 0 00.75-.75v-1.5a.75.75 0 00-.75-.75h-.58L3.28 2.22zM18 5.5a.75.75 0 00-1.5 0 8.69 8.69 0 01-2.09 5.64l1.08 1.08A10.18 10.18 0 0018 5.5z" clipRule="evenodd" /></svg>

// ── Live timer hook ────────────────────────────────────────────────────────────

function useLiveElapsed(startedAt: string | null, running: boolean) {
  const [secs, setSecs] = useState(() => elapsed(startedAt))
  useEffect(() => {
    if (!running || !startedAt) return
    setSecs(elapsed(startedAt))
    const t = setInterval(() => setSecs(elapsed(startedAt)), 1000)
    return () => clearInterval(t)
  }, [startedAt, running])
  return secs
}

// ── Active Call Card ───────────────────────────────────────────────────────────

function ActiveCallCard({ rep, monitoring, onJoin, onLeave }: {
  rep:        RepData
  monitoring: { repIdentity: string; mode: string } | null
  onJoin:     (confName: string, mode: 'listen' | 'whisper' | 'barge', coachSid?: string, repIdentity?: string) => void
  onLeave:    () => void
}) {
  const liveSecs  = useLiveElapsed(rep.callStartedAt, rep.status === 'ON_CALL')
  const isMonitored = monitoring?.repIdentity === rep.identity

  return (
    <div className={`rounded-2xl border-2 bg-white shadow-md dark:bg-gray-900 transition-all ${isMonitored ? 'border-violet-400 ring-2 ring-violet-300 ring-offset-2 dark:border-violet-600 dark:ring-violet-600 dark:ring-offset-gray-950' : 'border-cyan-400 dark:border-cyan-600'}`}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-cyan-100 dark:border-cyan-900/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-sm font-bold text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300">
            {rep.initials}
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{rep.name}</p>
            <div className="flex items-center gap-1.5">
              <span className="flex h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">Live call</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-mono font-bold text-cyan-700 dark:text-cyan-300 tabular-nums">
            {fmtDuration(liveSecs)}
          </p>
          <p className="text-[10px] text-gray-400">duration</p>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">On the phone with</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white truncate">
              {rep.contactName ?? 'Unknown caller'}
            </p>
            {rep.contactPhone && (
              <p className="mt-0.5 font-mono text-sm text-gray-500 dark:text-gray-400">{rep.contactPhone}</p>
            )}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {rep.firm && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {FIRM_LABEL[rep.firm] ?? rep.firm}
                </span>
              )}
              {rep.campaign && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {rep.campaign}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            {isMonitored ? (
              <button
                onClick={onLeave}
                className="flex items-center gap-2 rounded-xl bg-red-100 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-950"
              >
                <PhoneOffIcon /> Leave call
              </button>
            ) : (
              <>
                <button
                  onClick={() => onJoin(rep.conferenceName!, 'listen', undefined, rep.identity)}
                  className="flex items-center gap-2 rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-2.5 text-sm font-semibold text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:border-cyan-800 dark:text-cyan-300 dark:hover:bg-cyan-950"
                >
                  <EarIcon /> Listen
                </button>
                <button
                  onClick={() => onJoin(rep.conferenceName!, 'whisper', rep.repCallSid ?? undefined, rep.identity)}
                  className="flex items-center gap-2 rounded-xl bg-violet-50 border border-violet-200 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950"
                >
                  <MicIcon /> Whisper
                </button>
                <button
                  onClick={() => onJoin(rep.conferenceName!, 'barge', undefined, rep.identity)}
                  className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                >
                  <PhoneIcon /> Barge
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
        <div className="px-5 py-2.5 text-center">
          <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{rep.totalCalls}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Dials today</p>
        </div>
        <div className="px-5 py-2.5 text-center">
          <p className={`text-lg font-bold tabular-nums ${rep.connectRate >= 30 ? 'text-green-600 dark:text-green-400' : rep.connectRate >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
            {rep.totalCalls > 0 ? `${rep.connectRate}%` : '--'}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Connect rate</p>
        </div>
        <div className="px-5 py-2.5 text-center">
          <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
            {rep.connectedCalls > 0 ? fmtDuration(rep.avgDuration) : '--'}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Avg duration</p>
        </div>
      </div>
    </div>
  )
}

// ── Rep Status Card ────────────────────────────────────────────────────────────

const STATUS_BORDER: Record<string, string> = {
  OFFLINE: 'border-gray-200 dark:border-gray-800',
  READY:   'border-green-300 dark:border-green-800',
  ON_CALL: 'border-cyan-400 dark:border-cyan-700',
  PAUSED:  'border-amber-300 dark:border-amber-700',
  WRAPUP:  'border-violet-300 dark:border-violet-700',
}

function RepStatusCard({ rep }: { rep: RepData }) {
  return (
    <div className={`rounded-xl border-2 bg-white shadow-sm dark:bg-gray-900 ${STATUS_BORDER[rep.status]}`}>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold
            ${rep.status === 'ON_CALL' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300' :
              rep.status === 'READY'   ? 'bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300' :
              rep.status === 'PAUSED'  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-400' :
              rep.status === 'WRAPUP'  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-400' :
              'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>
            {rep.initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white truncate">{rep.name}</p>
            <StatusPill status={rep.status as RepStatus} size="sm" pulse />
          </div>
        </div>

        {rep.status === 'ON_CALL' && rep.contactName && (
          <div className="rounded-lg bg-cyan-50 px-3 py-2 dark:bg-cyan-950/30 mb-3">
            <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium truncate">{rep.contactName}</p>
            {rep.firm && <p className="text-[10px] text-cyan-500/70 dark:text-cyan-500/50">{FIRM_LABEL[rep.firm] ?? rep.firm}</p>}
          </div>
        )}

        <div className="grid grid-cols-3 gap-1 text-center">
          <div>
            <p className="text-base font-bold tabular-nums text-gray-800 dark:text-gray-200">{rep.totalCalls}</p>
            <p className="text-[9px] font-medium uppercase tracking-wider text-gray-400">Dials</p>
          </div>
          <div>
            <p className={`text-base font-bold tabular-nums ${rep.connectRate >= 30 ? 'text-green-600 dark:text-green-400' : rep.connectRate >= 15 ? 'text-amber-500 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
              {rep.totalCalls > 0 ? `${rep.connectRate}%` : '--'}
            </p>
            <p className="text-[9px] font-medium uppercase tracking-wider text-gray-400">Connect</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-gray-800 dark:text-gray-200">
              {rep.connectedCalls > 0 ? fmtDuration(rep.avgDuration) : '--'}
            </p>
            <p className="text-[9px] font-medium uppercase tracking-wider text-gray-400">Avg dur</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white px-5 py-4 shadow-sm dark:bg-gray-900 ${accent ? 'border-cyan-300 dark:border-cyan-700' : 'border-gray-200 dark:border-gray-800'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${accent ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FloorPage() {
  const { deviceReady, joinConference, hangUp, callState } = useCall()

  const [reps,       setReps]       = useState<RepData[]>([])
  const [stats,      setStats]      = useState<FloorStats | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [monitoring, setMonitoring] = useState<{ repIdentity: string; mode: string } | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  async function fetchFloor() {
    const res  = await fetch('/api/dialer/live-floor')
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

  const onCallReps = reps.filter(r => r.status === 'ON_CALL')
  const otherReps  = reps.filter(r => r.status !== 'ON_CALL')

  return (
    <div className="flex h-full flex-col overflow-auto bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Live Floor</h1>
            <p className="text-xs text-gray-400">
              {lastUpdate
                ? `Updated ${lastUpdate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' })} PT`
                : 'Connecting\u2026'}
              {' \u00b7 auto-refreshes every 5s'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {monitoring && (
              <div className="flex items-center gap-2 rounded-lg bg-violet-100 px-3 py-2 dark:bg-violet-950/40">
                <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 capitalize">
                  {monitoring.mode} — {reps.find(r => r.identity === monitoring.repIdentity)?.name}
                </span>
                <button onClick={handleLeave}
                  className="ml-1 text-xs text-violet-500 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-200">
                  ✕ Leave
                </button>
              </div>
            )}
            <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${deviceReady ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}>
              <span className={`h-2 w-2 rounded-full ${deviceReady ? 'bg-green-500' : 'bg-gray-400'}`} />
              {deviceReady ? 'Device ready' : 'Connecting\u2026'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KPICard label="On Call Now"  value={stats?.onCall ?? 0}   sub={`of ${reps.length} reps`} accent={(stats?.onCall ?? 0) > 0} />
          <KPICard label="Active Reps"  value={stats?.active ?? 0}   sub="ready or on call" />
          <KPICard label="Dials Today"  value={stats?.totalDials ?? 0} sub="all reps combined" />
          <KPICard label="Connect Rate" value={(stats?.totalDials ?? 0) > 0 ? `${stats?.avgConnectRate ?? 0}%` : '--'} sub={`${stats?.totalConnected ?? 0} connected`} />
        </div>

        {/* Active Calls */}
        {!loading && onCallReps.length > 0 && (
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Active Calls ({onCallReps.length})
            </p>
            <div className={`grid gap-4 ${onCallReps.length === 1 ? 'grid-cols-1 max-w-2xl' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {onCallReps.map(rep => (
                <ActiveCallCard
                  key={rep.identity}
                  rep={rep}
                  monitoring={monitoring}
                  onJoin={handleJoin}
                  onLeave={handleLeave}
                />
              ))}
            </div>
          </div>
        )}

        {/* All Reps status grid */}
        {!loading && (
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {onCallReps.length > 0 ? 'Rest of Floor' : 'All Reps'}
            </p>
            {otherReps.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {otherReps.map(rep => (
                  <RepStatusCard key={rep.identity} rep={rep} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">All reps are currently on calls.</p>
            )}
          </div>
        )}

        {/* No active calls empty state */}
        {!loading && onCallReps.length === 0 && otherReps.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">No reps online right now.</p>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-48 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
