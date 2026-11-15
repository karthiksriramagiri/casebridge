'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'

/* "The list is carried out" — told to Jason, from the page it was carried
   out on.

   This used to live on the kill list and the launch list, one button each,
   which put the report two pages away from the meeting it reports on. The
   Execute page is where the ticking happens, so it is where the telling
   belongs; both buttons sit beside Export.

   The two lists post the same shape to the same endpoint, so the only
   thing that differs is what is counted and what the message calls it.
   Nothing is sent when nothing was ticked off: a day where the list was
   never worked is not a finished list, and reporting it as one is worse
   than saying nothing. */

export type NotifyGroup = { firm: string; adsets: { name: string; ads: string[] }[] }

export type NotifyDone = {
  board: 'kill' | 'launch'
  day: string
  dateLabel: string
  /** Ticked off — what is being reported. */
  count: number
  /** Still outstanding, which the button says out loud rather than hiding. */
  pending: number
  /** Budget freed by the kills, or added by the launches. */
  amount: number
  groups: NotifyGroup[]
}

export function NotifyDoneButton({
  label,
  payload,
  disabledReason,
}: {
  label: string
  payload: NotifyDone
  /** Why it cannot be pressed, or undefined when it can. */
  disabledReason?: string
}) {
  const [sending, setSending] = useState(false)

  const send = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/creative/lists/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          board: payload.board,
          phase: 'done',
          day: payload.day,
          dateLabel: payload.dateLabel,
          count: payload.count,
          /* The endpoint reads one or the other depending on the board —
             freed for a kill, budget for a launch — so both are sent and
             it takes the one it needs. */
          freed: payload.amount,
          budget: payload.amount,
          by: 'The K-Team',
          url: typeof window === 'undefined' ? '' : window.location.href,
          groups: payload.groups,
        }),
      })
      const d = await res.json().catch(() => ({ sent: false, error: 'No answer from the server.' }))
      if (!d.sent) {
        toast.error('Slack was not notified', { description: d.error ?? 'The message was not accepted.' })
        return
      }
      toast(`Jason notified — the ${payload.board === 'kill' ? 'kill' : 'launch'} list is done`, {
        description: d.repliedTo ? 'Posted as a reply under this morning’s list.' : undefined,
      })
    } catch (e) {
      toast.error('Slack was not notified', { description: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  const blocked = disabledReason ?? (payload.count === 0 ? 'Nothing has been ticked off yet' : undefined)

  return (
    <Button
      variant={payload.count > 0 && payload.pending === 0 ? 'default' : 'outline'}
      onClick={() => void send()}
      disabled={Boolean(blocked) || sending}
      title={
        blocked
          ?? (payload.pending > 0
            ? `${payload.pending} still outstanding — this reports the ${payload.count} already done`
            : 'Tell Jason the list is carried out')
      }
    >
      <CheckCircle2 aria-hidden /> {sending ? 'Sending…' : label}
    </Button>
  )
}
