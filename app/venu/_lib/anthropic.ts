import Anthropic from '@anthropic-ai/sdk'

/**
 * An org-level key (one not scoped to a workspace) must name a workspace on
 * every request or the API 400s. A workspace-scoped key needs nothing here.
 * Same handling as app/dialer/_lib/intake-fill.ts.
 */
export function anthropic(): Anthropic {
  const workspace = (process.env.ANTHROPIC_WORKSPACE_ID ?? '').trim()
  return new Anthropic({
    apiKey: (process.env.ANTHROPIC_API_KEY ?? '').trim(),
    ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
  })
}
