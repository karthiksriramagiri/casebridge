'use client'

import { useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { Button } from '@/app/teams/_ui/button'
import { Textarea } from '@/app/teams/_ui/textarea'
import { Card } from '@/app/teams/_components/shared'

/* The announcement box.

   One message, shown at the top of every rep's training dashboard. Posting
   and clearing are the same endpoint, which is why clearing is a button here
   rather than a page of its own. */

export default function AnnouncementForm({ currentContent }: { currentContent: string }) {
  const [content, setContent] = useState(currentContent)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function send(body: Record<string, unknown>, done: string, after?: () => void) {
    setLoading(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/teams/admin/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save the announcement')
      after?.()
      setMessage(done)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-start gap-2.5">
        <Megaphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold tracking-tight">Team announcement</h2>
          <p className="text-xs text-muted-foreground">
            Shown at the top of every rep&rsquo;s training dashboard until you clear it.
          </p>
        </div>
      </div>

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
        placeholder="Write your announcement here…"
        aria-label="Announcement text"
        className="resize-none"
      />

      {message && <p className="text-sm font-medium text-success">{message}</p>}
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <div className="mt-auto flex gap-2">
        <Button
          className="flex-1"
          disabled={loading || !content.trim()}
          onClick={() => send({ content: content.trim() }, 'Announcement posted.')}
        >
          {loading ? 'Posting…' : 'Post announcement'}
        </Button>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => send({ clear: true }, 'Announcement cleared.', () => setContent(''))}
        >
          <X className="size-4" aria-hidden /> Clear
        </Button>
      </div>
    </Card>
  )
}
