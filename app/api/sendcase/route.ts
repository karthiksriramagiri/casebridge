import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

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

// Stage names (lowercased) that correspond to "pending send"
const PS_STAGE_NAMES = [
  'pending send', 'pending_send', 'signed/sent', 'signed sent',
  'signed / sent', 'pending-send',
]

function isPSStage(stageName: string): boolean {
  const lower = stageName.toLowerCase().trim()
  return PS_STAGE_NAMES.some(ps => lower.includes(ps))
}

function ghlHeaders() {
  const key = (process.env.GHL_API_KEY ?? '').trim()
  return {
    Authorization: `Bearer ${key}`,
    Version: '2021-07-28',
  }
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

// Step 1: Fetch all pipeline schemas to discover "Pending Send" stage IDs
async function discoverPSStages(): Promise<{ firm: string; pipelineId: string; stageId: string; stageName: string }[]> {
  const headers = ghlHeaders()

  // GHL returns ALL pipelines for a location in one call
  const res = await fetch(
    `${GHL_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`,
    { headers }
  )
  if (!res.ok) {
    console.error('[sendcase] Failed to fetch pipelines:', res.status)
    return []
  }
  const data = await res.json()
  const allPipelines = data.pipelines ?? []

  const psStages: { firm: string; pipelineId: string; stageId: string; stageName: string }[] = []

  for (const pipeline of PIPELINES) {
    const pl = allPipelines.find((p: any) => p.id === pipeline.id)
    if (!pl) continue

    for (const stage of (pl.stages ?? [])) {
      if (isPSStage(stage.name)) {
        psStages.push({
          firm: pipeline.firm,
          pipelineId: pipeline.id,
          stageId: stage.id,
          stageName: stage.name,
        })
      }
    }
  }

  console.log(`[sendcase] Found ${psStages.length} PS stages:`, psStages.map(s => `${s.firm}/${s.stageName}`))
  return psStages
}

// Step 2: Fetch all opportunities in a specific pipeline+stage
async function fetchStageOpps(
  pipelineId: string, stageId: string, firm: string, stageName: string
): Promise<PSLead[]> {
  const headers = ghlHeaders()
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

    const res = await fetch(url.toString(), { headers })
    if (!res.ok) break
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
  const apiKey = (process.env.GHL_API_KEY ?? '').trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'GHL_API_KEY not set' }, { status: 500 })
  }

  const debug = req.nextUrl.searchParams.get('debug') === '1'

  // If debug, return raw pipeline/stage data so we can see what GHL returns
  if (debug) {
    const headers = ghlHeaders()
    const res = await fetch(
      `${GHL_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`,
      { headers }
    )
    if (!res.ok) {
      return NextResponse.json({ error: `GHL ${res.status}`, body: await res.text() })
    }
    const data = await res.json()
    const pipelines = (data.pipelines ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      stages: (p.stages ?? []).map((s: any) => ({ id: s.id, name: s.name })),
    }))
    return NextResponse.json({ pipelines })
  }

  // 1. Discover which stages are "Pending Send" across all pipelines
  const psStages = await discoverPSStages()
  if (psStages.length === 0) {
    return NextResponse.json({ leads: [], debug: 'No pending send stages found in any pipeline' })
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

  return NextResponse.json({ leads })
}
