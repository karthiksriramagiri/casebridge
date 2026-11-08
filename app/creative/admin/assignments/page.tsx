'use client'

import { useMemo, useState } from 'react'
import { Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/creative/_ui/tabs'
import { AssignmentDetailSheet } from '@/app/creative/_components/assignment-detail-sheet'
import { CreativeBoard } from '@/app/creative/_components/creative-board'
import { TaskBoard } from '@/app/creative/_components/task-board'
import { LaunchDialog } from '@/app/creative/_components/admin/launch-dialog'
import { NewAssignmentDialog } from '@/app/creative/_components/admin/new-assignment-dialog'
import { NewTaskDialog } from '@/app/creative/_components/admin/new-task-dialog'
import { PageHeader, StatCard } from '@/app/creative/_components/admin/shared'
import { useStore } from '@/app/creative/_lib/store'
import { ASSIGNMENT_STATUSES, type Assignment, type AssignmentStatus , isCreativeWork } from '@/app/creative/_lib/types'

/* ═══════════════════════════════════════════════════════════════════════════
   Assignments

   Two boards, both Jason's to run: the briefs he sends Faisal, and his own
   queue — the resize, disclaimer, translate and naming work that used to sit
   behind a separate K-Team login nobody signed into.

   Everything here is in the database. A brief, a status move, a comment and
   an upload all survive a reload, which is the difference between a board and
   a mockup.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Where a card sits in the pipeline, for the header count. Anything past
   Launching has left the Creative Team's hands. */
const LIVE_STATUSES = ASSIGNMENT_STATUSES.filter((s) => s !== 'Ad Launched' && s !== 'Winner Ad')
const WAITING_ON_JASON: AssignmentStatus[] = ['Feedback Request', 'Ready to Launch']

export default function AssignmentsPage() {
  const {
    assignments: allAssignments, ktasks, addAssignment, setAssignmentStatus, pushToLaunch,
    boardLoading, boardSetupNeeded, boardError, refreshBoard,
  } = useStore()

  /* Relaunches are not creative work — an ad that already exists going back
     up — so they live on the launch list and the ad meeting, not here. */
  const assignments = useMemo(() => allAssignments.filter(isCreativeWork), [allAssignments])
  const [tab, setTab] = useState('creative')
  const [creating, setCreating] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [launching, setLaunching] = useState<Assignment | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const stats = useMemo(() => {
    const live = assignments.filter((a) => (LIVE_STATUSES as readonly string[]).includes(a.status))
    return {
      live: live.length,
      waiting: assignments.filter((a) => WAITING_ON_JASON.includes(a.status)).length,
      launched: assignments.filter((a) => a.status === 'Ad Launched' || a.status === 'Winner Ad').length,
      tasks: ktasks.filter((t) => t.status !== 'Done').length,
    }
  }, [assignments, ktasks])

  const changeStatus = (a: Assignment, status: AssignmentStatus) => {
    if (status === 'Launching') setLaunching(a)
    else setAssignmentStatus(a.id, status, 'admin')
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Assignments"
        description="Briefs for the Creative Team, and Jason’s own queue beside them."
        actions={
          <div className="flex items-center gap-2">
            {/* The board polls, but someone who has just been told "it's up"
                should not have to wait out the interval. */}
            <Button variant="outline" size="icon-sm" aria-label="Refresh board" title="Refresh" onClick={refreshBoard}>
              <RefreshCw aria-hidden />
            </Button>
            {tab === 'creative' ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden /> New assignment
            </Button>
          ) : (
            <Button onClick={() => setCreatingTask(true)}>
              <Plus aria-hidden /> New task
            </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {/* The migration is run by hand, so an un-migrated database is a
            normal state with a known fix rather than an error. */}
        {boardSetupNeeded && (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">The assignment tables have not been created yet</p>
              <p className="text-muted-foreground">
                Run <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">supabase/migration_creative_assignments.sql</code>{' '}
                in the Supabase SQL editor. Until then the boards stay empty and nothing saves.
              </p>
            </div>
          </div>
        )}
        {boardError && !boardSetupNeeded && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {boardError}
          </p>
        )}

        <section aria-label="Assignment totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="In flight" value={String(stats.live)} hint="briefs not yet launched" />
          <StatCard
            label="Waiting on you"
            value={String(stats.waiting)}
            tone={stats.waiting > 0 ? 'bad' : undefined}
            hint="feedback requested or ready to launch"
          />
          <StatCard label="Launched" value={String(stats.launched)} tone="good" hint="live or winning" />
          <StatCard label="Jason’s tasks" value={String(stats.tasks)} hint="resize, disclaimer, naming" />
        </section>

        <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
          <TabsList>
            <TabsTrigger value="creative">Creative Team ({assignments.length})</TabsTrigger>
            <TabsTrigger value="tasks">Jason ({stats.tasks})</TabsTrigger>
          </TabsList>

          <TabsContent value="creative" className="pt-4">
            {boardLoading ? (
              <div className="h-72 animate-pulse rounded-lg border bg-card" />
            ) : (
              <CreativeBoard onOpen={(a) => setOpenId(a.id)} onStatus={changeStatus} onLaunch={setLaunching} />
            )}
          </TabsContent>

          <TabsContent value="tasks" className="pt-4">
            {boardLoading ? <div className="h-72 animate-pulse rounded-lg border bg-card" /> : <TaskBoard />}
          </TabsContent>
        </Tabs>
      </div>

      <NewAssignmentDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={(a) => {
          addAssignment(a)
          setCreating(false)
          toast('Assignment sent to Faisal')
        }}
      />
      <NewTaskDialog open={creatingTask} onOpenChange={setCreatingTask} />
      <LaunchDialog
        key={launching?.id}
        assignment={launching}
        onClose={() => setLaunching(null)}
        onConfirm={(tags, budget) => {
          if (launching) pushToLaunch(launching.id, tags, budget)
          setLaunching(null)
          toast('Added to the launch list')
        }}
      />
      <AssignmentDetailSheet assignmentId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
