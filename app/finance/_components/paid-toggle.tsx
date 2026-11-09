'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/* Mark an invoice paid, or put it back.

   Writes the invoiced amount into `payment_received` — the column that
   already records cash — rather than a separate flag, so there is one
   place the book keeps this fact. Nothing else on the page moves: cash
   is not revenue, and revenue is recognised across the service period
   whatever the payment does. */
export function PaidToggle({ id, paid, amount }: { id: string; paid: boolean; amount: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggle = async () => {
    /* Putting a paid invoice back is the destructive direction — it
       erases a recorded receipt — so only that way round asks. */
    if (paid && !confirm('Mark this invoice unpaid? The recorded payment will be cleared.')) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/finance/invoices/paid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, paid: !paid }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not save.')
        return
      }
      router.refresh()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  if (paid) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span className="fin-pill pos">paid {amount}</span>
        <button type="button" className="fin-btn" style={{ padding: '2px 7px', fontSize: 11 }}
                onClick={toggle} disabled={busy} title="Clear the recorded payment">
          undo
        </button>
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button type="button" className="fin-btn" style={{ padding: '3px 9px', fontSize: 12 }}
              onClick={toggle} disabled={busy}>
        {busy ? 'Saving…' : 'Mark paid'}
      </button>
      {error && <span className="fin-err">{error}</span>}
    </span>
  )
}
