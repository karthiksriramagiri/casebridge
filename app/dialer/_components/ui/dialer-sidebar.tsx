'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, Megaphone, FileSignature, LayoutGrid, LogOut, MessageSquare,
  Phone, PhoneIncoming, PhoneOff, ListOrdered, Users, CalendarClock,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../../_context/auth'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   The dialer's navigation.

   Grouped rather than listed, the way the Creative Center's is. The old nav
   was thirteen items in one column with no order to them, so "My Phone" —
   the page a rep lives on all day — sat in the same visual rank as the DNC
   list, which is opened twice a month.

   Three groups, in the order the work happens:

     Call      what a rep does: the phone, what is ringing, who to call back
     Work      the records around it: leads, messages, documents
     Manage    the floor and its settings, admin only

   The badges stay. A ringing inbound call and an unread message are the two
   things on this nav that are true *now* rather than whenever the page was
   last opened, and losing them to a redesign would make the redesign a
   downgrade.
   ═══════════════════════════════════════════════════════════════════════════ */

type Item = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean }
type Group = { label: string; items: Item[] }

const GROUPS: Group[] = [
  {
    label: 'Call',
    items: [
      { href: '/dialer/agent', label: 'My Phone', icon: Phone },
      { href: '/dialer/inbound', label: 'Inbound Calls', icon: PhoneIncoming },
      { href: '/dialer/callbacks', label: 'Callbacks', icon: CalendarClock },
    ],
  },
  {
    label: 'Work',
    items: [
      { href: '/dialer/leads', label: 'Leads', icon: Users },
      { href: '/dialer/messages', label: 'Messages', icon: MessageSquare },
      { href: '/dialer/docuseal', label: 'DocuSeal', icon: FileSignature },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/dialer/floor', label: 'Live Floor', icon: LayoutGrid },
      { href: '/dialer/admin', label: 'Admin Floor', icon: LayoutGrid, adminOnly: true },
      { href: '/dialer/admin/queue', label: 'Queue', icon: ListOrdered, adminOnly: true },
      { href: '/dialer/admin/reps', label: 'Users', icon: Users, adminOnly: true },
      { href: '/dialer/admin/campaigns', label: 'Campaigns', icon: Megaphone, adminOnly: true },
      { href: '/dialer/admin/caller-ids', label: 'Caller IDs', icon: Phone, adminOnly: true },
      { href: '/dialer/admin/dnc', label: 'DNC List', icon: PhoneOff, adminOnly: true },
      { href: '/dialer/admin/reports', label: 'Reports', icon: BarChart3, adminOnly: true },
    ],
  },
]

/* Active, without claiming more than it should. "My Phone" and "Admin
   Floor" are prefixes of pages below them, so a plain startsWith marked
   both of them current on half the center. */
function isActive(pathname: string, href: string) {
  if (href === '/dialer/agent' || href === '/dialer/admin') return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

export function DialerSidebar({ role = 'REP' }: { role?: 'REP' | 'SUPERVISOR' | 'ADMIN' }) {
  const pathname = usePathname() || ''
  const { name, role: authRole, signOut } = useAuth()
  const isAdmin = String(role).toUpperCase() === 'ADMIN'
  const [unreadSms, setUnreadSms] = useState(0)
  const [ringing, setRinging] = useState(0)

  /* Two polls on two clocks, as before: a ringing phone is worth five
     seconds, an unread text is not. */
  useEffect(() => {
    const unread = async () => {
      try {
        const d = await fetch('/api/dialer/sms/conversations').then((r) => r.json())
        setUnreadSms(d.totalUnread ?? 0)
      } catch { /* a failed poll is not worth a message */ }
    }
    const inbound = async () => {
      try {
        const d = await fetch('/api/dialer/inbound-calls').then((r) => r.json())
        setRinging((d.ringing ?? []).length)
      } catch { /* same */ }
    }
    unread(); inbound()
    const a = setInterval(unread, 15_000)
    const b = setInterval(inbound, 5_000)
    return () => { clearInterval(a); clearInterval(b) }
  }, [])

  const badgeFor = (href: string) =>
    href === '/dialer/messages' ? unreadSms : href === '/dialer/inbound' ? ringing : 0

  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isAdmin) }))
    .filter((g) => g.items.length > 0)
  const allItems = groups.flatMap((g) => g.items)

  /* Bring the open page into view in the scrolling row.

     The row holds more tabs than a phone is wide, and it always started at
     the left edge — so opening DocuSeal, the last item, showed a nav with
     five other pages on it and no sign of which one you were on. The active
     tab is scrolled to on arrival. */
  const mobileNav = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = mobileNav.current?.querySelector('[data-active]')
    el?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [pathname])

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 border-b px-4 py-3.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            CD
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-sm font-semibold">Dialer</span>
            <span className="truncate text-xs text-muted-foreground">
              {isAdmin ? 'Admin' : 'Rep'} · CaseBridge
            </span>
          </div>
        </div>

        <nav aria-label="Dialer" className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </p>
              {g.items.map((item) => {
                const active = isActive(pathname, item.href)
                const Icon = item.icon
                const count = badgeFor(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                      active ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80 hover:bg-muted',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 text-[11px] font-medium tabular-nums',
                          /* A ringing phone is green and pulses; an unread
                             message is simply there. */
                          item.href === '/dialer/inbound'
                            ? 'dl-live-dot bg-success text-white'
                            : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-1 border-t p-3">
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {name ? name.charAt(0).toUpperCase() : 'CB'}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium">{name || 'CB Dialer'}</p>
              <p className="text-[11px] text-muted-foreground">{authRole}</p>
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

      {/* Narrow screens: the same items as one scrolling row. A rep on a
          phone still needs every page, just not a 240px column of them. */}
      <header className="sticky top-0 z-20 flex flex-col border-b bg-card md:hidden">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
            CD
          </div>
          <span className="flex-1 truncate text-sm font-semibold">Dialer</span>
          <button type="button" onClick={signOut} aria-label="Sign out" className="text-muted-foreground">
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
        <nav
          ref={mobileNav}
          /* Distinct from the sidebar's own nav. Both landmarks were
             labelled "Dialer", which leaves a screen reader announcing the
             same navigation twice with nothing to tell them apart. */
          aria-label="Dialer pages"
          className="flex gap-1 overflow-x-auto px-2 pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {allItems.map((item) => {
            const active = isActive(pathname, item.href)
            const count = badgeFor(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active || undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  /* py-2 rather than py-1: this row is the only navigation on
                     a phone and a 24px-tall link is a miss waiting to happen. */
                  'flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-2 text-xs',
                  active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground',
                )}
              >
                {item.label}
                {count > 0 && (
                  <span className={cn(
                    'rounded-full px-1 text-[10px] font-semibold',
                    item.href === '/dialer/inbound' ? 'bg-success text-white' : 'bg-muted-foreground/20',
                  )}>
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </header>
    </>
  )
}
