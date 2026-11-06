'use client'

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Radix in place of @base-ui/react/select.

   One real behavioural gap had to be closed. Eight call sites render the
   trigger's label through a function:

     <SelectValue>{(v) => (v === 'all' ? 'All campaigns' : v)}</SelectValue>

   base-ui hands the current value to a child function; Radix's Select.Value
   only ever renders the selected item's own text. Rather than rewrite those
   eight sites — the range picker, the campaign filter, every "None" option —
   the value is published on a context here and SelectValue calls the function
   with it. The call sites are unchanged.

   Positioning: the original asked for `alignItemWithTrigger`, the native
   behaviour where the selected row sits over the trigger. Radix spells that
   `position="item-aligned"`, but that mode ignores side/sideOffset and cannot
   match the popup to the trigger's width, which is what `w-(--anchor-width)`
   was for. `position="popper"` keeps the width and the 4px drop, which is how
   these menus actually read on screen.

   Anchor variables renamed to their Radix equivalents:
     --available-height → --radix-select-content-available-height
     --anchor-width     → --radix-select-trigger-width
     --transform-origin → --radix-select-content-transform-origin
   ═══════════════════════════════════════════════════════════════════════════ */

const SelectValueContext = React.createContext<string | undefined>(undefined)

function Select({
  value,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>) {
  return (
    <SelectPrimitive.Root value={value} {...props}>
      <SelectValueContext.Provider value={value}>{children}</SelectValueContext.Provider>
    </SelectPrimitive.Root>
  )
}

const SelectGroup = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Group>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Group
    ref={ref}
    data-slot="select-group"
    className={cn('scroll-my-1 p-1', className)}
    {...props}
  />
))
SelectGroup.displayName = 'SelectGroup'

type SelectValueProps = Omit<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value>,
  'children'
> & {
  /** A node, or a function given the current value — the base-ui signature. */
  children?: React.ReactNode | ((value: string) => React.ReactNode)
}

const SelectValue = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Value>,
  SelectValueProps
>(({ className, children, ...props }, ref) => {
  const value = React.useContext(SelectValueContext)
  const resolved =
    typeof children === 'function' ? (children as (v: string) => React.ReactNode)(value ?? '') : children

  return (
    <SelectPrimitive.Value
      ref={ref}
      data-slot="select-value"
      className={cn('flex flex-1 text-left', className)}
      {...props}
    >
      {resolved}
    </SelectPrimitive.Value>
  )
})
SelectValue.displayName = 'SelectValue'

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { size?: 'sm' | 'default' }
>(({ className, size = 'default', children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    data-slot="select-trigger"
    data-size={size}
    className={cn(
      "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(calc(var(--radius)-2px),10px)] [&>[data-slot=select-value]]:line-clamp-1 [&>[data-slot=select-value]]:flex [&>[data-slot=select-value]]:items-center [&>[data-slot=select-value]]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = 'SelectTrigger'

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, side = 'bottom', sideOffset = 4, align = 'center', alignOffset = 0, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      data-slot="select-content"
      position="popper"
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      className={cn(
        'relative isolate z-50 max-h-[var(--radix-select-content-available-height)] w-[var(--radix-select-trigger-width)] min-w-36 origin-[var(--radix-select-content-transform-origin)] overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className,
      )}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = 'SelectContent'

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    data-slot="select-label"
    className={cn('px-1.5 py-1 text-xs text-muted-foreground', className)}
    {...props}
  />
))
SelectLabel.displayName = 'SelectLabel'

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    data-slot="select-item"
    className={cn(
      "relative mx-1 my-0.5 flex w-[calc(100%-0.5rem)] cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>span:last-child]:flex [&>span:last-child]:items-center [&>span:last-child]:gap-2",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
      {children}
    </SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator asChild>
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <CheckIcon className="pointer-events-none" />
      </span>
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
))
SelectItem.displayName = 'SelectItem'

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    data-slot="select-separator"
    className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
    {...props}
  />
))
SelectSeparator.displayName = 'SelectSeparator'

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    data-slot="select-scroll-up-button"
    className={cn(
      "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
      className,
    )}
    {...props}
  >
    <ChevronUpIcon />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = 'SelectScrollUpButton'

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    data-slot="select-scroll-down-button"
    className={cn(
      "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
      className,
    )}
    {...props}
  >
    <ChevronDownIcon />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = 'SelectScrollDownButton'

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
