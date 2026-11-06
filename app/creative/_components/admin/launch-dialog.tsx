'use client'

import { useState } from 'react'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/creative/_ui/dialog'
import { Input } from '@/app/creative/_ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/creative/_ui/select'
import { DISCLAIMERS, type Assignment, type Disclaimer, type LaunchTags } from '@/app/creative/_lib/types'

export function LaunchDialog({
  assignment,
  onClose,
  onConfirm,
}: {
  assignment: Assignment | null
  onClose: () => void
  onConfirm: (tags: LaunchTags, budget: number) => void
}) {
  const [resize, setResize] = useState(false)
  const [asIs, setAsIs] = useState(false)
  const [disclaimer, setDisclaimer] = useState<Disclaimer | 'none'>('none')
  const [budget, setBudget] = useState('150')

  return (
    <Dialog open={!!assignment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to launch list</DialogTitle>
          <DialogDescription>
            {assignment?.title}
            {assignment?.type === 'New Test Batch'
              ? ' · New test batch — the naming convention is set at launch.'
              : ' · Naming convention is generated automatically.'}
          </DialogDescription>
        </DialogHeader>
        <form
          id="launch-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            onConfirm({ resize, asIs, disclaimer: disclaimer === 'none' ? null : disclaimer }, Number(budget) || 0)
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1 text-sm font-medium">Tags</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={resize} onCheckedChange={(v) => setResize(!!v)} /> Needs resize
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={asIs} onCheckedChange={(v) => setAsIs(!!v)} /> Launch as-is
            </label>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="disclaimer" className="text-sm font-medium">
              Disclaimer
            </label>
            <Select value={disclaimer} onValueChange={(v) => setDisclaimer(v as Disclaimer | 'none')}>
              <SelectTrigger id="disclaimer" className="w-full">
                <SelectValue>{(v: string) => (v === 'none' ? 'No disclaimer' : v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No disclaimer</SelectItem>
                {DISCLAIMERS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="budget" className="text-sm font-medium">
              Daily budget (USD)
            </label>
            <Input id="budget" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="launch-form">
            Push to launch list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
