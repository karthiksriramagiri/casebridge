// Shared GHL custom field config — single source of truth for field IDs.
// Previously duplicated in contacts/[id]/route.ts and ai-summary/generate.ts.

// Key selection, headers and pipeline access live in @/lib/ghl-pipelines so
// every GHL caller shares one cache and one notion of which token to use.
export { GHL_BASE, GHL_LOCATION_ID, ghlHeaders } from '@/lib/ghl-pipelines'

// GHL custom field ID → human label (superset of all intake-relevant fields)
export const CF_LABELS: Record<string, string> = {
  CquRmjr60UaEIjP9DD2F: 'Date of Accident',
  YKk0RFckpkrdvYTVVNkg: 'When Did Accident Happen',
  EwUs6rGuVeanDDP90agm: 'Accident State',
  '91X4LCiQ53bPjS52i0sg': 'City of Accident',
  ANMwrqQQmh1RcTr34HDC: 'Accident Location',
  '4FY0cD8CIVa85yPRFUDI': 'Estimated Time of Accident',
  hCnqQXqDrNKJs05Ddcm6: 'Injury Description',
  wwtqKVAfuc6cCCry1sPg: 'Injury Description (alt)',
  rgjapMT8juA3asip8zNl: 'Injuries Sustained',
  '5VwvlYSs6mUbidJTi8dt': 'Incident Notes',
  '5TGTevlEmHJ74SnDxRYh': 'Has Attorney?',
  u4Lay3oKulSMOwZilE3a: 'Worked With Law Firm?',
  s5WfL5WGmy99OgqaYpU9: 'Current Attorney / Firm',
  YtZUdIItzykXRn1RXCJn: 'Were You At Fault',
  uOv0RRRrEGgGo1eY1lp7: 'Were You At Fault? (alt)',
  '5yRuMLPI3s9YAYKt5xXy': 'Ambulance Involved',
  fakaJ96RTgbuv3lS8cnN: 'Vehicle Damaged?',
  mZRX8UhpoFh3qQxqbtDo: 'Were You Insured?',
  it3evcqCdkzSU0ubO1qn: 'Accepted Insurance Money?',
  NKTAnB2vDMMxs5BsEOJX: 'Vehicle Info',
  nHz4hxklQ5GhDE0KD1Jj: 'Vehicle Damage Description',
  ytrqG1b0D1BVXf0tPtaY: 'License Plate',
  u42ugUuWhr2NI64HW0uI: 'Vehicle Location',
  swvVdZRlyMpVxrO9sLsK: 'Passengers in Vehicle',
  TVyGWg5Ofpd1pUHTcAL2: 'Hospital / Facility',
  pxWLySNlVJrxySNsmUY3: 'Treatment Since Accident',
  hH9PxVS7xbpVqdXClUmU: 'Police Report #',
  zy3E3xzsezWpYfbyGnTW: 'Police Report Completed',
  JjOQB8FzbL3oWKTv87ge: "Client's Auto Insurance",
  KLl22odyp1f3TDs60zGh: "At-Fault Driver's Insurance",
  M9aUntlXM7l892OCoaUW: 'At-Fault Driver Info',
  YO3Pu5k1EK2q1cFFspnz: 'Witnesses / Video',
  dd7SAkCv7ffp1BnOsldH: "Client's Address",
  RA5qCQ7Eh9HKodl508vL: "Driver's License",
  tIy7Mj5kC1TnlyxEku5h: 'Emergency Contact',
  '6OVNq09HPO43c4Kijj5b': 'Parent/Guardian Name',
  SIqbCmbaNJW1HuZNOim4: 'Relationship to Client',
  ZmG154FohYzWRAFRuMnb: 'Reason Not Qualified',
  cRez6XhQX572JOE7rbep: 'Case Manager Appt Time',
  X6tTJYIWHS1PYiKQZxFq: 'PC Call Back Time',
  u4vacrNyMO0BvdrRkkMd: 'Closer',
  Cpr0DHgInsCyzAGfizPB: 'Follow Up Message Sent',
  DTgEC1i5V7T5GiuwPVV7: 'Phone Line Type',
  MN6t73d2QXKnowN5uRAi: 'Phone Carrier',
  mUC78HfvlR4Gcpu77rY2: 'Phone Valid',
  ex7DLJASpIK62235gARn: 'Phone Is Valid',
  uAjdBFB5bzEUJvwJw3bJ: 'Phone Activity Score',
}

