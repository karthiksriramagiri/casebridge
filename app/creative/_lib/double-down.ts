/* ═══════════════════════════════════════════════════════════════════════════
   What a double down is called, and what the brief says.

   Two pages raise one: Winner Analysis, where winners are read off ad set
   CPL, and Creative Analysis, where the same ad is read off the breakdown
   table. The decision is identical and so is the work — but the two had
   grown different implementations, and only one of them was finished.

   Winner Analysis wrote the full brief: the next free cut number, the ad set
   re-dated to the day it goes up, the firm, format, batch and both hook
   codes carried off the winning name, and all three lines of notes. Creative
   Analysis wrote a stub — a title reading `Double Down – <id> <angle>` and
   nothing else — so a cut raised there reached Faisal with none of the
   fields he needed and a name that was not a name.

   The fix is not a second copy that looks the same. It is this: one place
   that builds a double down, which both pages call.
   ═══════════════════════════════════════════════════════════════════════════ */

import { batchUsage, parseCreativeName, withAdsetDate, withCreativeDate, withCreativeSeq } from './metrics'
import { assigneeOf, type AssignmentFirm, type CreativeFormat } from './types'
import type { Creative } from './types'

/* Back to the long firm spelling the board's own fields use — the ad name
   carries LHP_SP, the form carries LHP [SPANISH], and the two have to meet
   somewhere or the Spanish boards split in two. */
const FIRM_FROM_CODE: Record<string, AssignmentFirm> = {
  LHP: 'LHP', LHP_SP: 'LHP [SPANISH]', JM: 'JM', JM_SP: 'JM [SPANISH]',
}

/* Every creative name in play — live in the account and already briefed.

   The next cut number is read off the whole batch, not off the cut being
   doubled. An ad set holding IMG1 and IMG2 produced IMG2 again when you
   doubled down off IMG1, because stepping from the source ignores what the
   batch has already used. Same rule the new-assignment form applies when
   you type a batch number. */
export function knownCreativeNames(
  creatives: { convention?: string; name: string }[],
  assignments: { creativeName?: string; title: string }[],
): string[] {
  return [
    ...creatives.map((c) => c.convention || c.name),
    ...assignments.map((a) => a.creativeName ?? a.title),
  ]
}

/** What this cut's next double down will be called. `taken` holds names
 *  claimed earlier in the same click, so sending a whole ad set numbers its
 *  cuts in sequence instead of giving them all the same one. */
export function nextDoubleDownName(
  c: Creative,
  launchDay: string,
  knownNames: string[],
  taken: string[] = [],
): string {
  const from = c.convention || c.name
  const src = parseCreativeName(from)
  /* Scoped to the winner's own firm — another firm's B000123 is a different
     batch that happens to share a number. */
  const { seq } = batchUsage([...knownNames, ...taken], src.batch ?? '', src.format ?? '', src.firm ?? '')
  return withCreativeDate(withCreativeSeq(from, seq), launchDay)
}

/** The ad set the new cut runs in — the winner's own, stamped with the day
 *  it will actually go up. A double down runs in the same ad set, so the
 *  name is copied rather than rebuilt: a new one would create a second. */
export function doubleDownAdset(c: Creative, launchDay: string): string {
  return withAdsetDate(c.adset, launchDay)
}

/* The brief itself.

   Everything the winning cut was built from, carried over: a double down is
   the same idea made again — same batch, same hooks, same ad set. Leaving
   those blank means retyping them off the old ad name, which is both the
   tedious part and the part that goes wrong. Offer and campaign type come
   off the ad set, which is the one that is definitely live. */
export function buildDoubleDown(c: Creative, launchDay: string, creativeName: string) {
  const from = c.convention || c.name
  const src = parseCreativeName(from)
  const setParts = c.adset.split('|').map((x) => x.trim())
  const adsetName = doubleDownAdset(c, launchDay)

  return {
    title: `[DD] ${creativeName}`,
    type: 'Double Down' as const,
    angle: c.angle,
    sourceCreativeId: c.id,
    firm: FIRM_FROM_CODE[src.firm ?? ''] ?? undefined,
    /* A double down runs in the winner's own ad set, so it is always the
       winner's account. Carried so the brief lands on the right one of the
       two Jacoby & Meyers boards. */
    account: c.account,
    format: (src.format as CreativeFormat) ?? undefined,
    batch: src.batch,
    visualCode: src.visualCode,
    verbalCode: src.verbalCode,
    offer: setParts[3] ?? src.offer,
    campaignType: setParts[4],
    /* Both names on the brief itself, not only in the prose — they are what
       the finished cut gets filed under. */
    adsetName,
    creativeName,
    notes: [
      `Ad set: ${adsetName}`,
      `New creative name: ${creativeName}`,
      `Doubling down on: ${from}  (${c.adset})`,
    ].join('\n'),
  }
}

/* Who it went to.

   An image double down is Jason's own work — saying it went to Faisal was
   the page telling him something that was not true, and the card was not on
   Faisal's board either. */
export function doubleDownTarget(c: Creative): string {
  const format = parseCreativeName(c.convention || c.name).format as CreativeFormat
  return assigneeOf({ type: 'Double Down', format }) === 'admin' ? 'your queue' : 'Faisal'
}

/** One click, however many cuts: names numbered in sequence, briefs built. */
export function buildDoubleDowns(list: Creative[], launchDay: string, knownNames: string[]) {
  const taken: string[] = []
  return list.map((c) => {
    const creativeName = nextDoubleDownName(c, launchDay, knownNames, taken)
    taken.push(creativeName)
    return { creative: c, creativeName, assignment: buildDoubleDown(c, launchDay, creativeName) }
  })
}
