'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BadgeDollarSign,
  Award, BadgeCheck, BarChart3, BookOpen, CalendarClock, ClipboardCheck, ClipboardList,
  Clock, FileQuestion, Flame, GraduationCap, Home, LayoutGrid, LogOut, Mic, PhoneOff, Repeat,
  Timer, Trophy, UserPlus, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   The Team Center's navigation.

   Grouped rather than listed, the way the Creative Center's and the Dialer's
   are. What it replaces on each side says why:

   The admin side was thirteen tabs in one scrolling row, in no order, with
   "Team Center" sitting between Timeclock and Urgent Tasks and meaning
   neither. Three of its pages — Completions, Retakes, Response Times — were
   not on it at all and could only be reached by typing the URL.

   The rep side was nine tabs in a row where Home, Pay and a bell icon all
   carried the same visual rank, so the page a rep opens every morning looked
   exactly as important as the one they open twice a month.

   Groups, in the order the work actually happens:

     rep     Today → Training → Performance → Pay
     admin   Floor → People → Measure → Training

   The gating is kept, because it is a real feature and losing it to a
   redesign would make the redesign a downgrade:

     phase < 3        a rep still in Intro or Onboarding does not see
                      Performance, My Cases or Todos
     teamType         a creative sees their own four items and none of the
                      intake training flow
     timeclockEnabled whether this rep clocks in at all

   External destinations (Venu, Nuances, the creative Notion board) stay in
   the nav rather than being dropped — they are where part of the work lives
   — and are marked so they open in a new tab and never read as "current".
   ═══════════════════════════════════════════════════════════════════════════ */

export type TeamsRole = 'rep' | 'admin'

type Item = {
  href: string
  label: string
  icon: LucideIcon
  /** Opens in a new tab and never matches the active path. */
  external?: boolean
  /** Hidden until a rep reaches phase 3 (Active). */
  activeOnly?: boolean
}
type Group = { label: string; items: Item[] }

const ADMIN_GROUPS: Group[] = [
  {
    label: 'Floor',
    items: [
      { href: '/teams/admin', label: 'Overview', icon: LayoutGrid },
      { href: '/teams/admin/urgent-tasks', label: 'Urgent Tasks', icon: Flame },
      { href: '/teams/mia', label: 'MIA Board', icon: PhoneOff },
      { href: '/teams/admin/timeclock', label: 'Timeclock', icon: Clock },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/teams/admin/reps', label: 'Reps', icon: Users },
      { href: '/teams/admin/candidates', label: 'Candidates', icon: UserPlus },
    ],
  },
  {
    label: 'Measure',
    items: [
      { href: '/teams/admin/performance', label: 'Performance', icon: BarChart3 },
      { href: '/teams/admin/response-times', label: 'Response Times', icon: Timer },
      { href: '/teams/admin/team-metrics', label: 'Team Metrics', icon: Trophy },
      { href: '/teams/admin/cases', label: 'Cases', icon: ClipboardList },
      { href: '/teams/admin/commissions', label: 'Commissions', icon: BadgeDollarSign },
    ],
  },
  {
    label: 'Training',
    items: [
      { href: '/teams/admin/programs', label: 'Programs', icon: GraduationCap },
      { href: '/teams/admin/modules', label: 'Modules', icon: BookOpen },
      { href: '/teams/admin/exams', label: 'Exams', icon: FileQuestion },
      { href: '/teams/admin/completions', label: 'Completions', icon: ClipboardCheck },
      { href: '/teams/admin/retakes', label: 'Retakes', icon: Repeat },
      { href: '/venu', label: 'Venu', icon: Mic, external: true },
    ],
  },
]

/* A creative's Team Center is four items: what they are learning, where their
   work is listed, and what they are paid. None of the intake training flow
   applies to them, and showing it was the reason their nav had tabs that
   404'd on their own account. */
const CREATIVE_GROUPS: Group[] = [
  {
    label: 'Work',
    items: [
      { href: '/teams/dashboard', label: 'Training', icon: BookOpen },
      {
        href: 'https://app.notion.com/p/ogeo/Creative-Workspace-34f895255ae980c3a4b6fcb5128f2519?source=copy_link',
        label: 'Todos',
        icon: ClipboardList,
        external: true,
      },
    ],
  },
  {
    label: 'Pay',
    items: [
      { href: '/teams/commissions', label: 'Commissions', icon: Award },
      { href: '/teams/pay', label: 'Pay', icon: Wallet },
    ],
  },
]

