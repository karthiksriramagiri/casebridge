import { NextRequest, NextResponse } from 'next/server'

const GHL_BASE = 'https://services.leadconnectorhq.com'

function ghlHeaders() {
  const key = (process.env.GHL_API_KEY ?? '').trim()
  return {
    Authorization: `Bearer ${key}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

// Curated map: custom field ID → human label
// Only includes fields relevant for intake reps — skips UTM/ad tracking fields
const CF_LABELS: Record<string, string> = {
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Contact ID required' }, { status: 400 })

  const res = await fetch(`${GHL_BASE}/contacts/${id}`, {
    headers: ghlHeaders(),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[dialer:contact] GHL error', res.status, text)
    return NextResponse.json({ error: 'GHL fetch failed' }, { status: 502 })
  }

  const data = await res.json()
  const c = data.contact ?? data

  // Map custom fields — only include ones with a known label and non-empty value
  const customFields: Array<{ label: string; value: string }> = []
  for (const cf of c.customFields ?? []) {
    const label = CF_LABELS[cf.id]
    const value = cf.value ?? cf.fieldValue
    if (label && value !== null && value !== undefined && value !== '') {
      customFields.push({ label, value: String(value) })
    }
  }

  return NextResponse.json({
    contact: {
      id: c.id,
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      name: c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
      email: c.email ?? '',
      phone: c.phone ?? '',
      country: c.country ?? '',
      timezone: c.timezone ?? '',
      source: c.source ?? '',
      dateAdded: c.dateAdded ?? '',
      tags: c.tags ?? [],
      customFields,
      attributionSource: c.attributionSource?.sessionSource ?? '',
    },
  })
}
