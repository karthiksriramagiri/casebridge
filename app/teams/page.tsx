'use client'

import { useState, useEffect } from 'react'

const LOOM_VIDEO_ID = '54b8b6f4ad414c8f99525aebc65ecaef'
const CALENDLY_URL  = 'https://calendly.com/case-bridge-sales/casebridge-interview-schedule'

export default function TeamsSignupPage() {
  const [step, setStep] = useState<'landing' | 'video'>('landing')

  // Listen for Loom's postMessage end event and redirect to Calendly
  useEffect(() => {
    if (step !== 'video') return

    function handleMessage(e: MessageEvent) {
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        const isEnd =
          d?.type === 'loom:end' ||
          d?.event === 'loom:end' ||
          (d?.type === 'loom-player-event' && d?.data?.type === 'end') ||
          d?.action === 'video-ended'
        if (isEnd) window.location.href = CALENDLY_URL
      } catch {}
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [step])

  /* ── Landing ─────────────────────────────────────────────────────────── */
  if (step === 'landing') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="bg-[#0f1e3c] rounded-t-xl px-8 py-8 text-center">
            <h1 className="text-3xl font-bold text-white tracking-tight">CaseBridge Teams</h1>
            <p className="text-blue-200 text-sm mt-2">Personal Closer Program</p>
          </div>

          {/* Body */}
          <div className="bg-white rounded-b-xl shadow-lg px-8 py-10 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-[#0f1e3c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-3">Join as a Personal Closer</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-8">
              Watch a short overview of the role, then schedule your interview to get started with the CaseBridge team.
            </p>

            <button
              onClick={() => setStep('video')}
              className="w-full bg-[#0f1e3c] hover:bg-[#1a3060] text-white font-semibold py-3.5 px-6 rounded-lg transition-colors text-sm"
            >
              Sign Up — Watch Overview
            </button>

            <p className="text-xs text-gray-400 mt-4">
              Already on the team?{' '}
              <a href="/teams/login" className="text-[#0f1e3c] font-medium hover:underline">Sign in here</a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ── Video ───────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#0a1628] flex flex-col items-center justify-center px-4 py-8">
      {/* Top label */}
      <div className="mb-6 text-center">
        <p className="text-blue-300 text-xs font-medium uppercase tracking-widest mb-1">Step 1 of 2</p>
        <h2 className="text-white text-xl font-bold">Watch the Overview</h2>
        <p className="text-blue-200 text-sm mt-1 opacity-75">
          After the video, you'll be taken to schedule your interview.
        </p>
      </div>

      {/* Loom embed */}
      <div className="w-full max-w-3xl rounded-xl overflow-hidden shadow-2xl bg-black"
        style={{ aspectRatio: '16/9', position: 'relative' }}>
        <iframe
          src={`https://www.loom.com/embed/${LOOM_VIDEO_ID}?hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true`}
          frameBorder="0"
          allowFullScreen
          allow="autoplay; fullscreen"
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
        />
      </div>

      {/* Manual continue */}
      <div className="mt-8 text-center">
        <p className="text-blue-300 text-sm mb-4 opacity-75">
          Once you've finished watching, click below to schedule your interview.
        </p>
        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white text-[#0f1e3c] font-semibold py-3 px-8 rounded-lg hover:bg-blue-50 transition-colors text-sm"
        >
          Schedule My Interview
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </div>
  )
}
