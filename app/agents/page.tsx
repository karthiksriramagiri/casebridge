'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Press_Start_2P } from 'next/font/google'

import Office from './_components/Office'
import { AGENTS, STATUS_LABEL, type Agent } from './_agents'
import './agents.css'

// Pixel type is reserved for the page title, where it reads fine. Everything
// else uses the app's DM Sans — Press Start 2P is illegible below ~14px.
const pixel = Press_Start_2P({ subsets: ['latin'], weight: '400', variable: '--font-pixel' })

interface Stats {
  filledToday: number
  awaitingReview: number
  totalFilled: number
  fieldsFilled: number
}

export default function AgentsPage() {
  const [selected, setSelected] = useState<Agent>(AGENTS[0])
  const [stats, setStats] = useState<Stats | null>(null)

  // Supabase-only read — costs no GHL quota, so it's safe on a page people
  // leave open.
  useEffect(() => {
    let alive = true
    fetch('/api/agents/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && !d.error) setStats(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  return (
    <div className={`ag-root ${pixel.variable}`}>
      <div className="ag-shell">
        <header className="ag-head">
          <h1 className="ag-title">THE AGENT FLOOR</h1>
          <p className="ag-sub">
            Our AI workers, what they handle, and where their work shows up.
            <span className="ag-hint"> Select a worker to spotlight them.</span>
          </p>
        </header>
        <div className="ag-headrule" />

        {/* The scene runs the full width — it's the point of the page. */}
        <Office selectedId={selected.id} />

        <div className="ag-roster">
          {AGENTS.map((a) => {
            const on = selected.id === a.id
            return (
              <article
                key={a.id}
                className={`ag-agent${on ? ' is-on' : ''}`}
                style={{ ['--accent' as string]: a.color }}
              >
                <button
                  className="ag-agent-head"
                  aria-pressed={on}
                  onClick={() => setSelected(a)}
                >
                  <span className="ag-agent-id">
                    <span className="ag-agent-name">{a.name}</span>
                    <span className="ag-agent-role">{a.role}</span>
                  </span>
                  <span className="ag-chip">
                    <span className={`ag-dot ag-dot--${a.status}`} />
                    {STATUS_LABEL[a.status]}
                  </span>
                </button>

                <p className="ag-agent-desc">{a.description}</p>

                <h3 className="ag-sub-h">What it does</h3>
                <ul className="ag-duties">
                  {a.duties.map((d) => <li key={d}>{d}</li>)}
                </ul>

                {a.id === 'sendcase' && stats && (
                  <>
                    <h3 className="ag-sub-h">Work done</h3>
                    <div className="ag-stats">
                      <div className="ag-stat">
                        <div className="ag-stat-n">{stats.filledToday}</div>
                        <div className="ag-stat-l">filled today</div>
                      </div>
                      <div className="ag-stat">
                        <div className="ag-stat-n">{stats.awaitingReview}</div>
                        <div className="ag-stat-l">awaiting review</div>
                      </div>
                      <div className="ag-stat">
                        <div className="ag-stat-n">{stats.totalFilled}</div>
                        <div className="ag-stat-l">cases all time</div>
                      </div>
                      <div className="ag-stat">
                        <div className="ag-stat-n">{stats.fieldsFilled}</div>
                        <div className="ag-stat-l">fields written</div>
                      </div>
                    </div>
                  </>
                )}

                <footer className="ag-agent-foot">
                  <span className="ag-runs">{a.runsOn}</span>
                  {a.href && (
                    <Link href={a.href} className="ag-link">
                      {a.hrefLabel} <span aria-hidden>→</span>
                    </Link>
                  )}
                </footer>
              </article>
            )
          })}

          {/* Makes the roster's intent obvious while there's only one hire. */}
          <article className="ag-agent ag-agent--ghost" aria-hidden>
            <div className="ag-ghost-plus">+</div>
            <p className="ag-ghost-text">
              Open role. Two desks on the floor are unassigned — the next agent
              takes one.
            </p>
          </article>
        </div>
      </div>
    </div>
  )
}
