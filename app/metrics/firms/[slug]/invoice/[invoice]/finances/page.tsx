'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { invoiceCodeFromRouteSegment } from '@/app/metrics/firms/_lib/invoice-routes'
import { fmt$, ExpensesPanel } from '@/app/metrics/firms/_components/firm-metrics-shared'

const BASE_PAY_PER_CASE = 5
const COMMISSION_PER_CLOSED = 25

export default function FinancesPage() {
  const params = useParams()
  const slug = params.slug as string
  const invoiceCode = invoiceCodeFromRouteSegment(params.invoice as string)

  const [kpi, setKpi] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(invoiceCode)}`)
      .then(r => r.json())
      .then(d => { setKpi(d); setLoading(false) })
  }, [slug, invoiceCode])

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>

  const s = kpi?.summary
  const pcs: any[] = kpi?.pcs || []
  const payment = kpi?.payment
  const sanguine = kpi?.sanguine
  const replacementDays = kpi?.firm?.replacement_window_days ?? 14
  const today = new Date()

  // Worker payroll calc
  const workerMap: Record<string, { signedCases: number; closedCases: number }> = {}
  for (const pc of pcs) {
    if (!pc.workerName) continue
    if (!workerMap[pc.workerName]) workerMap[pc.workerName] = { signedCases: 0, closedCases: 0 }
    workerMap[pc.workerName].signedCases += 1
    const st = (pc.caseStatus || '').toLowerCase()
    if (st === 'closed') {
      workerMap[pc.workerName].closedCases += 1
    } else if (pc.qualifiedAt) {
      const end = new Date(pc.qualifiedAt)
      end.setUTCDate(end.getUTCDate() + replacementDays)
      if (end < today) workerMap[pc.workerName].closedCases += 1
    }
  }
  const totalWorkerPayroll = Object.values(workerMap).reduce((sum, w) => {
    return sum + w.signedCases * BASE_PAY_PER_CASE + w.closedCases * COMMISSION_PER_CLOSED
  }, 0)

  // Revenue = net payment (post-fee) if set, otherwise cases × case_value
  const firmPayment = payment ? payment.net : (s?.grossRevenue ?? 0)
  const metaSpend = kpi?.meta?.spend ?? 0
  const opsExpenses = s?.opsExpenses ?? 0
  const sanguineTotal = sanguine?.total ?? 0
  const totalCosts = metaSpend + opsExpenses + totalWorkerPayroll + sanguineTotal
  const netProfit = firmPayment - totalCosts

  const rows = [
    { label: 'Firm Payment', value: firmPayment, sub: payment ? `${fmt$(payment.received)} − ${(payment.interestRate * 100).toFixed(1)}% fee` : `${s?.signedCases ?? 0} cases`, positive: true },
    { label: 'Meta Ad Spend', value: -metaSpend, sub: 'Advertising cost', positive: false },
    { label: 'Operating Expenses', value: -opsExpenses, sub: 'Ops for this invoice', positive: false },
    { label: 'Worker Payroll', value: -totalWorkerPayroll, sub: `Base + commission`, positive: false },
    { label: 'Sanguine Payroll', value: -sanguineTotal, sub: sanguine ? `${sanguine.eligibleCases} signed cases × ${fmt$(sanguine.rate)}` : '—', positive: false },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* P&L Summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <p className="text-sm font-medium text-gray-300">P&L — {invoiceCode}</p>
        </div>
        <div className="divide-y divide-gray-800/60">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm text-gray-200">{r.label}</p>
                <p className="text-xs text-gray-600 mt-0.5">{r.sub}</p>
              </div>
              <p className={`text-base font-semibold tabular-nums ${r.positive ? 'text-green-400' : r.value < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                {r.value < 0 ? `−${fmt$(Math.abs(r.value))}` : fmt$(r.value)}
              </p>
            </div>
          ))}
          {/* Divider + net */}
          <div className="flex items-center justify-between px-5 py-4 bg-gray-800/30">
            <div>
              <p className="text-sm font-semibold text-white">Net Profit</p>
              <p className="text-xs text-gray-500 mt-0.5">After all costs</p>
            </div>
            <p className={`text-xl font-bold tabular-nums ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmt$(netProfit)}
            </p>
          </div>
        </div>
      </div>

      {/* Total costs breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: fmt$(firmPayment), color: 'text-green-400' },
          { label: 'Total Costs', value: fmt$(totalCosts), color: 'text-red-400' },
          { label: 'Net Profit', value: fmt$(netProfit), color: netProfit >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Net Margin', value: firmPayment > 0 ? `${((netProfit / firmPayment) * 100).toFixed(1)}%` : '—', color: 'text-gray-200' },
        ].map(c => (
          <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Ops Expenses manager */}
      {kpi?.firm?.id && (
        <ExpensesPanel firmId={kpi.firm.id} invoiceCode={invoiceCode} />
      )}
    </div>
  )
}
