'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Paperclip, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/creative/_ui/dialog'
import { Input } from '@/app/creative/_ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/creative/_ui/select'
import { Textarea } from '@/app/creative/_ui/textarea'
import { batchUsage, buildAdsetName, buildCreativeName, CAMPAIGN_TYPES, CREATIVE_OFFERS } from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'
import { TODAY } from '@/app/creative/_lib/data'
import { PriorityStars } from './priority-stars'
import { RequestPicker } from './request-picker'
import {
  ASSIGNMENT_FIRMS, CREATIVE_FORMATS, CREATIVE_TYPES,
  type AssignmentFirm, type AssignmentType, type CreativeFormat,
} from '@/app/creative/_lib/types'

/* ═══════════════════════════════════════════════════════════════════════════
   Briefing a creative.

   The fields here are the ad's name, written before the ad exists:

     0826 | B00090_BNR1 | LHP | BNR | G1 | H4 | GA-WIN
      ^^^^                 ^^^   ^^^  ^^   ^^
     batch                firm  format vis verb

   Which means the hook pickers are not free lists — a Banner cut draws from
   G and H, a Broll cut from A and B. Choosing the format narrows them, so a
   brief cannot ask for a pairing that could never be named.
   ═══════════════════════════════════════════════════════════════════════════ */

type HookTables = { visual: Record<string, string>; verbal: Record<string, string> }

const NONE = '__none'
const byNumber = (a: string, b: string) => (parseInt(a.slice(1), 10) || 0) - (parseInt(b.slice(1), 10) || 0)

