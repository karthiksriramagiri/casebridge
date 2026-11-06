import '@/app/_metrics/metrics.css'

/* ═══════════════════════════════════════════════════════════════════════════
   The Creative Center as it was before the revamp: the Meta-backed overview,
   Creative Analysis, Winner Analysis, Angles, Competitors and the briefs
   board. Every URL is unchanged — /creative/analysis, /creative/angles and
   the rest still land here — except the overview, which moved off the root to
   /creative/overview to free that path for the new role chooser.

   These pages are the only things in the app wired to real Meta insights and
   the GHL lead join, so they stay reachable while the new center's backend is
   built; this is where that work reads its sources from.

   The wrapper lives here rather than in the parent layout so metrics.css
   cannot reach the new workspaces.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function LegacyCreativeLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx metrics-page">{children}</div>
}
