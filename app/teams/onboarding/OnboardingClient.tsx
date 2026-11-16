'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'

// Declare DocuSeal custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'docuseal-form': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        'data-src'?: string
        'data-email'?: string
      }, HTMLElement>
    }
  }
}

interface Props {
  name: string
}

export default function OnboardingClient({ name }: Props) {
  const router = useRouter()
  const called = useRef(false)
  const [signed, setSigned] = useState(false)
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLElement>(null)

  async function markNdaSigned() {
    if (called.current) return
    called.current = true
    setSaving(true)
    setSigned(true)
    try {
      await fetch('/api/teams/onboarding/nda', { method: 'POST' })
    } finally {
      router.push('/teams/home')
    }
  }

  useEffect(() => {
    // postMessage from DocuSeal iframe
    function handleMessage(event: MessageEvent) {
      if (!String(event.origin).includes('docuseal')) return
      const d = event.data
      if (d?.event === 'completed' || d?.type === 'completed' || d === 'completed') {
        markNdaSigned()
      }
    }
    window.addEventListener('message', handleMessage)

    // DocuSeal custom element fires 'completed' on itself (bubbles to document)
    function handleCompleted() { markNdaSigned() }
    document.addEventListener('completed', handleCompleted)

    // Also attach directly to the element once it's in the DOM
    const el = formRef.current
    if (el) el.addEventListener('completed', handleCompleted)

    return () => {
      window.removeEventListener('message', handleMessage)
      document.removeEventListener('completed', handleCompleted)
      if (el) el.removeEventListener('completed', handleCompleted)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="tc-root min-h-dvh bg-muted/40 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="bg-primary rounded-t-xl px-8 py-6 text-center">
          <h1 className="text-2xl font-bold text-primary-foreground tracking-tight">Welcome to CaseBridge Teams</h1>
          <p className="text-primary-foreground/85 text-sm mt-1">Please sign the NDA before accessing the training platform</p>
        </div>

        {/* Content */}
        <div className="bg-card rounded-b-xl shadow-lg border border-t-0 border-border px-8 py-6">
          <h2 className="text-base font-semibold text-foreground mb-1">Sign your Non-Disclosure Agreement</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Hi {name}! Please read and sign the NDA below. You'll be taken to the training portal automatically once complete.
          </p>

          <Script src="https://cdn.docuseal.com/js/form.js" strategy="afterInteractive" />
          <div className="rounded-xl overflow-hidden border border-border bg-muted/40 min-h-[500px]">
            {/* @ts-expect-error ref on custom element */}
            <docuseal-form ref={formRef} data-src="https://docuseal.com/d/j5qpinHAAKXnBz" />
          </div>

          <div className="mt-5 text-center space-y-3">
            {saving ? (
              <p className="text-sm text-primary font-medium">Saving your signature, redirecting...</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  After signing above, click the button below to access the training portal.
                </p>
                <button
                  onClick={markNdaSigned}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
                >
                  I've Signed — Continue →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
