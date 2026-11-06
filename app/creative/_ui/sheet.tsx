'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

import { Button } from './button'

/* ═══════════════════════════════════════════════════════════════════════════
   The side panel behind the creative detail drawer and the assignment brief.

   Radix Dialog with a side, in place of @base-ui/react/dialog. The slide
   needed the most translation: base-ui declares where an element comes from
   and goes to as `data-starting-style` / `data-ending-style`, which Radix
   expresses as state plus tailwindcss-animate keyframes:

     data-[side=right]:data-starting-style:translate-x-[2.5rem]
       → data-[state=open]:slide-in-from-right-10          (10 = 2.5rem)
     data-[side=right]:data-ending-style:translate-x-[2.5rem]
       → data-[state=closed]:slide-out-to-right-10

   `data-side` stays on Content because call sites style against it — the
   assignment sheet widens itself with `data-[side=right]:sm:max-w-xl`.
   ═══════════════════════════════════════════════════════════════════════════ */

const Sheet = ({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) => (
  <SheetPrimitive.Root data-slot="sheet" {...props} />
)

const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    data-slot="sheet-overlay"
    className={cn(
      'cc-portal fixed inset-0 z-50 bg-black/10 duration-150 supports-[backdrop-filter]:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
))
SheetOverlay.displayName = 'SheetOverlay'

const SIDE_CLASSES: Record<'top' | 'right' | 'bottom' | 'left', string> = {
  right:
    'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm data-[state=open]:slide-in-from-right-10 data-[state=closed]:slide-out-to-right-10',
  left:
    'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm data-[state=open]:slide-in-from-left-10 data-[state=closed]:slide-out-to-left-10',
  top: 'inset-x-0 top-0 h-auto border-b data-[state=open]:slide-in-from-top-10 data-[state=closed]:slide-out-to-top-10',
  bottom:
    'inset-x-0 bottom-0 h-auto border-t data-[state=open]:slide-in-from-bottom-10 data-[state=closed]:slide-out-to-bottom-10',
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
    side?: 'top' | 'right' | 'bottom' | 'left'
    showCloseButton?: boolean
  }
>(({ className, children, side = 'right', showCloseButton = true, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      data-slot="sheet-content"
      data-side={side}
      className={cn(
        'cc-portal fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg duration-200 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out',
        SIDE_CLASSES[side],
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <SheetPrimitive.Close asChild data-slot="sheet-close">
          <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3">
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </SheetPrimitive.Close>
      )}
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = 'SheetContent'

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-0.5 p-4', className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn('text-base font-medium text-foreground', className)}
    {...props}
  />
))
SheetTitle.displayName = 'SheetTitle'

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
SheetDescription.displayName = 'SheetDescription'

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
