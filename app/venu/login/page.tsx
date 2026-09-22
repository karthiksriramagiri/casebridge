'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function VenuLogin() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Same credentials as the Team Center — look the email up by name.
      const lookupRes = await fetch('/api/teams/auth/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const lookup = await lookupRes.json()
      if (!lookupRes.ok) {
        setError(lookup.error || 'Invalid name or password.')
        return
      }

      const { error: authError } = await createClient().auth.signInWithPassword({
        email: lookup.email,
        password,
      })
      if (authError) {
        setError(authError.message)
        return
      }

      router.push('/venu')
      router.refresh()
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
        <h1 className="venu-h1" style={{ fontSize: 34, marginTop: 30 }}>Venu</h1>
        <p className="venu-sub">Setter training.</p>
      </section>

      <section className="venu-login-form">
        <div style={{ width: '100%', maxWidth: 340 }}>
          <h2 className="venu-h1" style={{ fontSize: 28 }}>Welcome back</h2>
          <p className="venu-sub" style={{ marginBottom: 26 }}>
            Sign in with your Team Center name and password.
          </p>

          {error && <div className="venu-note" style={{ borderColor: '#f0c4c0', marginBottom: 16 }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <label className="venu-label" htmlFor="name">Your name</label>
            <input
              id="name" className="venu-input" required autoComplete="name"
              value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith"
            />

            <label className="venu-label" htmlFor="password" style={{ marginTop: 16 }}>Password</label>
            <input
              id="password" className="venu-input" type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
            />

            <button className="venu-btn" style={{ width: '100%', marginTop: 24 }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 20 }}>
            Access is granted by your team admin.
          </p>
        </div>
      </section>
    </main>
  )
}
