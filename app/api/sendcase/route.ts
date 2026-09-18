import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  GHL_BASE,
  GHL_LOCATION_ID,
  GhlQuotaError,
  getPipelines,
  ghlHeaders,
  ghlKey,
} from '@/lib/ghl-pipelines'

// Pipeline IDs per firm
const PIPELINES: { firm: string; id: string }[] = [
  { firm: 'lhp',         id: 'yMqNixSnChC5lcGQXA1g' },
  { firm: 'lhp_spanish', id: 'r1AsAtC7lzwO9ybtkQlA' },
  { firm: 'eisenberg',   id: 'Yk4w3ML56ECc10PFzjpK' },
  { firm: 'thl',         id: 'DYtmw8WEUtGePFbEDAIZ' },
  { firm: 'mca',         id: '6Ku9EwTtMFk51o7Re9x0' },
  { firm: 'fears',       id: 'Jj4DCdu5duYDgI87ERbx' },
  { firm: 'levine',      id: 'JPyMNjGGAIxUv0FWW7Cg' },
  { firm: 'jm',          id: '0tBzhg0eGSNKL870y3yV' },
]

// "Pending Send" is the one and only stage we track: signed, not yet sent to
// the firm. "Signed/Sent" is the archive of cases already sent — matching it
// swept in 413 closed cases. Pipelines without a Pending Send stage contribute
// nothing, by design.
const PENDING_NAMES = ['pending send', 'pending_send', 'pending-send']

