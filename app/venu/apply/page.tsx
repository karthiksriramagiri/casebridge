'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/* The shared link. Three fields and you have an account — the WhatsApp number
   matters because it is how we reach you once the interview is reviewed. */

const SOURCES = ['Upwork', 'Referral', 'LinkedIn', 'Facebook', 'Other']

export default function VenuApply() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', source: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/venu/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return }
      router.push(`/venu/apply/${data.token}`)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="venu-login">
      <section className="venu-login-stage">
        <div className="venu-orb lg" />
        <h1 className="venu-h1" style={{ fontSize: 34, marginTop: 30 }}>CaseBridge</h1>
        <p className="venu-sub" style={{ maxWidth: 360 }}>
          A short interview with Venu — a few questions about your background and the hours
          you can work. It takes about five minutes.
        </p>
      </section>

      <section className="venu-login-form">
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h2 className="venu-h1" style={{ fontSize: 28 }}>Start your application</h2>
          <p className="venu-sub" style={{ marginBottom: 26 }}>
            No password needed — you get a private link to come back to.
          </p>

          {error && <div className="venu-note" style={{ borderColor: '#f0c4c0', marginBottom: 16 }}>{error}</div>}

          <form onSubmit={submit}>
            <label className="venu-label" htmlFor="name">Your full name</label>
            <input id="name" className="venu-input" required autoComplete="name"
              value={form.name} onChange={set('name')} placeholder="Jane Smith" />

            <label className="venu-label" htmlFor="email" style={{ marginTop: 16 }}>Email</label>
            <input id="email" className="venu-input" type="email" autoComplete="email"
              value={form.email} onChange={set('email')} placeholder="jane@example.com" />

            <label className="venu-label" htmlFor="source" style={{ marginTop: 16 }}>Where did you find us?</label>
            <select id="source" className="venu-input" value={form.source} onChange={set('source')}>
              <option value="">Select one</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <button className="venu-btn" style={{ width: '100%', marginTop: 24 }} disabled={loading}>
              {loading ? 'Starting…' : 'Continue →'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
