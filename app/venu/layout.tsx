import type { ReactNode } from 'react'
import Link from 'next/link'
import '../globals.css'
import './venu.css'
import { getVenuUser } from './_lib/auth'
import LogoutButton from './LogoutButton'

export const metadata = {
  title: 'Venu — Setter Training',
  description: 'Practice calls from the Nuance Book, scored on criteria and empathy.',
}

export default async function VenuLayout({ children }: { children: ReactNode }) {
  const user = await getVenuUser()

  return (
    <div className="venu">
      <header className="venu-topbar">
        <Link href="/venu" className="venu-mark">
          <span>V</span>
          <span>Venu</span>
        </Link>
        {user && (
          <div className="venu-who">
            <Link href="/venu/voice" style={{ color: 'inherit', textDecoration: 'none' }}>Voice</Link>
            {user.role === 'admin' && (
              <Link href="/venu/admin" style={{ color: 'inherit', textDecoration: 'none', marginLeft: 14 }}>Team</Link>
            )}
            {user.role === 'admin' && (
              <Link href="/venu/admin/candidates" style={{ color: 'inherit', textDecoration: 'none', marginLeft: 14 }}>Candidates</Link>
            )}
            <Link href="/teams/dashboard" style={{ color: 'inherit', textDecoration: 'none', marginLeft: 14 }}>
              Team Center
            </Link>
            <span style={{ marginLeft: 14 }}>{user.name}</span>
            <LogoutButton />
          </div>
        )}
      </header>
      {children}
    </div>
  )
}
