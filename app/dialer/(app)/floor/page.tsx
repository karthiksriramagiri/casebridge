'use client'

import { useEffect, useState } from 'react'
import { Ear, Headphones, Mic, PhoneOff } from 'lucide-react'
import { useCall } from '../../_context/call'
import { StatusPill } from '../../_components/StatusPill'
import { Button } from '@/app/_ui/button'
import { Card, EmptyState, PageBody, PageHeader, Pill, StatCard } from '../../_components/ui/shell'
import type { RepStatus } from '../../_types'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   The floor, live.

   One question, asked continuously: who is on a call right now, and does
   anyone need help. Everything on this page is arranged around answering
   it from across a room — the live calls are large and first, the rest of
   the floor is a compact grid underneath, and the only moving thing on
   screen is a call in progress.

   Monitoring is three buttons on a live call, in increasing order of
   intrusion: listen (the rep does not know), whisper (only the rep hears
   you), barge (everyone does). They read in that order deliberately, so
   the least invasive is the easiest to reach.
   ═══════════════════════════════════════════════════════════════════════════ */

interface RepData {
  identity: string
  name: string
  initials: string
  status: RepStatus
  conferenceName: string | null
  repCallSid: string | null
  contactName: string | null
  contactPhone: string | null
  firm: string | null
  campaign: string | null
  callStartedAt: string | null
  totalCalls: number
  connectedCalls: number
  connectRate: number
  avgDuration: number
}

interface FloorStats {
  onCall: number
  active: number
  totalDials: number
  totalConnected: number
  avgConnectRate: number
}

function fmtDuration(sec: number) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const elapsed = (startedAt: string | null) =>
  startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears', jm: 'J&M' }

/** A duration that counts while the call is up, and stops when it is not. */
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

/* A rep's three numbers, in the same order wherever they appear. The
   connect rate is the only one with an opinion attached: under 15% is
   worth a look, over 30% is working. */
function RepFigures({ rep, size = 'md' }: { rep: RepData; size?: 'sm' | 'md' }) {
  const rate = rep.connectRate
  const tone = rep.totalCalls === 0 ? '' : rate >= 30 ? 'text-success' : rate >= 15 ? 'text-warning' : ''
  const value = size === 'sm' ? 'text-base' : 'text-lg'
  return (
    <div className="grid grid-cols-3 divide-x border-t text-center">
      {[
        { v: String(rep.totalCalls), l: 'Dials', c: '' },
        { v: rep.totalCalls > 0 ? `${rate}%` : '—', l: 'Connect', c: tone },
        { v: rep.connectedCalls > 0 ? fmtDuration(rep.avgDuration) : '—', l: 'Avg', c: '' },
      ].map((f) => (
        <div key={f.l} className="px-3 py-2">
          <p className={cn(value, 'font-semibold tabular-nums', f.c)}>{f.v}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{f.l}</p>
        </div>
      ))}
    </div>
  )
}

