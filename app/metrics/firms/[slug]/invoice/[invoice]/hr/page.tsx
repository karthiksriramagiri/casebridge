'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { invoiceCodeFromRouteSegment } from '@/app/metrics/firms/_lib/invoice-routes'

export default function HrPage() {
  const params = useParams()
  const slug = params.slug as string
  const invoiceCode = invoiceCodeFromRouteSegment(params.invoice as string)

  const [kpi, setKpi] = useState<any>(null)
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(invoiceCode)}`).then(r => r.json()),
      fetch('/api/teams/admin/reps').then(r => r.json()),
    ]).then(([kpiData, profileData]) => {
      setKpi(kpiData)
      const reps: any[] = (profileData.reps || []).filter((p: any) => (p.name || '').trim() !== '')
      const seen = new Set<string>()
      setProfiles(reps.filter(p => {
        const k = (p.name || '').trim().toLowerCase()
        if (seen.has(k)) return false
        seen.add(k); return true
      }))
      setLoading(false)
    })
  }, [slug, invoiceCode])

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>

  const pcs: any[] = kpi?.pcs || []
  const replacementDays = kpi?.firm?.replacement_window_days ?? 14
  const today = new Date()

  const casesByWorker: Record<string, { signedCases: number; closedCases: number }> = {}
  for (const pc of pcs) {
    if (!pc.workerName) continue
    if (!casesByWorker[pc.workerName]) casesByWorker[pc.workerName] = { signedCases: 0, closedCases: 0 }
    casesByWorker[pc.workerName].signedCases += 1
    const st = (pc.caseStatus || '').toLowerCase()
    if (st === 'closed') {
      casesByWorker[pc.workerName].closedCases += 1
    } else if (pc.qualifiedAt) {
      const end = new Date(pc.qualifiedAt)
      end.setUTCDate(end.getUTCDate() + replacementDays)
      if (end < today) casesByWorker[pc.workerName].closedCases += 1
    }
  }

  const workers = profiles.map(p => {
    const name = (p.name || '').trim() || 'Unnamed'
    const stats = casesByWorker[name] || { signedCases: 0, closedCases: 0 }
    return { id: p.id, name, ...stats }
  }).sort((a, b) => b.signedCases - a.signedCases)

  const unassigned = pcs.filter(p => !p.workerName).length

  return (
    <div className="p-6 space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Workers', value: workers.length },
          { label: 'Signed Cases', value: workers.reduce((s, w) => s + w.signedCases, 0) },
          { label: 'Closed Cases', value: workers.reduce((s, w) => s + w.closedCases, 0) },
        ].map(c => (
          <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className="text-lg font-bold text-white">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Performance table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <p className="text-sm font-medium text-gray-300">Performance — {invoiceCode}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Worker', 'Signed Cases', 'Closed Cases', 'Close Rate'].map(c => (
                  <th key={c} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const closeRate = w.signedCases > 0 ? Math.round(w.closedCases / w.signedCases * 100) : 0
                return (
                  <tr key={w.id} className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${w.signedCases === 0 ? 'opacity-50' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-200 font-medium">{w.name}</span>
                        {w.signedCases === 0 && (
                          <span className="text-[10px] bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded">not started</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-white font-semibold">{w.signedCases}</td>
                    <td className="py-3 px-4 text-green-400 font-semibold">{w.closedCases}</td>
                    <td className="py-3 px-4 text-gray-400">{w.signedCases > 0 ? `${closeRate}%` : '—'}</td>
                  </tr>
                )
              })}
              {workers.length > 0 && (
                <tr className="border-t border-gray-700 bg-gray-800/30">
                  <td className="py-3 px-4 text-gray-400 font-medium">Total</td>
                  <td className="py-3 px-4 text-white font-semibold">{workers.reduce((s, w) => s + w.signedCases, 0)}</td>
                  <td className="py-3 px-4 text-green-400 font-semibold">{workers.reduce((s, w) => s + w.closedCases, 0)}</td>
                  <td className="py-3 px-4 text-gray-500">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {unassigned > 0 && (
        <p className="text-xs text-gray-600">{unassigned} case{unassigned !== 1 ? 's' : ''} not assigned to a worker.</p>
      )}
    </div>
  )
}
