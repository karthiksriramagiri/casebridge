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
}

export const DISPOSITIONS: Disposition[] = [
  { id: 'd1',  label: 'Qualified',        category: 'POSITIVE',  color: 'bg-green-600',   ghlStageMove: 'Qualified' },
  { id: 'd2',  label: 'Not Qualified',    category: 'NEGATIVE',  color: 'bg-red-700',     ghlStageMove: 'Not Qualified' },
  { id: 'd3',  label: 'Callback',         category: 'CALLBACK',  color: 'bg-blue-600',    ghlStageMove: null },
  { id: 'd4',  label: 'No Answer',        category: 'NEGATIVE',  color: 'bg-gray-500',    ghlStageMove: null },
  { id: 'd5',  label: 'Voicemail Left',   category: 'NEGATIVE',  color: 'bg-gray-500',    ghlStageMove: null },
  { id: 'd6',  label: 'Not Interested',   category: 'NEGATIVE',  color: 'bg-red-800',     ghlStageMove: 'Not Interested' },
  { id: 'd7',  label: 'Wrong Number',     category: 'NEGATIVE',  color: 'bg-gray-600',    ghlStageMove: null },
  { id: 'd8',  label: 'Do Not Call',      category: 'DNC',       color: 'bg-rose-900',    ghlStageMove: null },
  { id: 'd9',  label: 'Appointment Set',  category: 'POSITIVE',  color: 'bg-emerald-600', ghlStageMove: 'Appointment' },
  { id: 'd10', label: 'Attorney Review',  category: 'POSITIVE',  color: 'bg-violet-600',  ghlStageMove: 'Contract Sent' },
]