function repGroups(timeclockEnabled: boolean): Group[] {
  return [
    {
      label: 'Today',
      items: [
        { href: '/teams/home', label: 'Home', icon: Home },
        { href: '/teams/todos', label: 'Todos', icon: ClipboardList, activeOnly: true },
        { href: '/teams/mia', label: 'MIA Board', icon: PhoneOff },
        { href: '/teams/notifications', label: 'Notifications', icon: BadgeCheck },
        /* Previously unreachable. `timeclockEnabled` was threaded all the way
           through the old shell and then never read, so /teams/timeclock had
           no link anywhere in the center. */
        ...(timeclockEnabled
          ? [{ href: '/teams/timeclock', label: 'Timeclock', icon: Clock } as Item]
          : []),
      ],
    },
    {
      label: 'Training',
      items: [
        { href: '/teams/dashboard', label: 'Training', icon: BookOpen },
        { href: '/teams/exam', label: 'Exams', icon: FileQuestion },
        { href: 'https://case-bridge.com/nuances', label: 'Nuances', icon: BookOpen, external: true },
        { href: '/venu', label: 'Venu', icon: Mic, external: true },
      ],
    },
    {
      label: 'Performance',
      items: [
        { href: '/teams/performance', label: 'Performance', icon: BarChart3, activeOnly: true },
        { href: '/teams/cases', label: 'My Cases', icon: ClipboardList, activeOnly: true },
        { href: '/teams/incentives', label: 'Incentives', icon: Trophy },
      ],
    },
    {
      label: 'Pay',
      items: [
        { href: '/teams/pay', label: 'Pay', icon: Wallet },
        { href: '/teams/commissions', label: 'Commissions', icon: Award },
      ],
    },
  ]
}

/* Active, without claiming more than it should.

   `/teams/admin` and `/teams/dashboard` are prefixes of pages beneath them,
   so a plain startsWith marked Overview current across the whole admin side.
   Those two match exactly; everything else matches itself or a child. */
const EXACT = new Set(['/teams/admin', '/teams/dashboard', '/teams/home'])

function isActive(pathname: string, item: Item) {
  if (item.external) return false
  if (EXACT.has(item.href)) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

export function TeamsSidebar({
  role,
  teamType = 'intake',
  phase = 3,
  timeclockEnabled = false,
  name,
}: {
  role: TeamsRole
  teamType?: string
  /** 1 = Intro, 2 = Onboarding, 3 = Active. */
  phase?: number
  timeclockEnabled?: boolean
  name?: string | null
}) {
  const pathname = usePathname() || ''
  const router = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/teams/login')
  }

  const isCreative = teamType === 'creative'
  const groups = (
    role === 'admin' ? ADMIN_GROUPS : isCreative ? CREATIVE_GROUPS : repGroups(timeclockEnabled)
  )
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.activeOnly || phase >= 3) }))
    .filter((g) => g.items.length > 0)

  const allItems = groups.flatMap((g) => g.items)
  const subtitle =
    role === 'admin' ? 'Training Admin' : isCreative ? 'Creative Team' : 'Intake Team'

  const link = (item: Item, active: boolean) => {
    const Icon = item.icon
    const inner = (
      <>
        <Icon className="size-4" aria-hidden />
        <span className="flex-1">{item.label}</span>
      </>
    )
    const className = cn(
      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
      active ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80 hover:bg-muted',
    )
    return item.external ? (
      <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    ) : (
      <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={className}>
        {inner}
      </Link>
    )
  }

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 border-b px-4 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            TC
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-sm font-semibold">Team Center</span>
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
          </div>
        </div>

        <nav aria-label="Team Center" className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </p>
              {g.items.map((item) => link(item, isActive(pathname, item)))}
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-1 border-t p-3">
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
              {name ? name.charAt(0) : 'CB'}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium">{name || 'CaseBridge'}</p>
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-destructive"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>

      {/* Narrow screens: the same items as one scrolling row. A rep on a phone
          still needs every page, just not a 240px column of them. */}
      <header className="sticky top-0 z-20 flex flex-col border-b bg-card md:hidden">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
            TC
          </div>
          <span className="flex-1 truncate text-sm font-semibold">Team Center</span>
          <button type="button" onClick={signOut} aria-label="Sign out" className="text-muted-foreground">
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
        <nav aria-label="Team Center" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {allItems.map((item) => {
            const active = isActive(pathname, item)
            const className = cn(
              'flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs',
              active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground',
            )
            return item.external ? (
              <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
                {item.label}
              </a>
            ) : (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={className}>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
    </>
  )
}
