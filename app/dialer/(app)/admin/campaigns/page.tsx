'use client'

import { useEffect, useState } from 'react'
import { PageBody, PageHeader } from '../../../_components/ui/shell'

interface Campaign {
  id: string
  name: string
  firm: string
  stageName: string
  leadCount: number
  pipelineId: string
  stageId: string
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dialer/campaigns')
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageHeader
        title="Campaigns"
        description={'GHL pipeline stages as dialer campaigns'}
      />
      <PageBody>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaign</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Firm</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stage</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map(c => (
                <tr key={c.id} className="bg-card">
                  <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.firm}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.stageName}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">{c.leadCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </PageBody>
    </>
  )
}
