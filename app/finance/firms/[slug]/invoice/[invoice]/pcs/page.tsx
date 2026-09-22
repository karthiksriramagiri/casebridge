'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { invoiceCodeFromRouteSegment } from '@/app/finance/firms/_lib/invoice-routes'
import { PcTable } from '@/app/finance/firms/_components/firm-metrics-shared'
import { Banner, DashboardSkeleton } from '@/app/_metrics/dash'

export default function InvoiceSignedCases() {
  const params = useParams()
  const slug = params.slug as string
  const code = invoiceCodeFromRouteSegment(params.invoice as string)

  const [pcs, setPcs] = useState<any[]>([])
  const [windowDays, setWindowDays] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else {
          setPcs(d.pcs || [])
          setWindowDays(d.firm?.replacement_window_days ?? null)
        }
        setLoading(false)
      })
      .catch(() => { setError('The case list could not be loaded.'); setLoading(false) })
  }, [slug, code])

  if (loading) return <DashboardSkeleton />
  if (error) return <Banner tone="crit" title="Could not load signed cases">{error}</Banner>

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="mx-section-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="mx-page-title" style={{ fontSize: 28 }}>Signed <i>cases</i></h1>
          <p className="mx-page-sub">
            Every case tagged {code}. The replacement countdown runs
            {windowDays != null ? ` ${windowDays} days` : ''} from the sign date — click a closer or
            rep name to edit it, and use Move invoice to re-file a case into another period.
          </p>
        </div>
      </div>

      <PcTable pcs={pcs} firmSlug={slug} />
    </div>
  )
}
