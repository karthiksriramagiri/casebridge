import { NextRequest, NextResponse } from 'next/server'
import { appendSignedCase } from '@/app/lib/google-sheets'

// Temporary test endpoint — remove after confirming Sheets integration works
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.GHL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await appendSignedCase({
      fullName: 'Test Client',
      phone: '+15555555555',
      email: 'test@example.com',
      dol: '2026-03-15',
      signUpDate: new Date().toISOString().split('T')[0],
      sheetTab: 'INV-1',
    })
    return NextResponse.json({ success: true, message: 'Row written to INV-1 tab' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
