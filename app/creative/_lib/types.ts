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
  /** Meta's ad set id. Absent on rows from before it was carried. */
  adsetId?: string
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
  /* Signed cases over the ad's whole life. Kept for the kill/watch rules,
     which judge an ad on every case it has ever produced — NOT for display.
     Everything on screen shows the range, like spend and leads beside it.
     See metrics.totalsFor. */
  acquisitions: number
  /** Signed cases inside the range, dated by the day they signed. On screen. */
  rangeAcquisitions: number
  /* Spend over the ad's whole life, carried alongside the range spend so
     the lifetime CPA the rules read stays lifetime ÷ lifetime even after
     rows are summed into an ad set. Without it, summing a set recomputed
     CPA from the RANGE spend and the lifetime case count — a $332 day over
     one case read as a $332 CPA. */
  lifeSpend: number
  cpl: number | null
  /** Lifetime spend ÷ lifetime cases. For the rules, like `acquisitions`. */
  cpa: number | null
  /** Range spend ÷ range cases. The one that is shown. */
  rangeCpa: number | null
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

/* Why an ad came off, which is not the same question as whether it came off.

   A killed ad did not work. A fatigued ad worked and wore out — same action
   in Ads Manager, opposite meaning afterwards: one is a dead end, the other
   is a winner to pull back when the audience has had a rest. Recording them
   the same way is what made the archive a single undifferentiated list. */
export type KillKind = 'kill' | 'fatigue'

