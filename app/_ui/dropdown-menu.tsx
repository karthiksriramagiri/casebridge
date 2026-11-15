'use client'

import * as React from 'react'
import * as MenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Radix in place of @base-ui/react/menu. Drives the notification bell.

   base-ui lets a part borrow another element through `render`:

     <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" />}>
     <DropdownMenuItem render={<Link href={n.href} />}>

   Radix spells the same idea `asChild` with the element as the child. Rather
   than rewrite those call sites, `render` is accepted here and bridged: the
   supplied element is cloned with the part's children inside it, and Radix
   merges its own props (aria-expanded, keyboard handlers, refs) onto it.

   Translations: Popup → Content, data-open/closed → data-[state=…],
   focus: → data-[highlighted]: (Radix tracks menu focus itself rather than
   relying on DOM focus), and the anchor variables renamed to Radix's.
   `not-data-[variant=destructive]:focus:**:…` was dropped — v4-only `**`
   descendant syntax, and no menu in the center uses the destructive variant.
   ═══════════════════════════════════════════════════════════════════════════ */

type RenderProp = { render?: React.ReactElement }

/** Clones `render` with the part's children inside, for Radix's asChild. */
function useRendered(render: React.ReactElement | undefined, children: React.ReactNode) {
  if (render && React.isValidElement(render)) {
    return { asChild: true as const, child: React.cloneElement(render, {}, children) }
  }
  return { asChild: false as const, child: children }
}

const DropdownMenu = ({ ...props }: React.ComponentProps<typeof MenuPrimitive.Root>) => (
  <MenuPrimitive.Root {...props} />
)

const DropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Trigger> & RenderProp
>(({ render, children, ...props }, ref) => {
  const { asChild, child } = useRendered(render, children)
  return (
    <MenuPrimitive.Trigger ref={ref} data-slot="dropdown-menu-trigger" asChild={asChild} {...props}>
      {child}
    </MenuPrimitive.Trigger>
  )
})
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>
>(({ className, align = 'start', alignOffset = 0, side = 'bottom', sideOffset = 4, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Content
      ref={ref}
      data-slot="dropdown-menu-content"
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      className={cn(
        'isolate z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-32 origin-[var(--radix-dropdown-menu-content-transform-origin)] overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:overflow-hidden data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className,
      )}
      {...props}
    />
  </MenuPrimitive.Portal>
))
DropdownMenuContent.displayName = 'DropdownMenuContent'

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> &
    RenderProp & { inset?: boolean; variant?: 'default' | 'destructive' }
>(({ className, inset, variant = 'default', render, children, ...props }, ref) => {
  const { asChild, child } = useRendered(render, children)
  return (
    <MenuPrimitive.Item
      ref={ref}
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      asChild={asChild}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[inset]:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-[highlighted]:bg-destructive/10 data-[variant=destructive]:data-[highlighted]:text-destructive data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:[&>svg]:text-destructive",
        className,
      )}
      {...props}
    >
      {child}
    </MenuPrimitive.Item>
  )
})
DropdownMenuItem.displayName = 'DropdownMenuItem'

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem }
