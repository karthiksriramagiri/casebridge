import { NextRequest, NextResponse } from 'next/server'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const DOCUSEAL_API = 'https://api.docuseal.com'
const DOCUSEAL_TOKEN = 'zvu1bLa36Qt21BMw7e3RS7ELUxEmQGTVmii5TCcSzJb'

// Template IDs per firm
const TEMPLATE_IDS: Record<string, number> = {
  lhp:   3788644, // Larry H. Parker Contingency Agreement
  fears: 4119907, // Fears Dudley Contingency Agreement
}

function ghlHeaders() {
  const key = (process.env.GHL_API_KEY ?? '').trim()
  return {
    Authorization: `Bearer ${key}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

// POST /api/dialer/docuseal/send
// Creates a DocuSeal submission directly via their API, then tags the GHL contact
export async function POST(req: NextRequest) {
  const {
    contactId,
    fullName,
    phone,
    email,
    dateOfAccident,
    dateOfBirth,
    cityOfAccident,
    firm,
    existingTags,
    passengers,
    skipTag,
  } = await req.json()

  if (!contactId || !fullName || !firm) {
    return NextResponse.json({ error: 'contactId, fullName, and firm are required' }, { status: 400 })
  }

  const firmKey = firm.toLowerCase().includes('fear') ? 'fears'
    : firm.toLowerCase().includes('parker') || firm.toLowerCase() === 'lhp' ? 'lhp'
    : firm.toLowerCase()

  const templateId = TEMPLATE_IDS[firmKey]
  if (!templateId) {
    return NextResponse.json({ error: `No DocuSeal template for firm: ${firm}` }, { status: 400 })
  }

  // Format YYYY-MM-DD → MM/DD/YY
  function fmtDate(d: string): string {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${m}/${day}/${y}`
  }

  // 1. Create DocuSeal submission via API
  const now = new Date()
  const todayFmt = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`
  const submissionBody = {
    template_id: templateId,
    send_email: true,
    send_sms: !!phone,
    submitters: [
      {
        role: 'First Party',
        email: email || undefined,
        phone: phone || undefined,
        name: fullName,
        values: {
          'Full Name':        fullName,
          'Date of Accident': fmtDate(dateOfAccident),
          'Date of Birth':    fmtDate(dateOfBirth),
          'City of Accident': cityOfAccident || '',
          "Today's Date":     todayFmt,
        },
      },
    ],
  }

  console.log('[docuseal] Creating submission', { templateId, firmKey, fullName, email, phone })

  let submissionId: number | null = null
  try {
    const dsRes = await fetch(`${DOCUSEAL_API}/submissions`, {
      method: 'POST',
      headers: {
        'X-Auth-Token': DOCUSEAL_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(submissionBody),
    })

    const dsData = await dsRes.json()

    if (!dsRes.ok) {
      console.error('[docuseal] API error', dsRes.status, dsData)
      return NextResponse.json({ error: 'DocuSeal API failed', detail: dsData }, { status: 502 })
    }

    // Response is an array of submitters
    submissionId = dsData?.[0]?.submission_id ?? dsData?.id ?? null
    console.log('[docuseal] Submission created', { submissionId, submitters: dsData })
  } catch (err) {
    console.error('[docuseal] API error', err)
    return NextResponse.json({ error: 'DocuSeal request failed' }, { status: 502 })
  }

  // 2. Create submissions for each passenger
  const passengerIds: number[] = []
  if (passengers?.length) {
    for (const p of passengers) {
      if (!p.name) continue
      const pBody = {
        template_id: templateId,
        send_email: false,
        send_sms: !!p.phone && p.phone !== '+1',
        submitters: [
          {
            role: 'First Party',
            phone: p.phone && p.phone !== '+1' ? p.phone : undefined,
            name: p.name,
            values: {
              'Full Name':        p.name,
              'Date of Accident': fmtDate(p.dateOfAccident || dateOfAccident),
              'Date of Birth':    fmtDate(p.dob || ''),
              'City of Accident': p.cityOfAccident || cityOfAccident || '',
              "Today's Date":     todayFmt,
            },
          },
        ],
      }
      try {
        const pRes = await fetch(`${DOCUSEAL_API}/submissions`, {
          method: 'POST',
          headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify(pBody),
        })
        const pData = await pRes.json()
        if (pRes.ok) {
          const pid = pData?.[0]?.submission_id ?? pData?.id ?? null
          if (pid) passengerIds.push(pid)
          console.log('[docuseal] Passenger submission created', { name: p.name, submissionId: pid })
        } else {
          console.error('[docuseal] Passenger submission failed', p.name, pRes.status, pData)
        }
      } catch (err) {
        console.error('[docuseal] Passenger submission error', p.name, err)
      }
    }
  }

  // 3. Tag the GHL contact with lhp - d or fl - d (skip for passenger-only submissions)
  let tag: string | null = null
  let tags: string[] = existingTags ?? []
  if (!skipTag) {
    tag = firmKey === 'fears' ? 'fl - d' : 'lhp - d'
    tags = Array.from(new Set([...(existingTags ?? []), tag]))

    try {
      const tagRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
        method: 'PUT',
        headers: ghlHeaders(),
        body: JSON.stringify({ tags }),
      })

      if (!tagRes.ok) {
        const text = await tagRes.text()
        console.error('[docuseal] GHL tag error', tagRes.status, text)
      }
    } catch (err) {
      console.error('[docuseal] GHL tag error', err)
    }
  }

  return NextResponse.json({ ok: true, submissionId, passengerIds, tag, tags })
}
