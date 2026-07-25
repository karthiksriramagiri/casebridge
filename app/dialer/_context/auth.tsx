'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '../_lib/supabase'

interface AuthContextValue {
  user:     User | null
  name:     string
  role:     'REP' | 'ADMIN'
  identity: string   // Twilio identity
  signOut:  () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children, initialUser }: {
  children: React.ReactNode
  initialUser: User | null
}) {
  const [user, setUser] = useState<User | null>(initialUser)
  const supabase = createClient()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const role     = (user?.user_metadata?.role             ?? 'REP')             as 'REP' | 'ADMIN'
  const identity = (user?.user_metadata?.twilio_identity  ?? '')                as string
  const name     = (user?.user_metadata?.name             ?? user?.email ?? '') as string

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/dialer/login'
  }

  return (
    <AuthContext.Provider value={{ user, name, role, identity, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
