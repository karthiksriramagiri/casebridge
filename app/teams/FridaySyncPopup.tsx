'use client'
import { useState, useEffect } from 'react'

function getFridayKey() {
  // Key is unique per Friday date so it resets every week
  const now = new Date()
  const day = now.getDay() // 0=Sun, 5=Fri
  if (day !== 5) return null
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `friday_sync_${yyyy}-${mm}-${dd}_dismissed`
}

export default function FridaySyncPopup() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const key = getFridayKey()
    if (!key) return
    if (localStorage.getItem(key) === 'true') return
    setShow(true)
  }, [])

  function dismiss() {
    const key = getFridayKey()
    if (key) localStorage.setItem(key, 'true')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-[#0f1e3c] px-7 py-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">📅</span>
            <div>
              <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider">Every Friday</p>
              <h2 className="text-white text-xl font-bold">Weekly Sync Up</h2>
            </div>
          </div>
          <p className="text-blue-200 text-sm mt-2 ml-10">Today at <strong className="text-white">3:00 PM PST</strong></p>
        </div>

        {/* Body */}
        <div className="px-7 py-6">
          {/* Meet link */}
          <a
            href="https://meet.google.com/cwv-xecz-anc"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6 hover:bg-green-100 transition-colors group"
          >
            <svg className="w-5 h-5 text-green-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 18H4a2 2 0 01-2-2V8a2 2 0 012-2h16a2 2 0 012 2v8a2 2 0 01-2 2zM4 8v8h16V8H4zm10 1l5 3-5 3V9z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 font-medium">Google Meet</p>
              <p className="text-sm font-semibold text-green-700 group-hover:underline truncate">meet.google.com/cwv-xecz-anc</p>
            </div>
            <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          {/* Agenda */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Agenda</p>
          <div className="space-y-4">
            {[
              {
                title: 'Conference Session',
                items: [
                  'Lagging Points / Inefficiency points from the Rep side',
                  'Lagging Points / Inefficiency points from the Management side',
                ],
              },
              {
                title: 'Call Review Session',
                items: [
                  'Reasoning on why we lost this PC',
                  'Discussion on how we can make it better/closable',
                ],
              },
              {
                title: 'Evaluation Session',
                items: ['Scoreboard Analysis'],
              },
            ].map((section) => (
              <div key={section.title}>
                <p className="text-sm font-bold text-gray-900 mb-1.5">{section.title}</p>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <button
            onClick={dismiss}
            className="mt-6 w-full bg-[#0f1e3c] hover:bg-[#1a3060] text-white font-bold text-sm py-3 rounded-xl transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
