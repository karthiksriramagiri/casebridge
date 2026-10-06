/* ═══════════════════════════════════════════════════════════════════════════
   Resolving an ad id to its creative and ad set names.

   Two alert paths needed this and each had its own copy reading a single
   token, which is why Jacoby & Meyers leads announced themselves with an
   em dash: a Meta token only reaches the accounts its user is assigned to,
   and an ad in another account answers "does not exist" — indistinguishable
   from a bad id. Every configured token is tried in turn instead.

   Tokens are ordered with the ad-account registry first and FB_ACCESS_TOKEN
   last, so the common case costs one call and the fallback only runs when the
   first account genuinely cannot see the ad.
   ═══════════════════════════════════════════════════════════════════════════ */

import { adAccounts } from '@/app/_metrics/ad-accounts'

export type CreativeNames = { creative: string | null; adset: string | null }

function tokens(): string[] {
  const out = adAccounts().map(a => a.token)
  const fb = (process.env.FB_ACCESS_TOKEN || '').trim()
  if (fb && !out.includes(fb)) out.push(fb)
  return out.filter(Boolean)
}

/** A GHL merge field that never got substituted is not an id. */
export function usableAdId(adId: string | null | undefined): string | null {
  const v = (adId ?? '').trim()
  if (!v || v.includes('{{') || !/^\d+$/.test(v)) return null
  return v
}

export async function creativeNames(adId: string | null | undefined): Promise<CreativeNames> {
  const id = usableAdId(adId)
  if (!id) return { creative: null, adset: null }

  for (const token of tokens()) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v25.0/${id}` +
        `?fields=name,adset{name}&access_token=${encodeURIComponent(token)}`,
        { cache: 'no-store' })
      if (!res.ok) continue           // wrong account for this ad — try the next
      const d = await res.json()
      if (d?.error || !d?.name) continue
      return { creative: d.name ?? null, adset: d.adset?.name ?? null }
    } catch {
      // Network trouble on one account must not stop the others.
    }
  }
  return { creative: null, adset: null }
}
