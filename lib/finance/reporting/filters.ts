import {
  addDays,
  addMonths,
  endOfMonth,
  endOfQuarter,
  isValidISODate,
  maxDate,
  minDate,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  type ISODate,
} from './dates'
import type { ComparisonMode, Granularity, RangePreset, ReportFilters, RevenueBasis } from './types'

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  wtd: 'Week to date',
  last_week: 'Last week',
  mtd: 'Month to date',
  last_month: 'Last month',
  qtd: 'Quarter to date',
  last_quarter: 'Last quarter',
  ytd: 'Year to date',
  last_30: 'Last 30 days',
  last_90: 'Last 90 days',
  last_12m: 'Last 12 months',
  custom: 'Custom range',
}

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export const COMPARISON_LABELS: Record<ComparisonMode, string> = {
  auto: 'Previous period (equivalent)',
  previous_year: 'Same period last year',
  none: 'No comparison',
}

const PRESETS = Object.keys(PRESET_LABELS) as RangePreset[]
const GRANULARITIES = Object.keys(GRANULARITY_LABELS) as Granularity[]
const COMPARISONS = Object.keys(COMPARISON_LABELS) as ComparisonMode[]

const DEFAULT_GRANULARITY: Record<RangePreset, Granularity> = {
  today: 'daily',
  yesterday: 'daily',
  wtd: 'daily',
  last_week: 'daily',
  mtd: 'daily',
  last_month: 'daily',
  qtd: 'weekly',
  last_quarter: 'weekly',
  ytd: 'monthly',
  last_30: 'daily',
  last_90: 'weekly',
  last_12m: 'monthly',
  custom: 'daily',
}

export function presetRange(preset: RangePreset, asOf: ISODate): { start: ISODate; end: ISODate } {
  switch (preset) {
    case 'today':
      return { start: asOf, end: asOf }
    case 'yesterday':
      return { start: addDays(asOf, -1), end: addDays(asOf, -1) }
    case 'wtd':
      return { start: startOfWeek(asOf), end: asOf }
    case 'last_week': {
      const s = addDays(startOfWeek(asOf), -7)
      return { start: s, end: addDays(s, 6) }
    }
    case 'mtd':
      return { start: startOfMonth(asOf), end: asOf }
    case 'last_month': {
      const s = addMonths(startOfMonth(asOf), -1)
      return { start: s, end: endOfMonth(s) }
    }
    case 'qtd':
      return { start: startOfQuarter(asOf), end: asOf }
    case 'last_quarter': {
      const s = addMonths(startOfQuarter(asOf), -3)
      return { start: s, end: endOfQuarter(s) }
    }
    case 'ytd':
      return { start: startOfYear(asOf), end: asOf }
    case 'last_30':
      return { start: addDays(asOf, -29), end: asOf }
    case 'last_90':
      return { start: addDays(asOf, -89), end: asOf }
    case 'last_12m':
      return { start: addMonths(addDays(asOf, 1), -12), end: asOf }
    case 'custom':
      return { start: startOfMonth(asOf), end: asOf }
  }
}

type SearchParamsInput = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export function parseFilters(
  params: SearchParamsInput,
  bounds: { dataStart: ISODate; asOf: ISODate },
  overrides: Partial<Pick<ReportFilters, 'firmId' | 'invoiceId'>> = {},
): ReportFilters {
  const presetParam = first(params.range) as RangePreset | undefined
  const preset: RangePreset = presetParam && PRESETS.includes(presetParam) ? presetParam : 'mtd'

  let { start, end } = presetRange(preset, bounds.asOf)
  if (preset === 'custom') {
    const s = first(params.from)
    const e = first(params.to)
    if (isValidISODate(s)) start = s
    if (isValidISODate(e)) end = e
  }
  start = maxDate(start, bounds.dataStart)
  end = minDate(end, bounds.asOf)
  if (start > end) start = end

  const g = first(params.granularity) as Granularity | undefined
  const c = first(params.compare) as ComparisonMode | undefined

  const b = first(params.basis) as RevenueBasis | undefined

  return {
    /* Delivered cases by default. Billing runs ahead of delivery, so the
       invoice basis flatters a month the moment an invoice is raised; the
       cases basis is what the company actually earned that day. */
    basis: b === 'invoiced' || b === 'cases' ? b : 'cases',
    preset,
    start,
    end,
    granularity: g && GRANULARITIES.includes(g) ? g : DEFAULT_GRANULARITY[preset],
    firmId: overrides.firmId !== undefined ? overrides.firmId : first(params.firm) || null,
    invoiceId: overrides.invoiceId !== undefined ? overrides.invoiceId : first(params.invoice) || null,
    comparison: c && COMPARISONS.includes(c) ? c : 'auto',
  }
}

export function filtersToSearchParams(
  f: Partial<ReportFilters>,
  opts: { omitScope?: boolean } = {},
): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.basis) sp.set('basis', f.basis)
  if (f.preset) sp.set('range', f.preset)
  if (f.preset === 'custom') {
    if (f.start) sp.set('from', f.start)
    if (f.end) sp.set('to', f.end)
  }
  if (f.granularity) sp.set('granularity', f.granularity)
  if (f.comparison && f.comparison !== 'auto') sp.set('compare', f.comparison)
  if (!opts.omitScope) {
    if (f.firmId) sp.set('firm', f.firmId)
    if (f.invoiceId) sp.set('invoice', f.invoiceId)
  }
  return sp
}
