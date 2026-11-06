'use client'

import { ExternalLink } from 'lucide-react'
import { Textarea } from '@/app/creative/_ui/textarea'
import { PageHeader } from '@/app/creative/_components/admin/shared'
import { COMPETITORS } from '@/app/creative/_lib/data'
import { libraryUrl } from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'

export default function CompetitorsPage() {
  const { competitorNotes, setCompetitorNote } = useStore()
  return (
    <div className="flex flex-col">
      <PageHeader title="Competitors" description="Meta Ad Library shortcuts with notes on winners and trends." />
      <ul className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {COMPETITORS.map((c) => (
          <li key={c.name} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{c.name}</h2>
              <a
                href={libraryUrl(c.url)}
                target="_blank"
                rel="noreferrer"
                title="Opens active ads sorted by impressions, high to low"
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Top ads by impressions <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(opens in new tab)</span>
              </a>
            </div>
            <label htmlFor={`note-${c.name}`} className="sr-only">
              Notes for {c.name}
            </label>
            <Textarea
              id={`note-${c.name}`}
              rows={4}
              placeholder="Winners spotted, recurring hooks, new formats…"
              value={competitorNotes[c.name] ?? ''}
              onChange={(e) => setCompetitorNote(c.name, e.target.value)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
