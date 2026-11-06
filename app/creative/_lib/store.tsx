'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TODAY, YESTERDAY, addDays } from './data'
import { bumpConvention, buildConvention, killReason, watchReason } from './metrics'
import { api, fetchBoard, isPersisted } from './assignments-api'
import {
  ROLE_LABEL,
  type Assignment,
  type AssignmentStatus,
  type AssignmentFirm,
  type CreativeFormat,
  type VersionStage,
  type AssignmentType,
  type Attachment,
  type AccountInfo,
  type Creative,
  type Decision,
  type SignedLead,
  type Disclaimer,
  type KillItem,
  type KTask,
  type KTaskStatus,
  type KTaskType,
  type LaunchTags,
  type LaunchTask,
  type Notification,
  type Role,
  type WatchItem,
} from './types'

let idSeq = 1000
const uid = (p: string) => `${p}_${++idSeq}`
const now = () => new Date().toISOString()
const DEFAULT_CAMPAIGN = 'CB | MVA | Broad | CBO'

/* ═══════════════════════════════════════════════════════════════════════════
   Creatives are live Meta ads now, so nothing below can be computed at module
   load the way the prototype's seeds were — there are no ads until the fetch
   lands. The watch and kill lists therefore start EMPTY rather than
   pre-populated against ids that no longer exist: a watch list is a record of
   decisions someone made, and inventing six of them on first open would be
   the one piece of mock data most likely to be mistaken for real.

   They fill the moment Jason adds from Creative Analysis. The remaining
   seeds (launches, watch and kill lists) are workflow placeholders with
   every reference to a fake creative id stripped out; they go when the
   backend lands.
   ═══════════════════════════════════════════════════════════════════════════ */

const seedWatch: WatchItem[] = []
const seedKill: KillItem[] = []

/* Kept as the shape reference the migration was written from, and as the
   sample rows worth inserting into an empty board. Nothing reads it at
   runtime any more — the boards come from creative_assignments. */
const seedAssignments: Assignment[] = (
  [
    { title: 'Hidden Compensation – new UGC hook', type: 'Competitor Winner Remake', angle: 'Hidden Compensation', status: 'Assigned', benchmarkUrl: 'https://www.facebook.com/ads/library/' },
    { title: 'Rideshare – testimonial cut', type: 'Double Down', angle: 'Rideshare Accident', status: 'Assigned' },
    { title: 'Statute Deadline – ENG winner to SP', type: 'ENG Winner → SP', angle: 'Statute Deadline', status: 'In Process of Making' },
    { title: 'Truck Accident – 3 hook variants', type: 'Remake - Improve Hook', angle: 'Truck Accident', status: 'Feedback Request' },
    { title: 'Insurance Lowball – tighter body', type: 'Remake - Improve Body', angle: 'Insurance Lowball', status: 'Feedback Done' },
    { title: 'Testimonial – batch 12 remake', type: 'Test Batch Remake', angle: 'Testimonial', status: 'Ready to Launch' },
    { title: 'Not At Fault – VO version', type: 'Double Down', angle: 'Not At Fault', status: 'Ad Launched' },
    { title: 'Hidden Compensation – calculator static', type: 'Double Down', angle: 'Hidden Compensation', status: 'Winner Ad' },
  ] as { title: string; type: AssignmentType; angle: string; status: AssignmentStatus; src?: string; benchmarkUrl?: string }[]
).map((a, i) => ({
  id: uid('a'),
  title: a.title,
  type: a.type,
  angle: a.angle,
  status: a.status,
  sourceCreativeId: a.src,
  benchmarkUrl: a.benchmarkUrl,
  notes: '',
  order: i,
  createdAt: addDays(TODAY, -i),
  attachments: [],
  comments:
    a.status === 'Feedback Done'
      ? [{ id: uid('cm'), author: 'admin' as Role, text: 'Cut the intro to 2s and swap the CTA card to the yellow version.', at: now() }]
      : a.status === 'Feedback Request'
        ? [{ id: uid('cm'), author: 'creative' as Role, text: 'Draft v1 uploaded — please review the first 3 seconds.', at: now() }]
        : [],
}))

/** @see seedAssignments — the same, for the production queue. */
const seedKTasks: KTask[] = (
  [
    { type: 'Add Disclaimer', title: 'Add LHP disclaimer to Rideshare statics', disclaimer: 'LHP', status: 'To Do' },
    { type: 'Resize Images', title: 'Resize Insurance Lowball set to 9:16 + 1:1', status: 'To Do' },
    { type: 'SP → ENG Images', title: 'Translate Statute Deadline SP set to ENG', status: 'In Progress' },
    { type: 'Naming Convention', title: 'Fix naming on batch 14 uploads', status: 'Done' },
  ] as { type: KTaskType; title: string; src?: string; disclaimer?: Disclaimer; status: KTaskStatus }[]
).map((t, i) => ({
  id: uid('t'),
  type: t.type,
  title: t.title,
  sourceCreativeId: t.src,
  disclaimer: t.disclaimer,
  notes: '',
  status: t.status,
  order: i,
  createdAt: addDays(TODAY, -i),
  doneAt: t.status === 'Done' ? YESTERDAY : undefined,
  comments: [],
}))

