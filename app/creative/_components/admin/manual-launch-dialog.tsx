'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Paperclip, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/creative/_ui/dialog'
import { Input } from '@/app/creative/_ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/creative/_ui/select'
import {
  batchUsage, buildAdsetName, buildCreativeName, CAMPAIGN_TYPES, CREATIVE_OFFERS, creativeSuffix, nextBatchNumber,
} from '@/app/creative/_lib/metrics'
import { TODAY } from '@/app/creative/_lib/data'
import { cn } from '@/lib/utils'
import { useStore, type ManualLaunchInput } from '@/app/creative/_lib/store'
import {
  AD_SIZES, ASSIGNMENT_FIRMS, CREATIVE_FORMATS, LAUNCH_STATES,
  type AdSize, type AssignmentFirm, type CreativeFormat, type LaunchState,
} from '@/app/creative/_lib/types'

const NONE = '__none'

/* ═══════════════════════════════════════════════════════════════════════════
   Manual launch — a cut going up that never had a brief behind it.

   The old form asked for a free-text name, an angle and a budget, and the
   naming was worked out again by hand at launch. It now collects what the
   launch sheet actually records — batch, format, angle codes, size,
   state-firm, date, budget — and builds both names from them, so a manual
   launch is filed exactly like one that came off the board.

   The batch number is handed out rather than typed: this is a new batch by
   definition, and the one thing nobody can work out from memory is which
   number is free.
   ═══════════════════════════════════════════════════════════════════════════ */

