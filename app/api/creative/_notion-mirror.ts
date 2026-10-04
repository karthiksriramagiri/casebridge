import { createClient } from '@supabase/supabase-js'
import {
  createAssignment, updateAssignment, archiveAssignment,
  notionConfigured, type MirrorBrief,
} from '@/lib/notion'
import { STATUS_LABELS } from '@/app/creative/assignments/statuses'

/* ═══════════════════════════════════════════════════════════════════════════
   Keeping the Notion database in step with the board.

   Called after the row is written, never before: the board is the record and
   must not wait on — or be rolled back by — a third-party API. Everything
   here swallows its own failures for the same reason.
   ═══════════════════════════════════════════════════════════════════════════ */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/* The page id lives in a column added after the table shipped. Until the
   migration is run we cannot remember which Notion page belongs to which
   brief, and mirroring without that memory would create a fresh duplicate on
   every drag — so the mirror stays off rather than making a mess. */
const NO_COLUMN = /notion_page_id|column .* does not exist|schema cache/i

function toMirror(row: any, assigneeName: string | null, origin: string): MirrorBrief {
  return {
    id: row.id,
    title: row.title,
    statusLabel: STATUS_LABELS[row.status] ?? row.status,
    ad_type: row.ad_type,
    language: row.language,
    assigneeName,
    due_date: row.due_date,
    must_launch: row.must_launch,
    brief: row.brief,
    benchmark_url: row.benchmark_url,
    deliverable_url: row.deliverable_url,
    boardUrl: `${origin}/creative/assignments`,
  }
}

async function rememberPage(briefId: string, pageId: string): Promise<boolean> {
  const { error } = await supabase
    .from('creative_briefs')
    .update({ notion_page_id: pageId })
    .eq('id', briefId)
  if (error && NO_COLUMN.test(error.message)) {
    console.warn('[notion] run supabase/migration_notion_assignments.sql to enable the mirror')
    return false
  }
  return !error
}

/** Mirror a newly created brief. Safe to call unconditionally. */
export async function mirrorCreate(row: any, assigneeName: string | null, origin: string) {
  if (!notionConfigured()) return
  const pageId = await createAssignment(toMirror(row, assigneeName, origin))
  if (pageId) await rememberPage(row.id, pageId)
}

/** Mirror an edit. A brief created before the workspace was connected has no
    page yet, so the first edit after connecting creates one. */
export async function mirrorUpdate(row: any, assigneeName: string | null, origin: string) {
  if (!notionConfigured()) return
  const existing = row.notion_page_id
  if (existing) {
    await updateAssignment(existing, toMirror(row, assigneeName, origin))
    return
  }
  const pageId = await createAssignment(toMirror(row, assigneeName, origin))
  if (pageId) await rememberPage(row.id, pageId)
}

/** Archive the mirrored page when its card is deleted. */
export async function mirrorDelete(pageId: string | null | undefined) {
  if (!notionConfigured() || !pageId) return
  await archiveAssignment(pageId)
}
