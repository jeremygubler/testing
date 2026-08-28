/** Typen der REST-API. Alle Geldbeträge sind ganzzahlige Minoreinheiten (Rappen). */

export type Flow = "INCOME" | "EXPENSE";
export type CategoryGroup = "EINKOMMEN" | "FIXKOSTEN" | "VARIABEL" | "SPAREN" | "SCHULDEN";
export type IntervalKind = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type SplitTemplate = "SINGLE" | "EQUAL" | "KEY" | "MANUAL";
export type SettlementBasis = "WEIGHT" | "INCOME";
export type AccountKind = "CHECKING" | "SAVINGS" | "CASH" | "CREDIT";

export const ACCOUNT_KINDS: AccountKind[] = ["CHECKING", "SAVINGS", "CASH", "CREDIT"];

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  CHECKING: "Kontokorrent",
  SAVINGS: "Sparkonto",
  CASH: "Bargeld",
  CREDIT: "Kreditkarte",
};

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
  settlement_basis: SettlementBasis;
}

export interface HouseholdCreate {
  name: string;
  currency: string;
  locale: string;
  timezone?: string;
  /** Startsaldo des ersten Kontos, das dabei angelegt wird. */
  opening_balance_minor: number;
  account_name: string;
  member_names: string[];
  with_starter_categories: boolean;
}

