/* The board's columns, in one place so the server can name a status without
   importing the client component that draws it. */

export const STATUSES = [
  { key: 'assigned',         label: 'Assigned',         tone: 'idle'   },
  { key: 'in_progress',      label: 'In progress',      tone: 'info'   },
  { key: 'feedback_process', label: 'Feedback Process', tone: 'warn'   },
  { key: 'feedback_done',    label: 'Feedback Done',    tone: 'idle'   },
  { key: 'ready_to_launch',  label: 'Ready To Launch',  tone: 'accent' },
  { key: 'ad_launched',      label: 'AD Launched',      tone: 'good'   },
  { key: 'winner',           label: '🏆 Winner',        tone: 'gold'   },
] as const

export const STATUS_LABELS: Record<string, string> =
  Object.fromEntries(STATUSES.map(s => [s.key, s.label]))

/* The ad families from the angle taxonomy on /creative/angles. Keeping the
   same six here means a brief can be traced to the angle codes it produced. */
export const AD_TYPES = ['BR', 'HYB', 'UGC', 'BNR', 'ANM', 'IMG']
