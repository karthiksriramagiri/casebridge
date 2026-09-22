// Intake field schema — the GHL custom fields the agent fills.
// Generated from app/dialer/_lib/ghl-fields.ts in the CaseBridge repo;
// keep the two in sync if field IDs change in GHL.

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

export const FIELD_LABELS: string[] = Object.values(INTAKE_FIELDS).map((f) => f.label)

export const LABEL_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(INTAKE_FIELDS).map(([id, f]) => [f.label, id])
)

// Rendered into the system prompt so the agent knows exactly what to look for.
export function fieldGuide(): string {
  return Object.entries(INTAKE_FIELDS)
    .map(([, f]) => `- ${f.label}: ${f.hint}`)
    .join('\n')
}
