import jwt from 'jsonwebtoken'

const CLIENT_EMAIL = (process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '').trim()
// Key stored base64-encoded; decode then convert literal \n to real newlines
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY_B64
  ? Buffer.from(process.env.GOOGLE_SHEETS_PRIVATE_KEY_B64, 'base64').toString('utf-8').replace(/\\n/g, '\n')
  : (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value

  const payload = {
    iss: CLIENT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
  }

  const assertion = jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256' })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google auth failed')
  }

  cachedToken = { value: data.access_token, expiresAt: now + 3600 }
  return data.access_token
}

export async function appendSignedCase(params: {
  fullName: string
  phone: string | null
  email: string | null
  dol: string | null
  signUpDate: string   // YYYY-MM-DD
  sheetTab: string     // e.g. "INV-1"
}) {
  if (!CLIENT_EMAIL || !PRIVATE_KEY || !SPREADSHEET_ID) {
    console.warn('[google-sheets] env vars not set — skipping sheet write')
    return
  }

  const token = await getAccessToken()

  // Find next empty row to build the Days Until Closed formula
  const rangeToAppend = `${params.sheetTab}!A:H`

  // Row values: A=Full Name, B=Phone, C=Email, D=DOL, E=Sign Up Date, F=formula, G=Status, H=Notes
  const values = [
    params.fullName,
    (params.phone ?? '').replace(/^\+1/, ''),
    params.email ?? '',
    params.dol ?? '',
    params.signUpDate,
    // Days Until Closed formula — will be calculated relative to column E in the appended row
    `=E{ROW}+28-TODAY()`,
    'E-Signed',
    '',
  ]

  // First append to get the row number, then update the formula with correct row ref
  // Use RAW for formula, so we append in two steps: data first, then fix formula
  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(rangeToAppend)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [values] }),
    }
  )

  const appendData = await appendRes.json()
  console.log('[google-sheets] append result:', JSON.stringify(appendData))

  if (!appendRes.ok) {
    throw new Error(appendData.error?.message || 'Google Sheets append failed')
  }

  // Fix the Days Until Closed formula with the actual row number
  const updatedRange = appendData.updates?.updatedRange // e.g. "INV-1!A5:H5"
  if (updatedRange) {
    const rowMatch = updatedRange.match(/:.*?(\d+)$/)
    const rowNum = rowMatch ? rowMatch[1] : null
    if (rowNum) {
      const formulaCell = `${params.sheetTab}!F${rowNum}`
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(formulaCell)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [[`=E${rowNum}+28-TODAY()`]] }),
        }
      )
    }
  }
}
