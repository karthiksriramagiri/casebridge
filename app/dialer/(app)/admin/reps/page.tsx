'use client'

import { useState, useEffect } from 'react'

interface Rep {
  id:              string
  name:            string
  email:           string
  role:            'REP' | 'ADMIN'
  twilio_identity: string | null
  active:          boolean
  spanish:         boolean
  created_at:      string
}

function autoIdentity(name: string) {
  return name.trim().split(/\s+/)[0].toLowerCase()
}

function AddRepModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form,    setForm]    = useState({ name: '', email: '', password: '', role: 'REP', twilio_identity: '' })
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handleNameChange(val: string) {
    setForm(p => ({
      ...p,
      name: val,
      // Auto-fill twilio_identity from first name unless user already typed something
      twilio_identity: p.twilio_identity === autoIdentity(p.name) || p.twilio_identity === ''
        ? autoIdentity(val)
        : p.twilio_identity,
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch('/api/dialer/admin/reps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(false); return }
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Add Rep</h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Pablo García"
              required
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          {[
            { label: 'Email',    key: 'email',    type: 'email',    placeholder: 'pablo@casebridge.com' },
            { label: 'Password', key: 'password', type: 'password', placeholder: 'Min 8 characters' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
              <input
                type={f.type}
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Twilio Identity <span className="text-gray-400">(auto-filled from name)</span>
            </label>
            <input
              type="text"
              value={form.twilio_identity}
              onChange={e => setForm(p => ({ ...p, twilio_identity: e.target.value }))}
              placeholder="pablo"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="REP">Rep</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
              {loading ? 'Creating…' : 'Create Rep'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditRepModal({ rep, onClose, onSaved }: { rep: Rep; onClose: () => void; onSaved: () => void }) {
  const [form,    setForm]    = useState({ name: rep.name, twilio_identity: rep.twilio_identity ?? '', role: rep.role })
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch('/api/dialer/admin/reps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rep.id, ...form }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(false); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Edit {rep.name}</h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Twilio Identity</label>
            <input
              type="text"
              value={form.twilio_identity}
              onChange={e => setForm(p => ({ ...p, twilio_identity: e.target.value }))}
              placeholder="pablo"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value as any }))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="REP">Rep</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function RepsPage() {
  const [reps,      setReps]      = useState<Rep[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showAdd,   setShowAdd]   = useState(false)
  const [editRep,   setEditRep]   = useState<Rep | null>(null)
  const [updating,  setUpdating]  = useState<string | null>(null)

  async function fetchReps() {
    const res = await fetch('/api/dialer/admin/reps')
    const data = await res.json()
    setReps(data.reps ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchReps() }, [])

  async function toggleActive(rep: Rep) {
    setUpdating(rep.id)
    await fetch('/api/dialer/admin/reps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rep.id, active: !rep.active }),
    })
    await fetchReps()
    setUpdating(null)
  }

  async function toggleSpanish(rep: Rep) {
    setUpdating(rep.id)
    await fetch('/api/dialer/admin/reps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rep.id, spanish: !rep.spanish }),
    })
    await fetchReps()
    setUpdating(null)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{reps.length} accounts</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">
          + Add Rep
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-gray-50 dark:bg-gray-800/50" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Name', 'Email', 'Role', 'Twilio Identity', 'Spanish', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {reps.map(rep => (
                <tr key={rep.id} className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/20 ${!rep.active ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {rep.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">{rep.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{rep.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      rep.role === 'ADMIN'
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {rep.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs">
                    {rep.twilio_identity
                      ? <span className="text-gray-500">{rep.twilio_identity}</span>
                      : <span className="text-amber-500 font-semibold">not set</span>
                    }
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => toggleSpanish(rep)}
                      disabled={updating === rep.id}
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 ${
                        rep.spanish
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                          : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                      }`}
                    >
                      {rep.spanish ? 'ES' : '—'}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${rep.active ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400' : 'bg-gray-100 text-gray-500'}`}>
                      {rep.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setEditRep(rep)}
                        className="text-xs text-gray-400 hover:text-cyan-500 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(rep)}
                        disabled={updating === rep.id}
                        className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                      >
                        {updating === rep.id ? '…' : rep.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd  && <AddRepModal  onClose={() => setShowAdd(false)}  onCreated={fetchReps} />}
      {editRep  && <EditRepModal rep={editRep} onClose={() => setEditRep(null)} onSaved={fetchReps} />}
    </div>
  )
}
