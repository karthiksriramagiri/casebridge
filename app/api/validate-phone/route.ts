import { NextRequest, NextResponse } from 'next/server'

const TRESTLE_API_KEY = process.env.TRESTLE_API_KEY!

function formatE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

export async function POST(req: NextRequest) {
  if (!TRESTLE_API_KEY) {
    return NextResponse.json({ valid: true }, { status: 200 })
  }

  let body: { phone?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ valid: false, message: 'Invalid request' }, { status: 400 })
  }

  const raw = (body.phone || '').trim()
  const digits = raw.replace(/\D/g, '')

  if (digits.length < 10) {
    return NextResponse.json({ valid: false, message: 'Enter a valid 10-digit phone number.' })
  }

  const e164 = formatE164(raw)

  try {
    const url = new URL('https://api.trestleiq.com/3.1/phone')
    url.searchParams.set('phone', e164)

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'x-api-key': TRESTLE_API_KEY, 'Accept': 'application/json' },
      cache: 'no-store',
    })

    // If Trestle is down, fail open so form still works
    if (!res.ok) {
      console.error('Trestle error:', res.status)
      return NextResponse.json({ valid: true })
    }

    const data = await res.json()
    const isValid = data.is_valid === true

    return NextResponse.json({
      valid: isValid,
      message: isValid ? '' : 'This phone number is not valid. Please check and try again.',
    })
  } catch (err) {
    console.error('validate-phone error:', err)
    // Fail open on network errors
    return NextResponse.json({ valid: true })
  }
}
