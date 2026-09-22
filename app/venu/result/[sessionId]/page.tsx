import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getVenuUser, venuAdmin, embedded } from '../../_lib/auth'
import { getNuanceScenario } from '../../_lib/nuance-scenarios'
import { mmss } from '../../_lib/metrics'
import type { SetterScorecard, SessionMetrics, Turn } from '../../_lib/types'

export const dynamic = 'force-dynamic'

function Ring({ label, value }: { label: string; value: number }) {
  return (
    <div className="venu-card venu-trait">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="venu-eyebrow">{label}</span>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>{value}</span>
      </div>
      <div className="venu-meter"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
    </div>
  )
}

export default async function ResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getVenuUser()
  if (!user) redirect('/venu/login')

  const { sessionId } = await params
  const { data: session } = await venuAdmin()
    .from('venu_sessions')
    .select('*, venu_scores(*)')
    .eq('id', sessionId)
    .single()

  if (!session) notFound()
  if (session.user_id !== user.id && user.role !== 'admin') notFound()

  const score = embedded<any>(session.venu_scores)
  if (!score) {
    return (
      <main className="venu-wrap" style={{ maxWidth: 560, textAlign: 'center', paddingTop: 60 }}>
        <p className="venu-empty">This call hasn&rsquo;t been scored yet.</p>
        <Link href="/venu" className="venu-btn">Back</Link>
      </main>
    )
  }

  const card = score.scorecard as SetterScorecard
  const metrics = (session.metrics ?? {}) as SessionMetrics
  const turns = (session.transcript ?? []) as Turn[]
  const scenario = getNuanceScenario(session.scenario_id)
  const surfaced = card.checkpoints.filter((c) => c.status === 'surfaced').length

  return (
    <main className="venu-wrap" style={{ maxWidth: 760 }}>
      <Link href="/venu" className="venu-eyebrow" style={{ textDecoration: 'none' }}>← Back</Link>

      <section style={{ margin: '18px 0 28px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <span className="venu-score-num">{card.overallScore}</span>
          <span style={{ color: 'var(--muted)' }}>/ 100</span>
          <span className={`venu-mode-tag ${session.mode}`}>{session.mode}</span>
        </div>
        <p className="venu-sub" style={{ fontSize: 17, color: 'var(--ink-2)', marginTop: 14 }}>
          {card.coachingSummary}
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>
          {session.scenario_title} · {session.scenario_category} ·{' '}
          {Math.floor((session.duration_sec ?? 0) / 60)}m {(session.duration_sec ?? 0) % 60}s
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Ring label="Criteria qualification" value={card.criteriaScore} />
        <Ring label="Empathy" value={card.empathy.score} />
      </div>

      <section style={{ marginTop: 26 }}>
        <h2 className="venu-h2" style={{ marginBottom: 12 }}>
          Checkpoints — {surfaced}/{card.checkpoints.length} covered
        </h2>
        <div className="venu-card">
          {card.checkpoints.map((c) => (
            <div key={c.id} className="venu-row">
              <span className={`venu-pill ${c.status}`}>{c.status}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontWeight: 600 }}>{c.label}</strong>
                {c.evidence && (
                  <span style={{ display: 'block', color: 'var(--ink-2)', fontSize: 13, marginTop: 2 }}>
                    &ldquo;{c.evidence}&rdquo;
                  </span>
                )}
                {c.note && (
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{c.note}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 26 }}>
        <h2 className="venu-h2" style={{ marginBottom: 12 }}>The detail that decided it</h2>
        <div className="venu-card" style={{ padding: 18 }}>
          <span className={`venu-pill ${card.nuance.caught ? 'surfaced' : 'missed'}`} style={{ marginBottom: 10, display: 'inline-block' }}>
            {card.nuance.caught ? 'you found it' : 'you missed it'}
          </span>
          <p style={{ fontSize: 15, lineHeight: 1.55 }}>{card.nuance.detail}</p>
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.55 }}>{card.nuance.note}</p>
          {scenario && (
            <p className="venu-note" style={{ marginTop: 14 }}>
              <strong>Book says:</strong> {scenario.disposition.replace('_', ' ')} — {scenario.reason}
            </p>
          )}
        </div>
      </section>

      <section style={{ marginTop: 26 }}>
        <h2 className="venu-h2" style={{ marginBottom: 12 }}>Empathy</h2>
        <div className="venu-card">
          {card.empathy.bestMoment && (
            <div className="venu-row">
              <span className="venu-pill surfaced">best</span>
              <span style={{ flex: 1 }}>{card.empathy.bestMoment}</span>
            </div>
          )}
          {card.empathy.worstMoment && (
            <div className="venu-row">
              <span className="venu-pill missed">worst</span>
              <span style={{ flex: 1 }}>{card.empathy.worstMoment}</span>
            </div>
          )}
          {card.empathy.evidence.slice(0, 4).map((e, i) => (
            <div key={i} className="venu-row">
              <span className="venu-pill not_applicable">note</span>
              <span style={{ flex: 1, color: 'var(--ink-2)' }}>{e}</span>
            </div>
          ))}
        </div>
      </section>

      {card.doDifferentlyNextTime?.length > 0 && (
        <section style={{ marginTop: 26 }}>
          <h2 className="venu-h2" style={{ marginBottom: 12 }}>Next call, do this</h2>
          <div className="venu-card">
            {card.doDifferentlyNextTime.map((d, i) => (
              <div key={i} className="venu-row">
                <span style={{ color: 'var(--muted)', width: 16 }}>{i + 1}</span>
                <span style={{ flex: 1 }}>{d}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: 26 }}>
        <div className="venu-card">
          <div className="venu-row" style={{ gap: 26, flexWrap: 'wrap' }}>
            {[
              ['Your share of talk', `${Math.round((metrics.repTalkRatio ?? 0) * 100)}%`],
              ['Speaking rate', `${metrics.repWordsPerMinute ?? 0} wpm`],
              ['Median pause', `${metrics.medianResponseGapMs ?? 0}ms`],
              ['Times you cut in', String(metrics.interruptions ?? 0)],
            ].map(([k, v]) => (
              <span key={k}>
                <span className="venu-eyebrow" style={{ display: 'block' }}>{k}</span>
                <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>{v}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <details className="venu-card" style={{ padding: 18, marginTop: 26 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Full transcript</summary>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {turns.map((t, i) => (
            <div key={i} className={`venu-line ${t.speaker}`}>
              <span className="who">{mmss(t.startMs)} · {t.speaker === 'rep' ? 'You' : 'Caller'}</span>
              {t.text}
            </div>
          ))}
        </div>
      </details>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 30 }}>
        <Link href={`/venu/call?mode=${session.mode}`} className="venu-btn">Run another</Link>
        <Link href="/venu" className="venu-btn ghost">Done</Link>
      </div>
    </main>
  )
}
