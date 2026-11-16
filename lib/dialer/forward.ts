import 'server-only'
import twilio from 'twilio'

/* ═══════════════════════════════════════════════════════════════════════════
   Ringing a real phone when a call comes in.

   The dialer's inbound design is pull-only: the caller is parked in a
   conference on hold music and waits for a rep who has the dialer open in
   a browser to click Answer. When that does not happen the caller hears
   music for two minutes and is hung up on — 23 of the last 40 inbound
   calls ended exactly that way, which is what "it just plays the song"
   means.

   So the call now also rings a phone. Both ring at once and whoever picks
   up first joins the same conference; the other leg is cancelled. The
   browser flow is untouched — this is a second way in, not a replacement,
   and the conference is kept so a supervisor can still listen, whisper
   and barge.

   Off unless `DIALER_FORWARD_NUMBER` is set, so an unconfigured
   deployment behaves exactly as it did before.

   One rule matters more than the rest: the person who answers has to press
   a key before they are bridged. A mobile that goes to voicemail answers
   the call as far as Twilio is concerned, and without the keypress the
   caller would be handed to a voicemail greeting while the dialer recorded
   it as a successful pickup. Pressing 1 proves a human.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The phone to ring alongside the browser. Empty disables forwarding. */
export function forwardNumber(): string {
  return (process.env.DIALER_FORWARD_NUMBER ?? '').trim()
}

/** What the caller sees on that phone. Falls back to the dialer's own number. */
function forwardCallerId(dialed: string): string {
  const explicit = (process.env.DIALER_FORWARD_CALLER_ID ?? '').trim()
  if (explicit) return explicit
  /* The number the customer dialled, so the phone shows which firm's line
     is ringing rather than a number nobody recognises. */
  if (dialed) return dialed
  return (process.env.TWILIO_CALLER_ID ?? '').trim()
}

function client() {
  const sid = (process.env.TWILIO_ACCOUNT_SID ?? '').trim()
  const token = (process.env.TWILIO_AUTH_TOKEN ?? '').trim()
  if (!sid || !token) return null
  return twilio(sid, token)
}

/** Start the phone ringing. Returns the leg's CallSid, or null if it could not. */
export async function startForwardLeg({
  confName, callSid, dialedNumber, callerName, base,
}: {
  confName: string
  callSid: string
  dialedNumber: string
  callerName: string | null
  base: string
}): Promise<string | null> {
  const to = forwardNumber()
  const c = client()
  if (!to || !c) return null

  const url = new URL(`${base}/api/dialer/twiml/forward-join`)
  url.searchParams.set('conf', confName)
  url.searchParams.set('inbound', callSid)
  if (callerName) url.searchParams.set('who', callerName)

  try {
    const leg = await c.calls.create({
      to,
      from: forwardCallerId(dialedNumber),
      url: url.toString(),
      method: 'POST',
      /* The caller is already waiting on hold music, so a long ring here
         only lengthens what they sit through. Thirty seconds is about as
         long as anyone holds without hanging up. */
      timeout: 30,
      /* Twilio's own answering-machine detection is not relied on — the
         keypress is what proves a human — but asking for it keeps the
         leg's status honest in the logs. */
      statusCallback: `${base}/api/dialer/twiml/forward-status?inbound=${encodeURIComponent(callSid)}`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['completed'],
    })
    return leg.sid
  } catch (err) {
    /* A forward that cannot be placed must never take the inbound call
       down with it: the browser flow is still live and the caller is
       still holding. */
    console.error('[dialer:forward] could not ring the forward number', err)
    return null
  }
}

/** Stop the phone ringing — a rep got there first. */
export async function cancelForwardLeg(sid: string | null | undefined) {
  if (!sid) return
  const c = client()
  if (!c) return
  try {
    await c.calls(sid).update({ status: 'completed' })
  } catch (err) {
    /* Already finished, already answered, or never started. None of these
       are worth failing the answer the rep just made. */
    console.warn('[dialer:forward] could not cancel the forward leg', (err as Error).message)
  }
}
