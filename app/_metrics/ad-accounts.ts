/* ═══════════════════════════════════════════════════════════════════════════
   Meta ad accounts

   The dashboard used to read one hardcoded account. A second firm running its
   own ads means a second account — with its own access token, since a token
   only reaches the accounts its system user is assigned to.

   Accounts are declared here and read from the environment, never inlined:
   a token in the repo is a token in the git history forever. An account whose
   id or token is missing is simply absent from the list, so the dashboard
   keeps working on whatever is configured rather than erroring on what is not.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AdAccount {
  /** act_… form, as Meta's edges expect it. */
  id: string
  /** Short code used in the UI and stamped onto every row. */
  key: string
  label: string
  token: string
}

const clean = (v: string | undefined) => (v ?? '').trim().replace(/\\n$/, '')

/** Normalise "788…" or "act_788…" to the act_ form Meta wants. */
function actId(raw: string | undefined): string {
  const v = clean(raw)
  if (!v) return ''
  return v.startsWith('act_') ? v : `act_${v}`
}

const DECLARED: Array<Omit<AdAccount, 'id' | 'token'> & { id: string; token: string }> = [
  {
    key: 'asd',
    label: 'Accident Support Desk',
    // The original account. Its id stays defaulted so nothing breaks if the
    // env var is not set on an older deployment.
    id: actId(process.env.META_AD_ACCOUNT_ID || 'act_788484706914452'),
    token: clean(process.env.META_ACCESS_TOKEN),
  },
  {
    key: 'jm',
    label: 'Jacoby & Meyers',
    id: actId(process.env.META_AD_ACCOUNT_JM),
    token: clean(process.env.META_ACCESS_TOKEN_JM),
  },
]

/** Every account that is actually configured, in display order. */
export function adAccounts(): AdAccount[] {
  return DECLARED.filter(a => a.id && a.token)
}

/** The account a given id belongs to, for per-row follow-up calls. */
export function accountByKey(key: string | null | undefined): AdAccount | null {
  if (!key) return null
  return adAccounts().find(a => a.key === key) ?? null
}

/** Primary account — the one single-account reports still read. */
export function primaryAccount(): AdAccount | null {
  return adAccounts()[0] ?? null
}
