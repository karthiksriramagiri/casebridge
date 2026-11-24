'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ALLOCATION_LABELS, ALLOCATION_METHODS, OPEX_CATEGORIES, OPEX_CATEGORY_LABELS,
  type AllocationMethod, type Firm, type OpexCategory,
} from '@/lib/finance/reporting/types'

/* One expense, and what can be done to it — in the list it is read in.

   Editing happens in place rather than on a page of its own: an expense is
   six fields, and a reader who has just found the wrong one wants to fix
   it where they found it. Voiding rather than deleting, which is what the
   endpoint does: an expense that has already moved a reported margin
   cannot simply vanish, or the margin it moved becomes unexplainable. A
   void row stays in the list, struck through, and stops counting.

   The shape below is what both callers hand over.

   The expenses page reads the table directly and the Reporting Center
   reads it through the ledger, so the two arrive with different field
   names for the same row. Rather than teach this component both, each
   caller hands over this shape — which is the report's, because that one
   is already camelCase. */
export type ExpenseRecord = {
  id: string
  expenseDate: string
  servicePeriodStart: string
  servicePeriodEnd: string
  description: string
  vendor: string
  category: OpexCategory
  amountCents: number
  recurrence: 'one_time' | 'monthly'
  allocationMethod: AllocationMethod
  firmIds: string[]
  status: 'posted' | 'pending' | 'void'
  notes: string
  updatedBy?: string
}

/** The table's own column names, mapped to the shape above. */
export function fromRow(r: any): ExpenseRecord {
  return {
    id: r.id,
    expenseDate: String(r.expense_date).slice(0, 10),
    servicePeriodStart: String(r.service_start).slice(0, 10),
    servicePeriodEnd: String(r.service_end).slice(0, 10),
    description: r.description ?? '',
    vendor: r.vendor ?? '',
    category: r.category,
    amountCents: Number(r.amount_cents) || 0,
    recurrence: r.recurrence === 'monthly' ? 'monthly' : 'one_time',
    allocationMethod: r.allocation,
    firmIds: Array.isArray(r.firm_ids) ? r.firm_ids : [],
    status: r.status,
    notes: r.notes ?? '',
    updatedBy: r.updated_by ?? '',
  }
}

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const day = (iso: string) =>
  new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })

