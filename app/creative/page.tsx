'use client'

import Link from 'next/link'
import { ArrowRight, Clapperboard, ShieldCheck } from 'lucide-react'
import { useSite } from '@/app/_metrics/site'

/* The front door: pick a workspace. Each role gets its own pages, its own
   sidebar and its own permissions. Paths are built off the center's base so
   one set of cards works on creatives.case-bridge.com and on the apex. */

/* Two workspaces. The K-Team login is gone — that work is Jason's, and its
   lists were already duplicated on the admin side. */
const ROLES = [
  {
    href: '/admin/analysis',
    title: 'Admin',
    who: 'Jason · Creative Team Lead',
    desc: 'Analyze creatives, run the watch and kill lists, brief the Creative Team, and work the launch and production queues.',
    icon: ShieldCheck,
    ready: true,
  },
  {
    href: '/team/assignments',
    title: 'Creative Team',
    who: 'Faisal & makers',
    desc: 'Assignment board with briefs, uploads and feedback chat, plus winners, angles and competitors.',
    icon: Clapperboard,
    ready: true,
  },
]

export default function CreativeCenterHome() {
  const { base } = useSite()

  return (
    <div className="cc-root">
      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-16">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            CC
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight">Creative Center</h1>
          <p className="max-w-md text-pretty text-muted-foreground">
            Choose your workspace. Each team gets its own pages and permissions.
          </p>
        </div>
        <ul className="grid w-full max-w-2xl gap-4 md:grid-cols-2">
          {ROLES.map((r) => {
            const Icon = r.icon
            const body = (
              <div className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5 transition-shadow group-hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {!r.ready && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Coming next</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="font-semibold">{r.title} Login</h2>
                  <p className="text-xs text-muted-foreground">{r.who}</p>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{r.desc}</p>
                {r.ready && (
                  <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary">
                    Enter workspace <ArrowRight className="size-4" aria-hidden />
                  </span>
                )}
              </div>
            )
            return (
              <li key={r.title} className="group">
                {r.ready ? (
                  <Link
                    href={base + r.href}
                    className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {body}
                  </Link>
                ) : (
                  <div aria-disabled className="h-full opacity-70">
                    {body}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {/* The Meta-backed pages the new center's backend will be built from. */}
        <Link
          href={`${base}/overview`}
          className="mt-8 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Open the previous Creative Center (live Meta data)
        </Link>
      </main>
    </div>
  )
}