export function isPendingStage(name: string): boolean {
  const lower = name.toLowerCase().trim()
  return PENDING_NAMES.some((n) => lower.includes(n))
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface PSLead {
  contactId: string
  contactName: string | null
  phone: string | null
  email: string | null
  firm: string
  pipelineStage: string | null
  opportunityId: string | null
  createdAt: string | null
  fillStatus: string | null
  scheduledAt: string | null
  completedAt: string | null
  fieldsWritten: Record<string, string> | null
  fieldsSkipped: Record<string, string> | null
  flags: string[] | null
  summary: string | null
  error: string | null
}

interface PSStage {
  firm: string
  pipelineId: string
  stageId: string
  stageName: string
}

// Step 1: Resolve "Pending Send" stage IDs from the cached pipeline schemas
async function discoverPSStages(): Promise<PSStage[]> {
  const allPipelines = await getPipelines('sendcase')
  const psStages: PSStage[] = []

  for (const pipeline of PIPELINES) {
    const pl = allPipelines.find(p => p.id === pipeline.id)
    if (!pl) continue

    for (const stage of pl.stages.filter((st) => isPendingStage(st.name))) {
      psStages.push({
        firm: pipeline.firm,
        pipelineId: pipeline.id,
        stageId: stage.id,
        stageName: stage.name,
      })
    }
  }

  console.log(`[sendcase] Found ${psStages.length} PS stages:`, psStages.map(s => `${s.firm}/${s.stageName}`))
  return psStages
}

// Step 2: Fetch all opportunities in a specific pipeline+stage
async function fetchStageOpps(
  pipelineId: string, stageId: string, firm: string, stageName: string
): Promise<PSLead[]> {
  const headers = ghlHeaders('sendcase')
  const leads: PSLead[] = []
  let cursor: string | null = null
  let cursorId: string | null = null
  let page = 0

  while (page < 10) {
    const url = new URL(`${GHL_BASE}/opportunities/search`)
    url.searchParams.set('location_id', GHL_LOCATION_ID)
    url.searchParams.set('pipeline_id', pipelineId)
    url.searchParams.set('pipeline_stage_id', stageId)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('startAfter', cursor)
    if (cursorId) url.searchParams.set('startAfterId', cursorId)

    const res = await fetch(url.toString(), { headers, cache: 'no-store' })
    if (!res.ok) {
      // Surface refusals instead of returning a short list that reads as
      // "this stage is empty".
      throw new GhlQuotaError(
        res.status,
        res.headers.get('x-ratelimit-daily-remaining'),
        res.headers.get('x-ratelimit-daily-reset')
      )
    }
    const data = await res.json()
    const opps = data.opportunities ?? []
    if (opps.length === 0) break

    for (const opp of opps) {
      const contact = opp.contact ?? {}
      leads.push({
        contactId:      contact.id ?? opp.contactId ?? '',
        contactName:    contact.name ?? opp.name ?? null,
        phone:          contact.phone ?? null,
        email:          contact.email ?? null,
        firm,
        pipelineStage:  stageName,
        opportunityId:  opp.id ?? null,
        createdAt:      opp.createdAt ?? null,
        fillStatus:     null,
        scheduledAt:    null,
        completedAt:    null,
        fieldsWritten:  null,
        fieldsSkipped:  null,
        flags:          null,
        summary:        null,
        error:          null,
      })
    }

    page++
    const meta = data.meta ?? {}
    if (opps.length < 100 || !meta.startAfter) break
    cursor = meta.startAfter
    cursorId = meta.startAfterId
  }

  return leads
}

// GET /api/sendcase — returns all leads in pending send stages + their fill status
export async function GET(req: NextRequest) {
  if (!ghlKey('sendcase')) {
    return NextResponse.json(
      { error: 'No GHL key set (GHL_API_KEY_SENDCASE or GHL_API_KEY)' },
      { status: 500 }
    )
  }

  const debug = req.nextUrl.searchParams.get('debug') === '1'

  try {
    // Debug: every pipeline/stage name GHL knows, plus whether we match it
    if (debug) {
      const pipelines = await getPipelines('sendcase')
      return NextResponse.json({
        pipelines: pipelines.map(p => ({
          id: p.id,
          name: p.name,
          firm: PIPELINES.find(x => x.id === p.id)?.firm ?? null,
          stages: p.stages.map(s => ({ ...s, tracked: isPendingStage(s.name) })),
        })),
      })
    }

    // 1. Discover which stages are "Pending Send" across all pipelines
    const psStages = await discoverPSStages()
    if (psStages.length === 0) {
      return NextResponse.json({
        leads: [],
        warning:
          'No Pending Send stages found in the configured pipelines. Hit ' +
          '/api/sendcase?debug=1 to see the stage names GHL returns.',
      })
    }

    // 2. Fetch opportunities from each PS stage in parallel
    const allResults = await Promise.all(
      psStages.map(s => fetchStageOpps(s.pipelineId, s.stageId, s.firm, s.stageName))
    )
    const allLeads = allResults.flat()

    // 3. Deduplicate by contactId
    const byContact = new Map<string, PSLead>()
    for (const lead of allLeads) {
      if (lead.contactId && !byContact.has(lead.contactId)) {
        byContact.set(lead.contactId, lead)
      }
    }

    // 4. Merge with intake_fill_jobs status
    const contactIds = [...byContact.keys()]
    if (contactIds.length > 0) {
      try {
        const db = supabaseAdmin()
        const { data: jobs } = await db
          .from('intake_fill_jobs')
          .select('contact_id, status, scheduled_at, completed_at, fields_written, fields_skipped, flags, summary, error')
          .in('contact_id', contactIds)

        for (const job of (jobs ?? [])) {
          const lead = byContact.get(job.contact_id)
          if (lead) {
            lead.fillStatus = job.status
            lead.scheduledAt = job.scheduled_at
            lead.completedAt = job.completed_at
            lead.fieldsWritten = job.fields_written
            lead.fieldsSkipped = job.fields_skipped
            lead.flags = job.flags
            lead.summary = job.summary
            lead.error = job.error
          }
        }
      } catch (err) {
        // intake_fill_jobs table may not exist yet — that's fine, just skip
        console.log('[sendcase] intake_fill_jobs query skipped (table may not exist)')
      }
    }

    const leads = [...byContact.values()].sort((a, b) => {
      const order: Record<string, number> = { pending: 0, processing: 1, error: 2, completed: 3, no_data: 4 }
      const aOrder = order[a.fillStatus ?? ''] ?? -1
      const bOrder = order[b.fillStatus ?? ''] ?? -1
      if (aOrder !== bOrder) return aOrder - bOrder
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    })

    return NextResponse.json({ leads, stages: psStages.length })
  } catch (err) {
    if (err instanceof GhlQuotaError) {
      const resetSec = err.resetMs ? Math.round(Number(err.resetMs) / 1000) : null
      console.error('[sendcase]', err.message)
      return NextResponse.json(
        {
          error: err.message,
          dailyRemaining: err.dailyRemaining,
          resetInSeconds: resetSec,
        },
        { status: err.status === 429 ? 429 : 502 }
      )
    }
    console.error('[sendcase] unexpected failure', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
