import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function estHour(date: Date): number {
  const h = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(date)
  )
  return h === 24 ? 0 : h
}

function isConnected(c: any): boolean {
  const dur = c.duration ?? 0
  if (dur <= 0) return false
  const ab = c.answered_by ?? null
  if (ab) return ab === 'human'
  return dur >= 15
}

// GET /api/dialer/reports?from=2026-08-01&to=2026-08-06
export async function GET(req: NextRequest) {
  const db = supabaseAdmin()
  const sp = req.nextUrl.searchParams
  const now = new Date()

  // Date range (default: today)
  const fromStr = sp.get('from') || now.toISOString().split('T')[0]
  const toStr   = sp.get('to')   || now.toISOString().split('T')[0]
  const from = new Date(`${fromStr}T00:00:00Z`)
  const to   = new Date(`${toStr}T23:59:59.999Z`)

  // ── Parallel data fetch ─────────────────────────────────────────────────
  const [
    callsRes,
    attemptsRes,
    leadStatesRes,
    messagesRes,
    inboundRes,
    heartbeatsRes,
    usersRes,
    transcriptsRes,
    dripRes,
  ] = await Promise.all([
    // All calls in range
    db.from('dialer_calls')
      .select('call_sid, rep_identity, contact_id, phone, firm, direction, call_status, duration, disposition, recording_url, answered_by, caller_id_used, started_at, ended_at')
      .gte('started_at', from.toISOString())
      .lte('started_at', to.toISOString()),

    // All attempts in range
    db.from('dialer_attempts')
      .select('id, contact_id, firm, stage_name, block, status, disposition, completed_by, completed_at, leased_at, is_carryover, is_callback, attempt_number, plan_date')
      .gte('plan_date', fromStr)
      .lte('plan_date', toStr),

    // Lead states (all-time snapshot)
    db.from('dialer_lead_state')
      .select('contact_id, last_disposition, exhausted, sms_drip_active, sms_drip_started_at, sms_disposition, owner_rep'),

    // SMS messages in range
    db.from('dialer_messages')
      .select('direction, status, contact_id, rep_identity, firm, created_at')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString()),

    // Inbound calls in range
    db.from('dialer_inbound_queue')
      .select('status, answered_by, created_at, answered_at, ended_at')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString()),

    // Heartbeats in range
    db.from('dialer_rep_heartbeats')
      .select('rep_identity, device_type, status, created_at')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString()),

    // All active reps
    db.from('dialer_users')
      .select('name, twilio_identity, role')
      .eq('active', true)
      .eq('role', 'REP'),

    // Transcripts in range
    db.from('dialer_transcripts')
      .select('call_sid, status')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString()),

    // Drip messages in range
    db.from('dialer_sms_drip')
      .select('contact_id, status, scheduled_at, sent_at')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString()),
  ])

  const calls      = callsRes.data      ?? []
  const attempts   = attemptsRes.data    ?? []
  const leadStates = leadStatesRes.data  ?? []
  const messages   = messagesRes.data    ?? []
  const inbounds   = inboundRes.data     ?? []
  const heartbeats = heartbeatsRes.data  ?? []
  const users      = usersRes.data       ?? []
  const transcripts = transcriptsRes.data ?? []
  const drips      = dripRes.data        ?? []

  // ── Rep map ─────────────────────────────────────────────────────────────
  const repMap = new Map<string, string>()
  for (const u of users) {
    const firstName = (u.name as string).split(' ')[0]
    repMap.set(firstName.toLowerCase(), u.name)
  }

  // ── 1. Rep Performance ─────────────────────────────────────────────────
  const outboundCalls = calls.filter(c => c.direction !== 'inbound')
  const repIds = [...new Set(outboundCalls.map(c => c.rep_identity).filter(Boolean))]

  const repPerformance = repIds.map(repId => {
    const repCalls    = outboundCalls.filter(c => c.rep_identity === repId)
    const connected   = repCalls.filter(c => isConnected(c))
    const totalDials  = repCalls.length
    const connectedN  = connected.length
    const connectRate = totalDials > 0 ? Math.round((connectedN / totalDials) * 100) : 0
    const totalTalk   = connected.reduce((s, c) => s + (c.duration ?? 0), 0)
    const avgTalk     = connectedN > 0 ? Math.round(totalTalk / connectedN) : 0

    // Disposition breakdown
    const dispositions: Record<string, number> = {}
    for (const c of repCalls) {
      const d = c.disposition || 'No Disposition'
      dispositions[d] = (dispositions[d] || 0) + 1
    }

    // Calls per hour (EST)
    const hourly: number[] = new Array(24).fill(0)
    for (const c of repCalls) {
      hourly[estHour(new Date(c.started_at))]++
    }

    return {
      repId,
      name: repMap.get(repId) || repId,
      totalDials,
      connected: connectedN,
      connectRate,
      totalTalkTime: totalTalk,
      avgTalkTime: avgTalk,
      dispositions,
      hourly,
    }
  }).sort((a, b) => b.totalDials - a.totalDials)

  // ── 2. Lead Funnel ─────────────────────────────────────────────────────
  const touchedContacts = new Set(attempts.filter(a => a.status === 'completed').map(a => a.contact_id))
  const totalLeads     = new Set(attempts.map(a => a.contact_id)).size
  const leadsTouched   = touchedContacts.size

  const funnelCounts: Record<string, number> = {}
  for (const ls of leadStates) {
    if (!touchedContacts.has(ls.contact_id)) continue
    const d = ls.last_disposition || 'Untouched'
    funnelCounts[d] = (funnelCounts[d] || 0) + 1
  }

  const exhaustedCount = leadStates.filter(ls => ls.exhausted).length

  // Avg attempts before conversion
  const convertedContacts = new Set(
    leadStates.filter(ls => ls.last_disposition === 'Qualified' || ls.last_disposition === 'Signed').map(ls => ls.contact_id)
  )
  let totalAttemptsForConverted = 0
  let convertedCount = 0
  for (const cid of convertedContacts) {
    const count = attempts.filter(a => a.contact_id === cid && a.status === 'completed').length
    if (count > 0) { totalAttemptsForConverted += count; convertedCount++ }
  }
  const avgAttemptsToConvert = convertedCount > 0 ? Math.round((totalAttemptsForConverted / convertedCount) * 10) / 10 : 0

  // ── 3. Call Quality ────────────────────────────────────────────────────
  const amdBreakdown: Record<string, number> = {}
  for (const c of outboundCalls) {
    const ab = c.answered_by || 'no_amd'
    amdBreakdown[ab] = (amdBreakdown[ab] || 0) + 1
  }

  // Voicemail rate by caller ID
  const callerIdStats: Record<string, { total: number; voicemail: number }> = {}
  for (const c of outboundCalls) {
    const cid = c.caller_id_used || 'default'
    if (!callerIdStats[cid]) callerIdStats[cid] = { total: 0, voicemail: 0 }
    callerIdStats[cid].total++
    const ab = c.answered_by ?? null
    if (ab && ab !== 'human') callerIdStats[cid].voicemail++
    else if (!ab && (c.duration ?? 0) < 15 && c.call_status === 'completed') callerIdStats[cid].voicemail++
  }

  // Avg duration by disposition
  const durationByDisp: Record<string, { total: number; count: number }> = {}
  for (const c of outboundCalls) {
    const d = c.disposition || 'None'
    if (!durationByDisp[d]) durationByDisp[d] = { total: 0, count: 0 }
    durationByDisp[d].total += c.duration ?? 0
    durationByDisp[d].count++
  }
  const avgDurationByDisp: Record<string, number> = {}
  for (const [k, v] of Object.entries(durationByDisp)) {
    avgDurationByDisp[k] = v.count > 0 ? Math.round(v.total / v.count) : 0
  }

  // Recording & transcription coverage
  const callsWithRecording = outboundCalls.filter(c => c.recording_url).length
  const recordingCoverage  = outboundCalls.length > 0 ? Math.round((callsWithRecording / outboundCalls.length) * 100) : 0
  const transcribedCount   = transcripts.filter(t => t.status === 'completed').length
  const transcriptCoverage = outboundCalls.length > 0 ? Math.round((transcribedCount / outboundCalls.length) * 100) : 0

  // ── 4. Queue Health ────────────────────────────────────────────────────
  const blockCounts: Record<string, number> = {}
  for (const a of attempts) {
    const b = a.block || 'unknown'
    blockCounts[b] = (blockCounts[b] || 0) + 1
  }

  const carryoverCount = attempts.filter(a => a.is_carryover).length
  const carryoverRate  = attempts.length > 0 ? Math.round((carryoverCount / attempts.length) * 100) : 0

  const callbacks      = attempts.filter(a => a.is_callback)
  const cbCompleted    = callbacks.filter(a => a.status === 'completed').length
  const cbRate         = callbacks.length > 0 ? Math.round((cbCompleted / callbacks.length) * 100) : 0

  // ── 5. SMS & Bot ───────────────────────────────────────────────────────
  const dripTriggered  = leadStates.filter(ls => ls.sms_drip_started_at).length
  const outboundSms    = messages.filter(m => m.direction === 'outbound')
  const smsSent        = outboundSms.filter(m => m.status === 'sent' || m.status === 'delivered').length
  const smsFailed      = outboundSms.filter(m => m.status === 'failed').length
  const smsDelivered   = outboundSms.filter(m => m.status === 'delivered').length
  const inboundSms     = messages.filter(m => m.direction === 'inbound').length

  const smsDispBreakdown: Record<string, number> = {}
  for (const ls of leadStates) {
    if (!ls.sms_disposition) continue
    smsDispBreakdown[ls.sms_disposition] = (smsDispBreakdown[ls.sms_disposition] || 0) + 1
  }

  // Bot → Qualified conversion
  const dripContacts    = new Set(leadStates.filter(ls => ls.sms_drip_started_at).map(ls => ls.contact_id))
  const dripToQualified = leadStates.filter(
    ls => dripContacts.has(ls.contact_id) && (ls.last_disposition === 'Qualified' || ls.last_disposition === 'Signed')
  ).length
  const botConversionRate = dripContacts.size > 0 ? Math.round((dripToQualified / dripContacts.size) * 100) : 0

  // ── 6. Firm Comparison ─────────────────────────────────────────────────
  const firms = ['lhp', 'fears']
  const firmComparison = firms.map(f => {
    const fc = outboundCalls.filter(c => c.firm === f)
    const conn = fc.filter(c => isConnected(c))
    const qualified = fc.filter(c => c.disposition === 'Qualified').length
    const signed    = fc.filter(c => c.disposition === 'Signed').length
    return {
      firm: f,
      totalDials:  fc.length,
      connected:   conn.length,
      connectRate: fc.length > 0 ? Math.round((conn.length / fc.length) * 100) : 0,
      qualified,
      signed,
      avgDuration: conn.length > 0 ? Math.round(conn.reduce((s, c) => s + (c.duration ?? 0), 0) / conn.length) : 0,
    }
  })

  // ── 7. Inbound ─────────────────────────────────────────────────────────
  const inboundTotal    = inbounds.length
  const inboundAnswered = inbounds.filter(i => i.status === 'answered' || i.status === 'completed').length
  const inboundMissed   = inbounds.filter(i => i.status === 'missed').length
  const inboundAnswerRate = inboundTotal > 0 ? Math.round((inboundAnswered / inboundTotal) * 100) : 0

  // Avg ring time (seconds)
  const ringTimes = inbounds
    .filter(i => i.answered_at && i.created_at)
    .map(i => (new Date(i.answered_at).getTime() - new Date(i.created_at).getTime()) / 1000)
  const avgRingTime = ringTimes.length > 0 ? Math.round(ringTimes.reduce((s, t) => s + t, 0) / ringTimes.length) : 0

  // Inbound by rep
  const inboundByRep: Record<string, number> = {}
  for (const i of inbounds) {
    if (!i.answered_by) continue
    inboundByRep[i.answered_by] = (inboundByRep[i.answered_by] || 0) + 1
  }

  // ── 8. Device & Activity Time (heartbeats) ────────────────────────────
  const HEARTBEAT_INTERVAL = 30 // seconds

  const deviceByRep: Record<string, { desktop: number; mobile: number; tablet: number }> = {}
  const activityByRep: Record<string, { ready: number; onCall: number; paused: number }> = {}

  for (const hb of heartbeats) {
    const r = hb.rep_identity
    if (!deviceByRep[r]) deviceByRep[r] = { desktop: 0, mobile: 0, tablet: 0 }
    if (!activityByRep[r]) activityByRep[r] = { ready: 0, onCall: 0, paused: 0 }

    const dt = hb.device_type as 'desktop' | 'mobile' | 'tablet'
    if (deviceByRep[r][dt] !== undefined) deviceByRep[r][dt] += HEARTBEAT_INTERVAL

    const st = hb.status
    if (st === 'READY')   activityByRep[r].ready  += HEARTBEAT_INTERVAL
    if (st === 'ON_CALL') activityByRep[r].onCall += HEARTBEAT_INTERVAL
    if (st === 'PAUSED')  activityByRep[r].paused += HEARTBEAT_INTERVAL
  }

  // ── 9. Daily trends ───────────────────────────────────────────────────
  const dailyMap: Record<string, { dials: number; connected: number; qualified: number; signed: number }> = {}
  for (const c of outboundCalls) {
    const day = c.started_at.split('T')[0]
    if (!dailyMap[day]) dailyMap[day] = { dials: 0, connected: 0, qualified: 0, signed: 0 }
    dailyMap[day].dials++
    if (isConnected(c)) dailyMap[day].connected++
    if (c.disposition === 'Qualified') dailyMap[day].qualified++
    if (c.disposition === 'Signed') dailyMap[day].signed++
  }
  const dailyTrends = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }))

  // Day of week
  const dayOfWeekMap: Record<string, { dials: number; connected: number }> = {}
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  for (const c of outboundCalls) {
    const d = dayNames[new Date(c.started_at).getUTCDay()]
    if (!dayOfWeekMap[d]) dayOfWeekMap[d] = { dials: 0, connected: 0 }
    dayOfWeekMap[d].dials++
    if (isConnected(c)) dayOfWeekMap[d].connected++
  }

  // Hourly aggregate (all reps, EST)
  const hourlyAll: number[] = new Array(24).fill(0)
  for (const c of outboundCalls) {
    hourlyAll[estHour(new Date(c.started_at))]++
  }

  // ── 10. Leaderboard ────────────────────────────────────────────────────
  const leaderboard = repPerformance.map(r => ({
    repId:      r.repId,
    name:       r.name,
    dials:      r.totalDials,
    connected:  r.connected,
    connectRate: r.connectRate,
    qualified:  r.dispositions['Qualified'] || 0,
    signed:     r.dispositions['Signed'] || 0,
    talkTime:   r.totalTalkTime,
  }))

  // ── Response ───────────────────────────────────────────────────────────
  return NextResponse.json({
    dateRange: { from: fromStr, to: toStr },

    // Summary
    summary: {
      totalDials:     outboundCalls.length,
      connected:      outboundCalls.filter(c => isConnected(c)).length,
      connectRate:    outboundCalls.length > 0 ? Math.round((outboundCalls.filter(c => isConnected(c)).length / outboundCalls.length) * 100) : 0,
      totalTalkTime:  outboundCalls.filter(c => isConnected(c)).reduce((s, c) => s + (c.duration ?? 0), 0),
      qualified:      outboundCalls.filter(c => c.disposition === 'Qualified').length,
      signed:         outboundCalls.filter(c => c.disposition === 'Signed').length,
      totalLeads,
      leadsTouched,
      exhausted:      exhaustedCount,
    },

    repPerformance,
    leaderboard,
    funnel: funnelCounts,
    avgAttemptsToConvert,

    callQuality: {
      amdBreakdown,
      callerIdStats,
      avgDurationByDisp,
      recordingCoverage,
      transcriptCoverage,
    },

    queueHealth: {
      blockCounts,
      carryoverRate,
      callbackCompletionRate: cbRate,
      totalCallbacks: callbacks.length,
      completedCallbacks: cbCompleted,
    },

    sms: {
      dripTriggered,
      sent: smsSent,
      delivered: smsDelivered,
      failed: smsFailed,
      inboundReplies: inboundSms,
      dispositions: smsDispBreakdown,
      botConversionRate,
    },

    firmComparison,

    inbound: {
      total: inboundTotal,
      answered: inboundAnswered,
      missed: inboundMissed,
      answerRate: inboundAnswerRate,
      avgRingTime,
      byRep: inboundByRep,
    },

    deviceTime: deviceByRep,
    activityTime: activityByRep,

    trends: {
      daily: dailyTrends,
      dayOfWeek: dayOfWeekMap,
      hourly: hourlyAll,
    },
  })
}
