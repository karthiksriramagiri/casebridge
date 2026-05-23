import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  if (username === 'Admin' && password === 'Admin123') {
    const session = await getSession()
    session.isLoggedIn = true
    await session.save()
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 })
}
