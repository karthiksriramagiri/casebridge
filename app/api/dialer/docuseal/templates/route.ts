import { NextResponse } from 'next/server'

const DOCUSEAL_API = 'https://api.docuseal.com'
const DOCUSEAL_TOKEN = 'zvu1bLa36Qt21BMw7e3RS7ELUxEmQGTVmii5TCcSzJb'

// GET /api/dialer/docuseal/templates
// Returns all DocuSeal templates available for sending
export async function GET() {
  try {
    const res = await fetch(`${DOCUSEAL_API}/templates`, {
      headers: { 'X-Auth-Token': DOCUSEAL_TOKEN },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `DocuSeal ${res.status}`, detail: text }, { status: 502 })
    }

    const data = await res.json()

    // DocuSeal returns { data: [...] } or an array directly
    const templates = (Array.isArray(data) ? data : data.data ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      created_at: t.created_at,
      updated_at: t.updated_at,
      fields: t.fields ?? [],
    }))

    return NextResponse.json({ templates })
  } catch (err) {
    console.error('[docuseal] templates fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 502 })
  }
}
