'use client'

import { useState, useEffect } from 'react'
import { PageBody, PageHeader } from '../../../_components/ui/shell'

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
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Add Rep</h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Pablo García"
              required
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          {[
            { label: 'Email',    key: 'email',    type: 'email',    placeholder: 'pablo@casebridge.com' },
            { label: 'Password', key: 'password', type: 'password', placeholder: 'Min 8 characters' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{f.label}</label>
              <input
                type={f.type}
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                required
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Twilio Identity <span className="text-muted-foreground">(auto-filled from name)</span>
            </label>
            <input
              type="text"
              value={form.twilio_identity}
              onChange={e => setForm(p => ({ ...p, twilio_identity: e.target.value }))}
              placeholder="pablo"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="REP">Rep</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50">
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
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Edit {rep.name}</h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Twilio Identity</label>
            <input
              type="text"
              value={form.twilio_identity}
              onChange={e => setForm(p => ({ ...p, twilio_identity: e.target.value }))}
              placeholder="pablo"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value as any }))}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="REP">Rep</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50">
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
    <>
      <PageHeader
        title="Users"
        description={`${reps.length} accounts`}
        actions={
        <button onClick={() => setShowAdd(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary">
          + Add Rep
        </button>
        }
      />
      <PageBody>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-muted/50" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Name', 'Email', 'Role', 'Twilio Identity', 'Spanish', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reps.map(rep => (
                <tr key={rep.id} className={`hover:bg-muted/50/50 ${!rep.active ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {rep.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">{rep.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{rep.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      rep.role === 'ADMIN'
                        ? 'bg-accent text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {rep.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs">
                    {rep.twilio_identity
                      ? <span className="text-muted-foreground">{rep.twilio_identity}</span>
                      : <span className="text-warning font-semibold">not set</span>
                    }
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => toggleSpanish(rep)}
                      disabled={updating === rep.id}
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 ${
                        rep.spanish
                          ? 'bg-warning/20 text-warning'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {rep.spanish ? 'ES' : '—'}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${rep.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {rep.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setEditRep(rep)}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(rep)}
                        disabled={updating === rep.id}
                        className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-40 transition-colors"
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
      </PageBody>
    </>
  )
}
