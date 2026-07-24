import { ThemeProvider } from './_context/theme'
import { CallProvider } from './_context/call'
import { DialerNav } from './_components/DialerNav'
import { FloatingCallBar } from './_components/FloatingCallBar'

export const metadata = { title: 'CB Dialer' }

export default function DialerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CallProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
          <FloatingCallBar />
          <DialerNav role="ADMIN" />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </CallProvider>
    </ThemeProvider>
  )
}
