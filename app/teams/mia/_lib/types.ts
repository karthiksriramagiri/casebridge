/* ═══════════════════════════════════════════════════════════════════════════
   The MIA board's shapes.

   Four columns, in the order the work moves. The order is the type: a card
   advances left to right, and the one place that order is written down is
   here, so a column cannot be added to the board without the move rules and
   the progress bar learning about it at the same time.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MIA_STATUSES = ['mia', 'reconnected', 'confirmed', 'safe'] as const
export type MiaStatus = (typeof MIA_STATUSES)[number]

export const MIA_COLUMNS: {
  key: MiaStatus
  label: string
  /** What being in this column actually means, for the column header. */
  blurb: string
  tone: 'red' | 'amber' | 'blue' | 'green'
}[] = [
  { key: 'mia',         label: 'MIA',         blurb: 'gone quiet — nobody has reached them', tone: 'red' },
  { key: 'reconnected', label: 'Reconnected', blurb: 'someone got through',                  tone: 'amber' },
  { key: 'confirmed',   label: 'Confirmed',   blurb: 'they confirmed they are still in',     tone: 'blue' },
  { key: 'safe',        label: 'Safe',        blurb: 'paperwork back, the case is secure',   tone: 'green' },
]

export const isMiaStatus = (v: unknown): v is MiaStatus =>
  typeof v === 'string' && (MIA_STATUSES as readonly string[]).includes(v)

export type MiaCase = {
  id: string
  name: string
  phone: string | null
  email: string | null
  firmId: string | null
  firmName: string | null
  leadId: string | null
  status: MiaStatus
  order: number
  ownerId: string | null
  ownerName: string | null
  note: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
  /** When it last changed column — what "stale" is measured from. */
  movedAt: string
}

export type MiaEvent = {
  id: string
  caseId: string
  kind: 'created' | 'moved' | 'claimed' | 'note' | 'edited'
  fromStatus: MiaStatus | null
  toStatus: MiaStatus | null
  detail: string
  actorName: string
  createdAt: string
}

export type MiaViewer = {
  id: string
  name: string
  isAdmin: boolean
}

/* How long a card may sit in one column before it is worth flagging.

   Per column, because the columns mean different things. A case sitting in
   `mia` for three days is the whole problem; a case sitting in `safe` is
   finished and should never be chased. */
export const STALE_AFTER_DAYS: Record<MiaStatus, number | null> = {
  mia: 3,
  reconnected: 2,
  confirmed: 5,
  safe: null,
}
