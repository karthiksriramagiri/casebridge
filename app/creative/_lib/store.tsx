'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { TODAY, YESTERDAY, addDays, pacificDay } from './data'
import { adsetIndex, buildAdsetName, buildCreativeName, bumpConvention, buildConvention, creativeSuffix, isDelivering, killReason, watchReason, withAdsetDate, withCreativeDate, type AdsetTotals } from './metrics'

/* How often today's Meta figures are re-taken. Five minutes is well inside
   the hour the numbers are useful for and well outside Meta's rate limit:
   two accounts, four calls each, twelve times an hour. */
const AUTO_REFRESH_MS = 5 * 60_000

/** The row collections /api/creative/board writes. */
type BoardName = 'watch' | 'kill' | 'launches' | 'exclusions' | 'notifications'
import { api, fetchBoard, isPersisted } from './assignments-api'
import { boardApi, fetchBoardState, type StoredExclusion, type StoredWatch } from './board-api'
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
  RELAUNCH_TYPE,
} from './types'

let idSeq = 1000
const uid = (p: string) => `${p}_${++idSeq}`

/* The cut number a name already carries, so an edit to the batch or a hook
   code keeps the number this brief was given rather than renumbering it and
   colliding with whatever has been made since. */
const seqOf = (name: string | undefined, format: string): number => {
  const seg = name?.split('|')[1]?.trim()
  const m = seg?.match(new RegExp(`_${creativeSuffix(format)}(\\d+)$`, 'i')) ?? seg?.match(/_[A-Za-z]*(\d+)$/)
  return m ? Number(m[1]) : 1
}
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

type AddAssignmentInput = {
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
  adsetName?: string
  creativeName?: string
  offer?: string
  campaignType?: string
  priority?: number
  script?: string
  benchmarkUrl?: string
  benchmarkName?: string
  /** Defaults to 'Assigned'. A relaunch comes in already queued. */
  status?: AssignmentStatus
  /** The day it is queued for. Set with status 'Launching'. */
  launchDate?: string
}

export type ManualLaunchInput = {
  name: string
  angle: string
  sourceCreativeId?: string
  isNewTestBatch: boolean
  tags: LaunchTags
  dailyBudget: number
  /* What the launch sheet records. A manual launch never had a brief, so
     this is the only place these are captured — they have to come through
     or the cut lands on the list with no idea what it is. */
  firm?: AssignmentFirm
  format?: CreativeFormat
  visualCode?: string
  verbalCode?: string
  batch?: string
  offer?: string
  campaignType?: string
  /** 9x16 and friends — the frame it is delivered in. */
  size?: string
  /** The state it targets, paired with the firm on the sheet. */
  state?: string
  launchDate?: string
  adsetName?: string
  creativeName?: string
  notes?: string
  /** The cut itself, already uploaded. */
  fileUrl?: string
  fileName?: string
}

