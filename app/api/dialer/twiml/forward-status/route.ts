import { NextRequest, NextResponse } from 'next/server'

/* The forward leg finishing.

   Only logged. The inbound call's own `<Dial>` action already decides
   whether the call was missed, and a forward leg that rang out — nobody
   home, or voicemail that never pressed 1 — must not mark the call as
   anything: the caller is still holding and a rep in the browser can
   still pick up. Writing "missed" from here would close a call that is
   still live. */

export async function POST(req: NextRequest) {
  const body = new URLSearchParams(await req.text())
  console.log('[dialer:forward-status]', {
    inbound: req.nextUrl.searchParams.get('inbound'),
    leg: body.get('CallSid'),
    status: body.get('CallStatus'),
    answeredBy: body.get('AnsweredBy'),
    duration: body.get('CallDuration'),
  })
  return new NextResponse(null, { status: 204 })
}
