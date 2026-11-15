'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Creative Center button.

   Deliberately NOT components/ui/button. That one is the app's older shadcn
   button — h-10, solid destructive, three sizes. The center was designed
   against a newer scale (h-8 default, tinted destructive, xs/icon-xs/icon-sm)
   and importing the app's would quietly resize every control on every page.

   Built on @radix-ui/react-slot rather than @base-ui/react/button, which this
   app does not carry. Three class families needed translating out of
   Tailwind v4:

     ring-3                         → ring-[3px]
     not-aria-[haspopup]            → [&:not([aria-haspopup])]
     has-data-[icon=…]              → has-[[data-icon=…]]
     rounded-[min(var(--radius-md)…  → the md step spelled out, since 3.4
                                       exposes it through config, not a var

   `in-data-[slot=button-group]:` was dropped: the center ships no button
   group, so the rule could never match.
   ═══════════════════════════════════════════════════════════════════════════ */

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&:active:not([aria-haspopup])]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-1.5 px-2.5 has-[[data-icon=inline-end]]:pr-2 has-[[data-icon=inline-start]]:pl-2',
        xs: "h-6 gap-1 rounded-[min(calc(var(--radius)-2px),10px)] px-2 text-xs has-[[data-icon=inline-end]]:pr-1.5 has-[[data-icon=inline-start]]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(calc(var(--radius)-2px),12px)] px-2.5 text-[0.8rem] has-[[data-icon=inline-end]]:pr-1.5 has-[[data-icon=inline-start]]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-[[data-icon=inline-end]]:pr-2 has-[[data-icon=inline-start]]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(calc(var(--radius)-2px),10px)] [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7 rounded-[min(calc(var(--radius)-2px),12px)]',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