const seedLaunches: LaunchTask[] = [
  {
    id: uid('l'),
    /* No assignmentId: assignments live in the database now, so a seeded
       launch pointing at a seeded assignment would dangle — the id it names
       is never in state. */
    name: 'Not At Fault – VO version',
    angle: 'Not At Fault',
    campaign: DEFAULT_CAMPAIGN,
    convention: 'CB_B10_NAF_IMG3_V2',
    tags: { resize: true, disclaimer: 'General', asIs: false },
    date: YESTERDAY,
    dailyBudget: 150,
    status: 'done',
    doneAt: YESTERDAY,
    isNewTestBatch: false,
    requestedBy: 'assignment',
  },
  {
    id: uid('l'),
    name: 'Testimonial – Batch 14 (new test)',
    angle: 'Testimonial',
    campaign: DEFAULT_CAMPAIGN,
    convention: '',
    tags: { resize: false, disclaimer: 'AI', asIs: false },
    date: addDays(TODAY, -2),
    dailyBudget: 100,
    status: 'pending',
    isNewTestBatch: true,
    requestedBy: 'manual',
  },
]

const seedNotifications: Notification[] = [
  { id: uid('n'), to: 'creative', text: 'Jason left feedback on “Insurance Lowball – tighter body”', href: '/team/assignments', at: now(), read: false },
  { id: uid('n'), to: 'admin', text: 'Faisal requested feedback on “Truck Accident – 3 hook variants”', href: '/admin/assignments', at: now(), read: false },
]

export type ManualLaunchInput = {
  name: string
  angle: string
  sourceCreativeId?: string
  isNewTestBatch: boolean
  tags: LaunchTags
  dailyBudget: number
}

type Store = {
  creatives: Creative[]
  /** The Meta ad accounts behind `creatives`, for the account filter. */
  accounts: AccountInfo[]
  /** Distinct angles across the loaded ads, read off their names. */
  angles: string[]
  loading: boolean
  loadError: string | null
  /** False until the GHL sweep lands; Signed and CPA are unknown rather than
      zero while it is. */
  hasOutcomes: boolean
  /** The assignment boards are loading from the database. */
  boardLoading: boolean
  /** The assignment tables have not been created yet. */
  boardSetupNeeded: boolean
  /** The last thing that went wrong reading or writing a board. */
  boardError: string | null
  /** Pull both boards again now — for a button, or after a slow write. */
  refreshBoard: () => void
  archived: Creative[]
  killedIds: Set<string>
  watch: WatchItem[]
  kill: KillItem[]
  assignments: Assignment[]
  ktasks: KTask[]
  launches: LaunchTask[]
  notifications: Notification[]
  competitorNotes: Record<string, string>
  getCreative: (id?: string) => Creative | undefined
  addToWatch: (ids: string[]) => number
  removeWatch: (id: string) => void
  setWatchDecision: (id: string, decision: Decision | undefined) => void
  addToKill: (ids: string[]) => number
  markKillDone: (id: string, done: boolean, by: Role) => void
  removeKill: (id: string) => void
  addAssignment: (a: {
    title: string
    type: AssignmentType
    angle: string
    notes?: string
    sourceCreativeId?: string
    firm?: AssignmentFirm
    format?: CreativeFormat
    visualCode?: string
    verbalCode?: string
    batch?: string
    priority?: number
    script?: string
    benchmarkUrl?: string
    benchmarkName?: string
  }) => void
  updateAssignment: (id: string, patch: Partial<Assignment>) => void
  setAssignmentStatus: (id: string, status: AssignmentStatus, by: Role) => void
  moveAssignment: (id: string, dir: -1 | 1) => void
  removeAssignment: (id: string) => void
  addComment: (assignmentId: string, by: Role, text: string, stage?: VersionStage) => void
  addAttachments: (assignmentId: string, by: Role, files: File[], stage?: VersionStage) => void
  addKTask: (t: {
    type: KTaskType
    title: string
    notes?: string
    sourceCreativeId?: string
    disclaimer?: Disclaimer
    firm?: AssignmentFirm
    format?: CreativeFormat
    visualCode?: string
    verbalCode?: string
    batch?: string
    priority?: number
    script?: string
    benchmarkUrl?: string
    benchmarkName?: string
  }) => void
  setKTaskStatus: (id: string, status: KTaskStatus, by: Role) => void
  moveKTask: (id: string, dir: -1 | 1) => void
  removeKTask: (id: string) => void
  pushToLaunch: (assignmentId: string, tags: LaunchTags, dailyBudget: number) => void
  manualLaunch: (input: ManualLaunchInput) => void
  relaunch: (creativeId: string) => void
  updateLaunch: (id: string, patch: Partial<LaunchTask>) => void
  markLaunchDone: (id: string, done: boolean, by: Role) => void
  cancelLaunch: (id: string) => void
  markNotificationsRead: (role: Role) => void
  setCompetitorNote: (name: string, note: string) => void
}

