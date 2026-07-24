'use client'

import { createContext, useContext, useState, useEffect } from 'react'

type Theme = 'dark' | 'light'
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('dialer-theme') as Theme | null
    if (saved) setTheme(saved)
  }, [])

  function toggle() {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      localStorage.setItem('dialer-theme', next)
      return next
    })
  }

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      <div className={theme === 'dark' ? 'dark' : ''} style={{ height: '100%' }}>
        {children}
      </div>
    </ThemeCtx.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeCtx)
}
