import { getAccessToken, SPREADSHEET_ID, sheetsConfigured } from './google-sheets'

/* ═══════════════════════════════════════════════════════════════════════════
   The case management sheet.

   LHP and CaseBridge both work out of one Google Sheet — a tab per invoice,
   a row per signed case — and that sheet, not the CRM, is what the two sides
   bill against. It is therefore the source of truth for the financial center:
   how many cases an invoice carries, which of them were handed back as
   replacements, and which have closed.

   The database still holds everything the sheet cannot: which rep closed the
   case, a minor's reduced case value, the ad that produced the lead. Sheet
   rows are matched back onto those records by phone, then by name, so the
   money keeps the detail while the counts follow the sheet.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Firms whose invoices are kept in a sheet. Everything else stays CRM-driven. */
export const SHEET_FIRMS: Record<string, { spreadsheetId: string; label: string }> = {
  lhp: { spreadsheetId: SPREADSHEET_ID, label: 'LHP Case Management' },
}

export type SheetCase = {
  invoiceCode: string
  name: string
  phone: string | null
  email: string | null
  dol: string | null
  /** Sign-up date, ISO. Null when the row has no usable date. */
  signedAt: string | null
  /** 'e_signed' | 'replacement' | 'disqualified' */
  status: 'e_signed' | 'replacement' | 'disqualified'
  /** The sheet's own wording, for display. */
  statusLabel: string
  closed: boolean
  /** Closing date when the sheet records one, e.g. CLOSED(06/22). */
  closedAt: string | null
  /** Days until the replacement window ends, when the sheet is counting down. */
  daysLeft: number | null
  lhpNote: string | null
  caseBridgeNote: string | null
  /** Row number in its tab, so a mismatch can be pointed at. */
  row: number
}

export type CaseSheet = {
  title: string
  spreadsheetId: string
  url: string
  tabs: string[]
  cases: SheetCase[]
  fetchedAt: string
}

/** Digits only, last ten — the sheet writes phones every way a person can. */
export function phoneKey(v: string | null | undefined): string | null {
  const digits = String(v || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.slice(-10)
}

export function nameKey(v: string | null | undefined): string | null {
  const k = String(v || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return k.length < 3 ? null : k
}

/** Invoice codes are typed by hand in both places: "INV - 7" is "INV-7". */
export function invoiceKey(v: string | null | undefined): string {
  return String(v || '').toUpperCase().replace(/\s+/g, '').trim()
}

/** M/D/YYYY (or M/D/YY) as the sheet writes it → ISO. */
function isoFromSheetDate(raw: string | null | undefined, fallbackYear?: number): string | null {
  const v = String(raw || '').trim()
  if (!v) return null
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
  if (!m) return null
  const month = Number(m[1]), day = Number(m[2])
  let year = m[3] ? Number(m[3]) : (fallbackYear ?? new Date().getFullYear())
  if (year < 100) year += 2000
  if (!month || !day || month > 12 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function statusOf(raw: string): { status: SheetCase['status']; label: string } {
  const v = raw.trim()
  const low = v.toLowerCase()
  if (low.startsWith('replace')) return { status: 'replacement', label: v || 'Replacement' }
  if (low.startsWith('disqual') || low.startsWith('dq')) return { status: 'disqualified', label: v || 'Disqualified' }
  // A blank status is a freshly signed case the sheet has not annotated yet.
  return { status: 'e_signed', label: v || 'E-Signed' }
}

/** "CLOSED(06/22)", "CLOSED", "19", "" — the one column carries three meanings. */
function closureOf(raw: string, signedAt: string | null) {
  const v = String(raw || '').trim()
  if (!v) return { closed: false, closedAt: null, daysLeft: null }
  if (/closed/i.test(v)) {
    const m = v.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/)
    const year = signedAt ? Number(signedAt.slice(0, 4)) : undefined
    return { closed: true, closedAt: m ? isoFromSheetDate(m[0], year) : null, daysLeft: null }
  }
  const n = Number(v)
  return { closed: false, closedAt: null, daysLeft: Number.isFinite(n) ? n : null }
}

async function sheetsApi(path: string, token: string) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    // The sheet is edited by hand through the day; minutes-stale is fine and
    // keeps a dashboard refresh from costing a round trip per tab.
    next: { revalidate: 300 },
  })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message || `Sheets HTTP ${res.status}`)
  return json
}

/** Every case row in the firm's sheet, tab by tab. Throws if the sheet cannot be read. */
export async function loadCaseSheet(firmSlug: string): Promise<CaseSheet | null> {
  const config = SHEET_FIRMS[firmSlug]
  if (!config?.spreadsheetId) return null
  if (!sheetsConfigured) throw new Error('Google Sheets credentials are not configured.')

  const token = await getAccessToken()
  const id = config.spreadsheetId

  const meta = await sheetsApi(`${id}?fields=properties.title,sheets.properties.title`, token)
  const tabs: string[] = (meta.sheets || [])
    .map((s: any) => s.properties?.title)
    .filter((t: string) => /^inv/i.test(t || ''))

  const ranges = tabs.map(t => `ranges=${encodeURIComponent(`${t}!A2:I2000`)}`).join('&')
  const batch = tabs.length ? await sheetsApi(`${id}/values:batchGet?${ranges}`, token) : { valueRanges: [] }

  const cases: SheetCase[] = []
  ;(batch.valueRanges || []).forEach((range: any, i: number) => {
    const tab = tabs[i]
    ;(range.values || []).forEach((row: any[], idx: number) => {
      const name = String(row[0] || '').trim()
      if (!name) return
      const signedAt = isoFromSheetDate(row[4])
      const { status, label } = statusOf(String(row[6] || ''))
      const { closed, closedAt, daysLeft } = closureOf(String(row[5] || ''), signedAt)
      cases.push({
        invoiceCode: invoiceKey(tab),
        name,
        phone: String(row[1] || '').trim() || null,
        email: String(row[2] || '').trim() || null,
        dol: isoFromSheetDate(row[3]),
        signedAt,
        status,
        statusLabel: label,
        closed,
        closedAt,
        daysLeft,
        lhpNote: String(row[7] || '').trim() || null,
        caseBridgeNote: String(row[8] || '').trim() || null,
        row: idx + 2,
      })
    })
  })

  return {
    title: meta.properties?.title || config.label,
    spreadsheetId: id,
    url: `https://docs.google.com/spreadsheets/d/${id}`,
    tabs,
    cases,
    fetchedAt: new Date().toISOString(),
  }
}