export function ManualLaunchDialog({
  open, onOpenChange, onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreate: (input: ManualLaunchInput) => void
}) {
  const { creatives, assignments } = useStore()

  /* The named hooks, so the angle pickers read "A18 · SMS / Texting" rather
     than a bare code. Same source the assignment form uses. */
  const [hooks, setHooks] = useState<{ visual: Record<string, string>; verbal: Record<string, string> }>({ visual: {}, verbal: {} })
  useEffect(() => {
    if (!open) return
    let live = true
    fetch('/api/creative/hooks', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (live) setHooks({ visual: d.visual ?? {}, verbal: d.verbal ?? {} }) })
      .catch(() => {})
    return () => { live = false }
  }, [open])

  const [firm, setFirm] = useState<AssignmentFirm>(ASSIGNMENT_FIRMS[0])
  const [format, setFormat] = useState<CreativeFormat>('BR')
  const [visualCode, setVisualCode] = useState(NONE)
  const [verbalCode, setVerbalCode] = useState(NONE)
  const [size, setSize] = useState<AdSize>(AD_SIZES[0])
  const [state, setState] = useState<LaunchState>(LAUNCH_STATES[0])
  const [offer, setOffer] = useState<string>(CREATIVE_OFFERS[0])
  const [campaignType, setCampaignType] = useState<string>(CAMPAIGN_TYPES[0])
  const [launchDate, setLaunchDate] = useState(TODAY)
  const [budget, setBudget] = useState('200')
  const [notes, setNotes] = useState('')

  const [batch, setBatch] = useState('')
  const [batchTouched, setBatchTouched] = useState(false)
  const [file, setFile] = useState<{ url: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Every batch the account knows about, live or merely briefed. */
  const knownNames = useMemo(
    () => [
      ...creatives.map((c) => c.convention || c.name),
      ...assignments.map((a) => a.creativeName ?? a.title),
    ],
    [creatives, assignments],
  )
  const firmCode = firm.replace(' [SPANISH]', '_SP')
  const suggestedBatch = useMemo(() => nextBatchNumber(knownNames, firmCode), [knownNames, firmCode])

  /* Offered when the dialog opens and whenever the suggestion moves, unless
     it has been typed over. */
  useEffect(() => { if (!batchTouched) setBatch(suggestedBatch) }, [suggestedBatch, batchTouched])
  useEffect(() => { if (!open) { setBatchTouched(false); setFile(null); setUploadError(null) } }, [open])
  /* Switching firm re-offers: each firm has its own next free number, and
     carrying one firm's suggestion across to another is how the two
     sequences get tangled. A number typed by hand still stands. */
  useEffect(() => { setBatchTouched(false) }, [firm])

  const { used, seq } = batchUsage(knownNames, batch, format, firmCode)
  const config = CREATIVE_FORMATS.find((f) => f.code === format) ?? CREATIVE_FORMATS[0]

  const parts = {
    firm: firmCode,
    format,
    offer,
    campaignType,
    date: launchDate,
    batch: batch.trim(),
    visualCode: visualCode !== NONE ? visualCode : undefined,
    verbalCode: verbalCode !== NONE ? verbalCode : undefined,
    seq,
  }
  const shown = { ...parts, batch: batch.trim() || '······' }
  const adsetName = buildAdsetName(shown)
  const creativeName = buildCreativeName(shown)

  const visualOptions = Object.entries(hooks.visual).filter(([c]) => c.startsWith(config.visual)) as [string, string][]
  const verbalOptions = Object.entries(hooks.verbal).filter(([c]) => c.startsWith(config.verbal)) as [string, string][]

  async function upload(f: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const body = new FormData()
      body.append('file', f)
      const res = await fetch('/api/creative/assignments/upload', { method: 'POST', body })
      const d = await res.json()
      if (!res.ok) { setUploadError(d.error ?? 'Upload failed.'); return }
      setFile({ url: d.url, name: d.name })
    } catch {
      setUploadError('Could not reach the server.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manual launch</DialogTitle>
          <DialogDescription>A cut going up that never had a brief behind it. Goes straight onto today&rsquo;s launch list.</DialogDescription>
        </DialogHeader>

        <form
          id="manual-launch"
          className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto pr-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (!batch.trim()) return
            onCreate({
              name: creativeName,
              angle: [visualCode, verbalCode].filter((v) => v !== NONE).join(' × ') || format,
              isNewTestBatch: true,
              tags: { resize: false, asIs: false, disclaimer: null },
              dailyBudget: Number(budget) || 0,
              firm,
              format,
              visualCode: visualCode === NONE ? undefined : visualCode,
              verbalCode: verbalCode === NONE ? undefined : verbalCode,
              batch: batch.trim(),
              offer,
              campaignType,
              /* Only meaningful for a static image. */
              size: format === 'IMG' ? size : undefined,
              state,
              launchDate,
              adsetName,
              creativeName,
              notes,
              fileUrl: file?.url,
              fileName: file?.name,
            })
          }}
        >
          {/* Both names, pinned so they stay in view as the form is filled. */}
          <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-md border bg-card px-3 py-2.5 shadow-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ad set</span>
              <code className="break-all font-mono text-xs">{adsetName}</code>
            </div>
            <div className="flex flex-col gap-0.5 border-t pt-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Creative</span>
              <code className="break-all font-mono text-xs">{creativeName}</code>
            </div>
          </div>

          <Field label="Creative batch" htmlFor="m-batch">
            <Input
              id="m-batch"
              value={batch}
              onChange={(e) => { setBatchTouched(true); setBatch(e.target.value.toUpperCase()) }}
              className="font-mono"
            />
            {/* A batch this firm has run before is not an error — adding a
                cut to an existing batch is normal — but it decides the
                number on the end of the creative name, so it is worth
                seeing rather than discovering in Ads Manager. */}
            {used.length > 0 ? (
              <p className="flex items-start gap-1.5 text-xs text-warning-foreground">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  {firm} has used <strong>{batch.trim()}</strong> before —{' '}
                  {used.slice(0, 4).join(', ')}
                  {used.length > 4 ? ` and ${used.length - 4} more` : ''}.{' '}
                  {/* A batch can hold an IMG series and a V series at once,
                      so a reused batch does not always mean a continued
                      series — saying "continues" when it is cut 1 of a new
                      series would be wrong. */}
                  {seq > 1 ? 'This cut continues the series as ' : `This starts a new ${creativeSuffix(format)} series in it, as `}
                  <strong>{creativeName.split('|')[1]?.trim()}</strong>.
                </span>
              </p>
            ) : batchTouched ? (
              <p className="text-xs text-muted-foreground">
                New batch for {firm}. Next free is{' '}
                <button
                  type="button"
                  className="font-mono underline underline-offset-2"
                  onClick={() => setBatchTouched(false)}
                >
                  {suggestedBatch}
                </button>
                .
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                The next batch number {firm} has not used. Type over it if you need a different one.
              </p>
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="State – Firm" htmlFor="m-state">
              <div className="flex gap-2">
                <Select value={state} onValueChange={(v) => setState(v as LaunchState)}>
                  <SelectTrigger id="m-state" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LAUNCH_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={firm} onValueChange={(v) => setFirm(v as AssignmentFirm)}>
                  <SelectTrigger className="w-full" aria-label="Firm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_FIRMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </Field>

            <Field label="Ad format" htmlFor="m-format">
              <Select value={format} onValueChange={(v) => { setFormat(v as CreativeFormat); setVisualCode(NONE); setVerbalCode(NONE) }}>
                <SelectTrigger id="m-format" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CREATIVE_FORMATS.map((f) => (
                    <SelectItem key={f.code} value={f.code}>{f.code} · {f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Visual angle (${config.visual})`} htmlFor="m-visual">
              <Select value={visualCode} onValueChange={setVisualCode}>
                <SelectTrigger id="m-visual" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {visualOptions.map(([code, name]) => (
                    <SelectItem key={code} value={code}>{code} · {name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Verbal angle (${config.verbal})`} htmlFor="m-verbal">
              <Select value={verbalCode} onValueChange={setVerbalCode}>
                <SelectTrigger id="m-verbal" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {verbalOptions.map(([code, name]) => (
                    <SelectItem key={code} value={code}>{code} · {name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Ad size is an image question. A video cut is delivered in one
              frame and the field was just another box to tab past. */}
          <div className={cn('grid gap-3', format === 'IMG' ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
            {format === 'IMG' && (
              <Field label="Ad size" htmlFor="m-size">
                <Select value={size} onValueChange={(v) => setSize(v as AdSize)}>
                  <SelectTrigger id="m-size" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AD_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label="Offer" htmlFor="m-offer">
              <Select value={offer} onValueChange={setOffer}>
                <SelectTrigger id="m-offer" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CREATIVE_OFFERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Campaign type" htmlFor="m-camp">
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger id="m-camp" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Launch date" htmlFor="m-date" hint="Drives the date in both names.">
              <Input id="m-date" type="date" value={launchDate} onChange={(e) => e.target.value && setLaunchDate(e.target.value)} />
            </Field>
            <Field label="Daily budget" htmlFor="m-budget" hint="The ABO ad set's budget.">
              <Input id="m-budget" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
          </div>

          <Field label="Creative file" hint="The cut itself — an image or a video, up to 50MB.">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }}
            />
            {file ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove file" onClick={() => setFile(null)}>
                  <X aria-hidden />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <><Loader2 className="animate-spin" aria-hidden /> Uploading…</> : <><Paperclip aria-hidden /> Upload creative</>}
              </Button>
            )}
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          </Field>

          <Field label="Notes" htmlFor="m-notes">
            <Input id="m-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the launcher needs to know" />
          </Field>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="manual-launch" disabled={uploading || !batch.trim()}>Add to launch list</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label, htmlFor, hint, children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