export interface Account {
  id: number;
  name: string;
  kind: AccountKind;
  opening_balance_minor: number;
  color: string;
  /** Zaehlt dieses Konto zum frei verfuegbaren Geld? */
  include_in_available: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface AccountInput {
  name: string;
  kind?: AccountKind;
  opening_balance_minor?: number;
  color?: string;
  include_in_available?: boolean;
  sort_order?: number;
}

export interface AccountPatch extends Partial<AccountInput> {
  is_active?: boolean;
}

export interface AccountBalance {
  account_id: number;
  name: string;
  kind: AccountKind;
  color: string;
  include_in_available: boolean;
  is_active: boolean;
  opening_balance_minor: number;
  /** Einnahmen minus Ausgaben auf diesem Konto, ohne Umbuchungen. */
  flow_minor: number;
  /** Zugefuehrt minus abgefuehrt durch Umbuchungen. */
  transfer_minor: number;
  balance_minor: number;
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
  account_id: number;
  account_name: string;
  counter_account_id: number | null;
  counter_account_name: string | null;
  /** Umbuchung zwischen zwei Konten statt Einnahme oder Ausgabe. */
  is_transfer: boolean;
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
  /** Nur die Anzahl — die Belege selbst holt der Dialog einzeln. */
  attachment_count: number;
}

export interface Attachment {
  id: number;
  txn_id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
  /** Ob eine Vorschau existiert. PDFs haben keine. */
  has_thumbnail: boolean;
}

/** Die URL, unter der ein Beleg liegt — der Browser lädt ihn selbst, nicht der Client. */
export const attachmentUrl = (id: number) => `/api/attachments/${id}`;
export const attachmentThumbnailUrl = (id: number) => `/api/attachments/${id}/thumbnail`;

export interface CategorySuggestion {
  category_id: number;
  category_name: string;
  matches: number;
  basis: "EXACT" | "TOKEN";
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
  account_id?: number | null;
  counter_account_id?: number | null;
  description?: string;
  note?: string | null;
  amount_minor: number;
  split: SplitSpec;
}

export interface TransactionPatch {
  date?: string;
  category_id?: number;
  account_id?: number | null;
  counter_account_id?: number | null;
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
  account_id?: number[];
  /** true = nur Umbuchungen, false = keine Umbuchungen, undefined = alle. */
  transfers?: boolean;
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
  /** Der Anteil des Ist, der aus Umbuchungen stammt — fürs Budget zählt er mit,
   *  als Ausgabe gilt er nicht. */
  transfer_minor: number;
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
  /** Was in der Periode auf Sparkonten umgebucht wurde. */
  savings_minor: number;
  /** Frei verfuegbares Geld auf den dafuer vorgesehenen Konten. */
  available_minor: number;
  /** Alle Konten zusammen. */
  net_worth_minor: number;
  savings_ratio: number | null;
  fixed_cost_ratio: number | null;
  accounts: AccountBalance[];
  categories: CategoryFigure[];
  groups: GroupFigure[];
  members: MemberFigure[];
}

export interface MemberBalance {
  member_id: number;
  borne_minor: number;
  share_minor: number;
  /** Netto bereits ausgeglichen: erhaltene minus geleistete Zahlungen. */
  settled_minor: number;
  /** Saldo vor Berücksichtigung der Zahlungen. */
  gross_balance_minor: number;
  /** Was noch offen ist. */
  balance_minor: number;
}

export interface SettlementPayment {
  id: number;
  from_member_id: number;
  to_member_id: number;
  amount_minor: number;
  date: string;
  period_year: number | null;
  period_month: number | null;
  note: string | null;
}

export interface SettlementPaymentInput {
  from_member_id: number;
  to_member_id: number;
  amount_minor: number;
  date: string;
  period_year: number;
  period_month: number;
  note?: string | null;
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
  /** Empfehlungen für das, was noch offen ist. */
  payments: Payment[];
  /** Bereits festgehaltene Zahlungen der Periode. */
  recorded: SettlementPayment[];
}

export interface TrendPoint {
  year: number;
  month: number;
  income_minor: number;
  expense_minor: number;
  balance_minor: number;
  savings_minor: number;
  available_minor: number;
  has_data: boolean;
}

export interface RecurringRule {
  id: number;
  category_id: number;
  category_name: string;
  category_group: CategoryGroup;
  category_color: string;
  description: string;
  amount_minor: number;
  interval: IntervalKind;
  day_of_period: number;
  anchor_month: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  note: string | null;
  split: SplitSpec;
  monthly_estimate_minor: number;
  yearly_estimate_minor: number;
  open_streak: number;
}

export type OccurrenceStatus = "OPEN" | "CONFIRMED" | "SKIPPED";

export interface Occurrence {
  rule_id: number;
  due_date: string;
  status: OccurrenceStatus;
  transaction_id: number | null;
  booked_amount_minor: number | null;
  booked_date: string | null;
  description: string;
  category_id: number;
  category_name: string;
  category_group: CategoryGroup;
  amount_minor: number;
}

export interface ConfirmOccurrence {
  rule_id: number;
  due_date: string;
  date?: string;
  amount_minor?: number;
  description?: string;
  note?: string | null;
  split?: SplitSpec;
}

export interface RecurringRuleInput {
  category_id: number;
  description: string;
  amount_minor: number;
  interval: IntervalKind;
  day_of_period: number;
  anchor_month?: number | null;
  start_date: string;
  end_date?: string | null;
  note?: string | null;
  split: SplitSpec;
}

export interface SavingsGoal {
  id: number;
  name: string;
  target_amount_minor: number;
  target_date: string | null;
  category_id: number;
  category_name: string;
  category_color: string;
  start_date: string | null;
  is_active: boolean;
  saved_minor: number;
  remaining_minor: number;
  progress: number | null;
  monthly_needed_minor: number | null;
  months_left: number | null;
}

export interface SavingsGoalInput {
  name: string;
  target_amount_minor: number;
  target_date?: string | null;
  category_id: number;
  start_date?: string | null;
}

export interface CalendarEntry {
  id: number;
  title: string;
  date: string;
  member_id: number | null;
  note: string | null;
}

export interface CalendarEntryInput {
  title: string;
  date: string;
  member_id?: number | null;
  note?: string | null;
}

export interface ImportRow {
  row_number: number;
  date: string;
  amount: string;
  description?: string;
  note?: string | null;
  category?: string | null;
  member?: string | null;
}

export interface ImportRequest {
  rows: ImportRow[];
  /** Konto, auf das der Auszug gebucht wird. Fehlt es, wird das erste aktive genommen. */
  account_id?: number | null;
  fallback_category_id?: number | null;
  fallback_split?: SplitSpec;
  keep_sign?: boolean;
  guess_categories?: boolean;
}

export interface ImportRowPreview {
  row_number: number;
  date: string | null;
  amount_minor: number | null;
  description: string;
  category_id: number | null;
  category_name: string | null;
  member_id: number | null;
  category_source: "CSV" | "HISTORY" | "FALLBACK" | null;
  is_duplicate: boolean;
  duplicate_transaction_id: number | null;
  error: string | null;
}

export interface ImportPreview {
  rows: ImportRowPreview[];
  total: number;
  importable: number;
  duplicates: number;
  errors: number;
}

export interface ImportResult {
  created: number;
  skipped: number;
}

export interface RestoreResult {
  restored: Record<string, number>;
}

export type ResetScope = "TRANSACTIONS" | "ALL";

export interface ResetResult {
  removed: Record<string, number>;
  household_deleted: boolean;
}

export interface BudgetProposalRow {
  category_id: number;
  name: string;
  group: CategoryGroup;
  current_minor: number | null;
  proposed_minor: number;
  based_on_months: number;
}

export interface BudgetProposal {
  source: "AVERAGE" | "LAST_MONTH";
  rows: BudgetProposalRow[];
}

export interface Forecast {
  year: number;
  month: number;
  expected_income_minor: number;
  expected_expense_minor: number;
  open_count: number;
  projected_balance_minor: number;
  projected_available_minor: number;
}

export interface CategoryComparison {
  category_id: number;
  name: string;
  group: CategoryGroup;
  flow: Flow;
  actual_minor: number;
  average_minor: number;
  delta_minor: number;
  delta_ratio: number | null;
  based_on_months: number;
}

export interface YearSummary {
  year: number;
  months: TrendPoint[];
  income_minor: number;
  expense_minor: number;
  balance_minor: number;
  savings_minor: number;
  savings_ratio: number | null;
  fixed_cost_ratio: number | null;
  groups: GroupFigure[];
  categories: CategoryFigure[];
}
