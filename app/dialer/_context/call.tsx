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
  identity:       string
  setIdentity:    (id: string) => void
  placeCall:      (lead: Lead, meta?: { firm?: string; campaign?: string; campaignId?: string }) => Promise<void>
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
  const [identity,     setIdentity]     = useState('agent')

  const deviceRef   = useRef<any>(null)
  const callRef     = useRef<any>(null)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const initStarted = useRef(false)

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
      device.on('incoming', (call: any) => {
        callRef.current = call
        const from = call.parameters.From || ''
        const inboundLead: Lead = {
          id: call.parameters.CallSid ?? 'inbound', name: from || 'Inbound call',
          phone: from, email: '', company: '', source: 'inbound',
          tags: [], lastActivity: new Date().toISOString(), contactId: '',
        }
        setCurrentLead(inboundLead)
        setCallState('ringing')
        call.on('accept',     () => setCallState('connected'))
        call.on('disconnect', handleCallEnd)
        call.on('cancel',     handleCallEnd)
        call.accept()
      })

      await device.register()
      deviceRef.current = device
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

  const placeCall = useCallback(async (lead: Lead, meta?: { firm?: string; campaign?: string; campaignId?: string }) => {
    if (!deviceRef.current || !deviceReady) return
    setCurrentLead(lead)
    setCallState('ringing')

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
        }),
      })
      const data = await res.json()
      if (!data.confName) throw new Error('Failed to create conference')

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

  const hangUp = useCallback(() => callRef.current?.disconnect(), [])

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
      deviceReady, deviceError, callState, currentLead, callDuration, muted,
      identity, setIdentity, placeCall, joinConference, hangUp, toggleMute, sendDtmf,
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
