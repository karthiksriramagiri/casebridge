'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { invoiceCodeFromRouteSegment } from '@/app/metrics/firms/_lib/invoice-routes'
import { PcTable } from '@/app/metrics/firms/_components/firm-metrics-shared'

export default function FirmInvoicePcsPage() {
  const params = useParams()
  const slug = params.slug as string
  const invSeg = params.invoice as string
  const invoiceCode = invoiceCodeFromRouteSegment(invSeg)

  const [pcs, setPcs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(invoiceCode)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setErr(d.error)
        else setPcs(d.pcs || [])
        setLoading(false)
      })
  }, [slug, invoiceCode])

  return (
    <div className="p-6 space-y-4">
      <p className="text-gray-500 text-sm">
        Signed PCs tagged <span className="text-gray-300">{invoiceCode}</span>. Replacement countdown uses the firm&apos;s replacement window from sign date.
      </p>
      {loading && <p className="text-gray-500">Loading...</p>}
      {err && <p className="text-red-400">{err}</p>}
      {!loading && !err && <PcTable pcs={pcs} />}
    </div>
  )
}