const StoreContext = createContext<Store | null>(null)

function reorder<T extends { id: string; order: number }>(list: T[], id: string, dir: -1 | 1, sameColumn: (a: T, b: T) => boolean) {
  const target = list.find((a) => a.id === id)
  if (!target) return list
  const column = list.filter((a) => sameColumn(a, target)).sort((a, b) => a.order - b.order)
  const idx = column.findIndex((a) => a.id === id)
  const swap = column[idx + dir]
  if (!swap) return list
  return list.map((a) => (a.id === target.id ? { ...a, order: swap.order } : a.id === swap.id ? { ...a, order: target.order } : a))
}

/* ═══════════════════════════════════════════════════════════════════════════
   The GHL sweep, reshaped for the center.

   /api/metrics/creative-overview returns one record per Meta ad id with a
   named list per pipeline stage. Two things are wanted from it: who signed,
   and who came in as a lead.

   A signed case is Pending Send or Signed/Sent, and the endpoint has already
   dated those by the stage change that signed them rather than by when the
   lead arrived — so a case signed today is counted today, whatever month its
   lead came from. That is the whole point of taking this over the simpler
   ghl_leads query, which only knows a case's own timestamp.
   ═══════════════════════════════════════════════════════════════════════════ */
type AdOutcome = { signed: SignedLead[]; leads: SignedLead[] }

/* Signed cases come from the Financial Center's source, not from here.

   The pipeline search can only see a GHL *contact*, and a driver and their
   passenger sign under one contact as two cases — so it reads 540 cases as
   474. Finance counts the case rows, which is the number that gets invoiced
   and paid commission on, so that is the number this page shows too.

   The sweep is still what names the *leads*: ghl_leads only exists once a
   case signs, so it cannot answer who is sitting in No Response. */
type SignedIndex = { byAdId: Record<string, SignedLead[]>; byAdName: Record<string, SignedLead[]> }

/** Every stage array the endpoint returns, with the label to show for it. */
const STAGE_LISTS: [string, string][] = [
  ['newLeadLeads', 'New lead'],
  ['nrLeads', 'No response'],
  ['fuLeads', 'Follow up'],
  ['chaseLeads', 'Chase'],
  ['appointmentLeads', 'Appointment'],
  ['contractSentLeads', 'Contract sent'],
  ['qualifiedLeads', 'Qualified'],
  ['nqLeads', 'Not qualified'],
  ['miaLeads', 'MIA'],
  ['pendingSendLeads', 'Pending Send'],
  ['sentLeads', 'Signed/Sent'],
]

const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : '')
const newestFirst = (a: SignedLead, b: SignedLead) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)

function shapeOutcomes(byAdId: Record<string, any>): Record<string, AdOutcome> {
  const out: Record<string, AdOutcome> = {}
  for (const [adId, rec] of Object.entries(byAdId)) {
    if (adId === '__unattributed__') continue
    /* One row per person, not per opportunity.

       A contact can hold an opportunity in more than one pipeline — the
       English and Spanish boards for the same firm, most often — and the
       sweep walks each pipeline separately, so the same person comes back
       twice under the same ad. That was 273 duplicate rows across 122 ads,
       which inflates every list this feeds. Keyed on the phone where there
       is one, since two different people can share a name. */
    const byPerson = new Map<string, SignedLead>()
    for (const [key, stage] of STAGE_LISTS) {
      for (const p of (rec?.[key] ?? []) as any[]) {
        const name = String(p?.name || 'Unnamed').replace(/\s+/g, ' ').trim()
        const phone = p?.phone ?? null
        const person: SignedLead = { name, date: day(p?.createdAt), stage, phone }
        const id = phone ? `p:${phone}` : `n:${name.toLowerCase()}`
        const seen = byPerson.get(id)
        /* Keep the latest sighting — it carries the stage they are in now. */
        if (!seen || person.date > seen.date) byPerson.set(id, person)
      }
    }
    out[adId] = { signed: [], leads: [...byPerson.values()].sort(newestFirst) }
  }
  return out
}

