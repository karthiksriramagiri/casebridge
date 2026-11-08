'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Paperclip, Plus, TriangleAlert, X } from 'lucide-react'
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

  /* A VAR ad set is one ad set holding more than one cut — that is what
     VAR means. The form built exactly one, so a VAR launch had to be
     entered twice and the two halves had no way of agreeing they were the
     same ad set. The second cut lives here: it inherits the ad set (firm,
     format, offer, campaign type, date, batch, budget) and brings only
     what is its own — its angles, its size, its file. */
  type SecondCut = {
    firm: AssignmentFirm
    format: CreativeFormat
    visualCode: string
    verbalCode: string
    size: AdSize
    state: LaunchState
    offer: string
    batch: string
    launchDate: string
    budget: string
    file: { url: string; name: string } | null
    notes: string
  }
  const [extras, setExtras] = useState<SecondCut[]>([])
  const patchExtra = (i: number, p: Partial<SecondCut>) =>
    setExtras((xs) => xs.map((x, n) => (n === i ? { ...x, ...p } : x)))
  const dropExtra = (i: number) => setExtras((xs) => xs.filter((_, n) => n !== i))
  /* Which extra is mid-upload, by index — one shared flag would spin every
     block's button at once. */
  const [uploadingExtra, setUploadingExtra] = useState<number | null>(null)
  const extraFileRefs = useRef<(HTMLInputElement | null)[]>([])

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
  useEffect(() => { if (!open) { setBatchTouched(false); setFile(null); setUploadError(null); setExtras([]) } }, [open])
  /* Leaving VAR drops the second cut: an INV ad set holds one creative, so
     keeping it would file a cut into an ad set that cannot hold it. */
  useEffect(() => { if (campaignType !== 'VAR') setExtras([]) }, [campaignType])
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
  /* Each extra cut's own names, built from its own fields.

     An extra starts as a copy of the one before it, which is what makes
     them one ad set: the ad set name is firm | Broad | format | offer |
     type | date | batch, so they land together only while all of those
     still agree. Changing one on an extra is allowed — it is a real thing
     to want — and its ad set name updates to say so, with a warning when
     it has parted company with the first.

     The cut number is the next in the series while the series is shared:
     V1, V2, V3 … Point an extra at a different batch, format or firm and
     it takes that series' own next number instead. Extras sharing a series
     are numbered by their position so two of them never collide. */
  const visualOptions = Object.entries(hooks.visual).filter(([c]) => c.startsWith(config.visual)) as [string, string][]
  const verbalOptions = Object.entries(hooks.verbal).filter(([c]) => c.startsWith(config.verbal)) as [string, string][]

  const describe = (x: SecondCut, i: number) => {
    const code = x.firm.replace(' [SPANISH]', '_SP')
    const shared = x.batch.trim() === batch.trim() && x.format === format && code === firmCode
    /* How many earlier extras are in this same series — the first shared
       extra is +1 on the lead cut, the second +2, and so on. */
    const ahead = extras.slice(0, i).filter(
      (y) => y.batch.trim() === x.batch.trim() && y.format === x.format && y.firm.replace(' [SPANISH]', '_SP') === code,
    ).length
    const own = batchUsage(knownNames, x.batch, x.format, code)
    const parts = {
      firm: code,
      format: x.format,
      offer: x.offer,
      campaignType,
      date: x.launchDate,
      batch: x.batch.trim() || '······',
      visualCode: x.visualCode !== NONE ? x.visualCode : undefined,
      verbalCode: x.verbalCode !== NONE ? x.verbalCode : undefined,
      seq: (shared ? (seq ?? 1) : (own.seq ?? 1)) + ahead + 1,
    }
    const cfg = CREATIVE_FORMATS.find((f) => f.code === x.format) ?? config
    const set = buildAdsetName(parts)
    return {
      adsetName: set,
      creativeName: buildCreativeName(parts),
      /* Two ad set names means two ad sets, which is not what VAR is for.
         Said out loud rather than discovered in Ads Manager. */
      split: set !== adsetName,
      sameSeries: shared,
      visualOptions: Object.entries(hooks.visual).filter(([c]) => c.startsWith(cfg.visual)) as [string, string][],
      verbalOptions: Object.entries(hooks.verbal).filter(([c]) => c.startsWith(cfg.verbal)) as [string, string][],
      config: cfg,
    }
  }
  const described = extras.map(describe)

  /* A new extra copies the last cut in the set — the one just filled in —
     so adding a third to a VAR set carries the work already done rather
     than starting from the firm's defaults again. */
  const blankExtra = (): SecondCut => {
    const from = extras[extras.length - 1]
    return from
      ? { ...from, visualCode: NONE, verbalCode: NONE, file: null, notes: '' }
      : { firm, format, visualCode: NONE, verbalCode: NONE, size, state, offer, batch, launchDate, budget, file: null, notes: '' }
  }

  async function send(f: File): Promise<{ url: string; name: string } | null> {
    const body = new FormData()
    body.append('file', f)
    const res = await fetch('/api/creative/assignments/upload', { method: 'POST', body })
    const d = await res.json()
    if (!res.ok) { setUploadError(d.error ?? 'Upload failed.'); return null }
    return { url: d.url, name: d.name }
  }

  async function upload(f: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const got = await send(f)
      if (got) setFile(got)
    } catch {
      setUploadError('Could not reach the server.')
    } finally {
      setUploading(false)
    }
  }

  async function uploadExtra(i: number, f: File) {
    setUploadingExtra(i)
    setUploadError(null)
    try {
      const got = await send(f)
      if (got) patchExtra(i, { file: got })
    } catch {
      setUploadError('Could not reach the server.')
    } finally {
      setUploadingExtra(null)
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
            /* The second cut is raised first so the two land on the list in
               the order they were filled in. Every field is its own — only
               the campaign type is inherited, because that is the one thing
               the ad set owns rather than the cut. */
            /* The extras are raised first so the set lands on the list in
               the order it was filled in. Every field is each cut's own —
               only the campaign type is inherited, because that is the one
               thing the ad set owns rather than the cut. */
            extras.forEach((x, i) => {
              const d = described[i]
              onCreate({
                name: d.creativeName,
                angle: [x.visualCode, x.verbalCode].filter((v) => v !== NONE).join(' × ') || x.format,
                isNewTestBatch: true,
                tags: { resize: false, asIs: false, disclaimer: null },
                dailyBudget: Number(x.budget) || 0,
                firm: x.firm,
                format: x.format,
                visualCode: x.visualCode === NONE ? undefined : x.visualCode,
                verbalCode: x.verbalCode === NONE ? undefined : x.verbalCode,
                batch: x.batch.trim(),
                offer: x.offer,
                campaignType,
                size: x.format === 'IMG' ? x.size : undefined,
                state: x.state,
                launchDate: x.launchDate,
                adsetName: d.adsetName,
                creativeName: d.creativeName,
                notes: x.notes,
                fileUrl: x.file?.url,
                fileName: x.file?.name,
              })
            })

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

          {/* ── The second cut, for a VAR ad set ──────────────────────────
              VAR means an ad set holding more than one creative, so the form
              offers the second one here rather than making you open the
              dialog twice and hope the two halves agree on a name. It
              inherits the ad set — firm, format, offer, campaign type, date,
              batch, budget — and is asked only what is its own. The campaign
              type is not repeated: it belongs to the ad set, and asking
              again invites two cuts that disagree about which set they are
              in. */}
          {/* ── The rest of the VAR set ───────────────────────────────────
              VAR means an ad set holding more than one creative — two, three,
              however many are being tested — so the button stays after every
              one you add. Each cut inherits nothing but the campaign type,
              which belongs to the ad set rather than to the cut; everything
              else is its own and starts as a copy of the cut before it. */}
          {campaignType === 'VAR' && (
            <>
              {extras.map((x, i) => {
                const d = described[i]
                return (
                  <section key={i} className="flex flex-col gap-3 rounded-md border border-dashed bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Creative {i + 2}
                        </span>
                        {/* Its own ad set name as well as its creative name.
                            The whole point of VAR is that this matches the
                            one at the top; showing it is how you can tell at
                            a glance that it still does. */}
                        <code className={cn('break-all font-mono text-xs', d.split && 'text-destructive')}>
                          {d.adsetName}
                        </code>
                        <code className="break-all font-mono text-xs">{d.creativeName}</code>
                      </div>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove creative ${i + 2}`} onClick={() => dropExtra(i)}>
                        <X aria-hidden />
                      </Button>
                    </div>

                    {d.split && (
                      <p className="flex items-start gap-1.5 text-xs text-destructive">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        This is a different ad set from the one above, so it will launch separately
                        rather than as part of the same VAR set. Match the firm, format, offer, date
                        and batch to put them back together.
                      </p>
                    )}

                    <Field
                      label="Batch number"
                      htmlFor={`m2-batch-${i}`}
                      hint={d.sameSeries ? 'Same batch as the cut above — this is its next number.' : 'A different batch from the cut above.'}
                    >
                      <Input
                        id={`m2-batch-${i}`}
                        value={x.batch}
                        onChange={(e) => patchExtra(i, { batch: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                        className="font-mono"
                      />
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="State – Firm">
                        <div className="flex gap-2">
                          <Select value={x.state} onValueChange={(v) => patchExtra(i, { state: v as LaunchState })}>
                            <SelectTrigger className="w-full" aria-label="State"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {LAUNCH_STATES.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={x.firm} onValueChange={(v) => patchExtra(i, { firm: v as AssignmentFirm })}>
                            <SelectTrigger className="w-full" aria-label="Firm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ASSIGNMENT_FIRMS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </Field>

                      <Field label="Ad format" htmlFor={`m2-format-${i}`}>
                        <Select
                          value={x.format}
                          /* The angle codes are drawn from the format's own
                             families, so they cannot survive a format change. */
                          onValueChange={(v) => patchExtra(i, { format: v as CreativeFormat, visualCode: NONE, verbalCode: NONE })}
                        >
                          <SelectTrigger id={`m2-format-${i}`} className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CREATIVE_FORMATS.map((f) => (
                              <SelectItem key={f.code} value={f.code}>{f.code} · {f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label={`Visual angle (${d.config.visual})`} htmlFor={`m2-visual-${i}`}>
                        <Select value={x.visualCode} onValueChange={(v) => patchExtra(i, { visualCode: v })}>
                          <SelectTrigger id={`m2-visual-${i}`} className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Not set</SelectItem>
                            {d.visualOptions.map(([code, label]) => (
                              <SelectItem key={code} value={code}>{code} · {label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label={`Verbal angle (${d.config.verbal})`} htmlFor={`m2-verbal-${i}`}>
                        <Select value={x.verbalCode} onValueChange={(v) => patchExtra(i, { verbalCode: v })}>
                          <SelectTrigger id={`m2-verbal-${i}`} className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Not set</SelectItem>
                            {d.verbalOptions.map(([code, label]) => (
                              <SelectItem key={code} value={code}>{code} · {label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      {x.format === 'IMG' && (
                        <Field label="Ad size" htmlFor={`m2-size-${i}`}>
                          <Select value={x.size} onValueChange={(v) => patchExtra(i, { size: v as AdSize })}>
                            <SelectTrigger id={`m2-size-${i}`} className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {AD_SIZES.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}

                      <Field label="Offer" htmlFor={`m2-offer-${i}`}>
                        <Select value={x.offer} onValueChange={(v) => patchExtra(i, { offer: v })}>
                          <SelectTrigger id={`m2-offer-${i}`} className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CREATIVE_OFFERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>

                      {/* No campaign type. It belongs to the ad set, not to
                          the cut, and asking per cut is how the cuts end up
                          disagreeing about which ad set they are in. */}

                      <Field label="Launch date" htmlFor={`m2-date-${i}`} hint="Drives the date in both names.">
                        <Input
                          id={`m2-date-${i}`}
                          type="date"
                          value={x.launchDate}
                          onChange={(e) => e.target.value && patchExtra(i, { launchDate: e.target.value })}
                        />
                      </Field>

                      <Field label="Daily budget" htmlFor={`m2-budget-${i}`} hint="Shared across the set — one ad set, one budget.">
                        <Input
                          id={`m2-budget-${i}`}
                          inputMode="numeric"
                          value={x.budget}
                          onChange={(e) => patchExtra(i, { budget: e.target.value.replace(/[^\d.]/g, '') })}
                        />
                      </Field>
                    </div>

                    <Field label="Creative file" hint="The cut itself — an image or a video, up to 50MB.">
                      <input
                        ref={(el) => { extraFileRefs.current[i] = el }}
                        type="file"
                        accept="image/*,video/*"
                        className="sr-only"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadExtra(i, f); e.target.value = '' }}
                      />
                      {x.file ? (
                        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                          <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{x.file.name}</span>
                          <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove file" onClick={() => patchExtra(i, { file: null })}>
                            <X aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={uploadingExtra === i}
                          onClick={() => extraFileRefs.current[i]?.click()}
                        >
                          {uploadingExtra === i
                            ? <><Loader2 className="animate-spin" aria-hidden /> Uploading…</>
                            : <><Paperclip aria-hidden /> Upload creative</>}
                        </Button>
                      )}
                    </Field>

                    <Field label="Notes" htmlFor={`m2-notes-${i}`}>
                      <Input
                        id={`m2-notes-${i}`}
                        value={x.notes}
                        onChange={(e) => patchExtra(i, { notes: e.target.value })}
                        placeholder="Anything specific to this cut"
                      />
                    </Field>
                  </section>
                )
              })}

              {/* Always offered, however many are already in the set. */}
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => setExtras((xs) => [...xs, blankExtra()])}
              >
                <Plus aria-hidden /> {extras.length === 0 ? 'Add the second creative' : 'Add another creative'}
              </Button>
            </>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="manual-launch" disabled={uploading || uploadingExtra !== null || !batch.trim()}>
            Add {extras.length === 0 ? 'to launch list' : `all ${extras.length + 1} creatives`}
          </Button>
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
