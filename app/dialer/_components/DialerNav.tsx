'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTheme } from '../_context/theme'
import { useAuth } from '../_context/auth'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
  repOnly?: boolean
}

const PhoneIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
  </svg>
)
const GridIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
)
const BullhornIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
  </svg>
)
const PhoneSlashIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M2.293 2.293a1 1 0 011.414 0L6 4.586V3a1 1 0 012 0v3a1 1 0 01-1 1H4a1 1 0 010-2h1.586L2.293 3.707a1 1 0 010-1.414zM7.978 7.978l3.11 3.11c.02.016.04.033.058.051l4.564 4.564A1 1 0 0114.293 17.12l-1.425-1.426A11.045 11.045 0 012 5.5v-.086a1 1 0 011.707-.707l3.271 3.271zM15 5a1 1 0 011 1v.5a11.04 11.04 0 01-.745 3.96l-1.45-1.45A8.96 8.96 0 0015 6.5V5zM11 3a1 1 0 00-1 1v.586L8.414 3H7a1 1 0 000 2h2a1 1 0 001-1V3z" />
  </svg>
)
const ChartIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
  </svg>
)
const UsersIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
  </svg>
)
const ChatIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" />
  </svg>
)
const SunIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
  </svg>
)
const MoonIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
  </svg>
)
const QueueIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
  </svg>
)

const InboundIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M14.414 7l3.293-3.293a1 1 0 00-1.414-1.414L13 5.586V4a1 1 0 10-2 0v4a1 1 0 001 1h4a1 1 0 100-2h-1.586zM2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
  </svg>
)

const NAV_ITEMS: NavItem[] = [
  { href: '/dialer/agent',            label: 'My Phone',       icon: <PhoneIcon /> },
  { href: '/dialer/inbound',          label: 'Inbound Calls',  icon: <InboundIcon /> },
  { href: '/dialer/leads',            label: 'Leads',          icon: <UsersIcon /> },
  { href: '/dialer/messages',         label: 'Messages',       icon: <ChatIcon /> },
  { href: '/dialer/admin',            label: 'Live Floor',     icon: <GridIcon />,       adminOnly: true },
  { href: '/dialer/admin/queue',      label: 'Queue',      icon: <QueueIcon />,      adminOnly: true },
  { href: '/dialer/admin/reps',       label: 'Users',      icon: <UsersIcon />,      adminOnly: true },
  { href: '/dialer/admin/campaigns',  label: 'Campaigns',  icon: <BullhornIcon />,   adminOnly: true },
  { href: '/dialer/admin/caller-ids', label: 'Caller IDs', icon: <PhoneSlashIcon />, adminOnly: true },
  { href: '/dialer/admin/dnc',        label: 'DNC List',   icon: <PhoneSlashIcon />, adminOnly: true },
  { href: '/dialer/admin/reports',    label: 'Reports',    icon: <ChartIcon />,      adminOnly: true },
]

interface Props {
  role?: 'REP' | 'SUPERVISOR' | 'ADMIN'
}

export function DialerNav({ role = 'ADMIN' }: Props) {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const { name, role: authRole, signOut } = useAuth()
  const isAdmin = role !== 'REP'
  const [unreadSms, setUnreadSms] = useState(0)
  const [ringingCount, setRingingCount] = useState(0)

  useEffect(() => {
    async function checkUnread() {
      try {
        const res  = await fetch('/api/dialer/sms/conversations')
        const data = await res.json()
        setUnreadSms(data.totalUnread ?? 0)
      } catch { /* ignore */ }
    }
    async function checkInbound() {
      try {
        const res  = await fetch('/api/dialer/inbound-calls')
        const data = await res.json()
        setRingingCount((data.ringing ?? []).length)
      } catch { /* ignore */ }
    }
    checkUnread()
    checkInbound()
    const t1 = setInterval(checkUnread, 15_000)
    const t2 = setInterval(checkInbound, 5_000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [])

  return (
    <aside className="flex h-screen w-14 flex-col items-center gap-1 border-r border-gray-200 bg-gray-50 py-4 dark:border-gray-800 dark:bg-gray-950 lg:w-48 lg:items-start lg:px-2">
      {/* Logo */}
      <div className="mb-4 px-2">
        <span className="hidden text-sm lg:block whitespace-nowrap">
          <span className="font-bold text-gray-900 dark:text-white">CaseBridge</span>{' '}
          <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, color: '#C17A4A' }}>Dialer</span>
        </span>
      </div>

      <nav className="flex w-full flex-col gap-0.5">
        {NAV_ITEMS.filter(item => (!item.adminOnly || isAdmin) && (!item.repOnly || !isAdmin)).map(item => {
          const active = pathname === item.href || (item.href !== '/dialer/agent' && item.href !== '/dialer/admin' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <span className="relative shrink-0">
                {item.icon}
                {item.href === '/dialer/messages' && unreadSms > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-500 text-[8px] font-bold text-white">
                    {unreadSms > 9 ? '9+' : unreadSms}
                  </span>
                )}
                {item.href === '/dialer/inbound' && ringingCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500 text-[8px] font-bold text-white animate-pulse">
                    {ringingCount}
                  </span>
                )}
              </span>
              <span className="hidden lg:block">{item.label}</span>
              {item.href === '/dialer/inbound' && ringingCount > 0 && (
                <span className="ml-auto hidden rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse lg:block">
                  {ringingCount}
                </span>
              )}
              {item.href === '/dialer/messages' && unreadSms > 0 && (
                <span className="ml-auto hidden rounded-full bg-cyan-500 px-1.5 py-0.5 text-[10px] font-bold text-white lg:block">
                  {unreadSms}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: theme toggle + user */}
      <div className="mt-auto flex w-full flex-col gap-1">
        <button
          onClick={toggle}
          className="flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="shrink-0">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</span>
          <span className="hidden lg:block">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>

        <div className="flex w-full items-center gap-2 rounded-md px-2 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-gray-700 dark:bg-gray-700 dark:text-white">
            {name ? name.charAt(0).toUpperCase() : 'CB'}
          </div>
          <div className="hidden lg:block min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-900 dark:text-white">{name || 'CB Dialer'}</p>
            <p className="text-xs text-gray-500">{authRole}</p>
          </div>
        </div>

        <button
          onClick={signOut}
          className="flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-red-400"
          title="Sign out"
        >
          <span className="shrink-0">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h7a1 1 0 000-2H4V5h6a1 1 0 000-2H3zm10.293 4.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 11H8a1 1 0 010-2h6.586l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </span>
          <span className="hidden lg:block">Sign out</span>
        </button>
      </div>
    </aside>
  )
}
