// The agent roster. Adding a worker to the floor = adding an entry here:
// `seat` decides which worker in the office art is theirs, `status` drives the
// badge, and an entry without `seat` is treated as not-yet-hired.

export type AgentStatus = 'live' | 'building' | 'planned'

/** Seats correspond to the three workers in the office art that carry a
 *  speech bubble. Coordinates live in Office.tsx. */
export type SeatId = 'A' | 'B' | 'C'

export interface Agent {
  id: string
  name: string
  role: string
  /** One line for the roster list. */
  blurb: string
  /** Full description for the detail panel. */
  description: string
  /** What it actually does, in order. */
  duties: string[]
  /** Where it runs. */
  runsOn: string
  /** Page this agent's work shows up on. */
  href: string | null
  hrefLabel: string | null
  status: AgentStatus
  activities?: string[]
  /** Accent colour for the panel and the seat highlight. */
  color: string
  /** Which seat in the office art this agent occupies. Omit if unhired. */
  seat?: SeatId
}

export const AGENTS: Agent[] = [
  {
    id: 'sendcase',
    name: 'Send Case Agent',
    role: 'Intake filler',
    blurb: 'Fills intake fields on signed cases, then pings you for review.',
    description:
      'When a case reaches Pending Send, this agent reads everything on file — call ' +
      'transcripts, the text thread, notes, accident photos — and fills in the client’s ' +
      'intake fields so you review a finished intake instead of copy-pasting from ' +
      'recordings. It never sends anything to the firm.',
    duties: [
      'Picks up any case tagged -ps',
      'Reads call transcripts and SMS history first (free — our own database)',
      'Only reaches into GHL when fields are still blank',
      'Writes blank fields only — never overwrites your values',
      'Flags anything ambiguous instead of guessing',
      'Updates /sendcase and pings Slack when ready',
    ],
    runsOn: 'Railway · claude-opus-5',
    href: '/sendcase',
    hrefLabel: 'Open /sendcase',
    status: 'building',
    color: '#C17A4A',
    seat: 'A',
    /** Cycled through in this agent's speech bubble. */
    activities: [
      'Reading transcripts…',
      'Checking the texts…',
      'Filling intake fields…',
      'Ready for review ✓',
    ],
  },
]

// Seats in the art that no agent has been assigned to yet.
export const ALL_SEATS: SeatId[] = ['A', 'B', 'C']

export const STATUS_LABEL: Record<AgentStatus, string> = {
  live: 'On shift',
  building: 'In training',
  planned: 'Not hired',
}
