'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import { Input } from '@/app/creative/_ui/input'
import type { Role } from '@/app/creative/_lib/types'
import { WORKSPACE_LANDING } from '@/app/creative/_lib/workspaces'

/* One sign-in, not a workspace chooser.

   Picking a workspace and then proving who you are asked the same question
   twice: the credentials already say which workspace you belong to. Jason's
   account opens the admin side, Faisal's opens the Creative Team board, and
   the form is the same either way. */
export function CreativeLogin({ base }: { base: string }) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Could not sign in. Try again.')
        setBusy(false)
        return
      }
      router.replace(base + WORKSPACE_LANDING[data.role as Role])
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection.')
      setBusy(false)
    }
  }

  return (
    <div className="cc-root">
      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-16">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            CC
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight">Creative Center</h1>
          <p className="max-w-xs text-pretty text-muted-foreground">Sign in to continue.</p>
        </div>

        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-card p-6">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Username
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              className="h-9"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Password
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="h-9"
            />
          </label>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </p>
          )}

          <Button type="submit" disabled={busy || !username || !password} className="mt-1 w-full">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </main>
    </div>
  )
}