export function ExpenseRow({
  e, firms, extra, columns = 7,
}: {
  e: ExpenseRecord
  firms: Firm[]
  /* A cell this component does not own, rendered before the controls —
     the Reporting Center's "recognised in range", which only makes sense
     against a window this component knows nothing about. */
  extra?: React.ReactNode
  /** How wide the editor row has to span in the host table. */
  columns?: number
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    expenseDate: e.expenseDate.slice(0, 10),
    serviceStart: e.servicePeriodStart.slice(0, 10),
    serviceEnd: e.servicePeriodEnd.slice(0, 10),
    vendor: e.vendor,
    description: e.description,
    category: e.category,
    amount: String(e.amountCents / 100),
    recurrence: e.recurrence,
    allocation: e.allocationMethod,
    firmIds: e.firmIds ?? [],
    notes: e.notes,
  })
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/finance/expenses', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: e.id, ...form, amount: Number(form.amount) || 0 }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not save.')
        return
      }
      setEditing(false)
      router.refresh()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  const voidIt = async () => {
    if (!confirm(`Void ${e.vendor || 'this expense'}? It stops counting toward any margin but stays on the list.`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/finance/expenses?id=${e.id}`, { method: 'DELETE' })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not void.')
        return
      }
      router.refresh()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/finance/expenses', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: e.id, ...form, amount: Number(form.amount) || 0, status: 'posted' }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Could not restore.')
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const voided = e.status === 'void'
  const firmNames = (e.firmIds ?? [])
    .map((id) => firms.find((f) => f.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  if (!editing) {
    return (
      <tr style={voided ? { opacity: 0.55 } : undefined}>
        <td className="fin-num">{day(e.expenseDate)}</td>
        <td>
          <span style={voided ? { textDecoration: 'line-through' } : undefined}>{e.vendor || '—'}</span>
          {voided && <> <span className="fin-tag warn">void</span></>}
          {e.status === 'pending' && <> <span className="fin-tag">pending</span></>}
        </td>
        <td>{e.description || '—'}</td>
        <td>{OPEX_CATEGORY_LABELS[e.category]}</td>
        <td>
          {e.allocationMethod === 'unallocated' ? 'Company' : firmNames || ALLOCATION_LABELS[e.allocationMethod]}
          {e.recurrence === 'monthly' && (
            <div className="fin-fig-s fin-num">{day(e.servicePeriodStart)} – {day(e.servicePeriodEnd)}</div>
          )}
        </td>
        <td className="n fin-num">{money(e.amountCents)}</td>
        {extra}
        <td className="n">
          <div className="fin-rowacts-b">
            <button type="button" className="fin-ot" onClick={() => setEditing(true)} disabled={busy}>Edit</button>
            {voided ? (
              <button type="button" className="fin-ot" onClick={restore} disabled={busy}>Restore</button>
            ) : (
              <button type="button" className="fin-ot" onClick={voidIt} disabled={busy}>Void</button>
            )}
          </div>
          {error && <span className="fin-err">{error}</span>}
        </td>
      </tr>
    )
  }

  const perFirm = form.allocation !== 'unallocated'

  return (
    <tr>
      <td colSpan={columns} style={{ padding: 0 }}>
        <form className="fin-form" onSubmit={save}>
          <div className="fin-row3">
            <label className="fin-field">
              <span>Date</span>
              <input type="date" className="fin-input" value={form.expenseDate} required
                     onChange={(ev) => set({ expenseDate: ev.target.value })} />
            </label>
            <label className="fin-field">
              <span>Vendor</span>
              <input className="fin-input" value={form.vendor}
                     onChange={(ev) => set({ vendor: ev.target.value })} />
            </label>
            <label className="fin-field">
              <span>Amount (USD)</span>
              <input className="fin-input fin-num" inputMode="decimal" value={form.amount} required
                     onChange={(ev) => set({ amount: ev.target.value.replace(/[^\d.]/g, '') })} />
            </label>
          </div>

          <div className="fin-row3">
            <label className="fin-field">
              <span>Category</span>
              <select className="fin-select" value={form.category}
                      onChange={(ev) => set({ category: ev.target.value as OpexCategory })}>
                {OPEX_CATEGORIES.map((c) => <option key={c} value={c}>{OPEX_CATEGORY_LABELS[c]}</option>)}
              </select>
            </label>
            <label className="fin-field">
              <span>Covers</span>
              <select className="fin-select" value={form.recurrence}
                      onChange={(ev) => set({ recurrence: ev.target.value as 'one_time' | 'monthly' })}>
                <option value="one_time">A single day</option>
                <option value="monthly">A period — spread evenly across it</option>
              </select>
            </label>
            <label className="fin-field">
              <span>Allocation</span>
              <select className="fin-select" value={form.allocation}
                      onChange={(ev) => set({ allocation: ev.target.value as AllocationMethod, firmIds: [] })}>
                {ALLOCATION_METHODS.map((m) => <option key={m} value={m}>{ALLOCATION_LABELS[m]}</option>)}
              </select>
            </label>
          </div>

          {form.recurrence === 'monthly' && (
            <div className="fin-row2">
              <label className="fin-field">
                <span>Service period from</span>
                <input type="date" className="fin-input" value={form.serviceStart}
                       onChange={(ev) => set({ serviceStart: ev.target.value })} />
              </label>
              <label className="fin-field">
                <span>to</span>
                <input type="date" className="fin-input" value={form.serviceEnd}
                       onChange={(ev) => set({ serviceEnd: ev.target.value })} />
              </label>
            </div>
          )}

          {perFirm && (
            <div className="fin-field">
              <span>{form.allocation === 'direct' ? 'Firm' : 'Firms to split between'}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 2 }}>
                {firms.map((f) => (
                  <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input
                      type={form.allocation === 'direct' ? 'radio' : 'checkbox'}
                      name={`edit-firms-${e.id}`}
                      checked={form.firmIds.includes(f.id)}
                      onChange={(ev) =>
                        set({
                          firmIds: form.allocation === 'direct'
                            ? [f.id]
                            : ev.target.checked
                              ? [...form.firmIds, f.id]
                              : form.firmIds.filter((x) => x !== f.id),
                        })
                      }
                    />
                    {f.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="fin-field">
            <span>Description</span>
            <input className="fin-input" value={form.description}
                   onChange={(ev) => set({ description: ev.target.value })} />
          </label>

          {error && <p className="fin-err">{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="fin-btn pri" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            <button type="button" className="fin-btn" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            {e.updatedBy && (
              <span className="fin-fig-s" style={{ alignSelf: 'center' }}>
                last changed by {e.updatedBy}
              </span>
            )}
          </div>
        </form>
      </td>
    </tr>
  )
}