function ActiveCallCard({
  rep, monitoring, onJoin, onLeave, deviceReady,
}: {
  rep: RepData
  monitoring: { repIdentity: string; mode: string } | null
  onJoin: (confName: string, mode: 'listen' | 'whisper' | 'barge', coachSid?: string, repIdentity?: string) => void
  onLeave: () => void
  deviceReady: boolean
}) {
  const live = useLiveElapsed(rep.callStartedAt, rep.status === 'ON_CALL')
  const watched = monitoring?.repIdentity === rep.identity

  return (
    <Card className={cn('transition-colors', watched ? 'ring-2 ring-primary' : 'border-primary/40')}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
            {rep.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{rep.name}</p>
            <StatusPill status={rep.status} size="sm" pulse />
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums text-primary">{fmtDuration(live)}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">duration</p>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            On the phone with
          </p>
          <p className="truncate text-lg font-semibold">{rep.contactName ?? 'Unknown caller'}</p>
          {rep.contactPhone && <p className="font-mono text-sm text-muted-foreground">{rep.contactPhone}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {rep.firm && <Pill tone="blue">{FIRM_LABEL[rep.firm] ?? rep.firm}</Pill>}
            {rep.campaign && <Pill>{rep.campaign}</Pill>}
          </div>
        </div>

        {/* Least invasive first. */}
        <div className="flex shrink-0 flex-col gap-1.5">
          {watched ? (
            <Button variant="destructive" size="sm" onClick={onLeave}>
              <PhoneOff aria-hidden /> Leave call
            </Button>
          ) : (
            <>
              <Button
                variant="outline" size="sm" disabled={!deviceReady || !rep.conferenceName}
                title="Listen in — the rep is not told"
                onClick={() => onJoin(rep.conferenceName!, 'listen', undefined, rep.identity)}
              >
                <Ear aria-hidden /> Listen
              </Button>
              <Button
                variant="outline" size="sm" disabled={!deviceReady || !rep.conferenceName}
                title="Whisper — only the rep hears you"
                onClick={() => onJoin(rep.conferenceName!, 'whisper', rep.repCallSid ?? undefined, rep.identity)}
              >
                <Mic aria-hidden /> Whisper
              </Button>
              <Button
                variant="outline" size="sm" disabled={!deviceReady || !rep.conferenceName}
                title="Barge — everyone on the call hears you"
                onClick={() => onJoin(rep.conferenceName!, 'barge', undefined, rep.identity)}
              >
                <Headphones aria-hidden /> Barge
              </Button>
            </>
          )}
        </div>
      </div>

      <RepFigures rep={rep} />
    </Card>
  )
}

function RepStatusCard({ rep }: { rep: RepData }) {
  return (
    <Card>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            rep.status === 'READY' ? 'bg-success/15 text-success'
              : rep.status === 'PAUSED' ? 'bg-warning/20 text-foreground'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {rep.initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{rep.name}</p>
          <StatusPill status={rep.status} size="sm" />
        </div>
      </div>
      <RepFigures rep={rep} size="sm" />
    </Card>
  )
}

export default function FloorPage() {
  const { deviceReady, joinConference, hangUp, callState } = useCall()

  const [reps, setReps] = useState<RepData[]>([])
  const [stats, setStats] = useState<FloorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [monitoring, setMonitoring] = useState<{ repIdentity: string; mode: string } | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetch('/api/dialer/live-floor').then((r) => r.json())
        setReps(data.reps ?? [])
        setStats(data.stats ?? null)
        setLastUpdate(new Date())
      } catch { /* a dropped poll is not worth a message — the next one is 5s away */ }
      setLoading(false)
    }
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  /* The call ending anywhere ends the monitoring too, however it ended. */
  useEffect(() => {
    if (callState === 'idle') setMonitoring(null)
  }, [callState])

  const handleJoin = async (
    confName: string, mode: 'listen' | 'whisper' | 'barge', coachSid?: string, repIdentity?: string,
  ) => {
    if (!deviceReady) return
    await joinConference(confName, mode, coachSid)
    if (repIdentity) setMonitoring({ repIdentity, mode })
  }

  const handleLeave = () => {
    hangUp()
    setMonitoring(null)
  }

  const onCall = reps.filter((r) => r.status === 'ON_CALL')
  const rest = reps.filter((r) => r.status !== 'ON_CALL')
  const watchedRep = monitoring && reps.find((r) => r.identity === monitoring.repIdentity)

  return (
    <>
      <PageHeader
        title="Live Floor"
        description={
          lastUpdate
            ? `Updated ${lastUpdate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' })} PT · refreshes every 5s`
            : 'Connecting…'
        }
        actions={
          <>
            {watchedRep && (
              <span className="flex items-center gap-2 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground">
                <span className="dl-live-dot size-2 rounded-full bg-primary" aria-hidden />
                <span className="capitalize">{monitoring!.mode}</span> — {watchedRep.name}
                <button type="button" onClick={handleLeave} className="ml-0.5 underline-offset-2 hover:underline">
                  leave
                </button>
              </span>
            )}
            <Pill tone={deviceReady ? 'green' : 'muted'}>
              <span className={cn('size-1.5 rounded-full', deviceReady ? 'bg-success' : 'bg-muted-foreground')} aria-hidden />
              {deviceReady ? 'Device ready' : 'Connecting…'}
            </Pill>
          </>
        }
      />

      <PageBody>
        <section aria-label="Floor totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="On call now" value={String(stats?.onCall ?? 0)} hint={`of ${reps.length} reps`}
            tone={(stats?.onCall ?? 0) > 0 ? 'good' : undefined}
          />
          <StatCard label="Active reps" value={String(stats?.active ?? 0)} hint="ready or on call" />
          <StatCard label="Dials today" value={String(stats?.totalDials ?? 0)} hint="all reps" />
          <StatCard
            label="Connect rate"
            value={(stats?.totalDials ?? 0) > 0 ? `${stats?.avgConnectRate ?? 0}%` : '—'}
            hint={`${stats?.totalConnected ?? 0} connected`}
          />
        </section>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted" />
            ))}
          </div>
        ) : (
          <>
            {onCall.length > 0 && (
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Active calls ({onCall.length})
                </p>
                <div className={cn('grid gap-3', onCall.length === 1 ? 'max-w-2xl' : 'sm:grid-cols-2')}>
                  {onCall.map((rep) => (
                    <ActiveCallCard
                      key={rep.identity}
                      rep={rep}
                      monitoring={monitoring}
                      onJoin={handleJoin}
                      onLeave={handleLeave}
                      deviceReady={deviceReady}
                    />
                  ))}
                </div>
              </section>
            )}

            {rest.length > 0 && (
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {onCall.length > 0 ? 'Rest of the floor' : 'All reps'}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {rest.map((rep) => <RepStatusCard key={rep.identity} rep={rep} />)}
                </div>
              </section>
            )}

            {reps.length === 0 && (
              <EmptyState title="Nobody is online">
                Reps appear here as soon as they open their phone.
              </EmptyState>
            )}
            {reps.length > 0 && rest.length === 0 && (
              <p className="text-sm text-muted-foreground">Every rep is on a call.</p>
            )}
          </>
        )}
      </PageBody>
    </>
  )
}
