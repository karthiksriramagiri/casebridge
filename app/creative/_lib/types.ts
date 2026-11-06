/* Two roles, not three.

   There used to be a separate K-Team workspace for the launch, kill, resize
   and disclaimer work. That work did not move — Jason does it — so a third
   login was a workspace nobody was going to sign into, and every list in the
   center was already duplicated between it and the admin side. The tasks it
   held are now Jason's own production queue. */
export type Role = 'admin' | 'creative'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Jason',
  creative: 'Faisal',
}

export type DayMetric = {
  date: string
  spend: number
  impressions: number
  hooks: number
  linkClicks: number
  leads: number
  /** Cases signed that day, attributed to this ad — from ghl_leads. */
  acquisitions: number
}

/* A person attributed to an ad, out of the GHL pipeline sweep.

   `date` is the day that matters for this person, and which day that is
   depends on what they are: a signed case is dated by the stage change that
   signed it — the day it entered Pending Send or Signed/Sent — while a lead
   is dated by when the lead came in. Filing both on the same date would hide
   a case that signed this week off a lead that arrived last month. */
export type SignedLead = {
  name: string
  date: string
  /** The pipeline stage they sit in, as GHL words it. */
  stage: string
  phone?: string | null
  /** Signed cases only: who closed it, and the invoice it sits on. */
  closer?: string | null
  invoiceCode?: string | null
  firmName?: string | null
  /** A case swapped for another — shown beside the rest, never counted. */
  isReplacement?: boolean
}

export type Creative = {
  id: string
  name: string
  convention: string
  adId: string
  campaign: string
  adset: string
  /** Firm code off the ad name — LHP | LHP_SP | JM | JM_SP | … */
  firm: string
  angle: string
  format: 'Video' | 'Image'
  launchDate: string
  dailyBudget: number
  daily: DayMetric[]
  /* Meta's `effective_status`, which rolls the parents in: an ad left on
     inside a paused ad set reports ADSET_PAUSED, not ACTIVE. Undefined when
     the ad was missing from the status sweep. */
  status?: string
  adsetStatus?: string
  /** Which Meta ad account this ad belongs to — 'asd' | 'jm'. */
  account: string
  accountLabel: string
  /** Cases signed off this ad — Pending Send or Signed/Sent — newest first. */
  signedLeads?: SignedLead[]
  /** Every person in the pipeline off this ad, newest first. */
  leadPeople?: SignedLead[]
  archived?: { killDate: string; fatigueDate?: string; reason: 'Fatigue' | 'Relaunch' }
}

/** An ad account as the filter row offers it. */
export type AccountInfo = {
  key: string
  label: string
  creatives: number
  error: string | null
}

export type RangeKey = 'today' | 'yest' | 'ty' | '3d' | '5d' | '7d' | 'month' | 'max'

export type Totals = {
  spend: number
  impressions: number
  hooks: number
  linkClicks: number
  leads: number
  acquisitions: number
  cpl: number | null
  cpa: number | null
  ctr: number
  hookRate: number
  cpm: number
}

export type Stage = 'NEW' | 'ACTIVE'
export type Decision = 'WATCH' | 'KILL'

export type WatchItem = {
  id: string
  creativeId: string
  date: string
  reason: string
  decision?: Decision
}

export type KillItem = {
  id: string
  creativeId: string
  addedAt: string
  reason: string
  status: 'pending' | 'done'
  doneAt?: string
}

export const ASSIGNMENT_STATUSES = [
  'Assigned',
  'In Process of Making',
  'Feedback Request',
  'Feedback Done',
  'Ready to Launch',
  'Launching',
  'Ad Launched',
  'Winner Ad',
] as const
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]

export const CREATIVE_EDITABLE_STATUSES: AssignmentStatus[] = ['In Process of Making', 'Feedback Request']

export const CREATIVE_TYPES = [
  'Double Down',
  'Remake - Improve Hook',
  'Remake - Improve Body',
  'ENG Winner → SP',
  'Competitor Winner Remake',
  'Test Batch Remake',
  'New Concept',
  'New Test Batch',
] as const
export type AssignmentType = (typeof CREATIVE_TYPES)[number]

/* Production tasks — the hands-on work that turns an approved creative into
   something launchable. Formerly the K-Team board; the work is the same, it
   is Jason's queue now. */
/* The three kinds of production work Jason actually queues for himself.
   Add Disclaimer and Naming Convention were on the old K-Team board and are
   not jobs anyone raises a ticket for — they are done in passing. */
export const TASK_TYPES = [
  'Resize Images',
  'Change Image Text',
  'SP → English Images',
] as const
export type KTaskType = (typeof TASK_TYPES)[number]

/** @deprecated kept so older imports keep resolving — use TASK_TYPES. */
export const KTEAM_TASK_TYPES = TASK_TYPES

export const TASK_STATUSES = ['To Do', 'In Progress', 'Done'] as const
export type KTaskStatus = (typeof TASK_STATUSES)[number]

/** @deprecated kept so older imports keep resolving — use TASK_STATUSES. */
export const KTEAM_STATUSES = TASK_STATUSES

/* The stages a creative passes through on its way to being launched.

   A brief is not one upload — it is a first cut, feedback on it, a second cut,
   feedback on that, and a final. Holding them all in one undifferentiated pile
   of files loses the thing everyone actually needs to know: which version is
   current, and what was said about the one before it. */
