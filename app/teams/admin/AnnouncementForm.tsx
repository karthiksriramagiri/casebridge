'use client'

import { useState } from 'react'

interface AnnouncementFormProps {
  currentContent: string
}

export default function AnnouncementForm({ currentContent }: AnnouncementFormProps) {
  const [content, setContent] = useState(currentContent)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handlePost() {
    if (!content.trim()) return
    setLoading(true)
    setMessage('')
    setError('')

    try {
      const res = await fetch('/api/teams/admin/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to post announcement')
      setMessage('Announcement posted successfully!')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleClear() {
    setLoading(true)
    setMessage('')
    setError('')

    try {
      const res = await fetch('/api/teams/admin/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to clear announcement')
      setContent('')
      setMessage('Announcement cleared.')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-full">
      <div className="flex items-start gap-2 mb-1">
        <span className="text-lg">📢</span>
        <div>
          <h2 className="text-base font-semibold text-gray-800">Team Announcement</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Post a message your reps will see at the top of their training dashboard.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="Write your announcement here..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition"
        />
      </div>

      {message && (
        <p className="text-sm text-green-600 font-medium mt-2">{message}</p>
      )}
      {error && (
        <p className="text-sm text-red-600 font-medium mt-2">{error}</p>
      )}

      <div className="flex gap-3 mt-4">
        <button
          onClick={handlePost}
          disabled={loading || !content.trim()}
          className="flex-1 bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg py-2.5 transition-colors flex items-center justify-center gap-1.5"
        >
          <span>📣</span>
          {loading ? 'Posting...' : 'Post Announcement'}
        </button>
        <button
          onClick={handleClear}
          disabled={loading}
          className="px-4 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 text-sm font-medium rounded-lg py-2.5 transition-colors"
        >
          ✕ Clear Current
        </button>
      </div>
    </div>
  )
}
