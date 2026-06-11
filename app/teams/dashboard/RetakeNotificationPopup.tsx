'use client'

import { useState, useEffect } from 'react'

interface RetakeNotification {
  id: string
  module_id: string
  module_title: string
  message: string | null
  created_at: string
}

export default function RetakeNotificationPopup() {
  const [notifications, setNotifications] = useState<RetakeNotification[]>([])
  const [show, setShow] = useState(false)
  const [acking, setAcking] = useState(false)

  useEffect(() => {
    fetch('/api/teams/retake-notifications')
      .then(r => r.json())
      .then(d => {
        if (d.notifications?.length > 0) {
          setNotifications(d.notifications)
          setShow(true)
        }
      })
      .catch(() => {})
  }, [])

  async function acknowledge() {
    setAcking(true)
    try {
      await fetch('/api/teams/retake-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: notifications.map(n => n.id) }),
      })
      setShow(false)
    } catch {}
    setAcking(false)
  }

  if (!show || notifications.length === 0) return null

  const message = notifications[0].message // same message across all, use first

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-orange-500 px-7 py-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔄</span>
            <div>
              <p className="text-orange-100 text-xs font-semibold uppercase tracking-wider">Action Required</p>
              <h2 className="text-white text-xl font-bold">Module Retake Required</h2>
            </div>
          </div>
          <p className="text-orange-100 text-sm mt-2 ml-11">
            Your manager has asked you to redo {notifications.length === 1 ? 'a module' : `${notifications.length} modules`}.
          </p>
        </div>

        {/* Body */}
        <div className="px-7 py-6">
          {message && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mb-5 text-sm text-orange-800">
              <p className="font-semibold text-xs uppercase tracking-wide text-orange-500 mb-1">Message from your manager</p>
              <p>{message}</p>
            </div>
          )}

          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Modules to retake</p>
          <div className="space-y-2 mb-6">
            {notifications.map(n => (
              <div key={n.id} className="flex items-center gap-2.5 bg-gray-50 rounded-lg px-4 py-2.5">
                <span className="text-orange-400 text-base">📋</span>
                <span className="text-sm font-medium text-gray-800">{n.module_title}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 mb-4">
            Your previous completion{notifications.length !== 1 ? 's have' : ' has'} been reset. Head to the Training page to redo {notifications.length !== 1 ? 'them' : 'it'}.
          </p>

          <button
            onClick={acknowledge}
            disabled={acking}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-sm py-3 rounded-xl transition-colors"
          >
            {acking ? 'Confirming…' : 'Got it — I\'ll retake them'}
          </button>
        </div>
      </div>
    </div>
  )
}
