import React from "react"
import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";

import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-dm-serif",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Case Bridge | Pre-Qualified MVA Cases for Personal Injury Attorneys",
  description:
    "Case Bridge delivers exclusive, pre-qualified motor vehicle accident cases to personal injury firms. Professional intake screening, live transfers, and full regulatory compliance.",
};

export const viewport: Viewport = {
  themeColor: "#1c2433",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* suppressHydrationWarning covers the class the inline script below adds
       to this element before React hydrates. It is scoped to <html> only, so
       a genuine mismatch anywhere else still surfaces. */
    <html
      lang="en"
      className={`${dmSans.variable} ${dmSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Stamped before first paint so the scroll-reveal styles only take
            effect when there is JavaScript to undo them. Without this the
            initial hidden state would strand every section below the fold
            for anyone whose bundle does not run. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('cb-js')`,
          }}
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
