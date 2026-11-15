'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/app/_ui/button'
import { Input } from '@/app/_ui/input'
import { Card, EmptyState, PageBody, PageHeader } from '../../../_components/ui/shell'

/* The do-not-call list.

   Held in component state only: nothing here reaches a server, so a number
   added is gone on reload. That is the page as it was found and it is
   deliberately left that way — making it persist is a behaviour change,
   and this pass is a rebuild of how the dialer looks, not of what it
   does. Said out loud on the page so nobody adds a number and believes
   the list is enforced. */

export default function DNCPage() {
  const [number, setNumber] = useState('')
  const [list, setList] = useState<string[]>([])

  const add = () => {
    const n = number.trim()
    if (!n) return
    setList((l) => [n, ...l])
    setNumber('')
  }

  return (
    <>
      <PageHeader title="DNC List" description="Numbers that must not be dialled" />
      <PageBody className="max-w-xl">
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); add() }}
        >
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="+1 (555) 000-0000"
            aria-label="Number to add"
            className="bg-card font-mono"
          />
          <Button type="submit" disabled={!number.trim()}>
            <Plus aria-hidden /> Add
          </Button>
        </form>

        {list.length === 0 ? (
          <EmptyState title="No numbers on the list">
            Numbers added here are not saved anywhere yet — this list clears on reload.
          </EmptyState>
        ) : (
          <Card>
            {list.map((n, i) => (
              <div key={`${n}-${i}`} className="flex items-center justify-between border-b px-4 py-2.5 last:border-0">
                <span className="font-mono text-sm">{n}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${n}`}
                  onClick={() => setList((l) => l.filter((_, j) => j !== i))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          This list is not yet connected to the dialer — a number added here is not blocked from being
          called.
        </p>
      </PageBody>
    </>
  )
}
