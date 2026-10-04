import { NextRequest, NextResponse } from 'next/server'
import { getSession, ROLE_ACCESS, type Role } from '@/lib/session'

/* Accounts. The admin pair is unchanged so nobody's existing sign-in breaks.

   The creative account's password comes from the environment rather than the
   source: a password in the repo is a password in the git history, and this
   one is for a person outside the company. With the variable unset the account
   simply cannot sign in, which is the safe direction to fail. */
function roleFor(username: string, password: string): Role | null {
  if (username === 'Admin' && password === 'Admin123') return 'admin'

  const creativeUser = (process.env.CREATIVE_USER || 'Faisal').trim()
  const creativePass = (process.env.CREATIVE_USER_PASSWORD || '').trim()
  if (creativePass && username.toLowerCase() === creativeUser.toLowerCase() && password === creativePass) {
    return 'creative'
  }
  return null
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  const role = roleFor(String(username ?? ''), String(password ?? ''))

  if (role) {
    const session = await getSession()
    session.isLoggedIn = true
    session.role = role
    session.user = String(username)
    await session.save()
    return NextResponse.json({ success: true, role, home: ROLE_ACCESS[role].home })
  }

  return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 })
}
