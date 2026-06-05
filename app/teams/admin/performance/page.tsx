'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'

interface Rep { id: string; name: string }
interface ScoreEntry {
  id: string
  user_id: string
  date: string
  score: number
  notes: string | null
  profiles: { name: string } | null
}

export default function AdminPerformancePage() {
  const [reps, setReps] = useState<Rep[]>([])
  const [scores, setScores] = useState<ScoreEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [userId, setUserId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [score, setScore] = useState('5')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const fetchScores = useCallback(async () => {
    const res = await fetch('/api/teams/admin/performance')
    if (res.ok) {
      const d = await res.json()
      setScores(d.scores || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/teams/admin/reps').then(r => r.json()).then(d => {
      setReps((d.reps || []).map((r: any) => ({ id: r.id, name: r.name })))
    })
    fetchScores()
  }, [fetchScores])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) { setMsg('Select a rep.'); return }
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/teams/admin/performance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, date, score: Number(score), notes: notes.trim() || null }),
    })
    const d = await res.json()
    if (!res.ok) { setMsg(`Error: ${d.error}`); setSaving(false); return }
    setMsg('Score saved!')
    setNotes('')
    await fetchScores()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this score?')) return
    await fetch(`/api/teams/admin/performance?id=${id}`, { method: 'DELETE' })
    await fetchScores()
  }

  // Group scores by rep for display
  const scoresByRep: Record<string, ScoreEntry[]> = {}
  for (const s of scores) {
    const name = s.profiles?.name || s.user_id
    if (!scoresByRep[name]) scoresByRep[name] = []
    scoresByRep[name].push(s)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Daily Performance</h1>
        <p className="text-sm text-gray-500 mt-1">Enter daily scores for each rep (1–5). Average ≥ 4.5 earns a bonus.</p>
      </div>

      {/* Entry form */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Log Score</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rep</label>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select rep...</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Score (1–5)</label>
            <select
              value={score}
              onChange={e => setScore(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['5', '4.5', '4', '3.5', '3', '2.5', '2', '1.5', '1'].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Great calls today"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-2 sm:col-span-4 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-50 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save Score'}
            </button>
            {msg && <p className={`text-sm font-medium ${msg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}
          </div>
        </form>
      </div>

      {/* Score history */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : scores.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-12 text-center text-gray-400 text-sm">
          No scores logged yet.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(scoresByRep).map(([repName, repScores]) => {
            const avg = repScores.reduce((sum, s) => sum + Number(s.score), 0) / repScores.length
            return (
              <div key={repName} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
                  <span className="font-semibold text-gray-900">{repName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">Avg: <span className={`font-bold ${avg >= 4.5 ? 'text-green-600' : 'text-gray-700'}`}>{avg.toFixed(2)}</span></span>
                    {avg >= 4.5 && <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Bonus!</span>}
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {repScores.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm text-gray-700">{format(new Date(s.date + 'T12:00:00'), 'EEE, MMM d, yyyy')}</p>
                        {s.notes && <p className="text-xs text-gray-400 mt-0.5">{s.notes}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold ${Number(s.score) >= 4.5 ? 'text-green-600' : 'text-gray-700'}`}>{s.score}</span>
                        <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