// Fields Claude should extract from transcripts/SMS.
// Matches the required intake form fields in the Signed/Sent pipeline.
// "dateOfBirth" is a standard GHL contact field (not custom) — handled separately in intake-fill.
export const INTAKE_FIELDS: Record<string, { label: string; hint: string }> = {
  // Required intake questions
  '5VwvlYSs6mUbidJTi8dt': { label: 'Incident Notes',                hint: 'Detailed narrative of how the accident happened. Include who hit who, road conditions, direction of travel, and any other relevant details the client described.' },
  tIy7Mj5kC1TnlyxEku5h:  { label: 'Emergency Contact',             hint: 'Name and phone number of emergency contact person' },
  CquRmjr60UaEIjP9DD2F:  { label: 'Date of Accident',              hint: 'Date in YYYY-MM-DD format' },
  u4Lay3oKulSMOwZilE3a:  { label: 'Worked With Law Firm?',         hint: '"Yes" or "No"' },
  s5WfL5WGmy99OgqaYpU9:  { label: 'Current Attorney / Firm',       hint: 'Name of attorney or law firm, if any' },
  zy3E3xzsezWpYfbyGnTW:  { label: 'Police Report Completed',       hint: '"Yes" or "No"' },
  hH9PxVS7xbpVqdXClUmU:  { label: 'Police Report #',               hint: 'Police report number and department name' },
  YO3Pu5k1EK2q1cFFspnz:  { label: 'Witnesses / Video',             hint: 'Witness names, contact info, or mention of dash cam / surveillance video' },
  rgjapMT8juA3asip8zNl:  { label: 'Injuries Sustained',            hint: 'List of specific injuries: back pain, neck pain, whiplash, headaches, shoulder pain, etc.' },
  '5yRuMLPI3s9YAYKt5xXy': { label: 'Ambulance Involved',           hint: '"Yes" or "No"' },
  TVyGWg5Ofpd1pUHTcAL2:  { label: 'Hospital / Facility',           hint: 'Name of hospital or medical facility taken to' },
  pxWLySNlVJrxySNsmUY3:  { label: 'Treatment Since Accident',      hint: 'Any medical treatment received since the accident (chiropractor, ER follow-up, physical therapy, etc.)' },
  fakaJ96RTgbuv3lS8cnN:  { label: 'Vehicle Damaged?',              hint: '"Yes" or "No"' },
  mZRX8UhpoFh3qQxqbtDo:  { label: 'Were You Insured?',             hint: '"Yes" or "No"' },
  it3evcqCdkzSU0ubO1qn:  { label: 'Accepted Insurance Money?',     hint: '"Yes" or "No"' },
  KLl22odyp1f3TDs60zGh:  { label: "At-Fault Driver's Insurance",   hint: 'Name of the at-fault driver\'s insurance company' },
  JjOQB8FzbL3oWKTv87ge:  { label: "Client's Auto Insurance",       hint: 'Name of the client\'s own auto insurance company' },
  // Additional fields
  '91X4LCiQ53bPjS52i0sg': { label: 'City of Accident',             hint: 'City where the accident happened' },
  X6tTJYIWHS1PYiKQZxFq:  { label: 'PC Call Back Time',             hint: 'Date and time the client requested a callback, if mentioned' },
  dd7SAkCv7ffp1BnOsldH:  { label: "Client's Address",              hint: 'Client\'s home address' },
  RA5qCQ7Eh9HKodl508vL:  { label: "Driver's License",              hint: 'Client\'s driver license number and state' },
  NKTAnB2vDMMxs5BsEOJX:  { label: 'Vehicle Info',                  hint: 'Year, make, model, and color of client\'s vehicle' },
  ytrqG1b0D1BVXf0tPtaY:  { label: 'License Plate',                 hint: 'Client\'s license plate number' },
  u42ugUuWhr2NI64HW0uI:  { label: 'Vehicle Location',              hint: 'Where the vehicle is now (tow yard name, home, body shop, etc.)' },
  nHz4hxklQ5GhDE0KD1Jj:  { label: 'Vehicle Damage Description',    hint: 'Description of damage to the vehicle (rear-end damage, front bumper, driver side, etc.)' },
  '4FY0cD8CIVa85yPRFUDI': { label: 'Estimated Time of Accident',   hint: 'Time of day the accident occurred (e.g. "3:00 PM", "morning", "around 5pm")' },
  swvVdZRlyMpVxrO9sLsK:  { label: 'Passengers in Vehicle',         hint: 'Number of passengers and their names if mentioned' },
  ANMwrqQQmh1RcTr34HDC:  { label: 'Accident Location',             hint: 'Specific street, intersection, freeway, or landmark where the accident happened' },
  M9aUntlXM7l892OCoaUW:  { label: 'At-Fault Driver Info',          hint: 'Name, description, or any details about the at-fault driver' },
}

// Reverse map: label → field ID
export const CF_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(CF_LABELS).map(([id, label]) => [label, id])
)
