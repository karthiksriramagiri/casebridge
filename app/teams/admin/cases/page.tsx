'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'

interface Rep { id: string; name: string }
interface CaseEntry {
  id: string
  user_id: string
  contact_name: string
  case_value: number | null
  status: string
  closed_at: string
  notes: string | null
  profiles: { name: string } | null
}

const STATUSES = ['signed', 'replacement', 'cancelled']
const STATUS_STYLES: Record<string, string> = {
  signed: 'bg-green-100 text-green-700',
  replacement: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-600',
}

export default function AdminCasesPage() {
  const [reps, setReps] = useState<Rep[]>([])
  const [cases, setCases] = useState<CaseEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [userId, setUserId] = useState('')
  const [contactName, setContactName] = useState('')
  const [caseValue, setCaseValue] = useState('')
  const [status, setStatus] = useState('signed')
  const [closedAt, setClosedAt] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const fetchCases = useCallback(async () => {
    const res = await fetch('/api/teams/admin/cases')
    if (res.ok) {
      const d = await res.json()
      setCases(d.cases || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/teams/admin/reps').then(r => r.json()).then(d => {
      setReps((d.reps || []).map((r: any) => ({ id: r.id, name: r.name })))
    })
    fetchCases()
  }, [fetchCases])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) { setMsg('Select a rep.'); return }
    if (!contactName.trim()) { setMsg('Enter a contact name.'); return }
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/teams/admin/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        contact_name: contactName.trim(),
        case_value: caseValue ? Number(caseValue) : null,
        status,
        closed_at: closedAt,
        notes: notes.trim() || null,
      }),
    })
    const d = await res.json()
    if (!res.ok) { setMsg(`Error: ${d.error}`); setSaving(false); return }
    setMsg('Case logged!')
    setContactName('')
    setCaseValue('')
    setNotes('')
    await fetchCases()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this case?')) return
    await fetch(`/api/teams/admin/cases?id=${id}`, { method: 'DELETE' })
    await fetchCases()
  }

  async function handleStatusChange(id: string, newStatus: string) {
    await fetch('/api/teams/admin/cases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    })
    await fetchCases()
  }

  // Group by rep
  const casesByRep: Record<string, CaseEntry[]> = {}
  for (const c of cases) {
    const name = c.profiles?.name || c.user_id
    if (!casesByRep[name]) casesByRep[name] = []
    casesByRep[name].push(c)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Rep Cases</h1>
        <p className="text-sm text-gray-500 mt-1">Log signed cases, replacements, and cancellations for each rep.</p>
      </div>

      {/* Entry form */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Log Case</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name</label>
            <input
              type="text"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="John Doe"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Case Value ($)</label>
            <input
              type="number"
              value={caseValue}
              onChange={e => setCaseValue(e.target.value)}
              placeholder="e.g. 2500"
              min="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date Closed</label>
            <input
              type="date"
              value={closedAt}
              onChange={e => setClosedAt(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any relevant notes"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-2 sm:col-span-3 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-50 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Log Case'}
            </button>
            {msg && <p className={`text-sm font-medium ${msg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}
          </div>
        </form>
      </div>

      {/* Case history */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : cases.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-12 text-center text-gray-400 text-sm">
          No cases logged yet.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(casesByRep).map(([repName, repCases]) => {
            const signed = repCases.filter(c => c.status === 'signed').length
            const totalValue = repCases.filter(c => c.status === 'signed').reduce((sum, c) => sum + (c.case_value || 0), 0)
            return (
              <div key={repName} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
                  <span className="font-semibold text-gray-900">{repName}</span>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{signed} signed</span>
                    {totalValue > 0 && <span className="font-semibold text-gray-700">${totalValue.toLocaleString()}</span>}
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {repCases.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3 gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{c.contact_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {format(new Date(c.closed_at + 'T12:00:00'), 'MMM d, yyyy')}
                          {c.notes && ` · ${c.notes}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {c.case_value && (
                          <span className="text-sm font-semibold text-gray-700">${Number(c.case_value).toLocaleString()}</span>
                        )}
                        <select
                          value={c.status}
                          onChange={e => handleStatusChange(c.id, e.target.value)}
                          className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${STATUS_STYLES[c.status] || 'bg-gray-100 text-gray-600'}`}
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                        <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
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
