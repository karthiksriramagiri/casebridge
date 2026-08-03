// US area code → IANA timezone
// Used as fallback when GHL contact record has no timezone field.
// Priority: GHL field → area code → firm default (LHP=Pacific, Fears=Central)

const AREA_CODE_TZ: Record<string, string> = {
  // ── Pacific ────────────────────────────────────────────────────────────────
  // California
  '209': 'America/Los_Angeles', '213': 'America/Los_Angeles', '279': 'America/Los_Angeles',
  '310': 'America/Los_Angeles', '323': 'America/Los_Angeles', '408': 'America/Los_Angeles',
  '415': 'America/Los_Angeles', '424': 'America/Los_Angeles', '442': 'America/Los_Angeles',
  '510': 'America/Los_Angeles', '530': 'America/Los_Angeles', '559': 'America/Los_Angeles',
  '562': 'America/Los_Angeles', '619': 'America/Los_Angeles', '626': 'America/Los_Angeles',
  '628': 'America/Los_Angeles', '650': 'America/Los_Angeles', '657': 'America/Los_Angeles',
  '661': 'America/Los_Angeles', '669': 'America/Los_Angeles', '707': 'America/Los_Angeles',
  '714': 'America/Los_Angeles', '747': 'America/Los_Angeles', '760': 'America/Los_Angeles',
  '805': 'America/Los_Angeles', '818': 'America/Los_Angeles', '820': 'America/Los_Angeles',
  '831': 'America/Los_Angeles', '858': 'America/Los_Angeles', '909': 'America/Los_Angeles',
  '916': 'America/Los_Angeles', '925': 'America/Los_Angeles', '949': 'America/Los_Angeles',
  '951': 'America/Los_Angeles',
  // Washington
  '206': 'America/Los_Angeles', '253': 'America/Los_Angeles', '360': 'America/Los_Angeles',
  '425': 'America/Los_Angeles', '509': 'America/Los_Angeles', '564': 'America/Los_Angeles',
  // Oregon
  '503': 'America/Los_Angeles', '541': 'America/Los_Angeles', '458': 'America/Los_Angeles',
  '971': 'America/Los_Angeles',
  // Nevada (most)
  '702': 'America/Los_Angeles', '725': 'America/Los_Angeles', '775': 'America/Los_Angeles',

  // ── Mountain ───────────────────────────────────────────────────────────────
  // Arizona (no DST — America/Phoenix)
  '480': 'America/Phoenix', '520': 'America/Phoenix', '602': 'America/Phoenix',
  '623': 'America/Phoenix', '928': 'America/Phoenix',
  // Colorado
  '303': 'America/Denver', '719': 'America/Denver', '720': 'America/Denver',
  '970': 'America/Denver',
  // Utah
  '385': 'America/Denver', '801': 'America/Denver',
  // New Mexico
  '505': 'America/Denver', '575': 'America/Denver',
  // Montana
  '406': 'America/Denver',
  // Idaho (most)
  '208': 'America/Denver',
  // Wyoming
  '307': 'America/Denver',

  // ── Central ────────────────────────────────────────────────────────────────
  // Texas
  '210': 'America/Chicago', '214': 'America/Chicago', '254': 'America/Chicago',
  '281': 'America/Chicago', '325': 'America/Chicago', '346': 'America/Chicago',
  '361': 'America/Chicago', '409': 'America/Chicago', '430': 'America/Chicago',
  '432': 'America/Chicago', '469': 'America/Chicago', '512': 'America/Chicago',
  '682': 'America/Chicago', '713': 'America/Chicago', '726': 'America/Chicago',
  '737': 'America/Chicago', '806': 'America/Chicago', '817': 'America/Chicago',
  '830': 'America/Chicago', '832': 'America/Chicago', '903': 'America/Chicago',
  '915': 'America/Chicago', '936': 'America/Chicago', '940': 'America/Chicago',
  '956': 'America/Chicago', '972': 'America/Chicago', '979': 'America/Chicago',
  // Illinois
  '217': 'America/Chicago', '224': 'America/Chicago', '309': 'America/Chicago',
  '312': 'America/Chicago', '331': 'America/Chicago', '618': 'America/Chicago',
  '630': 'America/Chicago', '708': 'America/Chicago', '773': 'America/Chicago',
  '815': 'America/Chicago', '847': 'America/Chicago', '872': 'America/Chicago',
  // Missouri
  '314': 'America/Chicago', '417': 'America/Chicago', '573': 'America/Chicago',
  '636': 'America/Chicago', '660': 'America/Chicago', '816': 'America/Chicago',
  // Louisiana
  '225': 'America/Chicago', '318': 'America/Chicago', '337': 'America/Chicago',
  '504': 'America/Chicago', '985': 'America/Chicago',
  // Alabama
  '205': 'America/Chicago', '251': 'America/Chicago', '256': 'America/Chicago',
  '334': 'America/Chicago', '938': 'America/Chicago',
  // Mississippi
  '228': 'America/Chicago', '601': 'America/Chicago', '662': 'America/Chicago',
  '769': 'America/Chicago',
  // Arkansas
  '479': 'America/Chicago', '501': 'America/Chicago', '870': 'America/Chicago',
  // Iowa
  '319': 'America/Chicago', '515': 'America/Chicago', '563': 'America/Chicago',
  '641': 'America/Chicago', '712': 'America/Chicago',
  // Minnesota
  '218': 'America/Chicago', '320': 'America/Chicago', '507': 'America/Chicago',
  '612': 'America/Chicago', '651': 'America/Chicago', '763': 'America/Chicago',
  '952': 'America/Chicago',
  // Nebraska
  '308': 'America/Chicago', '402': 'America/Chicago', '531': 'America/Chicago',
  // Kansas
  '316': 'America/Chicago', '620': 'America/Chicago', '785': 'America/Chicago',
  '913': 'America/Chicago',
  // Oklahoma
  '405': 'America/Chicago', '539': 'America/Chicago', '580': 'America/Chicago',
  '918': 'America/Chicago',
  // Wisconsin
  '262': 'America/Chicago', '414': 'America/Chicago', '608': 'America/Chicago',
  '715': 'America/Chicago', '920': 'America/Chicago',
  // North Dakota
  '701': 'America/Chicago',
  // South Dakota (most)
  '605': 'America/Chicago',
  // Tennessee (mostly Central; East TN is Eastern — mapped below)
  '615': 'America/Chicago', '629': 'America/Chicago', '731': 'America/Chicago',
  '901': 'America/Chicago', '931': 'America/Chicago',
  // Florida panhandle
  '850': 'America/Chicago',
  // Michigan Upper Peninsula
  '906': 'America/Chicago',
  // Indiana western counties
  '219': 'America/Chicago',
  // Kentucky western counties
  '270': 'America/Chicago', '364': 'America/Chicago',

  // ── Eastern ────────────────────────────────────────────────────────────────
  // New York
  '212': 'America/New_York', '315': 'America/New_York', '332': 'America/New_York',
  '347': 'America/New_York', '516': 'America/New_York', '518': 'America/New_York',
  '585': 'America/New_York', '607': 'America/New_York', '631': 'America/New_York',
  '646': 'America/New_York', '680': 'America/New_York', '716': 'America/New_York',
  '718': 'America/New_York', '838': 'America/New_York', '845': 'America/New_York',
  '914': 'America/New_York', '917': 'America/New_York', '929': 'America/New_York',
  '934': 'America/New_York',
  // New Jersey
  '201': 'America/New_York', '551': 'America/New_York', '609': 'America/New_York',
  '732': 'America/New_York', '848': 'America/New_York', '856': 'America/New_York',
  '862': 'America/New_York', '908': 'America/New_York', '973': 'America/New_York',
  // Pennsylvania
  '215': 'America/New_York', '267': 'America/New_York', '272': 'America/New_York',
  '412': 'America/New_York', '445': 'America/New_York', '484': 'America/New_York',
  '570': 'America/New_York', '610': 'America/New_York', '717': 'America/New_York',
  '724': 'America/New_York', '814': 'America/New_York', '878': 'America/New_York',
  // Connecticut
  '203': 'America/New_York', '475': 'America/New_York', '860': 'America/New_York',
  '959': 'America/New_York',
  // Massachusetts
  '339': 'America/New_York', '351': 'America/New_York', '413': 'America/New_York',
  '508': 'America/New_York', '617': 'America/New_York', '774': 'America/New_York',
  '781': 'America/New_York', '857': 'America/New_York', '978': 'America/New_York',
  // Rhode Island
  '401': 'America/New_York',
  // Maine
  '207': 'America/New_York',
  // New Hampshire
  '603': 'America/New_York',
  // Vermont
  '802': 'America/New_York',
  // Maryland
  '240': 'America/New_York', '301': 'America/New_York', '410': 'America/New_York',
  '443': 'America/New_York', '667': 'America/New_York',
  // Washington DC
  '202': 'America/New_York',
  // Delaware
  '302': 'America/New_York',
  // Virginia
  '276': 'America/New_York', '434': 'America/New_York', '540': 'America/New_York',
  '571': 'America/New_York', '703': 'America/New_York', '757': 'America/New_York',
  '804': 'America/New_York',
  // West Virginia
  '304': 'America/New_York', '681': 'America/New_York',
  // North Carolina
  '252': 'America/New_York', '336': 'America/New_York', '704': 'America/New_York',
  '743': 'America/New_York', '828': 'America/New_York', '910': 'America/New_York',
  '919': 'America/New_York', '980': 'America/New_York', '984': 'America/New_York',
  // South Carolina
  '803': 'America/New_York', '839': 'America/New_York', '843': 'America/New_York',
  '854': 'America/New_York', '864': 'America/New_York',
  // Georgia
  '229': 'America/New_York', '404': 'America/New_York', '470': 'America/New_York',
  '478': 'America/New_York', '678': 'America/New_York', '706': 'America/New_York',
  '762': 'America/New_York', '770': 'America/New_York', '912': 'America/New_York',
  // Florida (except panhandle)
  '239': 'America/New_York', '305': 'America/New_York', '321': 'America/New_York',
  '352': 'America/New_York', '386': 'America/New_York', '407': 'America/New_York',
  '561': 'America/New_York', '689': 'America/New_York', '727': 'America/New_York',
  '754': 'America/New_York', '772': 'America/New_York', '786': 'America/New_York',
  '813': 'America/New_York', '863': 'America/New_York', '904': 'America/New_York',
  '941': 'America/New_York', '954': 'America/New_York',
  // Ohio
  '216': 'America/New_York', '234': 'America/New_York', '326': 'America/New_York',
  '330': 'America/New_York', '380': 'America/New_York', '419': 'America/New_York',
  '440': 'America/New_York', '513': 'America/New_York', '567': 'America/New_York',
  '614': 'America/New_York', '740': 'America/New_York', '937': 'America/New_York',
  // Michigan (most)
  '231': 'America/New_York', '248': 'America/New_York', '269': 'America/New_York',
  '313': 'America/New_York', '517': 'America/New_York', '586': 'America/New_York',
  '616': 'America/New_York', '734': 'America/New_York', '810': 'America/New_York',
  '947': 'America/New_York', '989': 'America/New_York',
  // Indiana (most)
  '260': 'America/New_York', '317': 'America/New_York', '463': 'America/New_York',
  '574': 'America/New_York', '765': 'America/New_York', '812': 'America/New_York',
  '930': 'America/New_York',
  // Kentucky (most)
  '502': 'America/New_York', '606': 'America/New_York', '859': 'America/New_York',
  // Tennessee East
  '423': 'America/New_York', '865': 'America/New_York',
}

