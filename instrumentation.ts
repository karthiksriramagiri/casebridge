// Next runs register() once per server runtime, before route code. Patching
// fetch here catches every GHL call in the codebase — including whatever is
// draining the quota that call-site auditing failed to find.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { trackingEnabled, bumpGhlUsage, attributeCaller } = await import('./lib/ghl-usage')
  if (!trackingEnabled()) return

  const g = globalThis as typeof globalThis & { __ghlUsagePatched?: boolean }
  if (g.__ghlUsagePatched) return
  g.__ghlUsagePatched = true

  const original = globalThis.fetch
  globalThis.fetch = function patchedFetch(input: any, init?: any) {
    try {
      const url =
        typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : input?.url ?? ''
      if (typeof url === 'string' && url.includes('leadconnectorhq.com')) {
        // Attribute by GHL endpoint. Stack frames point at bundled chunks in a
        // production build, so source-file attribution is unreliable there;
        // the endpoint always survives and still identifies the caller when
        // read against the code.
        let endpoint = 'unknown'
        try {
          const u = new URL(url)
          endpoint = u.pathname
            .replace(/\/[0-9a-zA-Z]{18,}(?=\/|$)/g, '/{id}')
            .replace(/\/\d+(?=\/|$)/g, '/{n}')
        } catch {}
        const caller = attributeCaller(new Error().stack)
        bumpGhlUsage(caller === 'unattributed' || caller === 'unknown'
          ? endpoint
          : `${endpoint} <- ${caller}`)
      }
    } catch {
      // never let accounting break a request
    }
    return original(input, init)
  } as typeof fetch
}
