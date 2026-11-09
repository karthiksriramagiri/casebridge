'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ALLOCATION_LABELS, ALLOCATION_METHODS, OPEX_CATEGORIES, OPEX_CATEGORY_LABELS,
  type AllocationMethod, type Firm, type OpexCategory,
} from '@/lib/finance/reporting/types'

/* Adding an operating expense.

   Two fields decide where the money lands and they are the two people get
   wrong, so the form says what each does rather than leaving it to be
   inferred:

     recurrence   whether the cost is earned on one day or across a period.
                  A yearly licence bought in January is not a January cost.
     allocation   whether it reaches a firm at all, and how it splits when
                  it reaches several.

   Everything else is bookkeeping. */
export function ExpenseForm({ firms, defaultDate }: { firms: Firm[]; defaultDate: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    expenseDate: defaultDate,
    serviceStart: defaultDate,
    serviceEnd: defaultDate,
    vendor: '',
    description: '',
    category: 'software' as OpexCategory,
    amount: '',
    recurrence: 'one_time' as 'one_time' | 'monthly',
    allocation: 'unallocated' as AllocationMethod,
    firmIds: [] as string[],
    notes: '',
  })
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/finance/expenses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) || 0 }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? 'Could not save.')
        return
      }
      setOpen(false)
      setForm((f) => ({ ...f, vendor: '', description: '', amount: '', notes: '' }))
      /* The report is rendered on the server, so the new expense only
         appears once the server has recomputed the ledger. */
      router.refresh()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="fin-btn" onClick={() => setOpen(true)}>
        Add expense
      </button>
    )
  }

  const perFirm = form.allocation !== 'unallocated'

  return (
    <form className="fin-form" style={{ border: '1px solid var(--line)', borderRadius: 6, marginBottom: 12 }} onSubmit={submit}>
      <div className="fin-row3">
        <label className="fin-field">
          <span>Date</span>
          <input type="date" className="fin-input" value={form.expenseDate} required
                 onChange={(e) => set({ expenseDate: e.target.value })} />
        </label>
        <label className="fin-field">
          <span>Vendor</span>
          <input className="fin-input" value={form.vendor} placeholder="Adobe, AWS, …"
                 onChange={(e) => set({ vendor: e.target.value })} />
        </label>
        <label className="fin-field">
          <span>Amount (USD)</span>
          <input className="fin-input fin-num" inputMode="decimal" value={form.amount} required placeholder="0.00"
                 onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, '') })} />
        </label>
      </div>

      <div className="fin-row3">
        <label className="fin-field">
          <span>Category</span>
          <select className="fin-select" value={form.category}
                  onChange={(e) => set({ category: e.target.value as OpexCategory })}>
            {OPEX_CATEGORIES.map((c) => (
              <option key={c} value={c}>{OPEX_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label className="fin-field">
          <span>Covers</span>
          <select className="fin-select" value={form.recurrence}
                  onChange={(e) => set({ recurrence: e.target.value as 'one_time' | 'monthly' })}>
            <option value="one_time">A single day</option>
            <option value="monthly">A period — spread evenly across it</option>
          </select>
        </label>
        <label className="fin-field">
          <span>Allocation</span>
          <select className="fin-select" value={form.allocation}
                  onChange={(e) => set({ allocation: e.target.value as AllocationMethod, firmIds: [] })}>
            {ALLOCATION_METHODS.map((m) => (
              <option key={m} value={m}>{ALLOCATION_LABELS[m]}</option>
            ))}
          </select>
        </label>
      </div>

      {form.recurrence === 'monthly' && (
        <div className="fin-row2">
          <label className="fin-field">
            <span>Service period from</span>
            <input type="date" className="fin-input" value={form.serviceStart}
                   onChange={(e) => set({ serviceStart: e.target.value })} />
          </label>
          <label className="fin-field">
            <span>to</span>
            <input type="date" className="fin-input" value={form.serviceEnd}
                   onChange={(e) => set({ serviceEnd: e.target.value })} />
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
                  name="expense-firms"
                  checked={form.firmIds.includes(f.id)}
                  onChange={(e) =>
                    set({
                      firmIds:
                        form.allocation === 'direct'
                          ? [f.id]
                          : e.target.checked
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
        <input className="fin-input" value={form.description} placeholder="What it was for"
               onChange={(e) => set({ description: e.target.value })} />
      </label>

      {error && <p className="fin-err">{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="fin-btn pri" disabled={busy}>
          {busy ? 'Saving…' : 'Save expense'}
        </button>
        <button type="button" className="fin-btn" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
