'use client'

import { useMemo } from 'react'
import { ChevronDown, ChevronUp, MessageSquare, Paperclip, Pencil, Rocket, Trash2 } from 'lucide-react'
import { PriorityStars } from './admin/priority-stars'
import { Button } from '@/app/creative/_ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/creative/_ui/select'
import { matchesQuery, Pill } from '@/app/creative/_components/admin/shared'
import { formatDate } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { ASSIGNMENT_STATUSES, CREATIVE_EDITABLE_STATUSES, assigneeOf, type Assignment, type AssignmentStatus, type Role, isCreativeWork } from '@/app/creative/_lib/types'

const TYPE_TONE: Partial<Record<string, 'blue' | 'green' | 'amber' | 'muted' | 'red'>> = {
  'Double Down': 'green',
  'Remake - Improve Hook': 'amber',
  'Remake - Improve Body': 'amber',
  'New Concept': 'blue',
  'ENG Winner → SP': 'blue',
  'Competitor Winner Remake': 'red',
}

export function CreativeBoard({
  onOpen,
  onStatus,
  onLaunch,
  assignee = 'creative',
  query = '',
}: {
  onOpen: (a: Assignment) => void
  onStatus: (a: Assignment, s: AssignmentStatus) => void
  onLaunch?: (a: Assignment) => void
  /* Whose board this is. Faisal's by default — the briefs he has to build.
     Jason's own column holds the one kind of brief he does himself, the
     image double down, which used to sit on Faisal's board unactionable. */
  assignee?: Role
  /* Narrows the cards to the ones that match. A board is eight columns
     wide and the card you want is rarely in the column you are looking at,
     so finding one by eye means reading all of them. */
  query?: string
}) {
  const role = useRole()
  const isAdmin = role === 'admin'
  const { assignments: allAssignments, moveAssignment, removeAssignment } = useStore()

  /* Relaunches are not creative work — an ad that already exists going back
     up, with nothing for anyone to make. They live on the launch list and
     the ad meeting; this board is what Faisal has to build. */
  const assignments = useMemo(
    () => allAssignments.filter(
      (a) =>
        isCreativeWork(a) &&
        assigneeOf(a) === assignee &&
        /* Everything printed on the card, plus the two names the brief
           produces — the ad set and the creative name are what someone is
           holding when they come looking for the card. */
        matchesQuery(query, [
          a.title, a.type, a.angle, a.firm, a.format, a.batch,
          a.visualCode, a.verbalCode, a.status, a.creativeName, a.adsetName, a.notes,
        ]),
    ),
    [allAssignments, assignee, query],
  )
  const options = isAdmin ? [...ASSIGNMENT_STATUSES] : CREATIVE_EDITABLE_STATUSES

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {ASSIGNMENT_STATUSES.map((status) => {
        /* Highest priority first, then the hand-set order inside each band.
           The manual up/down arrows still work — they just move a card within
           its own priority, which is the only place moving it makes sense
           when the column is sorted by urgency. */
        const items = assignments
          .filter((a) => a.status === status)
          .sort((a, b) => (b.priority ?? 3) - (a.priority ?? 3) || a.order - b.order)
        return (
          <section key={status} aria-label={status} className="flex w-72 shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">{status}</h2>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            <ol className="flex min-h-24 flex-col gap-2 rounded-lg bg-muted/70 p-2">
              {items.map((a, i) => {
                const canEdit = isAdmin || CREATIVE_EDITABLE_STATUSES.includes(a.status) || a.status === 'Assigned' || a.status === 'Feedback Done'
                return (
                  <li key={a.id} className="flex flex-col gap-2 rounded-md border bg-card p-3 shadow-xs">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => onOpen(a)}
                        className="flex-1 text-left text-pretty text-sm font-medium leading-snug hover:text-primary"
                      >
                        {a.title}
                      </button>
                      {isAdmin && (
                        <div className="flex flex-col">
                          <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => moveAssignment(a.id, -1)}>
                            <ChevronUp aria-hidden />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Move down"
                            disabled={i === items.length - 1}
                            onClick={() => moveAssignment(a.id, 1)}
                          >
                            <ChevronDown aria-hidden />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <PriorityStars value={a.priority ?? 3} size="sm" />
                      <Pill tone={TYPE_TONE[a.type] ?? 'muted'}>{a.type}</Pill>
                      {a.firm && <Pill>{a.firm}</Pill>}
                      {/* One angle chip.

                          The hook pairing when it is set, because that is
                          what the maker builds from and it names the angle
                          in two characters. Otherwise the angle itself.

                          It used to be both, and `angle` often holds the
                          whole hook line — "I didn't know there were two
                          checks you could get" — which filled the card and
                          pushed everything else out of sight. Alongside it
                          sat the source ad's Meta id, a number nobody reads
                          off a card. Both are in the brief, which is where
                          you go when you need them. */}
                      {(a.visualCode || a.verbalCode) ? (
                        <Pill>{[a.visualCode, a.verbalCode].filter(Boolean).join(' × ')}</Pill>
                      ) : a.angle ? (
                        <Pill>{a.angle.length > 28 ? `${a.angle.slice(0, 28)}…` : a.angle}</Pill>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {canEdit ? (
                        <Select value={a.status} onValueChange={(v) => onStatus(a, v as AssignmentStatus)}>
                          <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(options.includes(a.status) ? options : [a.status, ...options]).map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="flex-1 text-xs text-muted-foreground">Managed by Jason</span>
                      )}
                      {isAdmin && a.status === 'Ready to Launch' && onLaunch && (
                        <Button size="icon-sm" aria-label="Push to launch list" onClick={() => onLaunch(a)}>
                          <Rocket aria-hidden />
                        </Button>
                      )}
                      {/* The card opens straight into its property list,
                          which as admin is the edit surface — so "edit" and
                          "open" are the same action rather than two. */}
                      {isAdmin && (
                        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${a.title}`} title="Edit" onClick={() => onOpen(a)}>
                          <Pencil aria-hidden />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button size="icon-sm" variant="ghost" aria-label="Delete assignment" onClick={() => removeAssignment(a.id)}>
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex-1">{formatDate(a.createdAt)}</span>
                      <button type="button" onClick={() => onOpen(a)} className="flex items-center gap-1 hover:text-foreground">
                        <MessageSquare className="size-3" aria-hidden />
                        {a.comments.length}
                        <span className="sr-only">comments</span>
                      </button>
                      <button type="button" onClick={() => onOpen(a)} className="flex items-center gap-1 hover:text-foreground">
                        <Paperclip className="size-3" aria-hidden />
                        {a.attachments.length}
                        <span className="sr-only">files</span>
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
