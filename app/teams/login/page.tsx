'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
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
      // Look up the internal email by name
      const lookupRes = await fetch('/api/teams/auth/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const lookupData = await lookupRes.json()
      if (!lookupRes.ok) {
        setError(lookupData.error || 'Invalid name or password.')
        return
      }

      const supabase = createClient()

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: lookupData.email,
        password,
      })

      if (authError) {
        setError(authError.message)
        return
      }

      if (!authData.user) {
        setError('Sign in failed. Please try again.')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single()

      if (profileError || !profile) {
        setError('Could not fetch your profile. Please contact your administrator.')
        return
      }

      /* Back to where they were sent from, when they were sent from
         somewhere — the MIA board bounces here with `?next=/mia`, and
         landing on a dashboard instead would make them navigate twice.
         Only same-site paths are honoured: an absolute URL in a query
         string is an open redirect. */
      /* Read at submit rather than through useSearchParams, which would
         put this page behind a Suspense boundary just to prerender. */
      const next = new URLSearchParams(window.location.search).get('next')
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        router.push(next)
      } else if (profile.role === 'admin') {
        router.push('/teams/admin')
      } else {
        router.push('/teams/home')
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="tc-root min-h-dvh bg-muted/40 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header Card */}
        <div className="bg-primary rounded-t-xl px-8 py-6 text-center">
          <h1 className="text-2xl font-bold text-primary-foreground tracking-tight">CaseBridge Teams</h1>
          <p className="text-primary-foreground/85 text-sm mt-1">Training Platform</p>
        </div>

        {/* Form Card */}
        <div className="bg-card rounded-b-xl shadow-lg px-8 py-8">
          <h2 className="text-lg font-semibold text-foreground mb-6">Sign in to your account</h2>

          {error && (
            <div className="mb-4 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground/90 mb-1.5">
                Your Name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground/90 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-primary-foreground font-semibold rounded-lg py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              New Hire for CaseBridge?{' '}
              <a href="/teams/signup" className="text-primary font-bold text-base hover:underline">
                Click now →
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
