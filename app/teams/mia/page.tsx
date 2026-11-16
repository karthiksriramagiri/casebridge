import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import { TeamsShell } from '@/app/teams/_components/teams-shell'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'
import { MiaBoard } from './_components/board'
import { isMiaStatus, type MiaStatus } from './_lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'MIA Board · Team Center' }

/* ═══════════════════════════════════════════════════════════════════════════
   The MIA board.

   A case that signs and then goes quiet has been paid for twice — once by
   the ad that bought it, once by the hour that closed it — and is worth
   nothing until somebody gets the person back on the phone. That chasing
   lived in a spreadsheet nobody shared, so two reps rang the same person
   and a third went untouched for a week.

   It sits in the Team Center rather than on a route of its own. It was
   /mia, which meant a second place to go, its own sign-in redirect and its
   own slate palette — a board about the team, outside the product the team
   already has open. Here it is one item in the sidebar beside the rest of
   their day.

   Not under /teams/admin: chasing a case is the rep's job. Any signed-in
   rep may open it and move a card; the route behind it is what stops a rep
   adding or deleting one. The shell's role only decides which nav they see.

   Rendered on the server so the board is populated on arrival rather than
   flashing empty, and the client takes over from there.
   ═══════════════════════════════════════════════════════════════════════════ */

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MISSING = (msg: string) =>
  /could not find the table/i.test(msg) || /relation .* does not exist/i.test(msg) || /schema cache/i.test(msg)

export default async function MiaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  /* The proxy guards /teams too; this is the second lock, because a page
     that reads the whole board must never render for someone who is not
     signed in even if the routing changes under it. */
  if (!user) redirect('/teams/login?next=/teams/mia')

  const { data: profile } = await admin
    .from('profiles').select('name, role, team_type, timeclock_enabled').eq('id', user.id).single()

  const viewer = {
    id: user.id,
    name: (profile?.name || '').trim() || 'Someone',
    isAdmin: profile?.role === 'admin',
  }

  const [cases, firms, profiles] = await Promise.all([
    admin.from('mia_cases').select('*').order('sort_order', { ascending: true }),
    admin.from('firms').select('id, name').eq('archived', false).order('name'),
    admin.from('profiles').select('id, name'),
  ])

  const setupNeeded = !!cases.error && MISSING(cases.error.message)
  const firmById = new Map((firms.data ?? []).map((f) => [f.id, f.name as string]))
  const repById = new Map((profiles.data ?? []).map((p) => [p.id, (p.name as string) || '']))

  const initial = {
    cases: (cases.data ?? []).map((r) => ({
      id: String(r.id),
      name: r.name ?? '',
      phone: r.phone ?? null,
      email: r.email ?? null,
      firmId: r.firm_id ?? null,
      firmName: r.firm_id ? firmById.get(r.firm_id) ?? null : null,
      leadId: r.lead_id ?? null,
      status: (isMiaStatus(r.status) ? r.status : 'mia') as MiaStatus,
      order: Number(r.sort_order ?? 0),
      ownerId: r.owner_id ?? null,
      ownerName: r.owner_id ? repById.get(r.owner_id) ?? null : null,
      closerId: r.closer_id ?? null,
      /* The name stored on the row wins: a closer who has since left still
         has a name here and no longer has a profile to look up. */
      closerName: r.closer ?? (r.closer_id ? repById.get(r.closer_id) ?? null : null),
      note: r.note ?? '',
      createdBy: r.created_by ?? null,
      createdAt: String(r.created_at ?? ''),
      updatedAt: String(r.updated_at ?? ''),
      movedAt: String(r.moved_at ?? r.created_at ?? ''),
    })),
    firms: (firms.data ?? []).map((f) => ({ id: f.id as string, name: f.name as string })),
    reps: (profiles.data ?? [])
      .filter((p) => (p.name || '').trim())
      .map((p) => ({ id: p.id as string, name: p.name as string })),
    viewer,
    setupNeeded,
  }

  const open = initial.cases.filter((c) => c.status !== 'safe').length

  return (
    <TeamsShell
      role={viewer.isAdmin ? 'admin' : 'rep'}
      name={viewer.name}
      teamType={profile?.team_type ?? 'intake'}
      timeclockEnabled={!!profile?.timeclock_enabled}
    >
      <PageHeader
        title="MIA Board"
        description={
          viewer.isAdmin
            ? 'Signed cases that went quiet. Drag a card as you get them back, or use the arrows on it.'
            : 'Signed cases that went quiet. Move a card as you get them back, and claim the ones you are chasing.'
        }
        /* The count belongs up here rather than inside the board: it is the
           one number somebody wants before they read a single card. */
        actions={
          !setupNeeded && initial.cases.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              <b className="font-semibold text-foreground tabular-nums">{open}</b> still open
              {' · '}
              <span className="tabular-nums">{initial.cases.length}</span> on the board
            </span>
          ) : undefined
        }
      />
      <PageBody>
        <MiaBoard initial={initial} />
      </PageBody>
    </TeamsShell>
  )
}
