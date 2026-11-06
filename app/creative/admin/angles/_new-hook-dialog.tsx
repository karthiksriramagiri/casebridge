'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/creative/_ui/dialog'
import { Button } from '@/app/creative/_ui/button'
import { Input } from '@/app/creative/_ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/creative/_ui/select'
import { ANGLE_FAMILIES } from './_config'

/* Naming a hook.

   A code exists the moment someone types it into an ad name — this is only
   about giving it a name, so the report says "Passenger Angle" instead of
   printing "B13" at the reader. The family and the half (visual or verbal)
   are chosen rather than typed, because the letter has to agree with both and
   a free-text code is the one way to get that wrong. */
export function NewHookDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [family, setFamily] = useState<string>(ANGLE_FAMILIES[0].id)
  const [half, setHalf] = useState<'visual' | 'verbal'>('visual')
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const config = ANGLE_FAMILIES.find((f) => f.id === family) ?? ANGLE_FAMILIES[0]
  const letter = half === 'visual' ? config.visual : config.verbal
  const code = `${letter}${number.replace(/\D/g, '')}`
  const valid = /^[A-L][0-9]{1,3}$/.test(code) && name.trim().length >= 2

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/creative/hooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, name: name.trim() }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error ?? 'Could not save the hook.')
        return
      }
      toast.success(`${code} is now “${name.trim()}”`)
      setNumber('')
      setName('')
      onCreated()
      onOpenChange(false)
    } catch {
      toast.error('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New angle</DialogTitle>
          <DialogDescription>
            Give a hook code a name. It appears in the angle reports straight away, and on every ad
            already carrying the code.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="nh-family">Family</label>
            <Select value={family} onValueChange={(v) => setFamily(v as string)}>
              <SelectTrigger id="nh-family" className="w-full">
                <SelectValue>
                  {(v: string) => {
                    const f = ANGLE_FAMILIES.find((x) => x.id === v)
                    return f ? `${f.id} · ${f.label} (${f.codes})` : v
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ANGLE_FAMILIES.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.id} · {f.label} ({f.codes})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Half of the pair</span>
            <div role="radiogroup" aria-label="Hook half" className="flex overflow-hidden rounded-md border">
              {(['visual', 'verbal'] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={half === h}
                  onClick={() => setHalf(h)}
                  className={
                    half === h
                      ? 'flex-1 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                      : 'flex-1 bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted'
                  }
                >
                  {h === 'visual' ? `Visual · ${config.visual}` : `Verbal · ${config.verbal}`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="nh-number">Number</label>
            <div className="flex items-center gap-2">
              <span className="rounded-md border bg-muted px-2.5 py-1.5 font-mono text-sm">{letter}</span>
              <Input
                id="nh-number"
                value={number}
                inputMode="numeric"
                placeholder="18"
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                → <span className="font-mono font-medium text-foreground">{code || '—'}</span>
              </span>
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="nh-name">What the hook is</label>
            <Input
              id="nh-name"
              value={name}
              placeholder={half === 'visual' ? 'Simulation Crash' : 'Passenger Angle'}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || saving} onClick={save}>
            {saving ? 'Saving…' : `Name ${code || 'hook'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
