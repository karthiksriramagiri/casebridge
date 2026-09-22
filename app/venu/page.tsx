import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getVenuUser, venuAdmin, embedded } from './_lib/auth'
import CallsList, { type CallRow } from './CallsList'

export const dynamic = 'force-dynamic'

export default async function VenuHome() {
  const user = await getVenuUser()
  if (!user) redirect('/venu/login')

  const { data: recent } = await venuAdmin()
    .from('venu_sessions')
    .select('id, scenario_title, mode, started_at, duration_sec, status, venu_scores(overall_score, criteria_score, empathy_score, nuance_caught)')
    .eq('user_id', user.id)
    .eq('track', 'setter')
    .order('started_at', { ascending: false })
    .limit(8)

  const rows = recent ?? []
  const scoreOf = (r: any) => embedded<any>(r.venu_scores)
  const tests = rows.filter((r: any) => r.mode === 'test' && scoreOf(r))
  const avg = tests.length
    ? Math.round(tests.reduce((n: number, r: any) => n + (scoreOf(r)?.overall_score ?? 0), 0) / tests.length)
    : null

  if (!user.setter) {
    return (
      <main className="venu-wrap" style={{ maxWidth: 560, textAlign: 'center', paddingTop: 80 }}>
        <div className="venu-orb sm" style={{ margin: '0 auto 28px' }} />
        <h1 className="venu-h1" style={{ fontSize: 28 }}>Not enabled yet</h1>
        <p className="venu-sub">
          Setter training hasn&rsquo;t been turned on for your account. Ask your admin to enable it.
        </p>
      </main>
    )
  }

  return (
    <main className="venu-wrap" style={{ maxWidth: 720 }}>
      <section style={{ textAlign: 'center', padding: '28px 0 8px' }}>
        <div className="venu-orb lg" style={{ margin: '0 auto' }} />
        <h1 className="venu-h1" style={{ marginTop: 30 }}>
          {user.name.split(' ')[0]}, ready to run a call?
        </h1>
        <p className="venu-sub" style={{ maxWidth: 460, margin: '10px auto 0' }}>
          Venu picks a real case from the Nuance Book and plays the caller. Qualify it —
          eight checkpoints, and the one detail that decides it.
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, margin: '34px 0 10px' }}>
        <Link href="/venu/call?mode=practice" className="venu-card venu-mode">
          <span className="venu-eyebrow">Practice</span>
          <h2 className="venu-h2" style={{ fontSize: 20 }}>Run it with the checklist up</h2>
          <p className="venu-scenario-archetype">
            The eight checkpoints stay on screen. Full feedback after. Nothing counts toward your average.
          </p>
          <span className="venu-mode-go">Start practice →</span>
        </Link>

        <Link href="/venu/call?mode=test" className="venu-card venu-mode is-test">
          <span className="venu-eyebrow">Test</span>
          <h2 className="venu-h2" style={{ fontSize: 20 }}>Run it cold</h2>
          <p className="venu-scenario-archetype">
            No checklist, no help. Scored and logged for your admin. This is the one that counts.
          </p>
          <span className="venu-mode-go">Start test →</span>
        </Link>
      </section>

      {avg !== null && (
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginTop: 18 }}>
          Test average <strong style={{ color: 'var(--ink)', fontWeight: 700 }}>{avg}</strong> over {tests.length}{' '}
          {tests.length === 1 ? 'call' : 'calls'}
        </p>
      )}

      <section style={{ marginTop: 40 }}>
        <h2 className="venu-h2" style={{ marginBottom: 12 }}>Your calls</h2>
        <CallsList
          rows={rows.map((r: any): CallRow => {
            const s = scoreOf(r)
            return {
              id: r.id,
              title: r.scenario_title,
              mode: r.mode,
              status: r.status,
              startedAt: r.started_at,
              durationSec: r.duration_sec,
              score: s?.overall_score ?? null,
              criteria: s?.criteria_score ?? null,
              empathy: s?.empathy_score ?? null,
              nuanceCaught: s?.nuance_caught ?? null,
            }
          })}
        />
      </section>
    </main>
  )
}
