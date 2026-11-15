'use client'

import * as React from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════════════
   Toasts for the Creative Center.

   Two departures from the original, both forced by where this renders.

   Sonner portals to <body>, which is outside .cc-root — so the palette this
   center scopes to that wrapper is not in scope for the toast. The original
   passed `var(--popover)` through and let the cascade find it; here that
   would resolve to the app's popover, not the center's. The four values are
   therefore written as literals, taken from the same conversion as cc.css.

   `theme` is pinned to light rather than read from next-themes: the center
   ships no dark palette, and the root layout mounts no ThemeProvider for
   useTheme to read.
   ═══════════════════════════════════════════════════════════════════════════ */

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      error: <OctagonXIcon className="size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    style={
      {
        '--normal-bg': '#ffffff',       /* --popover            */
        '--normal-text': '#181b1f',     /* --popover-foreground */
        '--normal-border': '#dcdee2',   /* --border             */
        '--border-radius': '0.625rem',  /* --radius             */
      } as React.CSSProperties
    }
    {...props}
  />
)

export { Toaster }
