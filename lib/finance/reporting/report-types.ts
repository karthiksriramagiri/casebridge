import type { ISODate } from './dates'
import type { Cents } from './money'
import type { EarnoutConfig, Firm, OpexCategory, OpexExpense, ReportFilters, RevenueTargets } from './types'

export interface Metrics {
  /** Whichever basis the report was built on. */
  revenue: Cents
  /** Always both, so a card can show the one it is not built on. */
  invoicedRevenue: Cents
  caseRevenue: Cents
  /** Cases delivered in the window. */
  cases: number
  advertising: Cents
  intake: Cents
  opex: Cents
  totalSpend: Cents
  profit: Cents
  margin: number | null
}

export interface PeriodWindow {
  start: ISODate
  end: ISODate
  label: string
  days: number
  /** Days in the full calendar unit (for partial-period labelling). */
  unitDays: number
  partial: boolean
}

export interface ComparisonInfo {
  label: string
  method: string
  window: PeriodWindow
  /** False when the comparison window falls (partly) before the first available data. */
  dataComplete: boolean
  metrics: Metrics
}

export interface PeriodComparisonRow {
  key: 'dod' | 'wow' | 'mom' | 'qoq' | 'yoy'
  label: string
  current: PeriodWindow
  previous: PeriodWindow
  method: string
  dataComplete: boolean
  currentMetrics: Metrics
  previousMetrics: Metrics
}

export interface TrendPoint extends Metrics {
  key: string
  label: string
  start: ISODate
  end: ISODate
  partial: boolean
}

export interface TargetProgress {
  key: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  label: string
  periodLabel: string
  start: ISODate
  end: ISODate
  actual: Cents
  target: Cents
  attainment: number | null
  remaining: Cents
  elapsedDays: number
  totalDays: number
  expectedToDate: Cents
  paceDelta: Cents
  projected: Cents
  status: 'ahead' | 'on_pace' | 'behind' | 'no_target'
  source: 'configured' | 'derived'
}

export interface FirmRow {
  firmId: string | null
  name: string
  invoiceCount: number
  metrics: Metrics
  previous: Metrics | null
  revenueGrowth: number | null
  profitGrowth: number | null
  target: Cents | null
  targetAttainment: number | null
}

export interface InvoiceRow {
  invoiceId: string | null
  number: string
  firmId: string | null
  firmName: string
  periodStart: ISODate | null
  periodEnd: ISODate | null
  invoicedCents: Cents | null
  receivedCents: Cents | null
  metrics: Metrics
  kind: 'invoice' | 'unattributed' | 'unallocated'
}

export interface ExpenseShare {
  firmId: string | null
  firmName: string
  allocatedCents: Cents
  recognizedInRange: Cents
}

export interface ExpenseRow extends OpexExpense {
  shares: ExpenseShare[]
  recognizedInRange: Cents
  /** Portion relevant to the current firm filter (equals recognizedInRange when unfiltered). */
  recognizedForSelection: Cents
}

export interface EarnoutResult {
  config: EarnoutConfig
  revenue: Cents
  deductions: { label: string; cents: Cents }[]
  metric: Cents
  amount: Cents
}

export interface ReportData {
  meta: {
    calcVersion: string
    generatedAt: string
    dataStart: ISODate
    dataAsOf: ISODate
    /** What could not be loaded. The page says so rather than printing a
        zero that looks like a fact. */
    gaps: {
      opexTableMissing: boolean
      payRatesMissing: boolean
      sharedAdAccounts: number
      errors: string[]
    }
    filters: ReportFilters
    window: PeriodWindow
    scope: 'company' | 'firm' | 'invoice'
    scopeLabel: string
    firms: Firm[]
    invoiceOptions: { id: string; number: string; firmId: string; periodStart: ISODate; periodEnd: ISODate }[]
  }
  current: Metrics
  comparison: ComparisonInfo | null
  targetAttainment: {
    target: Cents | null
    attainment: number | null
    previousAttainment: number | null
  }
  periodComparisons: PeriodComparisonRow[]
  trend: TrendPoint[]
  breakdown: {
    advertising: Cents
    intake: Cents
    opex: Cents
    opexByCategory: Record<OpexCategory, Cents> | null
    allocatedOpex: Cents
    unallocatedOpex: Cents
  }
  targets: { items: TargetProgress[]; configured: RevenueTargets; firmMonthly: Record<string, Cents> } | null
  firms: { rows: FirmRow[]; total: Metrics; reconciled: boolean }
  invoices: { rows: InvoiceRow[]; total: Metrics; reconciled: boolean }
  opex: {
    total: Cents
    previous: Cents | null
    pctChange: number | null
    pctOfRevenue: number | null
    byCategory: Record<OpexCategory, Cents> | null
    allocated: Cents
    unallocated: Cents
    expenses: ExpenseRow[]
  }
  earnout: EarnoutResult | null
}