export const VERSION_STAGES = [
  { key: 'v1',    label: 'Remake V1', feedback: 'Feedback V1' },
  { key: 'v2',    label: 'Remake V2', feedback: 'Feedback V2' },
  { key: 'final', label: 'Final V',   feedback: null },
] as const
export type VersionStage = (typeof VERSION_STAGES)[number]['key']

export type Comment = {
  id: string
  author: Role
  text: string
  at: string
  /** Which version this feedback is about. Absent for general chat. */
  stage?: VersionStage
}

export type Attachment = {
  id: string
  name: string
  url: string
  kind: 'image' | 'video' | 'file'
  by: Role
  at: string
  /** Which cut this file is. Absent for files uploaded before stages existed. */
  stage?: VersionStage
}

/* The firms a creative can be cut for. The Spanish boards are separate firms
   here because they are separate pipelines, separate ad sets and separate
   hooks — the same split the rest of the center already makes. */
export const ASSIGNMENT_FIRMS = ['LHP', 'LHP [SPANISH]', 'JM', 'JM [SPANISH]'] as const
export type AssignmentFirm = (typeof ASSIGNMENT_FIRMS)[number]

/* The production style, and the angle family it draws its hooks from.

   These are the same six families the Angles page ranks, named by the segment
   that appears in every ad name:

     0826 | B00090_BNR1 | LHP | BNR | G1 | H4 | GA-WIN
                           ^^^   ^^^  ^^   ^^
                          firm  type  vis  verb

   Pinning the letters to the type is what stops a brief asking for a Banner
   cut built on a Branded hook — the codes would not match the ad it becomes. */
export const CREATIVE_FORMATS = [
  { code: 'BR',    label: 'Broll',       family: 'BR-AD',    visual: 'A', verbal: 'B' },
  { code: 'HYB',   label: 'Hybrid',      family: 'HYB-AD',   visual: 'C', verbal: 'D' },
  { code: 'BNR',   label: 'Banner',      family: 'BNR-AD',   visual: 'G', verbal: 'H' },
  { code: 'AIUGC', label: 'AI UGC',      family: 'AIUGC-AD', visual: 'E', verbal: 'F' },
  { code: 'ANM',   label: 'Animation',   family: 'ANM-AD',   visual: 'I', verbal: 'J' },
  { code: 'IMG',   label: 'Static image', family: 'IMG-AD',  visual: 'K', verbal: 'L' },
] as const
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number]['code']

export type Assignment = {
  id: string
  title: string
  type: AssignmentType
  /* The angle this sits under, as a name. Kept alongside the hook codes
     below: the codes say which hooks to build from, this says what the ad is
     about, and the boards group on it. */
  angle: string
  /** Which firm the cut is for. */
  firm?: AssignmentFirm
  /** Production style — BR | HYB | BNR | AIUGC | ANM | IMG. */
  format?: CreativeFormat
  /** Visual hook code, e.g. A3. Always from `format`'s family. */
  visualCode?: string
  /** Verbal hook code, e.g. B13. Always from `format`'s family. */
  verbalCode?: string
  /** The batch this belongs to, as it appears in the ad name. */
  batch?: string
  /* 1 to 5 stars, 5 being the most urgent. Cards sort on this first, so the
     top of every column is what matters most — the board stops being a
     queue in creation order and starts being a queue in importance order. */
  priority?: number
  /* The ad this was built from. Not asked for on the new-assignment form any
     more — it is set automatically by the Double Down and Remake buttons,
     which already know which creative they came from, and it is what
     pushToLaunch reads to bump the naming convention. */
  sourceCreativeId?: string
  /** The reference creative to build against, uploaded rather than linked. */
  benchmarkUrl?: string
  benchmarkName?: string
  /* The script the cut should use, handed over with the brief. Often just
     "same as the benchmark", which is still worth saying explicitly. */
  script?: string
  notes: string
  status: AssignmentStatus
  order: number
  createdAt: string
  comments: Comment[]
  attachments: Attachment[]
}

export const DISCLAIMERS = ['General', 'AI', 'LHP', 'JM'] as const
export type Disclaimer = (typeof DISCLAIMERS)[number]

/* A production task carries the same brief fields an assignment does — it
   ends up as an ad with the same name, so it needs the same pieces:

     1105 | B000123 | LHP | BNR | G1 | H4
      date   batch   firm  format vis verb

   The only difference is who does it and what kind of work it is. */
export type KTask = {
  id: string
  type: KTaskType
  title: string
  sourceCreativeId?: string
  disclaimer?: Disclaimer
  notes: string
  status: KTaskStatus
  order: number
  createdAt: string
  doneAt?: string
  comments: Comment[]
  firm?: AssignmentFirm
  format?: CreativeFormat
  visualCode?: string
  verbalCode?: string
  batch?: string
  priority?: number
  script?: string
  benchmarkUrl?: string
  benchmarkName?: string
  attachments?: Attachment[]
}

export type LaunchTags = { resize: boolean; disclaimer: Disclaimer | null; asIs: boolean }

export type LaunchTask = {
  id: string
  assignmentId?: string
  sourceCreativeId?: string
  name: string
  angle: string
  campaign: string
  convention: string
  tags: LaunchTags
  date: string
  dailyBudget: number
  status: 'pending' | 'done' | 'cancelled'
  doneAt?: string
  isNewTestBatch: boolean
  requestedBy: 'assignment' | 'manual' | 'relaunch'
}

export type Notification = {
  id: string
  to: Role
  text: string
  href: string
  at: string
  read: boolean
}
