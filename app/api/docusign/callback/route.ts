import { NextResponse } from 'next/server'

// DocuSign redirects here after JWT consent grant — just confirm and close
export async function GET() {
  return new NextResponse(
    '<html><body><h2>DocuSign consent granted. You can close this tab.</h2></body></html>',
    { headers: { 'Content-Type': 'text/html' } }
  )
}
