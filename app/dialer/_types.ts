export type RepStatus = 'OFFLINE' | 'READY' | 'ON_CALL' | 'PAUSED' | 'WRAPUP'

export interface QueueLead {
  queueId:          string
  contactId:        string
  name:             string
  phone:            string
  firm:             string
  stageName:        string
  timezone:         string
  isCallback:       boolean
  callbackAt:       string | null
  callbackContext:  string | null
  ownerRepIdentity: string | null
  priority:         number
}
export type CallState = 'idle' | 'ringing' | 'connected' | 'wrapup'

export interface Lead {
  id:           string
  name:         string
  phone:        string
  email:        string
  company:      string
  source:       string
  tags:         string[]
  lastActivity: string
  contactId:    string
}

export interface Disposition {
  id: string
  label: string
  category: 'POSITIVE' | 'NEGATIVE' | 'CALLBACK' | 'DNC'
  color: string
  ghlStageMove: string | null
  requiresReason?: boolean
}

export const DISPOSITIONS: Disposition[] = [
  { id: 'd1', label: 'Qualified',        category: 'POSITIVE',  color: 'bg-green-600',   ghlStageMove: null },
  { id: 'd2', label: 'Not Qualified',    category: 'NEGATIVE',  color: 'bg-red-700',     ghlStageMove: 'Not Qualified', requiresReason: true },
  { id: 'd3', label: 'Callback',         category: 'CALLBACK',  color: 'bg-blue-600',    ghlStageMove: null },
  { id: 'd4', label: 'No Answer',        category: 'NEGATIVE',  color: 'bg-gray-500',    ghlStageMove: null },
  { id: 'd5', label: 'Signed',           category: 'POSITIVE',  color: 'bg-emerald-600', ghlStageMove: null },
  { id: 'd6', label: 'MIA Reconnected',  category: 'POSITIVE',  color: 'bg-teal-600',    ghlStageMove: null },
]
