import type { ISODate } from './dates'
import type { Cents } from './money'

/* The Reporting Center's vocabulary.

   Everything here is in integer cents. The rest of the Financial Center
   works in dollars-as-floats, which is why its totals have historically
   drifted a few cents from the sum of their parts; the boundary where
   dollars become cents is the loader, and nothing past it sees a float. */

export interface Firm {
  id: string
  name: string
  slug: string
  archived: boolean
  /** The Meta ad account this firm bills against. Shared between firms. */
  adAccountId: string | null
}

export interface Invoice {
  id: string
  /** "INV - 9" — the code the firm sees. */
  number: string
  firmId: string
  periodStart: ISODate
  periodEnd: ISODate
  invoicedCents: Cents
  /** Cash received against it, which is not revenue until it is earned. */
  receivedCents: Cents | null
  caseCount: number | null
}

/** One firm's advertising on one day. */
export interface AdSpendRecord {
  date: ISODate
  firmId: string
  amountCents: Cents
}

/** One firm's intake cost on one day: hours worked plus commission earned. */
export interface IntakeCostRecord {
  date: ISODate
  firmId: string
  basePayCents: Cents
  commissionCents: Cents
}

export const OPEX_CATEGORIES = [
  'software',
  'creative',
  'administrative',
  'contractor',
  'other',
] as const
export type OpexCategory = (typeof OPEX_CATEGORIES)[number]

export const OPEX_CATEGORY_LABELS: Record<OpexCategory, string> = {
  software: 'Subscriptions & software',
  creative: 'Creative & video editing',
  administrative: 'Administrative',
  contractor: 'Contractor fees',
  other: 'Other operating expenses',
}

export const ALLOCATION_METHODS = ['direct', 'even', 'revenue', 'unallocated'] as const
export type AllocationMethod = (typeof ALLOCATION_METHODS)[number]

export const ALLOCATION_LABELS: Record<AllocationMethod, string> = {
  direct: 'Direct to one firm',
  even: 'Shared — split evenly',
  revenue: 'Shared — by revenue',
  unallocated: 'Company-level (unallocated)',
}

export type Recurrence = 'one_time' | 'monthly'
export type ExpenseStatus = 'posted' | 'pending' | 'void'

export interface OpexExpense {
  id: string
  expenseDate: ISODate
  /** The period the cost covers. A one-time cost covers its own date only. */
  servicePeriodStart: ISODate
  servicePeriodEnd: ISODate
  description: string
  vendor: string
  category: OpexCategory
  amountCents: Cents
  recurrence: Recurrence
  allocationMethod: AllocationMethod
  firmIds: string[]
  status: ExpenseStatus
  notes: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface RevenueTargets {
  daily: Cents
  weekly: Cents
  monthly: Cents
  quarterly: Cents
  annual: Cents
}

export interface TargetsConfig {
  company: RevenueTargets
  firmMonthly: Record<string, Cents>
  updatedAt: string
  updatedBy: string
}

export interface EarnoutConfig {
  agreementReference: string
  deductAdvertising: boolean
  deductIntake: boolean
  eligibleOpexCategories: OpexCategory[]
  deductUnallocatedOpex: boolean
  /** Basis points on the contractual metric — 1000 is 10%. */
  rateBps: number
  updatedAt: string
  updatedBy: string
}

export type Granularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
export type ComparisonMode = 'auto' | 'previous_year' | 'none'
export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'wtd'
  | 'last_week'
  | 'mtd'
  | 'last_month'
  | 'qtd'
  | 'last_quarter'
  | 'ytd'
  | 'last_30'
  | 'last_90'
  | 'last_12m'
  | 'custom'

export interface ReportFilters {
  preset: RangePreset
  start: ISODate
  end: ISODate
  granularity: Granularity
  firmId: string | null
  invoiceId: string | null
  comparison: ComparisonMode
}

/** Everything the calculation layer reads. Assembled by the loader. */
export interface FinanceDataset {
  firms: Firm[]
  invoices: Invoice[]
  adSpend: AdSpendRecord[]
  intakeCosts: IntakeCostRecord[]
  expenses: OpexExpense[]
  targets: TargetsConfig | null
  earnout: EarnoutConfig | null
  dataStart: ISODate
  dataAsOf: ISODate
  /* What could not be loaded, so the page can say so rather than reporting
     a zero as though it were a fact. */
  gaps: {
    /** No operating_expenses table yet — the migration has not been run. */
    opexTableMissing: boolean
    /** No pay rates configured, so base pay cannot be computed. */
    payRatesMissing: boolean
    /** Ad accounts billed by more than one firm; their spend is split by
        invoice day because nothing in the account separates the firms. */
    sharedAdAccounts: number
    /** Meta or Supabase calls that failed outright. */
    errors: string[]
  }
}