export function NewAssignmentDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreate: (a: {
    title: string
    type: AssignmentType
    angle: string
    notes: string
    firm?: AssignmentFirm
    format?: CreativeFormat
    visualCode?: string
    verbalCode?: string
    batch?: string
    adsetName?: string
    creativeName?: string
    offer?: string
    campaignType?: string
    priority?: number
    script?: string
    benchmarkUrl?: string
    benchmarkName?: string
  }) => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<AssignmentType>('New Concept')
  const [firm, setFirm] = useState<AssignmentFirm>(ASSIGNMENT_FIRMS[0])
  const [format, setFormat] = useState<CreativeFormat>('BR')
  const [visualCode, setVisualCode] = useState(NONE)
  const [verbalCode, setVerbalCode] = useState(NONE)
  const [batch, setBatch] = useState('')
  const [offer, setOffer] = useState<string>(CREATIVE_OFFERS[0])
  const [campaignType, setCampaignType] = useState<string>(CAMPAIGN_TYPES[0])
  const [priority, setPriority] = useState(3)
  const [script, setScript] = useState('')
  const [notes, setNotes] = useState('')

  const [hooks, setHooks] = useState<HookTables>({ visual: {}, verbal: {} })
  const [bench, setBench] = useState<{ url: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Hook names come from the same place the angle reports read them, so a
     hook named in the Angles page is offered here without a deploy. */
  useEffect(() => {
    if (!open) return
    let live = true
    fetch('/api/creative/hooks')
      .then((r) => r.json())
      .then((d) => live && setHooks({ visual: d.visual ?? {}, verbal: d.verbal ?? {} }))
      .catch(() => {})
    return () => { live = false }
  }, [open])

  const config = CREATIVE_FORMATS.find((f) => f.code === format) ?? CREATIVE_FORMATS[0]

  const visualOptions = useMemo(
    () => Object.keys(hooks.visual).filter((c) => c.startsWith(config.visual)).sort(byNumber),
    [hooks.visual, config.visual],
  )
  const verbalOptions = useMemo(
    () => Object.keys(hooks.verbal).filter((c) => c.startsWith(config.verbal)).sort(byNumber),
    [hooks.verbal, config.verbal],
  )

  /* A code from the old format is not valid under the new one, and leaving it
     selected would submit a pairing that cannot be named. */
  useEffect(() => {
    setVisualCode((c) => (c !== NONE && !c.startsWith(config.visual) ? NONE : c))
    setVerbalCode((c) => (c !== NONE && !c.startsWith(config.verbal) ? NONE : c))
  }, [config.visual, config.verbal])

  /* The angle is not asked for: it is what the verbal hook already says.
     B13 is "Passenger Angle", B3 is "Never Sue" — a second free-text field
     beside those was offering the raw code as a choice, which is how it came
     to read "B37". The visual hook stands in when only that is set, and an
     unnamed pairing simply leaves it blank rather than inventing one. */
  const derivedAngle =
    (verbalCode !== NONE ? hooks.verbal[verbalCode] : '') ||
    (visualCode !== NONE ? hooks.visual[visualCode] : '') ||
    ''

  async function uploadBenchmark(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/creative/assignments/upload', { method: 'POST', body })
      const d = await res.json()
      if (!res.ok) { setUploadError(d.error ?? 'Upload failed.'); return }
      setBench({ url: d.url, name: d.name })
    } catch {
      setUploadError('Could not reach the server.')
    } finally {
      setUploading(false)
    }
  }

  function reset() {
    setTitle(''); setNotes(''); setBatch('')
    setVisualCode(NONE); setVerbalCode(NONE); setPriority(3)
    setBench(null); setUploadError(null); setScript('')
  }

  /* The name this brief will produce, shown as it is filled in so the shape
     is obvious before anything is built.

     It opens with today's date as MMDD — the first segment of every ad name
     in the account, and the one piece nobody should have to type. Eastern,
     because that is the day the rest of the center is keeping. */
  /* Both names, built from the fields above and from the same inputs, so
     they cannot disagree about the date, the offer or the batch — which is
     what puts a cut in an ad set one segment away from the intended one.

     The firm code in a name is the short form the ad carries (LHP_SP), not
     the long one the form shows (LHP [SPANISH]). */
  const firmCode = firm.replace(' [SPANISH]', '_SP')

  /* The cut number is worked out, not typed.

     Every creative name already in the account and every one already briefed
     is searched for this batch, and the new cut takes the next number after
     the highest. Typing it meant remembering what a batch was up to, and
     being wrong produced two different ads filed under one name. */
  const { creatives, assignments } = useStore()
  const knownNames = useMemo(
    () => [
      ...creatives.map((c) => c.convention || c.name),
      ...assignments.map((a) => a.creativeName ?? a.title),
    ],
    [creatives, assignments],
  )
  const { used, seq } = useMemo(
    () => batchUsage(knownNames, batch, format, firmCode),
    [knownNames, batch, format, firmCode],
  )

  const base = { firm: firmCode, format, offer, campaignType, date: TODAY, seq }

  /* Two readings of the same name. The preview fills the gaps with dots so a
     missing field is visible; what gets saved leaves them out, because a
     literal "··" written into an ad name is worse than a short one. */
  const shown = {
    ...base,
    batch: batch.trim() || '······',
    visualCode: visualCode !== NONE ? visualCode : '··',
    verbalCode: verbalCode !== NONE ? verbalCode : '··',
  }
  const real = {
    ...base,
    batch: batch.trim(),
    visualCode: visualCode !== NONE ? visualCode : undefined,
    verbalCode: verbalCode !== NONE ? verbalCode : undefined,
  }
  const adsetName = buildAdsetName(shown)
  const creativeName = buildCreativeName(shown)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New assignment</DialogTitle>
          <DialogDescription>Assigned to Faisal on the Creative Team board. He gets notified right away.</DialogDescription>
        </DialogHeader>

        <form
          id="new-assignment"
          className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            onCreate({
              title: title.trim(),
              type,
              angle: derivedAngle,
              notes,
              firm,
              format,
              visualCode: visualCode === NONE ? undefined : visualCode,
              verbalCode: verbalCode === NONE ? undefined : verbalCode,
              batch: batch.trim() || undefined,
              offer,
              campaignType,
              adsetName: buildAdsetName(real),
              creativeName: buildCreativeName(real),
              priority,
              script: script.trim() || undefined,
              benchmarkUrl: bench?.url,
              benchmarkName: bench?.name,
            })
            reset()
          }}
        >
          {/* Both names, assembling as the form is filled, each labelled —
              they look alike at a glance and putting a cut in the wrong one
              is the mistake this is here to prevent. */}
          <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-md border bg-card px-3 py-2.5 shadow-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ad set</span>
              <code className="break-all font-mono text-xs">{adsetName}</code>
            </div>
            <div className="flex flex-col gap-0.5 border-t pt-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Creative</span>
              <code className="break-all font-mono text-xs">{creativeName}</code>
            </div>

            {/* A batch that has run before is not an error — a second cut in
                the same batch is normal — but it decides the number on the
                end of the creative name, so it is worth seeing. */}
            {used.length > 0 && (
              <p className="flex items-start gap-1.5 border-t pt-2 text-xs text-warning-foreground">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  Batch <strong>{batch.trim()}</strong> has been used before —{' '}
                  {used.slice(0, 4).join(', ')}
                  {used.length > 4 ? ` and ${used.length - 4} more` : ''}. This cut continues the
                  series as <strong>{creativeName.split('|')[1]?.trim()}</strong>.
                </span>
              </p>
            )}
          </div>

          <Field label="Title" htmlFor="a-title">
            <Input id="a-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          {/* The two segments both names share and nothing else on the form
              supplies. Every live ad set carries them, so a brief without
              them cannot name itself. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Offer" htmlFor="a-offer" hint="The segment both names share.">
              <Select value={offer} onValueChange={setOffer}>
                <SelectTrigger id="a-offer" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CREATIVE_OFFERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Campaign type" htmlFor="a-camp">
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger id="a-camp" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Firm" htmlFor="a-firm">
              <Select value={firm} onValueChange={(v) => setFirm(v as AssignmentFirm)}>
                <SelectTrigger id="a-firm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_FIRMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Creative type" htmlFor="a-format">
              <Select value={format} onValueChange={(v) => setFormat(v as CreativeFormat)}>
                <SelectTrigger id="a-format" className="w-full">
                  <SelectValue>
                    {(v: string) => {
                      const f = CREATIVE_FORMATS.find((x) => x.code === v)
                      return f ? `${f.code} · ${f.label}` : v
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CREATIVE_FORMATS.map((f) => (
                    <SelectItem key={f.code} value={f.code}>{f.code} · {f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={`Visual angle (${config.visual})`}
              htmlFor="a-visual"
              hint={visualOptions.length === 0 ? `No ${config.visual} hooks named yet — add them on the Angles page.` : undefined}
            >
              <Select value={visualCode} onValueChange={(v) => setVisualCode(v as string)}>
                <SelectTrigger id="a-visual" className="w-full">
                  <SelectValue>
                    {(v: string) => (v === NONE ? 'Not set' : `${v} · ${hooks.visual[v] ?? ''}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {visualOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c} · {hooks.visual[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={`Verbal angle (${config.verbal})`}
              htmlFor="a-verbal"
              hint={verbalOptions.length === 0 ? `No ${config.verbal} hooks named yet — add them on the Angles page.` : undefined}
            >
              <Select value={verbalCode} onValueChange={(v) => setVerbalCode(v as string)}>
                <SelectTrigger id="a-verbal" className="w-full">
                  <SelectValue>
                    {(v: string) => (v === NONE ? 'Not set' : `${v} · ${hooks.verbal[v] ?? ''}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {verbalOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c} · {hooks.verbal[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Batch number" htmlFor="a-batch">
              <Input
                id="a-batch"
                value={batch}
                placeholder="0826"
                onChange={(e) => setBatch(e.target.value)}
              />
            </Field>

            <Field label="Assignment type" htmlFor="a-type">
              <Select value={type} onValueChange={(v) => setType(v as AssignmentType)}>
                <SelectTrigger id="a-type" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CREATIVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Priority" hint="Five stars is most urgent. The board puts the highest at the top of its column.">
            <PriorityStars value={priority} onChange={setPriority} />
          </Field>

          <Field label="Benchmark creative" hint="The reference to build against — an image or a video, up to 50MB.">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadBenchmark(f)
                e.target.value = ''
              }}
            />
            {bench ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={bench.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                  {bench.name}
                </a>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove benchmark" onClick={() => setBench(null)}>
                  <X aria-hidden />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <><Loader2 className="animate-spin" aria-hidden /> Uploading…</> : <><Paperclip aria-hidden /> Upload benchmark</>}
              </Button>
            )}
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          </Field>

          <Field label="Request" hint="What is being asked for. Pick as many as apply.">
            <RequestPicker value={script} onChange={setScript} idPrefix="a" />
          </Field>

          <Field label="Brief / notes" htmlFor="a-notes">
            <Textarea id="a-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="new-assignment" disabled={uploading}>Create</Button>
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