/** Attach both sources to the Meta ads, and rebuild the daily signed counts. */
function mergeOutcomes(
  ads: Creative[],
  outcomes: Record<string, AdOutcome>,
  signedIdx: SignedIndex | null,
): Creative[] {
  if (Object.keys(outcomes).length === 0 && !signedIdx) return ads
  return ads.map((c) => {
    const o = outcomes[c.adId]
    /* Join on the ad id, fall back to the ad name — GHL records one or the
       other depending on how the lead arrived. */
    const signed = signedIdx
      ? signedIdx.byAdId[c.adId] ?? signedIdx.byAdName[c.name] ?? []
      : []
    if (!o && signed.length === 0) return c

    /* Replacements are shown in the list but never counted: they are a case
       swapped for another, not a case this ad produced. Finance separates
       them on the invoice for the same reason. */
    const signedOn = new Map<string, number>()
    for (const l of signed) if (l.date && !l.isReplacement) signedOn.set(l.date, (signedOn.get(l.date) ?? 0) + 1)

    const daily = c.daily.map((d) => ({ ...d, acquisitions: signedOn.get(d.date) ?? 0 }))

    /* A case can sign on a day the ad did not deliver — Meta emits no row for
       such a day, so without this the signing would vanish from every range
       that contains it and CPA would read high. */
    const have = new Set(daily.map((d) => d.date))
    for (const [date, count] of signedOn) {
      if (have.has(date)) continue
      daily.push({ date, spend: 0, impressions: 0, hooks: 0, linkClicks: 0, leads: 0, acquisitions: count })
    }
    daily.sort((a, b) => (a.date < b.date ? -1 : 1))

    return { ...c, daily, signedLeads: signed, leadPeople: o?.leads ?? c.leadPeople ?? [] }
  })
}

