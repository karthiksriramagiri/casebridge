'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/app/creative/_ui/dropdown-menu'
import { useCenterHref, useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { cn } from '@/lib/utils'

export function NotificationBell() {
  const role = useRole()
  const { notifications, markNotificationsRead } = useStore()
  const centerHref = useCenterHref()
  const mine = notifications.filter((n) => n.to === role)
  const unread = mine.filter((n) => !n.read).length

  return (
    <DropdownMenu onOpenChange={(open) => !open && unread && markNotificationsRead(role)}>
      <DropdownMenuTrigger
        render={
          <Button size="icon-sm" variant="ghost" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} />
        }
      >
        <Bell aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
            {unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Notifications</p>
        {mine.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          mine.slice(0, 12).map((n) => (
            <DropdownMenuItem key={n.id} render={<Link href={centerHref(n.href)} />} className="flex items-start gap-2">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} aria-hidden />
              <span className="text-pretty text-sm leading-snug">{n.text}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
