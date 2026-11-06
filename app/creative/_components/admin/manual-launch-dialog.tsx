'use client'

import { useState } from 'react'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/creative/_ui/dialog'
import { Input } from '@/app/creative/_ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/creative/_ui/select'
import { bumpConvention } from '@/app/creative/_lib/metrics'
import { useStore, type ManualLaunchInput } from '@/app/creative/_lib/store'
import { DISCLAIMERS, type Disclaimer } from '@/app/creative/_lib/types'

const NONE = '__none'

export function ManualLaunchDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreate: (input: ManualLaunchInput) => void
}) {
  const { creatives, angles } = useStore()
  const [name, setName] = useState('')
  const [angle, setAngle] = useState('')
  /* Angles are read off live ad names, so there is no fixed first option to
     seed the field with — it settles on the first one the accounts actually
     run as soon as the load lands. */
  const effAngle = angle || angles[0] || ''
  const [source, setSource] = useState(NONE)
  const [isNewTestBatch, setIsNewTestBatch] = useState(false)
  const [resize, setResize] = useState(false)
  const [asIs, setAsIs] = useState(false)
  const [disclaimer, setDisclaimer] = useState<Disclaimer | typeof NONE>(NONE)
  const [budget, setBudget] = useState('100')

  const src = creatives.find((c) => c.id === source)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manual launch request</DialogTitle>
          <DialogDescription>For anything outside the assignment board. Goes straight to the launch list.</DialogDescription>
        </DialogHeader>
        <form
          id="manual-launch"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            onCreate({
              name: name.trim(),
              angle: src?.angle ?? effAngle,
              sourceCreativeId: src?.id,
              isNewTestBatch,
              tags: { resize, asIs, disclaimer: disclaimer === NONE ? null : disclaimer },
              dailyBudget: Number(budget) || 0,
            })
            setName('')
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ml-name" className="text-sm font-medium">
              Name
            </label>
            <Input id="ml-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ml-source" className="text-sm font-medium">
                Based on existing creative
              </label>
              <Select value={source} onValueChange={(v) => setSource(v as string)}>
                <SelectTrigger id="ml-source" className="w-full">
                  <SelectValue>{(v: string) => (v === NONE ? 'None — new creative' : v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None — new creative</SelectItem>
                  {creatives.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.id} · {c.angle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ml-angle" className="text-sm font-medium">
                Angle
              </label>
              <Select value={src?.angle ?? effAngle} disabled={!!src} onValueChange={(v) => setAngle(v as string)}>
                <SelectTrigger id="ml-angle" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {angles.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {src && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Naming will bump to <code className="font-mono text-foreground">{bumpConvention(src.convention)}</code>
            </p>
          )}
          <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
            <legend className="mb-2 text-sm font-medium">Tags</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={resize} onCheckedChange={(v) => setResize(!!v)} /> Resize
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={asIs} onCheckedChange={(v) => setAsIs(!!v)} /> As-is
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isNewTestBatch} onCheckedChange={(v) => setIsNewTestBatch(!!v)} /> New test batch
            </label>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ml-disc" className="text-sm font-medium">
                Disclaimer
              </label>
              <Select value={disclaimer} onValueChange={(v) => setDisclaimer(v as Disclaimer)}>
                <SelectTrigger id="ml-disc" className="w-full">
                  <SelectValue>{(v: string) => (v === NONE ? 'None' : v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {DISCLAIMERS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ml-budget" className="text-sm font-medium">
                Daily budget ($)
              </label>
              <Input id="ml-budget" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="manual-launch">
            Add to launch list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
