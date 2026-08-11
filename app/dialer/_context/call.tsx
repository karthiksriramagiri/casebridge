'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { CallState, Lead } from '../_types'

interface CallContextValue {
  deviceReady:    boolean
  deviceError:    string | null
  callState:      CallState
  currentLead:    Lead | null
  callDuration:   number
  muted:          boolean
  callerIdUsed:   string | null
  identity:       string
  setIdentity:    (id: string) => void
  placeCall:      (lead: Lead, meta?: { firm?: string; campaign?: string; campaignId?: string; queueId?: string }) => Promise<void>
  answerInbound:  (confName: string, lead: Lead) => Promise<void>
  joinConference: (confName: string, mode: 'listen' | 'whisper' | 'barge', coachSid?: string) => Promise<void>
  hangUp:         () => void
  toggleMute:     () => void
  sendDtmf:       (key: string) => void
  setCurrentLead: React.Dispatch<React.SetStateAction<Lead | null>>
  setCallState:   React.Dispatch<React.SetStateAction<CallState>>
}

const CallContext = createContext<CallContextValue | null>(null)

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [deviceReady,  setDeviceReady]  = useState(false)
  const [deviceError,  setDeviceError]  = useState<string | null>(null)
  const [callState,    setCallState]    = useState<CallState>('idle')
  const [currentLead,  setCurrentLead]  = useState<Lead | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const [muted,        setMuted]        = useState(false)
  const [callerIdUsed, setCallerIdUsed] = useState<string | null>(null)
  const [identity,     setIdentity_]    = useState('agent')
  function setIdentity(id: string) { setIdentity_(id); identityRef.current = id }

  const deviceRef    = useRef<any>(null)
  const callRef      = useRef<any>(null)
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const initStarted  = useRef(false)
  const identityRef  = useRef(identity)

  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true

    async function initDevice() {
      const { Device } = await import('@twilio/voice-sdk')
      const res  = await fetch(`/api/dialer/token?identity=${encodeURIComponent(identity)}`)
      const data = await res.json()
      if (!data.token) { setDeviceError('Failed to get access token'); return }

      const device = new Device(data.token, {
        logLevel: 5,
        codecPreferences: ['opus', 'pcmu'] as any,
        allowIncomingWhileBusy: true,
      })

      device.on('registered',   () => setDeviceReady(true))
      device.on('unregistered', () => setDeviceReady(false))
      device.on('error', (err: any) => {
        if (err?.code === 31005) return
        setDeviceError(err?.message ?? String(err))
      })
      // Inbound calls are handled via conference (rep joins with device.connect).
      // Reject any unexpected direct incoming calls.
      device.on('incoming', (call: any) => {
        call.reject()
      })

      await device.register()
      deviceRef.current = device

      // Pre-select the default mic so the Twilio SDK holds an audio stream.
      // This prevents PermissionDeniedError on auto-dial calls (no user gesture).
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const mic = devices.find(d => d.kind === 'audioinput')
        if (mic?.deviceId && device.audio) {
          await (device.audio as any).setInputDevice(mic.deviceId)
        }
      } catch { /* non-fatal — manual calls still work via user gesture */ }
    }

    initDevice().catch(err => setDeviceError(String(err)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      if (callState === 'idle') setCallDuration(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [callState])

  function handleCallEnd() {
    callRef.current = null
    setMuted(false)
    setCallState('wrapup')
  }

  const placeCall = useCallback(async (lead: Lead, meta?: { firm?: string; campaign?: string; campaignId?: string; queueId?: string }) => {
    if (!deviceRef.current || !deviceReady) return
    setCurrentLead(lead)
    setCallState('ringing')
    setCallerIdUsed(null)

    try {
      // Create conference and dial customer
      const res = await fetch('/api/dialer/call/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:       lead.phone,
          contactId:   lead.contactId,
          contactName: lead.name,
          identity,
          firm:        meta?.firm,
          campaign:    meta?.campaign,
          campaignId:  meta?.campaignId,
          queueId:     meta?.queueId,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        let msg = 'Failed to create conference'
        try { msg = JSON.parse(text)?.error || msg } catch {}
        throw new Error(msg)
      }
      const data = await res.json()
      if (!data.confName) throw new Error(data.error || 'Failed to create conference')
      if (data.callerIdUsed) setCallerIdUsed(data.callerIdUsed)

      // Rep joins the conference
      const call = await deviceRef.current.connect({
        params: { ConferenceName: data.confName, Mode: 'rep' },
      })
      callRef.current = call
      call.on('ringing',    () => setCallState('ringing'))
      call.on('accept',     () => setCallState('connected'))
      call.on('disconnect', handleCallEnd)
      call.on('cancel',     handleCallEnd)
      call.on('error',      (err: any) => { setDeviceError(err.message); handleCallEnd() })
    } catch (err) {
      setDeviceError(String(err))
      setCallState('idle')
      setCurrentLead(null)
    }
  }, [deviceReady, identity]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rep answers an inbound call by joining its conference
  const answerInbound = useCallback(async (confName: string, lead: Lead) => {
    if (!deviceRef.current || !deviceReady) return
    setCurrentLead(lead)
    setCallState('ringing')
    try {
      const call = await deviceRef.current.connect({
        params: { ConferenceName: confName, Mode: 'rep' },
      })
      callRef.current = call
      call.on('accept',     () => setCallState('connected'))
      call.on('disconnect', handleCallEnd)
      call.on('cancel',     handleCallEnd)
      call.on('error',      (err: any) => { setDeviceError(err.message); handleCallEnd() })
      // Conference connects instantly (caller already waiting) — accept event
      // may have fired before we registered the listener above
      const status = typeof call.status === 'function' ? call.status() : (call as any)._status
      if (status === 'open' || status === 'connected') setCallState('connected')
    } catch (err) {
      setDeviceError(String(err))
      setCallState('idle')
      setCurrentLead(null)
    }
  }, [deviceReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const joinConference = useCallback(async (confName: string, mode: 'listen' | 'whisper' | 'barge', coachSid?: string) => {
    if (!deviceRef.current || !deviceReady) return
    const params: Record<string, string> = { ConferenceName: confName, Mode: mode }
    if (coachSid) params.CoachSid = coachSid
    const call = await deviceRef.current.connect({ params })
    callRef.current = call
    setCallState('connected')
    call.on('disconnect', () => { callRef.current = null; setMuted(false); setCallState('idle') })
    call.on('cancel',     () => { callRef.current = null; setMuted(false); setCallState('idle') })
  }, [deviceReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const hangUp = useCallback(() => {
    // Disconnect the Device leg (ends the rep's audio)
    callRef.current?.disconnect()
    // Force-kill the customer call server-side — handles the case where the rep
    // hangs up before fully joining the conference (customer would keep ringing otherwise)
    fetch('/api/dialer/call/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: identityRef.current }),
    }).catch(() => {})
  }, [])

  const toggleMute = useCallback(() => {
    if (!callRef.current) return
    const next = !muted
    callRef.current.mute(next)
    setMuted(next)
  }, [muted])

  const sendDtmf = useCallback((key: string) => {
    callRef.current?.sendDigits(key)
  }, [])

  return (
    <CallContext.Provider value={{
      deviceReady, deviceError, callState, currentLead, callDuration, muted, callerIdUsed,
      identity, setIdentity, placeCall, answerInbound, joinConference, hangUp, toggleMute, sendDtmf,
      setCurrentLead, setCallState,
    }}>
      {children}
    </CallContext.Provider>
  )
}

export function useCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used within CallProvider')
  return ctx
}