export function StoreProvider({ children }: { children: ReactNode }) {
  /* Live ads from both Meta accounts. Fetched once per mount and kept whole:
     the API hands back a 30-day daily series per ad, and every range the
     center offers — Today, T&Y, 3/5/7/30D, Max — is a filter over that array,
     so moving the date picker costs nothing. */
  const [metaAds, setMetaAds] = useState<Creative[]>([])
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /* Whether the GHL sweep has landed. Meta cannot answer who signed — a
     column of zeroes reads as fact, so the table blanks Signed and CPA while
     this is false. */
  const [hasOutcomes, setHasOutcomes] = useState(false)
  const [outcomes, setOutcomes] = useState<Record<string, AdOutcome>>({})
  const [signedIdx, setSignedIdx] = useState<SignedIndex | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch('/api/creative/center/creatives?days=30')
      .then((r) => r.json())
      .then((d) => {
        if (!live) return
        setMetaAds(d.creatives ?? [])
        setAccounts(d.accounts ?? [])
        setLoadError(d.error ?? null)
      })
      .catch((e) => live && setLoadError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  /* Signed cases, from the Financial Center's source. One Supabase query, so
     Signed and CPA are filled in almost immediately — long before the
     pipeline sweep below returns. */
  useEffect(() => {
    let live = true
    fetch('/api/creative/center/signed?days=120')
      .then((r) => r.json())
      .then((d) => {
        if (!live || d.error) return
        setSignedIdx({ byAdId: d.byAdId ?? {}, byAdName: d.byAdName ?? {} })
        setHasOutcomes(true)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  /* The pipeline sweep, fetched alongside rather than inside the Meta call.
     It takes the best part of twenty seconds across nine pipelines and is
     needed only to name the leads sitting in each stage — ghl_leads cannot
     answer that, because a row there exists only once a case has signed.
     Signed and CPA do not wait on it. */
  useEffect(() => {
    let live = true
    fetch('/api/metrics/creative-overview?date_preset=maximum')
      .then((r) => r.json())
      .then((d) => {
        if (!live || d.error) return
        setOutcomes(shapeOutcomes(d.byAdId ?? {}))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  /* Meta's daily series carries spend and leads; the sweep carries who signed
     and when. Joined on the Meta ad id, here, so everything downstream — the
     range filters, CPA, the name lists — reads one shape. */
  const creatives = useMemo(
    () => mergeOutcomes(metaAds, outcomes, signedIdx),
    [metaAds, outcomes, signedIdx],
  )

  /* How many writes are in the air. A refresh that lands between an optimistic
     update and its save would pull the old row back and look like the edit was
     rejected, so refreshing waits for the queue to drain. */
  const inFlight = useRef(0)

  const refreshBoard = useCallback(async (opts?: { initial?: boolean }) => {
    if (inFlight.current > 0) return
    const d = await fetchBoard()
    setAssignments(d.assignments)
    setKTasks(d.tasks)
    setBoardSetupNeeded(d.setupNeeded)
    setBoardError(d.error)
    if (opts?.initial) setBoardLoading(false)
  }, [])

  useEffect(() => {
    void refreshBoard({ initial: true })
  }, [refreshBoard])

  /* The board is shared: Jason writes a brief, Faisal uploads against it, and
     each needs to see the other's work without being told to reload. Polled
     while the tab is visible, and again the moment it regains focus — which
     is when someone has just come back from doing the thing they want to see.
     The interval is paused on a hidden tab so a board left open overnight is
     not still asking every ten seconds. */
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void refreshBoard() }
    const id = setInterval(tick, 15_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refreshBoard])

  /* A write that fails must say so rather than leaving the board showing a
     change the database never took. */
  const persist = useCallback((p: Promise<unknown>) => {
    inFlight.current += 1
    p.catch((e: Error) => setBoardError(e.message)).finally(() => { inFlight.current -= 1 })
  }, [])

  const [watch, setWatch] = useState(seedWatch)
  const [kill, setKill] = useState(seedKill)
  /* The two boards start empty and are filled from the database. They used to
     start from seed arrays, which made every brief and comment vanish on
     reload — a board that forgets is a mockup. The seeds remain below only as
     the shape reference for the migration. */
  const [assignments, setAssignments] = useState<Assignment[]>([])

  /* The current boards, readable from an async callback.

     A `setAssignments` updater does not run synchronously, so anything that
     needs the resulting list — a save, in particular — cannot read it from a
     variable assigned inside the updater: that line runs first, while the
     variable is still empty. This ref is the honest answer to "what is on the
     board right now". */
  const assignmentsRef = useRef<Assignment[]>([])
  useEffect(() => { assignmentsRef.current = assignments }, [assignments])
  const [boardLoading, setBoardLoading] = useState(true)
  const [boardSetupNeeded, setBoardSetupNeeded] = useState(false)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [ktasks, setKTasks] = useState<KTask[]>([])
  const [launches, setLaunches] = useState(seedLaunches)
  const [notifications, setNotifications] = useState(seedNotifications)
  const [competitorNotes, setCompetitorNotes] = useState<Record<string, string>>({})

  const notify = useCallback((to: Role, text: string, href: string) => {
    setNotifications((prev) => [{ id: uid('n'), to, text, href, at: now(), read: false }, ...prev])
  }, [])

  const killedIds = useMemo(() => new Set(kill.filter((k) => k.status === 'done').map((k) => k.creativeId)), [kill])

  const findCreative = useCallback(
    (id?: string) => (id ? creatives.find((c) => c.id === id) : undefined),
    [creatives],
  )

  /* The archive is whatever has actually been marked killed. The prototype
     also carried five pre-archived creatives; with live ads there is no such
     thing until someone kills one. */
  const archived = useMemo(
    () =>
      creatives
        .filter((c) => killedIds.has(c.id))
        .map((c) => ({
          ...c,
          archived: { killDate: kill.find((k) => k.creativeId === c.id)?.doneAt ?? TODAY, reason: 'Fatigue' as const },
        })),
    [creatives, kill, killedIds],
  )

  /* Angles come off real ad names via parseAdName, so the list is whatever is
     running rather than a fixed taxonomy. */
  const angles = useMemo(
    () => [...new Set(creatives.map((c) => c.angle))].sort((a, b) => a.localeCompare(b)),
    [creatives],
  )

  const seedWatchDay = useCallback(
    (ids: string[], date: string): WatchItem[] =>
      ids
        .map((id) => {
          const c = findCreative(id)
          return c ? { id: uid('w'), creativeId: id, date, reason: watchReason(c) } : null
        })
        .filter((w): w is WatchItem => w !== null),
    [findCreative],
  )

  const addToWatch = useCallback(
    (ids: string[]) => {
      const existing = new Set(watch.filter((w) => w.date === TODAY).map((w) => w.creativeId))
      const fresh = ids.filter((id) => !existing.has(id))
      setWatch((prev) => [...prev, ...seedWatchDay(fresh, TODAY)])
      return fresh.length
    },
    [watch, seedWatchDay],
  )

  /** Every kill must originate from the watch list, so direct kills also log a KILL decision on today's watch list. */
  const addToKill = useCallback(
    (ids: string[]) => {
      const existing = new Set(kill.map((k) => k.creativeId))
      const fresh = ids.filter((id) => !existing.has(id))
      if (!fresh.length) return 0
      const onWatchToday = new Set(watch.filter((w) => w.date === TODAY).map((w) => w.creativeId))
      setWatch((prev) => [
        ...prev.map((w) => (w.date === TODAY && fresh.includes(w.creativeId) ? { ...w, decision: 'KILL' as const } : w)),
        ...seedWatchDay(fresh.filter((id) => !onWatchToday.has(id)), TODAY).map((w) => ({ ...w, decision: 'KILL' as const })),
      ])
      setKill((prev) => [
        ...prev,
        ...fresh.map((id) => {
          const c = findCreative(id)
          return { id: uid('k'), creativeId: id, addedAt: TODAY, reason: c ? killReason(c) : '', status: 'pending' as const }
        }),
      ])
      return fresh.length
    },
    [kill, watch, notify, findCreative, seedWatchDay],
  )

  const updateAssignment = useCallback(
    (id: string, patch: Partial<Assignment>) => {
      setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
      /* Comments are rows of their own and are written by addComment; sending
         them here too would duplicate every one. Everything else on the card
         is a column and goes straight through. */
      const { comments, ...columns } = patch
      if (isPersisted(id) && Object.keys(columns).length > 0) persist(api.patchAssignment(id, columns))
    },
    [persist],
  )

  const setAssignmentStatus = useCallback(
    (id: string, status: AssignmentStatus, by: Role) => {
      const a = assignments.find((x) => x.id === id)
      if (!a || a.status === status) return
      updateAssignment(id, { status })

      /* The two transitions that hand work over. Everything else on the board
         can be found by looking; these two are the moments where someone is
         waiting. Fired and forgotten — a Slack outage must never block the
         status change that triggered it. */
      const handoff =
        status === 'Feedback Request' ? 'review' :
        status === 'Feedback Done'    ? 'revise' : null

      if (handoff) {
        fetch('/api/creative/assignments/notify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: handoff,
            title: a.title,
            by: ROLE_LABEL[by],
            convention: [a.batch, a.firm, a.format, a.visualCode, a.verbalCode].filter(Boolean).join(' | '),
            files: a.attachments.length,
            url: typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '',
          }),
        }).catch(() => {})
      }

      if (by === 'creative') notify('admin', `Faisal moved “${a.title}” to ${status}`, '/admin/assignments')
      else notify('creative', `${ROLE_LABEL[by]} moved “${a.title}” to ${status}`, '/team/assignments')
    },
    [assignments, updateAssignment, notify],
  )

  const nextConvention = (opts: { angle: string; type: string; sourceCreativeId?: string; isNewTestBatch: boolean }) => {
    if (opts.isNewTestBatch) return ''
    const src = findCreative(opts.sourceCreativeId)
    if (src) return bumpConvention(src.convention)
    return buildConvention({ angle: opts.angle, type: opts.type, date: TODAY, seq: launches.filter((l) => l.date === TODAY).length + 1 })
  }

  const value: Store = {
    creatives,
    accounts,
    angles,
    loading,
    loadError,
    hasOutcomes,
    boardLoading,
    boardSetupNeeded,
    boardError,
    refreshBoard: () => { void refreshBoard() },
    archived,
    killedIds,
    watch,
    kill,
    assignments,
    ktasks,
    launches,
    notifications,
    competitorNotes,
    getCreative: findCreative,
    addToWatch,
    removeWatch: (id) => setWatch((prev) => prev.filter((w) => w.id !== id)),
    setWatchDecision: (id, decision) => setWatch((prev) => prev.map((w) => (w.id === id ? { ...w, decision } : w))),
    addToKill,
    markKillDone: (id, done, by) => {
      const k = kill.find((x) => x.id === id)
      setKill((prev) => prev.map((x) => (x.id === id ? { ...x, status: done ? 'done' : 'pending', doneAt: done ? TODAY : undefined } : x)))
    },
    removeKill: (id) => setKill((prev) => prev.filter((k) => k.id !== id)),
    addAssignment: (a) => {
      const order = Math.max(-1, ...assignments.map((p) => p.order)) + 1
      const temp = uid('a')
      /* Shown immediately under a temporary id, then swapped for the real one
         the database hands back — so the card is on the board before the
         round-trip finishes, and still editable after it. */
      setAssignments((prev) => [
        ...prev,
        {
          id: temp,
          title: a.title,
          type: a.type,
          angle: a.angle,
          notes: a.notes ?? '',
          sourceCreativeId: a.sourceCreativeId,
          firm: a.firm,
          format: a.format,
          visualCode: a.visualCode,
          verbalCode: a.verbalCode,
          batch: a.batch,
          priority: a.priority ?? 3,
          script: a.script,
          benchmarkUrl: a.benchmarkUrl,
          benchmarkName: a.benchmarkName,
          status: 'Assigned',
          order,
          createdAt: TODAY,
          comments: [],
          attachments: [],
        },
      ])
      persist(
        api
          .createAssignment({
            title: a.title, type: a.type, angle: a.angle, notes: a.notes ?? '',
            sourceCreativeId: a.sourceCreativeId,
            firm: a.firm, format: a.format,
            visualCode: a.visualCode, verbalCode: a.verbalCode, batch: a.batch,
            priority: a.priority ?? 3, script: a.script,
            benchmarkUrl: a.benchmarkUrl, benchmarkName: a.benchmarkName,
            status: 'Assigned', order, createdBy: 'admin',
          })
          .then((d) => {
            if (d?.id) setAssignments((prev) => prev.map((x) => (x.id === temp ? { ...x, id: d.id } : x)))
          }),
      )
      notify('creative', `New assignment: ${a.title}`, '/team/assignments')
    },
    updateAssignment,
    setAssignmentStatus,
    moveAssignment: (id, dir) =>
      setAssignments((prev) => {
        const next = reorder(prev, id, dir, () => true)
        /* Reordering swaps two cards, so both positions have to be written —
           saving only the one that was dragged would leave the other claiming
           a slot it no longer holds. */
        for (const card of next) {
          const before = prev.find((p) => p.id === card.id)
          if (before && before.order !== card.order && isPersisted(card.id)) {
            persist(api.patchAssignment(card.id, { order: card.order }))
          }
        }
        return next
      }),
    removeAssignment: (id) => {
      setAssignments((prev) => prev.filter((a) => a.id !== id))
      if (isPersisted(id)) persist(api.remove('assignment', id))
    },
    addComment: (assignmentId, by, text, stage) => {
      const a = assignments.find((x) => x.id === assignmentId)
      if (!a) return
      const temp = uid('cm')
      setAssignments((prev) =>
        prev.map((x) =>
          x.id === assignmentId ? { ...x, comments: [...x.comments, { id: temp, author: by, text, at: now(), stage }] } : x,
        ),
      )
      if (isPersisted(assignmentId)) {
        persist(
          api
            .createComment({ parentKind: 'assignment', parentId: assignmentId, author: by, text, stage })
            .then((d) => {
              if (!d?.comment?.id) return
              setAssignments((prev) =>
                prev.map((x) =>
                  x.id === assignmentId
                    ? { ...x, comments: x.comments.map((c) => (c.id === temp ? { ...c, id: d.comment.id } : c)) }
                    : x,
                ),
              )
            }),
        )
      }
      /* The other person is now waiting on a reply, and they may not have the
         board open. Routed by author in the notify route — a note goes to
         whoever did not write it. Fired and forgotten: a Slack outage must
         never cost someone their comment. */
      fetch('/api/creative/assignments/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'comment',
          author: by,
          by: ROLE_LABEL[by],
          title: a.title,
          text,
          stage,
          convention: [a.batch, a.firm, a.format, a.visualCode, a.verbalCode].filter(Boolean).join(' | '),
          url: typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '',
        }),
      }).catch(() => {})

      if (by === 'creative') notify('admin', `Faisal commented on “${a.title}”`, '/admin/assignments')
      else notify('creative', `Jason commented on “${a.title}”`, '/team/assignments')
    },
    addAttachments: (assignmentId, by, files, stage) => {
      const a = assignments.find((x) => x.id === assignmentId)
      if (!a || !files.length) return

      /* Shown straight away from a local blob URL so the thumbnail appears
         while the upload runs, then swapped for the stored URL. The blob is
         revoked once it has been replaced — it only survives this page, and
         leaving it attached would give a file that silently 404s on reload. */
      const pending: Attachment[] = files.map((f) => ({
        id: uid('f'),
        name: f.name,
        url: URL.createObjectURL(f),
        kind: f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'file',
        by,
        at: now(),
        stage,
      }))
      setAssignments((prev) =>
        prev.map((x) => (x.id === assignmentId ? { ...x, attachments: [...x.attachments, ...pending] } : x)),
      )

      persist(
        Promise.all(
          files.map(async (file, i) => {
            const form = new FormData()
            form.append('file', file)
            form.append('bucket', 'upload')
            const res = await fetch('/api/creative/assignments/upload', { method: 'POST', body: form })
            const d = await res.json()
            if (!res.ok) throw new Error(d.error ?? 'Upload failed.')
            return { temp: pending[i], url: d.url as string }
          }),
        ).then((done) => {
          /* Built before the state is set, not inside the updater: a state
             updater has to be pure, and a value assigned in one is not
             readable on the next line — which is how the save came to be
             skipped entirely, leaving the file in storage but attached to
             nothing. */
          const live = assignmentsRef.current.find((x) => x.id === assignmentId)
          const base = live?.attachments ?? [...a.attachments, ...pending]
          const next = base.map((f) => {
            const hit = done.find((d) => d.temp.id === f.id)
            return hit ? { ...f, url: hit.url } : f
          })
          /* A file whose optimistic row never made it into state — a refresh
             landing mid-upload, say — is appended rather than dropped. */
          for (const d of done) {
            if (!next.some((f) => f.id === d.temp.id)) next.push({ ...d.temp, url: d.url })
          }

          setAssignments((prev) => prev.map((x) => (x.id === assignmentId ? { ...x, attachments: next } : x)))
          for (const d of done) URL.revokeObjectURL(d.temp.url)

          /* One write after every file lands, not one per file. */
          if (isPersisted(assignmentId)) persist(api.patchAssignment(assignmentId, { attachments: next }))
        }),
      )

      if (by === 'creative') notify('admin', `Faisal uploaded ${files.length} file${files.length > 1 ? 's' : ''} to “${a.title}”`, '/admin/assignments')
    },
    addKTask: (t) => {
      const order = Math.max(-1, ...ktasks.map((p) => p.order)) + 1
      const temp = uid('t')
      setKTasks((prev) => [
        ...prev,
        {
          id: temp,
          type: t.type,
          title: t.title,
          notes: t.notes ?? '',
          sourceCreativeId: t.sourceCreativeId,
          disclaimer: t.disclaimer,
          status: 'To Do',
          order,
          createdAt: TODAY,
          comments: [],
          firm: t.firm,
          format: t.format,
          visualCode: t.visualCode,
          verbalCode: t.verbalCode,
          batch: t.batch,
          priority: t.priority ?? 3,
          script: t.script,
          benchmarkUrl: t.benchmarkUrl,
          benchmarkName: t.benchmarkName,
          attachments: [],
        },
      ])
      persist(
        api
          .createTask({
            title: t.title, type: t.type, notes: t.notes ?? '', disclaimer: t.disclaimer,
            sourceCreativeId: t.sourceCreativeId, status: 'To Do', order, createdBy: 'admin',
            firm: t.firm, format: t.format,
            visualCode: t.visualCode, verbalCode: t.verbalCode, batch: t.batch,
            priority: t.priority ?? 3, script: t.script,
            benchmarkUrl: t.benchmarkUrl, benchmarkName: t.benchmarkName,
          })
          .then((d) => {
            if (d?.id) setKTasks((prev) => prev.map((x) => (x.id === temp ? { ...x, id: d.id } : x)))
          }),
      )
    },
    setKTaskStatus: (id, status) => {
      setKTasks((prev) => prev.map((x) => (x.id === id ? { ...x, status, doneAt: status === 'Done' ? TODAY : undefined } : x)))
      if (isPersisted(id)) persist(api.patchTask(id, { status }))
    },
    moveKTask: (id, dir) =>
      setKTasks((prev) => {
        const next = reorder(prev, id, dir, (a, b) => a.status === b.status)
        for (const task of next) {
          const before = prev.find((p) => p.id === task.id)
          if (before && before.order !== task.order && isPersisted(task.id)) {
            persist(api.patchTask(task.id, { order: task.order }))
          }
        }
        return next
      }),
    removeKTask: (id) => {
      setKTasks((prev) => prev.filter((t) => t.id !== id))
      if (isPersisted(id)) persist(api.remove('task', id))
    },
    pushToLaunch: (assignmentId, tags, dailyBudget) => {
      const a = assignments.find((x) => x.id === assignmentId)
      if (!a) return
      const isNewTestBatch = a.type === 'New Test Batch'
      setLaunches((prev) => [
        ...prev,
        {
          id: uid('l'),
          assignmentId,
          sourceCreativeId: a.sourceCreativeId,
          name: a.title,
          angle: a.angle,
          campaign: findCreative(a.sourceCreativeId)?.campaign ?? DEFAULT_CAMPAIGN,
          convention: nextConvention({ angle: a.angle, type: a.type, sourceCreativeId: a.sourceCreativeId, isNewTestBatch }),
          tags,
          date: TODAY,
          dailyBudget,
          status: 'pending',
          isNewTestBatch,
          requestedBy: 'assignment',
        },
      ])
      updateAssignment(assignmentId, { status: 'Launching' })
    },
    manualLaunch: (input) => {
      setLaunches((prev) => [
        ...prev,
        {
          id: uid('l'),
          sourceCreativeId: input.sourceCreativeId,
          name: input.name,
          angle: input.angle,
          campaign: findCreative(input.sourceCreativeId)?.campaign ?? DEFAULT_CAMPAIGN,
          convention: nextConvention({ angle: input.angle, type: 'New Concept', sourceCreativeId: input.sourceCreativeId, isNewTestBatch: input.isNewTestBatch }),
          tags: input.tags,
          date: TODAY,
          dailyBudget: input.dailyBudget,
          status: 'pending',
          isNewTestBatch: input.isNewTestBatch,
          requestedBy: 'manual',
        },
      ])
    },
    relaunch: (creativeId) => {
      const c = findCreative(creativeId)
      if (!c) return
      setLaunches((prev) => [
        ...prev,
        {
          id: uid('l'),
          sourceCreativeId: c.id,
          name: `Relaunch – ${c.name}`,
          angle: c.angle,
          campaign: c.campaign,
          convention: bumpConvention(c.convention),
          tags: { resize: false, disclaimer: null, asIs: true },
          date: TODAY,
          dailyBudget: c.dailyBudget,
          status: 'pending',
          isNewTestBatch: false,
          requestedBy: 'relaunch',
        },
      ])
    },
    updateLaunch: (id, patch) => setLaunches((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l))),
    markLaunchDone: (id, done, by) => {
      const l = launches.find((x) => x.id === id)
      setLaunches((prev) => prev.map((x) => (x.id === id ? { ...x, status: done ? 'done' : 'pending', doneAt: done ? TODAY : undefined } : x)))
      if (l?.assignmentId) updateAssignment(l.assignmentId, { status: done ? 'Ad Launched' : 'Launching' })
      /* The only notification worth keeping here: Faisal cannot see the
         launch list, so this is how the maker learns their ad went live.
         Jason marking his own launch done needs no telling. */
      if (l && done && l.assignmentId) notify('creative', `Your ad “${l.name}” is live`, '/team/assignments')
    },
    cancelLaunch: (id) => {
      const l = launches.find((x) => x.id === id)
      setLaunches((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)))
      if (l?.assignmentId) updateAssignment(l.assignmentId, { status: 'Ready to Launch' })
    },
    markNotificationsRead: (role) => setNotifications((prev) => prev.map((n) => (n.to === role ? { ...n, read: true } : n))),
    setCompetitorNote: (name, note) => setCompetitorNotes((prev) => ({ ...prev, [name]: note })),
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