// ── Area code → US state abbreviation ──────────────────────────────────────
export const AREA_CODE_STATE: Record<string, string> = {
  // California
  '209': 'CA', '213': 'CA', '279': 'CA', '310': 'CA', '323': 'CA', '408': 'CA',
  '415': 'CA', '424': 'CA', '442': 'CA', '510': 'CA', '530': 'CA', '559': 'CA',
  '562': 'CA', '619': 'CA', '626': 'CA', '628': 'CA', '650': 'CA', '657': 'CA',
  '661': 'CA', '669': 'CA', '707': 'CA', '714': 'CA', '747': 'CA', '760': 'CA',
  '805': 'CA', '818': 'CA', '820': 'CA', '831': 'CA', '858': 'CA', '909': 'CA',
  '916': 'CA', '925': 'CA', '949': 'CA', '951': 'CA',
  // Washington
  '206': 'WA', '253': 'WA', '360': 'WA', '425': 'WA', '509': 'WA', '564': 'WA',
  // Oregon
  '503': 'OR', '541': 'OR', '458': 'OR', '971': 'OR',
  // Nevada
  '702': 'NV', '725': 'NV', '775': 'NV',
  // Arizona
  '480': 'AZ', '520': 'AZ', '602': 'AZ', '623': 'AZ', '928': 'AZ',
  // Colorado
  '303': 'CO', '719': 'CO', '720': 'CO', '970': 'CO',
  // Utah
  '385': 'UT', '801': 'UT',
  // New Mexico
  '505': 'NM', '575': 'NM',
  // Montana
  '406': 'MT',
  // Idaho
  '208': 'ID',
  // Wyoming
  '307': 'WY',
  // Texas
  '210': 'TX', '214': 'TX', '254': 'TX', '281': 'TX', '325': 'TX', '346': 'TX',
  '361': 'TX', '409': 'TX', '430': 'TX', '432': 'TX', '469': 'TX', '512': 'TX',
  '682': 'TX', '713': 'TX', '726': 'TX', '737': 'TX', '806': 'TX', '817': 'TX',
  '830': 'TX', '832': 'TX', '903': 'TX', '915': 'TX', '936': 'TX', '940': 'TX',
  '956': 'TX', '972': 'TX', '979': 'TX',
  // Illinois
  '217': 'IL', '224': 'IL', '309': 'IL', '312': 'IL', '331': 'IL', '618': 'IL',
  '630': 'IL', '708': 'IL', '773': 'IL', '815': 'IL', '847': 'IL', '872': 'IL',
  // Missouri
  '314': 'MO', '417': 'MO', '573': 'MO', '636': 'MO', '660': 'MO', '816': 'MO',
  // Louisiana
  '225': 'LA', '318': 'LA', '337': 'LA', '504': 'LA', '985': 'LA',
  // Alabama
  '205': 'AL', '251': 'AL', '256': 'AL', '334': 'AL', '938': 'AL',
  // Mississippi
  '228': 'MS', '601': 'MS', '662': 'MS', '769': 'MS',
  // Arkansas
  '479': 'AR', '501': 'AR', '870': 'AR',
  // Iowa
  '319': 'IA', '515': 'IA', '563': 'IA', '641': 'IA', '712': 'IA',
  // Minnesota
  '218': 'MN', '320': 'MN', '507': 'MN', '612': 'MN', '651': 'MN', '763': 'MN', '952': 'MN',
  // Nebraska
  '308': 'NE', '402': 'NE', '531': 'NE',
  // Kansas
  '316': 'KS', '620': 'KS', '785': 'KS', '913': 'KS',
  // Oklahoma
  '405': 'OK', '539': 'OK', '580': 'OK', '918': 'OK',
  // Wisconsin
  '262': 'WI', '414': 'WI', '608': 'WI', '715': 'WI', '920': 'WI',
  // North Dakota
  '701': 'ND',
  // South Dakota
  '605': 'SD',
  // Tennessee
  '615': 'TN', '629': 'TN', '731': 'TN', '901': 'TN', '931': 'TN', '423': 'TN', '865': 'TN',
  // Florida
  '239': 'FL', '305': 'FL', '321': 'FL', '352': 'FL', '386': 'FL', '407': 'FL',
  '561': 'FL', '689': 'FL', '727': 'FL', '754': 'FL', '772': 'FL', '786': 'FL',
  '813': 'FL', '850': 'FL', '863': 'FL', '904': 'FL', '941': 'FL', '954': 'FL',
  // New York
  '212': 'NY', '315': 'NY', '332': 'NY', '347': 'NY', '516': 'NY', '518': 'NY',
  '585': 'NY', '607': 'NY', '631': 'NY', '646': 'NY', '680': 'NY', '716': 'NY',
  '718': 'NY', '838': 'NY', '845': 'NY', '914': 'NY', '917': 'NY', '929': 'NY', '934': 'NY',
  // New Jersey
  '201': 'NJ', '551': 'NJ', '609': 'NJ', '732': 'NJ', '848': 'NJ', '856': 'NJ',
  '862': 'NJ', '908': 'NJ', '973': 'NJ',
  // Pennsylvania
  '215': 'PA', '267': 'PA', '272': 'PA', '412': 'PA', '445': 'PA', '484': 'PA',
  '570': 'PA', '610': 'PA', '717': 'PA', '724': 'PA', '814': 'PA', '878': 'PA',
  // Connecticut
  '203': 'CT', '475': 'CT', '860': 'CT', '959': 'CT',
  // Massachusetts
  '339': 'MA', '351': 'MA', '413': 'MA', '508': 'MA', '617': 'MA', '774': 'MA',
  '781': 'MA', '857': 'MA', '978': 'MA',
  // Rhode Island
  '401': 'RI',
  // Maine
  '207': 'ME',
  // New Hampshire
  '603': 'NH',
  // Vermont
  '802': 'VT',
  // Maryland
  '240': 'MD', '301': 'MD', '410': 'MD', '443': 'MD', '667': 'MD',
  // Washington DC
  '202': 'DC',
  // Delaware
  '302': 'DE',
  // Virginia
  '276': 'VA', '434': 'VA', '540': 'VA', '571': 'VA', '703': 'VA', '757': 'VA', '804': 'VA',
  // West Virginia
  '304': 'WV', '681': 'WV',
  // North Carolina
  '252': 'NC', '336': 'NC', '704': 'NC', '743': 'NC', '828': 'NC', '910': 'NC',
  '919': 'NC', '980': 'NC', '984': 'NC',
  // South Carolina
  '803': 'SC', '839': 'SC', '843': 'SC', '854': 'SC', '864': 'SC',
  // Georgia
  '229': 'GA', '404': 'GA', '470': 'GA', '478': 'GA', '678': 'GA', '706': 'GA',
  '762': 'GA', '770': 'GA', '912': 'GA',
  // Ohio
  '216': 'OH', '234': 'OH', '326': 'OH', '330': 'OH', '380': 'OH', '419': 'OH',
  '440': 'OH', '513': 'OH', '567': 'OH', '614': 'OH', '740': 'OH', '937': 'OH',
  // Michigan
  '231': 'MI', '248': 'MI', '269': 'MI', '313': 'MI', '517': 'MI', '586': 'MI',
  '616': 'MI', '734': 'MI', '810': 'MI', '906': 'MI', '947': 'MI', '989': 'MI',
  // Indiana
  '219': 'IN', '260': 'IN', '317': 'IN', '463': 'IN', '574': 'IN', '765': 'IN', '812': 'IN', '930': 'IN',
  // Kentucky
  '270': 'KY', '364': 'KY', '502': 'KY', '606': 'KY', '859': 'KY',
}

// ── Helpers ────────────────────────────────────────────────────────────────
export function extractAreaCode(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.substring(1, 4)
  if (digits.length === 10) return digits.substring(0, 3)
  return null
}

// Timezone is determined solely by firm:
//   Fears → America/Chicago  (CDT — starts calling at 8:30 AM CDT)
//   LHP   → America/Los_Angeles (PDT — starts calling at 8:30 AM PDT)
export function resolveTimezone(
  _ghlTimezone: string | null | undefined,
  _phone: string | null | undefined,
  firmDefault: string
): string {
  return firmDefault
}
