'use client'

import React, { useState, useEffect, useRef } from 'react'
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
  if (!sec) return '—'
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

// ── PST clock hook ───────────────────────────────────────────────────────────

function usePSTClock() {
  const fmt = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' })
  const [time, setTime] = useState(fmt)
  useEffect(() => {
    setTime(fmt())
    const t = setInterval(() => setTime(fmt()), 1000)
    return () => clearInterval(t)
  }, [])
  return time
}

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
      {/* Header row */}
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

      {/* PC info */}
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

          {/* Monitoring actions */}
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

      {/* Stats footer */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
        <div className="px-5 py-2.5 text-center">
          <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{rep.totalCalls}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Dials today</p>
        </div>
        <div className="px-5 py-2.5 text-center">
          <p className={`text-lg font-bold tabular-nums ${rep.connectRate >= 30 ? 'text-green-600 dark:text-green-400' : rep.connectRate >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
            {rep.totalCalls > 0 ? `${rep.connectRate}%` : '—'}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Connect rate</p>
        </div>
        <div className="px-5 py-2.5 text-center">
          <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
            {rep.connectedCalls > 0 ? fmtDuration(rep.avgDuration) : '—'}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Avg duration</p>
        </div>
      </div>
    </div>
  )
}

// ── Rep Status Card (compact, for non-call status) ────────────────────────────

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
              {rep.totalCalls > 0 ? `${rep.connectRate}%` : '—'}
            </p>
            <p className="text-[9px] font-medium uppercase tracking-wider text-gray-400">Connect</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-gray-800 dark:text-gray-200">
              {rep.connectedCalls > 0 ? fmtDuration(rep.avgDuration) : '—'}
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

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_REPS: RepData[] = [
  {
    identity: 'karthik', name: 'Karthik', initials: 'K',
    status: 'ON_CALL',
    conferenceName: 'conf-karthik-001', repCallSid: 'CA000001',
    contactName: 'Margaret Johnson', contactId: 'c1', contactPhone: '+1 (818) 555-0192',
    firm: 'lhp', campaign: 'No Response',
    callStartedAt: new Date(Date.now() - 4 * 60 * 1000 - 23 * 1000).toISOString(),
    totalCalls: 14, connectedCalls: 4, connectRate: 29, avgDuration: 187,
  },
  {
    identity: 'pablo', name: 'Pablo', initials: 'P',
    status: 'ON_CALL',
    conferenceName: 'conf-pablo-001', repCallSid: 'CA000002',
    contactName: 'Robert Delgado', contactId: 'c2', contactPhone: '+1 (312) 555-0047',
    firm: 'fears', campaign: 'Chase',
    callStartedAt: new Date(Date.now() - 1 * 60 * 1000 - 8 * 1000).toISOString(),
    totalCalls: 9, connectedCalls: 3, connectRate: 33, avgDuration: 142,
  },
  {
    identity: 'ziyad', name: 'Ziyad', initials: 'Z',
    status: 'READY',
    conferenceName: null, repCallSid: null,
    contactName: null, contactId: null, contactPhone: null,
    firm: null, campaign: null, callStartedAt: null,
    totalCalls: 11, connectedCalls: 2, connectRate: 18, avgDuration: 95,
  },
  {
    identity: 'mauricio', name: 'Mauricio', initials: 'M',
    status: 'PAUSED',
    conferenceName: null, repCallSid: null,
    contactName: null, contactId: null, contactPhone: null,
    firm: null, campaign: null, callStartedAt: null,
    totalCalls: 6, connectedCalls: 1, connectRate: 17, avgDuration: 210,
  },
]

const MOCK_STATS: FloorStats = {
  onCall: 2, active: 3, totalDials: 40, totalConnected: 10, avgConnectRate: 25,
}

// ── Types for rep call log ────────────────────────────────────────────────────

interface RepCall {
  callSid:     string
  contactName: string
  phone:       string
  status:      string
  duration:    number
  startedAt:   string
  endedAt:     string | null
  firm:        string | null
  stageName:   string | null
  answeredBy:  string | null
  connected:   boolean
  disposition: string | null
  endedBy:     string | null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LiveFloorPage() {
  const { deviceReady, joinConference, hangUp, callState } = useCall()
  const pstClock = usePSTClock()

  const [reps,       setReps]       = useState<RepData[]>([])
  const [stats,      setStats]      = useState<FloorStats | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [monitoring, setMonitoring] = useState<{ repIdentity: string; mode: string } | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [mockMode,   setMockMode]   = useState(false)
  const [expandedRep, setExpandedRep] = useState<string | null>(null)
  const [repCalls,    setRepCalls]    = useState<RepCall[]>([])
  const [repCallsLoading, setRepCallsLoading] = useState(false)

  async function fetchRepCalls(repIdentity: string) {
    setRepCallsLoading(true)
    try {
      const res  = await fetch(`/api/dialer/rep-calls?rep=${encodeURIComponent(repIdentity)}`)
      const data = await res.json()
      setRepCalls(data.calls ?? [])
    } catch { setRepCalls([]) }
    finally { setRepCallsLoading(false) }
  }

  function toggleRepExpand(repIdentity: string) {
    if (expandedRep === repIdentity) {
      setExpandedRep(null)
      setRepCalls([])
    } else {
      setExpandedRep(repIdentity)
      fetchRepCalls(repIdentity)
    }
  }

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

  const displayReps  = mockMode ? MOCK_REPS  : reps
  const displayStats = mockMode ? MOCK_STATS : stats

  const onCallReps  = displayReps.filter(r => r.status === 'ON_CALL')
  const otherReps   = displayReps.filter(r => r.status !== 'ON_CALL')
  const totalDials  = displayStats?.totalDials     ?? 0
  const connectRate = displayStats?.avgConnectRate ?? 0

  return (
    <div className="flex h-full flex-col overflow-auto bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Live Floor</h1>
              <span className="font-mono text-sm font-semibold text-gray-600 dark:text-gray-300 tabular-nums">{pstClock} <span className="text-[10px] font-medium text-gray-400">PT</span></span>
            </div>
            <p className="text-xs text-gray-400">
              {mockMode ? <span className="text-amber-500 font-medium">Preview mode — mock data</span> : lastUpdate
                ? `Updated ${lastUpdate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' })} PT`
                : 'Connecting…'}
              {!mockMode && ' · auto-refreshes every 5s'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMockMode(m => !m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${mockMode ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-400' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'}`}
            >
              {mockMode ? '✕ Exit preview' : 'Preview layout'}
            </button>
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
              {deviceReady ? 'Device ready' : 'Connecting…'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KPICard label="On Call Now"   value={displayStats?.onCall ?? 0}   sub={`of ${displayReps.length} reps`} accent={(displayStats?.onCall ?? 0) > 0} />
          <KPICard label="Active Reps"   value={displayStats?.active ?? 0}   sub="ready or on call" />
          <KPICard label="Dials Today"   value={totalDials}            sub="all reps combined" />
          <KPICard label="Connect Rate"  value={totalDials > 0 ? `${connectRate}%` : '—'} sub={`${displayStats?.totalConnected ?? 0} connected`} />
        </div>

        {/* Active Calls — hero section */}
        {(!loading || mockMode) && onCallReps.length > 0 && (
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
        {(!loading || mockMode) && (
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

        {/* Full rep breakdown table */}
        {(!loading || mockMode) && displayReps.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Today's Breakdown</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Rep', 'Status', 'Current Call', 'Phone', 'Firm / Stage', 'Dials', 'Connected', 'Connect %', 'Avg Duration'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reps.map(rep => (
                  <React.Fragment key={rep.identity}>
                    <tr
                      className={`border-b border-gray-50 hover:bg-gray-50/50 dark:border-gray-800/50 dark:hover:bg-gray-800/20 cursor-pointer ${expandedRep === rep.identity ? 'bg-gray-50 dark:bg-gray-800/30' : ''}`}
                      onClick={() => toggleRepExpand(rep.identity)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{rep.initials}</div>
                          <span className="font-medium text-gray-800 dark:text-gray-200">{rep.name}</span>
                          <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${expandedRep === rep.identity ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusPill status={rep.status as RepStatus} size="sm" /></td>
                      <td className="px-4 py-3 max-w-[160px]">
                        {rep.status === 'ON_CALL' && rep.contactName
                          ? <p className="truncate font-semibold text-cyan-700 dark:text-cyan-300">{rep.contactName}</p>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {rep.contactPhone ?? <span className="text-gray-300 dark:text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {rep.firm
                          ? <div>
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{FIRM_LABEL[rep.firm] ?? rep.firm}</p>
                              {rep.campaign && <p className="text-[10px] text-gray-400 truncate max-w-[120px]">{rep.campaign}</p>}
                            </div>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-800 dark:text-gray-200 font-medium">{rep.totalCalls}</td>
                      <td className="px-4 py-3 tabular-nums text-gray-800 dark:text-gray-200">{rep.connectedCalls}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold">
                        <span className={rep.connectRate >= 30 ? 'text-green-600 dark:text-green-400' : rep.connectRate >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}>
                          {rep.totalCalls > 0 ? `${rep.connectRate}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-gray-800 dark:text-gray-200">
                        {rep.connectedCalls > 0 ? fmtDuration(rep.avgDuration) : '—'}
                      </td>
                    </tr>
                    {expandedRep === rep.identity && (
                      <tr>
                        <td colSpan={10} className="bg-gray-50/80 px-4 py-0 dark:bg-gray-800/20">
                          <div className="py-3 pl-9">
                            {repCallsLoading ? (
                              <p className="text-xs text-gray-400 animate-pulse py-2">Loading calls…</p>
                            ) : repCalls.length === 0 ? (
                              <p className="text-xs text-gray-400 py-2">No calls today.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-gray-200 dark:border-gray-700">
                                    {['Time', 'Contact', 'Phone', 'Firm', 'Status', 'Duration', 'Hung Up', 'Connected', 'Disposition'].map(h => (
                                      <th key={h} className="px-3 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {repCalls.map(c => (
                                    <tr key={c.callSid} className="border-b border-gray-100 dark:border-gray-800/50">
                                      <td className="px-3 py-1.5 text-gray-500 tabular-nums">
                                        {new Date(c.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}
                                      </td>
                                      <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300 max-w-[140px] truncate">{c.contactName}</td>
                                      <td className="px-3 py-1.5 font-mono text-gray-500">{c.phone}</td>
                                      <td className="px-3 py-1.5 text-gray-500">{c.firm ? (FIRM_LABEL[c.firm] ?? c.firm) : '—'}</td>
                                      <td className="px-3 py-1.5">
                                        <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                          c.status === 'completed' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                                          c.status === 'no-answer' ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' :
                                          c.status === 'busy'      ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' :
                                          'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                        }`}>
                                          {c.answeredBy?.startsWith('machine') ? 'voicemail' : c.status}
                                        </span>
                                      </td>
                                      <td className="px-3 py-1.5 tabular-nums text-gray-700 dark:text-gray-300">{fmtDuration(c.duration)}</td>
                                      <td className="px-3 py-1.5">
                                        {c.endedBy === 'contact' ? (
                                          <span className="text-amber-600 dark:text-amber-400 font-medium text-[10px]">PC @ {fmtDuration(c.duration)}</span>
                                        ) : c.endedBy === 'rep' ? (
                                          <span className="text-gray-500 dark:text-gray-400 text-[10px]">Rep @ {fmtDuration(c.duration)}</span>
                                        ) : (
                                          <span className="text-gray-400 text-[10px]">—</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-1.5">
                                        {c.connected ? (
                                          <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-semibold">
                                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Yes
                                          </span>
                                        ) : (
                                          <span className="text-gray-400">No</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-1.5">
                                        {c.disposition ? (
                                          <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                            c.disposition === 'Signed'        ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' :
                                            c.disposition === 'Qualified'     ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :
                                            c.disposition === 'Callback'      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' :
                                            c.disposition === 'No Response'   ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                                            c.disposition === 'Not Qualified' ? 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400' :
                                            c.disposition === 'Wrong Number'  ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' :
                                            'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                          }`}>
                                            {c.disposition}
                                          </span>
                                        ) : (
                                          <span className="text-gray-400">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
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