type Store = {
  creatives: Creative[]
  /** The Meta ad accounts behind `creatives`, for the account filter. */
  accounts: AccountInfo[]
  /** Distinct angles across the loaded ads, read off their names. */
  angles: string[]
  loading: boolean
  loadError: string | null
  /* ── The day the whole center is looking at ──────────────────────────
     One value, shared by every page, because the numbers and the boards
     have to agree on what day it is. Moving the day nav on the kill list
     moves Creative Analysis with it; otherwise you read one day's lists
     against another day's CPLs. */
  /** Pacific day under view. `TODAY` unless someone has stepped back. */
  day: string
  setDay: (day: string) => void
  /** Viewing a day that is finished. Its numbers are a record: frozen, and
      nothing on it can be changed. */
  dayLocked: boolean
  /** No numbers were ever written down for the day being viewed — it is
      before the day lock existed, so there is nothing to show. */
  dayMissing: boolean
  /** The day lock is switched on, i.e. its table exists. False means every
      day is showing live Meta, whatever date is on screen. */
  lockAvailable: boolean
  /** When the day under view was written down, and how many ads it holds. */
  snapshot: { takenAt: string; ads: number } | null
  /** Re-take today's numbers from Meta. Today only; a past day is a record. */
  refreshDay: () => void
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
  getCreative: (id?: string) => Creative | undefined
  addToWatch: (ids: string[]) => number
  removeWatch: (id: string) => void
  setWatchDecision: (id: string, decision: Decision | undefined) => void
  /** Spend and leads totalled per ad set — what the watch rules are read off. */
  adsetTotals: Map<string, AdsetTotals>
  addToKill: (ids: string[]) => number
  markKillDone: (id: string, done: boolean, by: Role) => void
  /** Take an ad off as fatigued rather than killed — it worked, it wore out. */
  markFatigued: (id: string) => void
  removeKill: (id: string) => void
  addAssignment: (a: AddAssignmentInput) => void
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
  /** Tick an assignment live, or put it back in the day's queue. */
  setLaunched: (assignmentId: string, done: boolean) => void
  cancelLaunch: (id: string) => void
  markNotificationsRead: (role: Role) => void
  /** Every watch row including ones taken off the list, for reading a past
   *  day back as it actually was. */
  watchAll: StoredWatch[]
  /** Watch List Mode dismissals, by Pacific day — shared, not per-browser. */
  exclusions: StoredExclusion[]
  exclude: (ids: string[]) => void
  restoreExclusions: () => void
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
    /* The sweep's own signed figure is deliberately NOT read.

       It counts pipeline opportunities at Pending Send or Signed/Sent, one
       per contact, over all time. /api/creative/center/signed counts
       ghl_leads rows with no pipeline stage, one per CASE, over the loaded
       window, excluding replacements. They are different questions and they
       disagree on 42 of the 163 live ads — by up to five cases, in both
       directions — because a driver and their passenger are one contact and
       two cases, and because a case that signed four months ago is still an
       opportunity but is outside the window.

       Finance invoices the case count, so the case count is the one the
       center reports. Taking "signed" from here as well would mean two
       numbers for one question, and the page cannot say which is right. */
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

  /* The day the center is looking at, and the numbers that belong to it.

     Meta's figures move all day; the boards beside them are dated and do
     not. Reading live Meta under a dated board meant last Tuesday's kill
     list sat next to this morning's CPLs. So the server writes the day's
     numbers down once and serves that copy back — see the day lock in
     /api/creative/center/creatives. This holds which day that is, and
     refetches when it changes. */
  const [day, setDay] = useState(TODAY)
  const [snapshot, setSnapshot] = useState<{ takenAt: string; ads: number } | null>(null)
  const [dayMissing, setDayMissing] = useState(false)
  const [lockAvailable, setLockAvailable] = useState(true)
  const [dayTick, setDayTick] = useState(0)

  /* A finished day is a record of what the room decided that day, against
     the numbers it had. Writing to it would make the record wrong, so every
     action scoped to a day refuses while the day nav is stepped back — and
     says why, rather than looking broken by doing nothing. Assignments and
     tasks are not dated to the day under view and stay editable. */
  const lockedDay = useCallback(() => {
    if (day >= TODAY) return false
    toast.error('That day is locked', {
      description: 'It is a record of what was decided. Go back to today to make changes.',
    })
    return true
  }, [day])

  useEffect(() => {
    let live = true
    setLoading(true)
    const url = `/api/creative/center/creatives?days=30&day=${day}${dayTick ? '&refresh=1' : ''}`
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return
        setMetaAds(d.creatives ?? [])
        setAccounts(d.accounts ?? [])
        setLoadError(d.error ?? null)
        setSnapshot(d.snapshot ?? null)
        setDayMissing(!!d.missing)
        setLockAvailable(d.lockAvailable !== false)
      })
      .catch((e) => live && setLoadError(e.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [day, dayTick])

  /* Today's numbers, re-taken every five minutes.

     The day lock freezes the figures the first time the centre is opened,
     which is what a past day needs and what today does not: a meeting that
     starts at nine should not still be reading the eight o'clock spend at
     eleven. The Refresh button did this by hand; this does it on a timer.

     Three conditions, all of them load-bearing:

       today only   a past day is a record. The server refuses to re-take
                    one anyway, but asking would be a wasted Meta call
                    every five minutes for as long as the tab is open.
       visible      a tab left open overnight stops asking. Meta's rate
                    limit is shared with the rest of the account.
       idle         `inFlight` is the optimistic-write counter. A refetch
                    landing between a write and its save pulls the old row
                    back and reads as the edit being rejected.

     It also fires on focus, which is when someone has come back from Ads
     Manager having changed something and wants to see it. */
  useEffect(() => {
    if (day !== TODAY) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (inFlight.current > 0) return
      setDayTick((n) => n + 1)
    }
    const id = setInterval(tick, AUTO_REFRESH_MS)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
    }
  }, [day])

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
    const [d, b] = await Promise.all([fetchBoard(), fetchBoardState()])
    setAssignments(d.assignments)
    setKTasks(d.tasks)
    /* The watch, kill and launch lists come back on the same beat. They used
       to be React state with no backing table at all, which is why a refresh
       threw away the day's decisions. */
    setWatch(b.watch)
    setKill(b.kill)
    setLaunches(b.launches)
    setExclusions(b.exclusions)
    setNotifications(b.notifications)
    setBoardSetupNeeded(d.setupNeeded || b.setupNeeded)
    setBoardError(d.error ?? b.error)
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

  /* Create a row on one of the three boards.

     The row is shown immediately under a temporary id and the database's uuid
     is swapped in when the write lands — the same trick the assignment board
     uses. Without the swap the card appears, but every later edit to it is
     sent against an id the database has never heard of and silently does
     nothing. */
  const createOn = useCallback(
    <T extends { id: string }>(
      board: BoardName,
      setList: React.Dispatch<React.SetStateAction<T[]>>,
      temp: T,
      row: Record<string, unknown>,
    ) => {
      inFlight.current += 1
      boardApi.create(board, row)
        .then((saved) => setList((prev) => prev.map((x) => (x.id === temp.id ? { ...x, id: saved.id } : x))))
        .catch((e: Error) => setBoardError(e.message))
        .finally(() => { inFlight.current -= 1 })
    },
    [],
  )

  /** Update one row, skipping anything not yet saved. */
  const patchOn = useCallback(
    (board: BoardName, id: string, patch: Record<string, unknown>) => {
      if (!isPersisted(id)) return
      persist(boardApi.patch(board, id, patch))
    },
    [persist],
  )

  const removeOn = useCallback(
    (board: BoardName, id: string) => {
      if (!isPersisted(id)) return
      persist(boardApi.remove(board, id))
    },
    [persist],
  )

  /* Every watch row, hidden ones included. A Watch List Mode removal flags
     its row rather than deleting it, so the raw list is what answers "is this
     ad already on today's list" — re-adding one that was deliberately hidden
     is exactly the bug the flag exists to prevent. The pages read `watch`
     below, which is this minus the hidden rows. */
  const [watchRows, setWatch] = useState<StoredWatch[]>(seedWatch)
  const [kill, setKill] = useState<KillItem[]>(seedKill)
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
  /* Empty for the same reason the assignment board is: the real rows come
     from the database a moment later, and seeding them would show two
     launches that do not exist and then take them away again. */
  const [launches, setLaunches] = useState<LaunchTask[]>([])
  /* Both start empty and arrive from the database a moment later. Seeding
     them would show a bell count and a set of dismissals that are not real
     and then take them away. */
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [exclusions, setExclusions] = useState<StoredExclusion[]>([])

  const notify = useCallback((to: Role, text: string, href: string) => {
    const temp: Notification = { id: uid('n'), to, text, href, at: now(), read: false }
    setNotifications((prev) => [temp, ...prev])
    inFlight.current += 1
    boardApi.create('notifications', { to, text, href, read: false })
      .then((saved) => setNotifications((prev) => prev.map((x) => (x.id === temp.id ? { ...x, id: saved.id } : x))))
      .catch((e: Error) => setBoardError(e.message))
      .finally(() => { inFlight.current -= 1 })
  }, [])

  /* What the pages see: today's hidden rows stay hidden, across reloads and
     across people, until the date rolls over and a new day's list is built. */
  const watch = useMemo(() => watchRows.filter((w) => !w.removed), [watchRows])

  /* Hoisted out of the context object so other actions can call it — a
     relaunch has to raise a Ready to Launch card, and a property of the same
     object literal is not in scope from its siblings. `status` is a parameter
     now rather than always 'Assigned': a relaunch skips the brief, because
     the ad already exists and only needs putting back up. */
  const addAssignment = useCallback(
    (a: AddAssignmentInput) => {
      /* A double down is always top priority.

         It is the one brief that is known to pay: the ad set it comes from
         has already earned its CPL, so the sooner the next cut is in the
         account the sooner that keeps happening. Set here rather than at
         each button, so a new way of raising one cannot forget it. */
      if (a.type === 'Double Down') a = { ...a, priority: 5 }
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
          adsetName: a.adsetName,
          creativeName: a.creativeName,
          offer: a.offer,
          campaignType: a.campaignType,
          priority: a.priority ?? 3,
          script: a.script,
          benchmarkUrl: a.benchmarkUrl,
          benchmarkName: a.benchmarkName,
          status: a.status ?? 'Assigned',
          launchDate: a.launchDate,
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
            adsetName: a.adsetName, creativeName: a.creativeName,
            offer: a.offer, campaignType: a.campaignType,
            priority: a.priority ?? 3, script: a.script,
            benchmarkUrl: a.benchmarkUrl, benchmarkName: a.benchmarkName,
            status: a.status ?? 'Assigned', launchDate: a.launchDate,
            order, createdBy: 'admin',
          })
          .then((d) => {
            if (d?.id) setAssignments((prev) => prev.map((x) => (x.id === temp ? { ...x, id: d.id } : x)))
            /* The brief saved, but some of it had nowhere to go. Said out
               loud: a Double Down whose ad set name was quietly dropped
               looks finished and sends someone hunting in Ads Manager. */
            if (d?.dropped?.length) setBoardError(d.setup ?? `Saved without ${d.dropped.join(', ')}.`)
          }),
      )
      notify('creative', `New assignment: ${a.title}`, '/team/assignments')
    },
    [assignments, persist, notify],
  )

  /* The watch list is judged on the ad set, so its totals are built once here
     and handed to everything that reads a watch rule. Rebuilding it per row
     would re-sum an ad set's history for every ad inside it. */
  /* Built from what is actually running. The watch bands and the KILL/WATCH
     suggestions are read off these totals, and a cut paused days ago was
     still pulling its old spend into them — a set could be judged on money
     no longer being spent. */
  const adsetTotals = useMemo(() => adsetIndex(creatives.filter(isDelivering)), [creatives])

  const killedIds = useMemo(() => new Set(kill.filter((k) => k.status === 'done').map((k) => k.creativeId)), [kill])

  const findCreative = useCallback(
    (id?: string) => (id ? creatives.find((c) => c.id === id) : undefined),
    [creatives],
  )

  /* The archive is whatever has actually been marked killed. The prototype
     also carried five pre-archived creatives; with live ads there is no such
     thing until someone kills one. */
  /* Marked fatigued but not yet pulled. The Relaunch / Fatigue list is the
     record of what wore out, so it has to show the label the moment it is
     applied rather than waiting for someone to switch the ad off. */
  const fatiguedIds = useMemo(
    () => new Set(kill.filter((k) => k.kind === 'fatigue').map((k) => k.creativeId)),
    [kill],
  )

  const archived = useMemo(
    () =>
      creatives
        .filter((c) => killedIds.has(c.id) || fatiguedIds.has(c.id))
        .map((c) => ({
          ...c,
          archived: (() => {
            const k = kill.find((x) => x.creativeId === c.id)
            return {
              /* The day it was pulled, or — while that is still pending —
                 the day it landed on the kill list. */
              killDate: k?.doneAt ?? k?.addedAt ?? TODAY,
              /* The archive used to call everything fatigue, which made the
                 one distinction worth keeping invisible. */
              reason: (k?.kind === 'fatigue' ? 'Fatigue' : 'Relaunch') as 'Fatigue' | 'Relaunch',
              fatigueDate: k?.kind === 'fatigue' ? k?.doneAt : undefined,
            }
          })(),
        })),
    [creatives, kill, killedIds, fatiguedIds],
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
          return c ? { id: uid('w'), creativeId: id, date, reason: watchReason(c, adsetTotals) } : null
        })
        .filter((w): w is WatchItem => w !== null),
    [findCreative, adsetTotals],
  )

  const addToWatch = useCallback(
    (ids: string[]) => {
      if (lockedDay()) return 0
      /* Rows flagged `removed` by the old behaviour are not on the list any
         more, so they must not block an add. Without this, every creative
         taken off the list before this change stayed un-addable forever. */
      const existing = new Set(
        watchRows.filter((w) => w.date === TODAY && !w.removed).map((w) => w.creativeId),
      )
      const fresh = ids.filter((id) => !existing.has(id))
      const rows = seedWatchDay(fresh, TODAY)
      setWatch((prev) => [...prev, ...rows])
      for (const w of rows) {
        createOn('watch', setWatch, w, {
          creativeId: w.creativeId, date: w.date, reason: w.reason, removed: false,
        })
      }
      return fresh.length
    },
    [watchRows, seedWatchDay, createOn, lockedDay],
  )

  /** Every kill must originate from the watch list, so direct kills also log a KILL decision on today's watch list. */
  const addToKill = useCallback(
    (ids: string[]) => {
      if (lockedDay()) return 0
      const existing = new Set(kill.map((k) => k.creativeId))
      const fresh = ids.filter((id) => !existing.has(id))
      if (!fresh.length) return 0
      const onWatchToday = new Set(
        watchRows.filter((w) => w.date === TODAY && !w.removed).map((w) => w.creativeId),
      )

      /* Already on today's watch list: the row stands, its decision becomes
         KILL. Not on it: a new row is written carrying that decision, because
         every kill has to be traceable to the watch list it came off.

         Either way the row comes off the visible list. A killed creative is
         decided — leaving it on the watch list means the next person reads it
         as still awaiting a call and the list never shrinks as the meeting
         works through it. The row stays in the table with its KILL decision,
         which is the record of where the kill came from. */
      const marked = watchRows.filter((w) => w.date === TODAY && fresh.includes(w.creativeId))
      const added: StoredWatch[] = seedWatchDay(fresh.filter((id) => !onWatchToday.has(id)), TODAY)
        .map((w) => ({ ...w, decision: 'KILL' as const, removed: true }))

      setWatch((prev) => [
        ...prev.map((w) =>
          w.date === TODAY && fresh.includes(w.creativeId)
            ? { ...w, decision: 'KILL' as const, removed: true }
            : w,
        ),
        ...added,
      ])
      for (const w of marked) patchOn('watch', w.id, { decision: 'KILL', removed: true })
      for (const w of added) {
        createOn('watch', setWatch, w, {
          creativeId: w.creativeId, date: w.date, reason: w.reason, decision: 'KILL', removed: true,
        })
      }

      const killRows: KillItem[] = fresh.map((id) => {
        const c = findCreative(id)
        return { id: uid('k'), creativeId: id, addedAt: TODAY, reason: c ? killReason(c) : '', status: 'pending' as const }
      })
      setKill((prev) => [...prev, ...killRows])
      for (const k of killRows) {
        createOn('kill', setKill, k, {
          creativeId: k.creativeId, addedAt: k.addedAt, reason: k.reason, status: 'pending', kind: 'kill',
        })
      }
      return fresh.length
    },
    [kill, watchRows, notify, findCreative, seedWatchDay, createOn, patchOn, lockedDay],
  )

  /* The fields both names are built from. Changing any of them changes what
     the ad should be called. */
  const NAMING_FIELDS: (keyof Assignment)[] = [
    'firm', 'format', 'offer', 'campaignType', 'batch', 'visualCode', 'verbalCode',
  ]

  const updateAssignment = useCallback(
    (id: string, patch: Partial<Assignment>) => {
      const before = assignmentsRef.current.find((a) => a.id === id)

      /* Rename when a naming field moves.

         The names used to be written once, at creation, and then stood
         still — change the batch number or a hook code afterwards and the
         card kept advertising the old name, which is the one somebody would
         then go and type into Ads Manager.

         Only on a card that already has names: a brief written before this
         existed should not acquire them from an unrelated edit, and a double
         down's ad set is deliberately the live one and must not be rebuilt
         from the form's fields. */
      /* Switching a card to Double Down promotes it, same rule as creating
         one. A priority the person set by hand afterwards is left alone —
         reverting a deliberate choice is worse than the inconsistency. */
      if (patch.type === 'Double Down' && before?.type !== 'Double Down' && patch.priority === undefined) {
        patch = { ...patch, priority: 5 }
      }

      const touchesNaming = NAMING_FIELDS.some((k) => k in patch)
      let renamed: Partial<Assignment> = {}
      if (before && touchesNaming && (before.adsetName || before.creativeName)) {
        const next = { ...before, ...patch }
        const parts = {
          firm: (next.firm ?? '').replace(' [SPANISH]', '_SP'),
          format: next.format ?? '',
          offer: next.offer ?? '',
          campaignType: next.campaignType ?? '',
          date: next.createdAt || TODAY,
          batch: next.batch ?? '',
          visualCode: next.visualCode,
          verbalCode: next.verbalCode,
          seq: seqOf(next.creativeName, next.format ?? ''),
        }
        /* Keep the date segment the name already carries.

           A brief written on the 5th and edited on the 7th keeps the 5th:
           the date is when the cut was briefed, not when somebody last
           touched a field on it. Double downs are stamped with the day they
           are raised, which this then leaves alone. */
        const built = buildCreativeName(parts)
        const keptDate = next.creativeName?.split('|')[0]?.trim()
        const creativeName = keptDate
          ? built.replace(/^[^|]*/, `${keptDate} `)
          : built

        renamed = {
          /* A double down runs in an existing ad set, so its ad set name is
             a fact about Meta rather than something to regenerate. */
          ...(next.type === 'Double Down' ? {} : { adsetName: buildAdsetName(parts) }),
          creativeName,
        }
      }

      const full = { ...patch, ...renamed }
      setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, ...full } : a)))
      /* Comments are rows of their own and are written by addComment; sending
         them here too would duplicate every one. Everything else on the card
         is a column and goes straight through. */
      const { comments, ...columns } = full
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
    day,
    setDay,
    /* A finished day is a record. Nothing on it can be changed — not the
       kill list, not a launch tick — or the record stops being one. A
       forward date is not a record: Launch Lists queues tomorrow's ads on
       it, so it stays open. */
    dayLocked: day < TODAY,
    dayMissing,
    lockAvailable,
    snapshot,
    /* Only today can be re-taken. `dayTick` forces the effect to run with
       refresh=1, which is what tells the server to ask Meta again and
       replace today's copy. */
    refreshDay: () => setDayTick((n) => n + 1),
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
    getCreative: findCreative,
    adsetTotals,
    watchAll: watchRows,
    addToWatch,
    /* Taking a creative off the watch list deletes the row.

       It used to flag the row instead, back when that flag was also how
       Watch List Mode's hides survived a reload. Those live in their own
       table now, so the flag's only remaining effect was to block the ad
       from ever being added again — deleting it from the list and then
       trying to put it back reported "already on today's watch list" and
       did nothing, with no row on screen to explain why. */
    removeWatch: (id) => {
      if (lockedDay()) return
      setWatch((prev) => prev.filter((w) => w.id !== id))
      removeOn('watch', id)
    },
    setWatchDecision: (id, decision) => {
      if (lockedDay()) return
      setWatch((prev) => prev.map((w) => (w.id === id ? { ...w, decision } : w)))
      patchOn('watch', id, { decision: decision ?? null })
    },
    addToKill,
    /* Fatigue is a label, not an action.

       It used to also mark the kill done, which meant pressing it switched
       the ad off as far as the rest of the app was concerned — gone from
       Creative Analysis, gone from the budget — before anyone had touched
       Ads Manager. Saying "this one wore out" and actually pulling it are
       two separate moments, and only the second is a kill. */
    markFatigued: (id) => {
      if (lockedDay()) return
      const k = kill.find((x) => x.id === id)
      setKill((prev) =>
        prev.map((x) => (x.id === id ? { ...x, kind: 'fatigue', reason: x.reason || 'Fatigued' } : x)),
      )
      patchOn('kill', id, { kind: 'fatigue', reason: k?.reason || 'Fatigued' })
      if (k) notify('creative', `“${findCreative(k.creativeId)?.convention ?? 'A creative'}” was marked fatigued`, '/team/archives')
    },
    markKillDone: (id, done, by) => {
      if (lockedDay()) return
      const k = kill.find((x) => x.id === id)
      setKill((prev) => prev.map((x) => (x.id === id ? { ...x, status: done ? 'done' : 'pending', doneAt: done ? TODAY : undefined } : x)))
      patchOn('kill', id, { status: done ? 'done' : 'pending', doneAt: done ? TODAY : null })
    },
    removeKill: (id) => {
      if (lockedDay()) return
      setKill((prev) => prev.filter((k) => k.id !== id))
      removeOn('kill', id)
    },
    addAssignment,
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
      const row: LaunchTask = {
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
      }
      setLaunches((prev) => [...prev, row])
      createOn('launches', setLaunches, row, {
          assignmentId: row.assignmentId ?? null, sourceCreativeId: row.sourceCreativeId ?? null,
          name: row.name, angle: row.angle, campaign: row.campaign, convention: row.convention,
          tags: row.tags, date: row.date, dailyBudget: row.dailyBudget, status: row.status,
          isNewTestBatch: row.isNewTestBatch, requestedBy: row.requestedBy,
        })
      updateAssignment(assignmentId, { status: 'Launching' })
    },
    manualLaunch: (input) => {
      /* Raise the card the Launch Lists page actually renders.

         That page reads the assignment board — anything at Launching with
         today's date is on the list — not this LaunchTask array. Writing
         only the task put a manual launch somewhere nothing showed it, the
         same gap relaunch had. */
      addAssignment({
        title: input.creativeName ?? input.name,
        type: 'New Concept',
        angle: input.angle,
        sourceCreativeId: input.sourceCreativeId,
        firm: input.firm,
        format: input.format,
        visualCode: input.visualCode,
        verbalCode: input.verbalCode,
        batch: input.batch,
        offer: input.offer,
        campaignType: input.campaignType,
        adsetName: input.adsetName,
        creativeName: input.creativeName,
        status: 'Launching',
        launchDate: input.launchDate ?? TODAY,
        notes: [
          input.adsetName && `Ad set: ${input.adsetName}`,
          input.size && `Size: ${input.size}`,
          input.state && input.firm && `${input.state} – ${input.firm}`,
          `Budget: $${input.dailyBudget}/day`,
          input.fileName && `File: ${input.fileName}`,
          input.notes,
        ].filter(Boolean).join('\n'),
      })

      const row: LaunchTask = {
        id: uid('l'),
        sourceCreativeId: input.sourceCreativeId,
        name: input.creativeName ?? input.name,
        angle: input.angle,
        campaign: input.adsetName ?? findCreative(input.sourceCreativeId)?.campaign ?? DEFAULT_CAMPAIGN,
        convention: input.creativeName ?? nextConvention({ angle: input.angle, type: 'New Concept', sourceCreativeId: input.sourceCreativeId, isNewTestBatch: input.isNewTestBatch }),
        tags: input.tags,
        date: input.launchDate ?? TODAY,
        dailyBudget: input.dailyBudget,
        status: 'pending',
        isNewTestBatch: input.isNewTestBatch,
        requestedBy: 'manual',
      }
      setLaunches((prev) => [...prev, row])
      createOn('launches', setLaunches, row, {
          assignmentId: row.assignmentId ?? null, sourceCreativeId: row.sourceCreativeId ?? null,
          name: row.name, angle: row.angle, campaign: row.campaign, convention: row.convention,
          tags: row.tags, date: row.date, dailyBudget: row.dailyBudget, status: row.status,
          isNewTestBatch: row.isNewTestBatch, requestedBy: row.requestedBy,
        })
    },
    relaunch: (creativeId) => {
      if (lockedDay()) return
      const c = findCreative(creativeId)
      if (!c) return

      /* A relaunch has to show up on the Launch Lists page, and that page
         reads the assignment board rather than this array. Writing only the
         LaunchTask below put the relaunch somewhere nothing rendered it, so
         the button looked like it had done nothing.

         It goes straight into today's queue — 'Launching', dated today — not
         into the Ready to Launch pool. The pool is for finished work nobody
         has picked a day for; a relaunch has already had its day picked, by
         the act of relaunching it. Leaving it in the pool would mean
         scheduling something that was only ever going out today.

         The two records are not duplicates: the assignment is the card
         someone launches, the LaunchTask is what the Budget Tracker and the
         Execute view count as pending. The ad's firm code (LHP_SP) is
         translated to the spelling the board uses (LHP [SPANISH]) or the
         Spanish lists silently split in two. */
      const SPELLING: Record<string, AssignmentFirm> = { LHP: 'LHP', LHP_SP: 'LHP [SPANISH]', JM: 'JM', JM_SP: 'JM [SPANISH]' }

      /* The names it goes back up under, dated today.

         A relaunch reuses the ad set and the cut it already had — same
         batch, same angles, same sequence — but it is going live today,
         and the date segment of both names says when something launched.
         Carrying the original's date forward filed a relaunch under the
         day it first ran, so the account read as though nothing had gone
         up. Same rule as a Double Down. A name that does not follow the
         convention is left exactly as found rather than rebuilt. */
      const adsetName = withAdsetDate(c.adset, TODAY)
      const creativeName = withCreativeDate(c.convention || c.name, TODAY)

      addAssignment({
        title: `Relaunch – ${creativeName}`,
        /* Not creative work: nothing is made, the ad already exists. It is
           kept off the Creative Team board and goes straight to the launch
           queue. */
        type: RELAUNCH_TYPE,
        angle: c.angle,
        sourceCreativeId: c.id,
        firm: SPELLING[c.firm],
        status: 'Launching',
        launchDate: TODAY,
        adsetName,
        creativeName,
      })
      const row: LaunchTask = {
        id: uid('l'),
        sourceCreativeId: c.id,
        name: `Relaunch – ${creativeName}`,
        angle: c.angle,
        campaign: c.campaign,
        convention: creativeName,
        tags: { resize: false, disclaimer: null, asIs: true },
        date: TODAY,
        dailyBudget: c.dailyBudget,
        status: 'pending',
        isNewTestBatch: false,
        requestedBy: 'relaunch',
      }
      setLaunches((prev) => [...prev, row])
      createOn('launches', setLaunches, row, {
          assignmentId: row.assignmentId ?? null, sourceCreativeId: row.sourceCreativeId ?? null,
          name: row.name, angle: row.angle, campaign: row.campaign, convention: row.convention,
          tags: row.tags, date: row.date, dailyBudget: row.dailyBudget, status: row.status,
          isNewTestBatch: row.isNewTestBatch, requestedBy: row.requestedBy,
        })
    },
    updateLaunch: (id, patch) => {
      setLaunches((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
      patchOn('launches', id, patch as Record<string, unknown>)
    },
    markLaunchDone: (id, done, by) => {
      if (lockedDay()) return
      const l = launches.find((x) => x.id === id)
      setLaunches((prev) => prev.map((x) => (x.id === id ? { ...x, status: done ? 'done' : 'pending', doneAt: done ? TODAY : undefined } : x)))
      patchOn('launches', id, { status: done ? 'done' : 'pending', doneAt: done ? TODAY : null })
      if (l?.assignmentId) updateAssignment(l.assignmentId, { status: done ? 'Ad Launched' : 'Launching' })
      /* The only notification worth keeping here: Faisal cannot see the
         launch list, so this is how the maker learns their ad went live.
         Jason marking his own launch done needs no telling. */
      if (l && done && l.assignmentId) notify('creative', `Your ad “${l.name}” is live`, '/team/assignments')
    },

    /* "Launched" is one fact kept in two places: the status on the card, and
       the launch row that raised it. Ticking it on the launch row synced
       both; ticking it on the card — which is what Launch Lists and Execute
       actually do — did not. The row stayed `done` through an undo, and the
       Budget Tracker went on counting the ad as live money. Both ends go
       through here now, so reverting a launch walks the whole way back. */
    setLaunched: (assignmentId, done) => {
      if (lockedDay()) return
      updateAssignment(assignmentId, { status: done ? 'Ad Launched' : 'Launching' })
      const row = launches.find((l) => l.assignmentId === assignmentId)
      if (!row) return
      setLaunches((prev) => prev.map((x) => (
        x.id === row.id ? { ...x, status: done ? 'done' : 'pending', doneAt: done ? TODAY : undefined } : x
      )))
      patchOn('launches', row.id, { status: done ? 'done' : 'pending', doneAt: done ? TODAY : null })
      if (done) notify('creative', `Your ad “${row.name}” is live`, '/team/assignments')
    },
    cancelLaunch: (id) => {
      const l = launches.find((x) => x.id === id)
      setLaunches((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)))
      patchOn('launches', id, { status: 'cancelled' })
      if (l?.assignmentId) updateAssignment(l.assignmentId, { status: 'Ready to Launch' })
    },
    markNotificationsRead: (role) => {
      const unread = notifications.filter((n) => n.to === role && !n.read)
      setNotifications((prev) => prev.map((n) => (n.to === role ? { ...n, read: true } : n)))
      for (const n of unread) patchOn('notifications', n.id, { read: true })
    },

    /* Watch List Mode dismissals, shared and dated. Keyed to the Pacific day
       so the slate clears itself at midnight PST without anything having to
       run — yesterday's rows are simply never matched again. */
    exclusions,
    exclude: (ids: string[]) => {
      const day = pacificDay()
      const already = new Set(exclusions.filter((x) => x.day === day).map((x) => x.creativeId))
      const fresh = ids.filter((id) => !already.has(id))
      const rows: StoredExclusion[] = fresh.map((id) => ({ id: uid('x'), creativeId: id, day }))
      setExclusions((prev) => [...prev, ...rows])
      for (const r of rows) {
        createOn('exclusions', setExclusions, r, { creativeId: r.creativeId, day: r.day, createdBy: 'admin' })
      }
    },
    restoreExclusions: () => {
      const day = pacificDay()
      const today = exclusions.filter((x) => x.day === day)
      setExclusions((prev) => prev.filter((x) => x.day !== day))
      for (const x of today) removeOn('exclusions', x.id)
    },
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