export type KillItem = {
  id: string
  creativeId: string
  addedAt: string
  reason: string
  status: 'pending' | 'done'
  doneAt?: string
  /** Absent on rows written before fatigue was tracked; those read as kills. */
  kind?: KillKind
  /* When the ad was taken off the Relaunch / Fatigue list.

     Hidden, not deleted. The archive is built out of these rows, so removing
     one used to mean deleting the kill — which tidied the page and took the
     record with it: the ad vanished from the day it was killed on and out of
     the killed history. This hides the archive row and leaves both intact. */
  archiveHiddenAt?: string
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

/* A relaunch is not creative work.

   Nothing is made for one — an ad that already exists goes back up, with
   its name stepped. It still needs a card so the launch list and the ad
   meeting can show it, but it has no place on the Creative Team board,
   where every other card is something Faisal has to build.

   Kept out of CREATIVE_TYPES so it cannot be picked on the new-assignment
   form; it is only ever set by the Relaunch button. */
export const RELAUNCH_TYPE = 'Relaunch'

export type AssignmentType = (typeof CREATIVE_TYPES)[number] | typeof RELAUNCH_TYPE

/** Cards the Creative Team board shows — everything somebody has to make. */
export const isCreativeWork = (a: { type: AssignmentType }) => a.type !== RELAUNCH_TYPE

/* Who a brief is for.

   Faisal builds the cuts; Jason builds the images himself. An image double
   down is therefore his own work, not a brief to send out — it was landing
   on Faisal's board, where it sat as something he could not action.

   Derived rather than stored: the rule is the brief's own type and format,
   both of which are already on the card, so there is nothing to keep in
   sync and nothing that can be assigned one way and saved the other. Every
   other double down, and every other kind of brief, still goes to Faisal. */
export const isImageDoubleDown = (a: { type: AssignmentType; format?: CreativeFormat }) =>
  a.type === 'Double Down' && a.format === 'IMG'

/* Whose desk a card lands on.

   A relaunch is Jason's. Nothing is made — the ad already exists and is
   going back up — so there is no brief for Faisal to work, and the only
   hands it passes through are the ones that launch it. It used to fall
   through to 'creative' by default, which is why it had to be filtered off
   the assignments page wholesale rather than simply shown on the right
   tab.

   An explicit `director` overrides all of it: the default is about what a
   card usually is, and a handover is about this one. */
export const assigneeOf = (a: { type: AssignmentType; format?: CreativeFormat; director?: Role }): Role =>
  a.director ?? (a.type === RELAUNCH_TYPE || isImageDoubleDown(a) ? 'admin' : 'creative')

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
/* The standing requests, and the one escape hatch.

   A short fixed list keeps the common instructions identical on every brief
   — "Add LHP Disclaimer" is one thing, not four spellings of it — and
   "Other" exists because no fixed list survives contact with a real ask. */
/* The frame the cut is delivered in. 9x16 is the default because almost
   everything runs in feed and reels. */
export const AD_SIZES = ['9x16', '4x5', '1x1', '16x9'] as const
export type AdSize = (typeof AD_SIZES)[number]

/* The state a launch targets, paired with the firm — "California-LHP" on the
   brief. Only the states the firms are licensed in. */
export const LAUNCH_STATES = ['California', 'Georgia', 'Texas', 'Florida', 'Nationwide'] as const
export type LaunchState = (typeof LAUNCH_STATES)[number]

export const CREATIVE_REQUESTS = [
  'Same as benchmark',
  'Add LHP Disclaimer',
  'Add JM Disclaimer',
  'Add AI Disclaimer',
] as const
export type CreativeRequest = (typeof CREATIVE_REQUESTS)[number]

/** Joined form, so one text column holds the choices and the free text. */
export const REQUEST_SEP = ' · '

export function parseRequests(value: string | undefined): { picked: string[]; other: string } {
  if (!value?.trim()) return { picked: [], other: '' }
  const parts = value.split(REQUEST_SEP).map((p) => p.trim()).filter(Boolean)
  const known = new Set<string>(CREATIVE_REQUESTS)
  return {
    picked: parts.filter((p) => known.has(p)),
    /* Anything not on the list is what somebody typed. Joined back with the
       same separator so a brief written before this list existed survives a
       round trip unchanged. */
    other: parts.filter((p) => !known.has(p)).join(REQUEST_SEP),
  }
}

export const joinRequests = (picked: string[], other: string) =>
  [...picked, other.trim()].filter(Boolean).join(REQUEST_SEP)

export const ASSIGNMENT_FIRMS = ['LHP', 'LHP [SPANISH]', 'JM', 'JM [SPANISH]'] as const
export type AssignmentFirm = (typeof ASSIGNMENT_FIRMS)[number]

/* The code is what goes in the ad name; this is what a person is called by.
   The launch list groups on firms and is read down a page rather than
   scanned across a row, so it uses the long form. */
export const ASSIGNMENT_FIRM_LABEL: Record<string, string> = {
  'LHP': 'Larry H. Parker',
  'LHP [SPANISH]': 'Larry H. Parker [SPANISH]',
  'JM': 'Jacoby & Meyers',
  'JM [SPANISH]': 'Jacoby & Meyers [SPANISH]',
}

/** The firm as a person would say it; falls back to the code. */
export const firmLabel = (code: string | undefined | null) =>
  (code && ASSIGNMENT_FIRM_LABEL[code]) || code || 'No firm set'

/* Two spellings of the same firm exist in this app and both are load-bearing.

   A live Meta ad carries the code parsed out of its name — LHP, LHP_SP, JM,
   JM_SP — because that is literally the segment in the ad. An assignment
   carries the one a person picked on a form — 'LHP', 'LHP [SPANISH]'. Any
   page that puts live ads next to planned ones has to put both on the same
   footing first, or the Spanish boards silently split in two. */
export const FIRM_KEYS = ['LHP', 'LHP_SP', 'JM', 'JM_SP'] as const
export type FirmKey = (typeof FIRM_KEYS)[number]

const TO_KEY: Record<string, FirmKey> = {
  LHP: 'LHP',
  LHP_SP: 'LHP_SP',
  'LHP [SPANISH]': 'LHP_SP',
  JM: 'JM',
  JM_SP: 'JM_SP',
  'JM [SPANISH]': 'JM_SP',
}

/** Either spelling → the one key both sides agree on. */
export const firmKey = (code: string | undefined | null): FirmKey | null =>
  code ? TO_KEY[code] ?? null : null

export const FIRM_KEY_LABEL: Record<FirmKey, string> = {
  LHP: 'Larry H. Parker',
  LHP_SP: 'Larry H. Parker [SPANISH]',
  JM: 'Jacoby & Meyers',
  JM_SP: 'Jacoby & Meyers [SPANISH]',
}

/* ═══════════════════════════════════════════════════════════════════════════
   Lanes — a firm inside one ad account

   Jacoby & Meyers now runs in both Meta accounts: Accident Support Desk, the
   original one, and Collision Support Desk, its own. The boards in this
   center are worked one account at a time — you sit inside an account in Ads
   Manager and do its ads — so a single "Jacoby & Meyers" block is no longer a
   list anybody can work. It mixes two accounts, and the only way to tell
   which row belongs to which is to read each row's account.

   So the boards group on a lane rather than on a firm: the firm, plus the
   account when that firm runs in more than one. A lane is written to the
   screen as the firm with the account in brackets — Jacoby & Meyers (ASD) and
   Jacoby & Meyers (CSD) — and the two read as two separate lists.

   A lane is a plain string, and a firm that runs in one account IS its firm
   code unchanged. That is deliberate: every board that already grouped on a
   firm code keeps working on Larry H. Parker without a special case, and
   nothing stored has to be migrated.
   ═══════════════════════════════════════════════════════════════════════════ */

/* The account as it is written in brackets. Short, because it is appended to
   a firm name that is already long, and these are the initials the team says
   out loud. Keyed on the account key every creative row carries. */
export const ACCOUNT_TAG: Record<string, string> = {
  asd: 'ASD',
  jm: 'CSD',
}

/** Accounts in the order the boards read them — the original account first. */
export const ACCOUNT_ORDER = ['asd', 'jm'] as const

/** The account as a person says it, for a tooltip or a label with room. */
export const ACCOUNT_NAME: Record<string, string> = {
  asd: 'Accident Support Desk',
  jm: 'Collision Support Desk',
}

/* Which firms are cut per account. Only the firms that actually run in more
   than one: splitting Larry H. Parker would be two headings with one of them
   always empty. Add a firm here the day its ads appear in a second account. */
export const SPLIT_FIRMS: readonly FirmKey[] = ['JM', 'JM_SP']

/* The account a split firm's work belonged to before the split.

   Jacoby & Meyers ran in one account — its own, which the center shows under
   the brand its ads run as, Collision Support Desk — until its ads started
   appearing in Accident Support Desk as well. Every brief raised before that
   has no account recorded on it, and all of them were for that one account.

   Reading a blank as "unknown" would file all of them under a third heading
   that stands for nothing, so a blank resolves to the firm's own account
   instead. A firm absent from this map has no home account, and a blank
   stays blank. */
export const FIRM_HOME_ACCOUNT: Partial<Record<FirmKey, string>> = {
  JM: 'jm',
  JM_SP: 'jm',
}

/* Separator between the firm and the account inside a lane. Not a character
   that appears in a firm code or in an account key, so the two halves can
   always be taken back apart. */
const LANE_SEP = '@'

/** Whether this firm's boards are cut per ad account. */
export const isSplitFirm = (code: string | undefined | null) => {
  const k = firmKey(code)
  return !!k && SPLIT_FIRMS.includes(k)
}

/* The grouping key for a board lane.

   Either spelling of the firm goes in and the canonical FirmKey comes out, so
   a live ad (JM_SP) and the brief that produced it (JM [SPANISH]) land on the
   same lane instead of in two blocks — the same normalisation firmKey has
   always done, with the account added.

   A firm that runs in one account is its FirmKey unchanged, and a firm this
   app has no key for — FL, EBL, BL, or an unattributed '—' — is passed
   through as it came so it still groups as itself. */
export function laneOf(firm: string | undefined | null, account?: string | undefined | null): string {
  const k = firmKey(firm)
  if (!k) return firm ?? ''
  if (!SPLIT_FIRMS.includes(k)) return k
  const acct = account || FIRM_HOME_ACCOUNT[k]
  return acct ? `${k}${LANE_SEP}${acct}` : k
}

/** The firm half of a lane — a FirmKey, for every firm that has one. */
export const laneFirm = (lane: string) => lane.split(LANE_SEP)[0]

/** The account half, or undefined on a lane that is not split. */
export const laneAccount = (lane: string): string | undefined => lane.split(LANE_SEP)[1]

/** The firm as a person says it, from either spelling. Falls back to the code
    so FL, EBL and BL — which have no long name — still read as themselves. */
export function firmText(code: string | undefined | null): string {
  const k = firmKey(code)
  return k ? FIRM_KEY_LABEL[k] : (code || '—')
}

/** The lane as a heading: the firm, with the account in brackets when split. */
export function laneLabel(lane: string): string {
  const acct = laneAccount(lane)
  const tag = acct ? ACCOUNT_TAG[acct] ?? acct.toUpperCase() : ''
  return tag ? `${firmText(laneFirm(lane))} (${tag})` : firmText(laneFirm(lane))
}

/* Reading order. Firms in the canonical order so a firm and its Spanish board
   stay adjacent, and inside a firm the accounts in ACCOUNT_ORDER — so the two
   Jacoby lists always read ASD then CSD and the eye learns where to look.
   Anything unattributed sorts last. */
export function laneRank(lane: string): number {
  const k = firmKey(laneFirm(lane))
  const firm = k ? FIRM_KEYS.indexOf(k) : FIRM_KEYS.length
  const acct = laneAccount(lane)
  const i = acct ? ACCOUNT_ORDER.indexOf(acct as (typeof ACCOUNT_ORDER)[number]) : -1
  return firm * 10 + (i === -1 ? 0 : i)
}

/* Every lane the boards lay out, in reading order — four firms, six lanes.
   Used by the pages that show a block per lane whether or not it has anything
   in it, and by the forms that ask which lane a brief is for. */
export const LANE_KEYS: readonly string[] = FIRM_KEYS.flatMap((f) =>
  SPLIT_FIRMS.includes(f) ? ACCOUNT_ORDER.map((a) => laneOf(f, a)) : [f],
)

/* A FirmKey back to the spelling the assignment board stores.

   The board's own fields carry 'LHP [SPANISH]' while an ad name carries
   LHP_SP, and the two have to meet somewhere or the Spanish lists split in
   two. A lane normalises to the key; this is the way back out, for the forms
   that write a brief. */
export const FIRM_KEY_SPELLING: Record<FirmKey, AssignmentFirm> = {
  LHP: 'LHP',
  LHP_SP: 'LHP [SPANISH]',
  JM: 'JM',
  JM_SP: 'JM [SPANISH]',
}

/** The firm half of a lane, spelled the way a brief stores it. */
export function laneAssignmentFirm(lane: string): AssignmentFirm | undefined {
  const k = firmKey(laneFirm(lane))
  return k ? FIRM_KEY_SPELLING[k] : undefined
}

/* A lane as the firm dropdowns show it: the short code a brief carries, with
   the account in brackets. Those selects have always shown the code rather
   than the long name, because the code is what gets typed into Ads Manager. */
export function laneCode(lane: string): string {
  const firm = laneAssignmentFirm(lane) ?? laneFirm(lane)
  const acct = laneAccount(lane)
  const tag = acct ? ACCOUNT_TAG[acct] ?? acct.toUpperCase() : ''
  return tag ? `${firm} (${tag})` : firm
}

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
  /* Which Meta ad account it launches into — 'asd' | 'jm'. Only meaningful
     for a firm that runs in more than one; see SPLIT_FIRMS. It is not part of
     the ad name, which is why it is its own field rather than something read
     back out of `firm`: the name carries JM either way, and the account is
     which of the two JM boards the brief belongs on. Absent on every brief
     raised before Jacoby & Meyers had a second account. */
  account?: string
  /** Production style — BR | HYB | BNR | AIUGC | ANM | IMG. */
  format?: CreativeFormat
  /** Visual hook code, e.g. A3. Always from `format`'s family. */
  visualCode?: string
  /** Verbal hook code, e.g. B13. Always from `format`'s family. */
  verbalCode?: string
  /** The batch this belongs to, as it appears in the ad name. */
  batch?: string
  /* The two names this brief produces, generated from the fields above.

     The ad set is copied verbatim by a double down — it runs in the same ad
     set, so a new name would create a second one — while the creative name
     steps a version. Stored rather than re-derived at launch, which is where
     a cut ends up in an ad set that differs by a segment. */
  adsetName?: string
  creativeName?: string
  /* Whose brief this is, when somebody has said so explicitly.

     Normally the type decides: a relaunch and an image double down are
     Jason's, everything else is Faisal's. That is a sensible default and a
     poor rule — work gets handed over, and there was no way to say so. Set
     here, it wins; left unset, the type still decides. */
  director?: Role

  /** The offer segment both names share — OG | RIP. */
  offer?: string
  /** Campaign type — INV | VAR. */
  campaignType?: string
  /* The Slack thread this brief's messages hang under, per channel —
     { revise: '1794339000.123456' }. Written the first time the center
     posts about the card and read by every message after it, so a brief is
     one conversation in Slack rather than six loose messages. */
  slackThreads?: Record<string, string>
  /* 1 to 5 stars, 5 being the most urgent. Cards sort on this first, so the
     top of every column is what matters most — the board stops being a
     queue in creation order and starts being a queue in importance order. */
  priority?: number
  /* The day this is queued to go live. Absent while it is still in the ready
     pool — a creative can be finished without anyone having decided which
     day it launches, and those are two different states. */
  launchDate?: string
  /* The ad this was built from. Not asked for on the new-assignment form any
     more — it is set automatically by the Double Down and Remake buttons,
     which already know which creative they came from, and it is what
     pushToLaunch reads to bump the naming convention. */
  sourceCreativeId?: string
  /** The reference creative to build against, uploaded rather than linked. */
  benchmarkUrl?: string
  benchmarkName?: string
  /* What is being asked for, handed over with the brief.

     Stored as one string — the chosen requests joined, with anything typed
     under "Other" on the end. It was a free-text script box, and the same
     few instructions were retyped into it every day with small differences
     that made them hard to read at a glance. The column is unchanged, so
     briefs written before this still read correctly as a single Other. */
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
