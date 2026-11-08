'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Archive,
  BarChart3,
  ClipboardList,
  Compass,
  Eye,
  Rocket,
  Skull,
  Swords,
  Trophy,
  Wallet,
  ListChecks,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { NotificationBell } from '@/app/creative/_components/notification-bell'
import { TODAY } from '@/app/creative/_lib/data'
import { useCenterHref, useRole, useRoleBase } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { isCreativeWork } from '@/app/creative/_lib/types'
import type { Role } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

type Item = { slug: string; label: string; icon: LucideIcon }
type Group = { label: string; items: Item[] }

const NAV: Record<Role, Group[]> = {
  admin: [
    {
      label: 'Analyze',
      items: [
        { slug: 'analysis', label: 'Creative Analysis', icon: BarChart3 },
        { slug: 'winners', label: 'Winner Analysis', icon: Trophy },
        { slug: 'angles', label: 'Angles', icon: Compass },
        { slug: 'competitors', label: 'Competitors', icon: Swords },
      ],
    },
    {
      label: 'Act',
      items: [
        { slug: 'watch-list', label: 'Watch List', icon: Eye },
        { slug: 'kill-list', label: 'Kill List', icon: Skull },
        { slug: 'assignments', label: 'Assignments', icon: ClipboardList },
        { slug: 'launch-lists', label: 'Launch Lists', icon: Rocket },
      ],
    },
    {
      label: 'Track',
      items: [
        { slug: 'execute', label: 'Execute', icon: ListChecks },
        { slug: 'budget', label: 'Budget Tracker', icon: Wallet },
        { slug: 'archives', label: 'Relaunch / Fatigue', icon: Archive },
      ],
    },
  ],
  creative: [
    {
      label: 'Work',
      items: [{ slug: 'assignments', label: 'My Assignments', icon: ClipboardList }],
    },
    {
      label: 'Research',
      items: [
        { slug: 'winners', label: 'Winner Analysis', icon: Trophy },
        { slug: 'angles', label: 'Angles', icon: Compass },
        { slug: 'competitors', label: 'Competitors', icon: Swords },
        { slug: 'archives', label: 'Relaunch / Fatigue', icon: Archive },
      ],
    },
  ],
}

const SUBTITLE: Record<Role, string> = {
  admin: 'Admin · Jason',
  creative: 'Creative Team · Faisal',
}

export function WorkspaceSidebar() {
  const role = useRole()
  const base = useRoleBase()
  const centerHref = useCenterHref()
  const pathname = usePathname()
  const { watch, kill, assignments, ktasks } = useStore()

  const counts: Record<string, number> = {
    'watch-list': watch.filter((w) => w.date === TODAY).length,
    'kill-list': kill.filter((k) => k.status === 'pending').length,
    /* What is actually going out, not what is merely finished.

       Read off the assignment board, which is what the Launch Lists page
       itself renders — the badge was counting the creative_launches table, a
       parallel record the page does not show, so it carried rows that were
       nowhere on screen. And it counted the Ready to Launch pool, which is
       work waiting for a day to be picked rather than work being launched.

       `Launching` is the one that means scheduled and going out. */
    'launch-lists': assignments.filter((a) => a.status === 'Launching').length,
    /* Jason's Assignments page holds both boards — Faisal's briefs and his
       own production queue — so his badge counts both. Faisal only ever sees
       his own. */
    assignments:
      assignments.filter((a) => isCreativeWork(a) && a.status !== 'Ad Launched' && a.status !== 'Winner Ad').length +
      (role === 'admin' ? ktasks.filter((t) => t.status !== 'Done').length : 0),
  }

  const groups = NAV[role]
  const allItems = groups.flatMap((g) => g.items)

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 border-b px-4 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">CC</div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-sm font-semibold">Creative Center</span>
            <span className="truncate text-xs text-muted-foreground">{SUBTITLE[role]}</span>
          </div>
          <NotificationBell />
        </div>
        <nav aria-label="Workspace" className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
              {g.items.map((item) => {
                const href = `${base}/${item.slug}`
                const active = pathname === href
                const Icon = item.icon
                const count = counts[item.slug]
                return (
                  <Link
                    key={item.slug}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                      active ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80 hover:bg-muted',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {count ? (
                      <span
                        className={cn(
                          'rounded-full px-1.5 text-[11px] font-medium tabular-nums',
                          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="border-t p-3">
          <SwitchWorkspace href={centerHref('/')} />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex flex-col border-b bg-card md:hidden">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Link href={centerHref('/')} className="flex size-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
            CC
          </Link>
          <span className="flex-1 truncate text-sm font-semibold">{SUBTITLE[role]}</span>
          <NotificationBell />
        </div>
        <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {allItems.map((item) => {
            const href = `${base}/${item.slug}`
            const active = pathname === href
            return (
              <Link
                key={item.slug}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap rounded-md px-2.5 py-1 text-xs',
                  active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
    </>
  )
}

/* Signing out is the only way back to the front door: a plain link there
   would be bounced straight here again by the session that is still open. */
function SwitchWorkspace({ href }: { href: string }) {
  const [busy, setBusy] = useState(false)

  const leave = async () => {
    setBusy(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      /* A full document navigation rather than router.replace: the session
         cookie has just been destroyed and the front door is gated in
         middleware, which a client-side transition does not re-run against
         the new cookie state. */
      window.location.href = href.replace(/\/$/, '') || '/'
    }
  }

  return (
    <button
      type="button"
      onClick={leave}
      disabled={busy}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
    >
      <LogOut className="size-3.5" aria-hidden />
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
