/** Typen der REST-API. Alle Geldbeträge sind ganzzahlige Minoreinheiten (Rappen). */

export type Flow = "INCOME" | "EXPENSE";
export type CategoryGroup = "EINKOMMEN" | "FIXKOSTEN" | "VARIABEL" | "SPAREN" | "SCHULDEN";
export type IntervalKind = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type SplitTemplate = "SINGLE" | "EQUAL" | "KEY" | "MANUAL";
export type SettlementBasis = "WEIGHT" | "INCOME";

export const CATEGORY_GROUPS: CategoryGroup[] = [
  "EINKOMMEN",
  "FIXKOSTEN",
  "VARIABEL",
  "SPAREN",
  "SCHULDEN",
];

export interface Household {
  id: number;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  opening_balance_minor: number;
  settlement_basis: SettlementBasis;
}

export interface Member {
  id: number;
  name: string;
  color: string;
  is_active: boolean;
  sort_order: number;
  share_weight: number;
}

export interface Category {
  id: number;
  name: string;
  flow: Flow;
  group: CategoryGroup;
  icon: string | null;
  color: string;
  is_active: boolean;
  sort_order: number;
}

export interface SplitLine {
  member_id: number;
  amount_minor: number;
}

export interface SplitSpec {
  template: SplitTemplate;
  member_id?: number | null;
  lines?: SplitLine[] | null;
}

export interface Transaction {
  id: number;
  date: string;
  category_id: number;
  category_name: string;
  category_group: CategoryGroup;
  category_flow: Flow;
  category_color: string;
  description: string;
  note: string | null;
  amount_minor: number;
  recurring_rule_id: number | null;
  splits: SplitLine[];
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
  sum_income_minor: number;
  sum_expense_minor: number;
}

export interface TransactionInput {
  date: string;
  category_id: number;
  description?: string;
  note?: string | null;
  amount_minor: number;
  split: SplitSpec;
}

export interface TransactionPatch {
  date?: string;
  category_id?: number;
  description?: string;
  note?: string | null;
  amount_minor?: number;
  split?: SplitSpec;
}

export interface TransactionQuery {
  date_from?: string;
  date_to?: string;
  category_id?: number[];
  group?: CategoryGroup[];
  member_id?: number[];
  q?: string;
  recurring_rule_id?: number;
  limit?: number;
  offset?: number;
  sort?: string;
}

export interface Budget {
  id: number;
  category_id: number;
  year: number | null;
  month: number | null;
  amount_minor: number;
  is_default: boolean;
}

export interface BudgetUpsert {
  category_id: number;
  amount_minor: number;
  year?: number | null;
  month?: number | null;
}

export interface CategoryFigure {
  category_id: number;
  name: string;
  group: CategoryGroup;
  flow: Flow;
  color: string;
  actual_minor: number;
  budget_minor: number | null;
  budget_source: "MONTH" | "DEFAULT" | null;
  difference_minor: number | null;
  usage: number | null;
}

export interface GroupFigure {
  group: CategoryGroup;
  actual_minor: number;
  budget_minor: number;
  has_budget: boolean;
}

export interface MemberFigure {
  member_id: number;
  income_minor: number;
  expense_minor: number;
  balance_minor: number;
}

export interface MonthSummary {
  year: number;
  month: number;
  income_minor: number;
  expense_minor: number;
  balance_minor: number;
  balance_excl_savings_minor: number;
  available_minor: number;
  savings_ratio: number | null;
  fixed_cost_ratio: number | null;
  categories: CategoryFigure[];
  groups: GroupFigure[];
  members: MemberFigure[];
}

export interface MemberBalance {
  member_id: number;
  borne_minor: number;
  share_minor: number;
  balance_minor: number;
}

export interface Payment {
  from_member_id: number;
  to_member_id: number;
  amount_minor: number;
}

export interface Settlement {
  basis: SettlementBasis;
  total_expense_minor: number;
  balances: MemberBalance[];
  payments: Payment[];
}

export interface TrendPoint {
  year: number;
  month: number;
  income_minor: number;
  expense_minor: number;
  balance_minor: number;
  savings_minor: number;
}
