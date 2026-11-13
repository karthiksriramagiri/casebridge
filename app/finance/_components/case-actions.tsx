'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/* What can be done to a signed case, from the list it is read in.

   The two things that go wrong with a case are both corrections of what it
   is, not of what it earned: it was swapped for another one, or it belongs
   to a different firm than the one it came in under. Both move money — a
   replacement delivers nothing, and a firm carries its own case price,
   commission and ad account — so both are made here, beside the figure
   they change, rather than in the lead record three systems away.

   Routing asks for the invoice too. A case moved to another firm keeps the
   old firm's invoice code otherwise, which is a row on an invoice that
   cannot be reconciled by anyone who later reads it. */

export type RouteFirm = { id: string; name: string }
export type RouteInvoice = { code: string; firmId: string; label: string }

export function CaseActions({
  id,
  name,
  firmId,
  invoiceCode,
  isReplacement,
  firms,
  invoices,
  onChanged,
}: {
  id: string
  name: string
  firmId: string
  invoiceCode: string | null
  isReplacement: boolean
  firms: RouteFirm[]
  invoices: RouteInvoice[]
  /* Called after a change lands. A page that fetched its own rows has to
     fetch them again — `router.refresh()` only re-runs the server, and on
     a client page that would leave the list showing what it showed before
     the button was pressed. */
  onChanged?: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [routing, setRouting] = useState(false)
  const [toFirm, setToFirm] = useState(firmId)
  const [toInvoice, setToInvoice] = useState(invoiceCode ?? '')

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/finance/pcs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not save.')
        return false
      }
      setRouting(false)
      if (onChanged) onChanged()
      else router.refresh()
      return true
    } catch {
      setError('Could not reach the server.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const replace = () => {
    /* Marking is the direction that removes revenue, so that is the one
       that asks. Putting a case back only restores what it already was. */
    if (!isReplacement && !confirm(`Mark ${name} as a replacement? It stops counting as a case delivered.`)) return
    save({ replacement: !isReplacement })
  }

  /* Only the chosen firm's invoices, because the server refuses any other
     pairing — better to not offer it than to offer it and be told no. */
  const options = invoices.filter((i) => i.firmId === toFirm)

  return (
    <div className="fin-rowacts">
      <div className="fin-rowacts-b">
        <button type="button" className={`fin-ot${isReplacement ? ' on' : ''}`}
                onClick={replace} disabled={busy} aria-pressed={isReplacement}
                title={isReplacement
                  ? 'Put it back as a case delivered.'
                  : 'A case swapped for another — it delivers nothing and stops counting.'}>
          {isReplacement ? 'Undo replacement' : 'Replace'}
        </button>
        <button type="button" className="fin-ot" disabled={busy}
                onClick={() => { setRouting(!routing); setError('') }}
                aria-expanded={routing}
                title="Move this case to another law firm and invoice.">
          {routing ? 'Cancel' : 'Route'}
        </button>
      </div>

      {routing && (
        <div className="fin-rowacts-f">
          <select className="fin-select fin-select-xs" value={toFirm} disabled={busy}
                  aria-label="Law firm"
                  onChange={(e) => {
                    setToFirm(e.target.value)
                    /* The old firm's invoice cannot follow the case to a new
                       firm, so it is dropped rather than carried into a
                       pairing the server will refuse. */
                    setToInvoice(e.target.value === firmId ? (invoiceCode ?? '') : '')
                  }}>
            {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select className="fin-select fin-select-xs" value={toInvoice} disabled={busy}
                  aria-label="Invoice"
                  onChange={(e) => setToInvoice(e.target.value)}>
            <option value="">No invoice</option>
            {options.map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}
          </select>
          <button type="button" className="fin-ot fin-ot-go" disabled={busy}
                  onClick={() => save({ firmId: toFirm, invoiceCode: toInvoice })}>
            {busy ? 'Saving…' : 'Move'}
          </button>
        </div>
      )}

      {error && <span className="fin-err">{error}</span>}
    </div>
  )
}
