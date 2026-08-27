import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

import { ApiError, api, buildQuery } from "./client";
import type {
  Budget,
  BudgetUpsert,
  CalendarEntry,
  CalendarEntryInput,
  Category,
  ConfirmOccurrence,
  Household,
  HouseholdCreate,
  MonthSummary,
  Occurrence,
  ImportPreview,
  ImportRequest,
  ImportResult,
  RecurringRule,
  RecurringRuleInput,
  SavingsGoal,
  SavingsGoalInput,
  Settlement,
  TrendPoint,
  Member,
  SplitLine,
  SplitSpec,
  Transaction,
  TransactionInput,
  TransactionPage,
  TransactionPatch,
  TransactionQuery,
} from "./types";

export const queryKeys = {
  household: ["household"] as const,
  members: ["members"] as const,
  categories: ["categories"] as const,
  transactions: (query: TransactionQuery) => ["transactions", query] as const,
  transaction: (id: number) => ["transaction", id] as const,
};

export function useHousehold(options?: Partial<UseQueryOptions<Household>>) {
  return useQuery({
    queryKey: queryKeys.household,
    queryFn: () => api.get<Household>("/household"),
    staleTime: 60_000,
    // 404 heisst "noch nicht eingerichtet" -- daran aendert kein Wiederholen etwas.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
    ...options,
  });
}

export function useCreateHousehold() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HouseholdCreate) => api.post<Household>("/household", input),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useUpdateHousehold() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Household>) => api.patch<Household>("/household", patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.household });
      void client.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useMembers() {
  return useQuery({
    queryKey: queryKeys.members,
    queryFn: () => api.get<Member[]>("/members"),
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.get<Category[]>("/categories"),
    staleTime: 60_000,
  });
}

export function useTransactions(query: TransactionQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactions(query),
    queryFn: () => api.get<TransactionPage>(`/transactions${buildQuery(query as never)}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

/** Nach jeder Buchungsänderung sind Liste und alle Auswertungen veraltet. */
function invalidateTransactionViews(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ["transactions"] });
  void client.invalidateQueries({ queryKey: ["analytics"] });
  void client.invalidateQueries({ queryKey: ["recurring"] });
  void client.invalidateQueries({ queryKey: ["savings"] });
}

export function useCreateTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TransactionInput) => api.post<Transaction>("/transactions", input),
    onSuccess: () => invalidateTransactionViews(client),
  });
}

export function useUpdateTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TransactionPatch }) =>
      api.patch<Transaction>(`/transactions/${id}`, patch),
    onSuccess: () => invalidateTransactionViews(client),
  });
}

export function useDeleteTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/transactions/${id}`),
    onSuccess: () => invalidateTransactionViews(client),
  });
}

export function usePreviewSplit() {
  return useMutation({
    mutationFn: (input: { amount_minor: number; split: SplitSpec }) =>
      api.post<{ lines: SplitLine[]; total_minor: number }>("/transactions/preview-split", input),
  });
}

export function useCreateMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Member>) => api.post<Member>("/members", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.members }),
  });
}

export function useUpdateMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Member> }) =>
      api.patch<Member>(`/members/${id}`, patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.members });
      void client.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useDeactivateMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<Member>(`/members/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.members }),
  });
}

export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Category>) => api.post<Category>("/categories", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}

export function useUpdateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Category> }) =>
      api.patch<Category>(`/categories/${id}`, patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.categories });
      void client.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useDeactivateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<Category>(`/categories/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}

// --------------------------------------------------------------------- Auswertungen

export function useMonthSummary(year: number, month: number) {
  return useQuery({
    queryKey: ["analytics", "summary", year, month],
    queryFn: () => api.get<MonthSummary>(`/analytics/summary${buildQuery({ year, month })}`),
    placeholderData: (previous) => previous,
  });
}

export function useSettlement(year: number, month: number, months = 1) {
  return useQuery({
    queryKey: ["analytics", "settlement", year, month, months],
    queryFn: () => api.get<Settlement>(`/analytics/settlement${buildQuery({ year, month, months })}`),
    placeholderData: (previous) => previous,
  });
}

export function useTrend(year: number, month: number, months = 6) {
  return useQuery({
    queryKey: ["analytics", "trend", year, month, months],
    queryFn: () => api.get<TrendPoint[]>(`/analytics/trend${buildQuery({ year, month, months })}`),
    placeholderData: (previous) => previous,
  });
}

// -------------------------------------------------------------------------- Budgets

export function useBudgets(year?: number, month?: number) {
  return useQuery({
    queryKey: ["budgets", year ?? null, month ?? null],
    queryFn: () => api.get<Budget[]>(`/budgets${buildQuery({ year, month })}`),
  });
}

function invalidateBudgetViews(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ["budgets"] });
  void client.invalidateQueries({ queryKey: ["analytics"] });
}

export function useUpsertBudget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetUpsert) => api.put<Budget>("/budgets", input),
    onSuccess: () => invalidateBudgetViews(client),
  });
}

export function useDeleteBudget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/budgets/${id}`),
    onSuccess: () => invalidateBudgetViews(client),
  });
}

// -------------------------------------------------------------- Wiederkehrend

export function useRecurringRules() {
  return useQuery({
    queryKey: ["recurring", "rules"],
    queryFn: () => api.get<RecurringRule[]>("/recurring"),
  });
}

export function useOccurrences(year: number, month: number, onlyOpen = false) {
  return useQuery({
    queryKey: ["recurring", "occurrences", year, month, onlyOpen],
    queryFn: () =>
      api.get<Occurrence[]>(`/recurring/occurrences${buildQuery({ year, month, only_open: onlyOpen })}`),
    placeholderData: (previous) => previous,
  });
}

function invalidateRecurringViews(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ["recurring"] });
  void client.invalidateQueries({ queryKey: ["transactions"] });
  void client.invalidateQueries({ queryKey: ["analytics"] });
}

export function useCreateRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RecurringRuleInput) => api.post<RecurringRule>("/recurring", input),
    onSuccess: () => invalidateRecurringViews(client),
  });
}

export function useUpdateRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<RecurringRuleInput> & { is_active?: boolean } }) =>
      api.patch<RecurringRule>(`/recurring/${id}`, patch),
    onSuccess: () => invalidateRecurringViews(client),
  });
}

export function useDeactivateRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<RecurringRule>(`/recurring/${id}`),
    onSuccess: () => invalidateRecurringViews(client),
  });
}

export function useConfirmOccurrences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (occurrences: ConfirmOccurrence[]) =>
      api.post<Transaction[]>("/recurring/occurrences/confirm", { occurrences }),
    onSuccess: () => invalidateRecurringViews(client),
  });
}

export function useUnskipOccurrence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ rule_id, due_date }: { rule_id: number; due_date: string }) =>
      api.delete<void>(`/recurring/occurrences/skip${buildQuery({ rule_id, due_date })}`),
    onSuccess: () => invalidateRecurringViews(client),
  });
}

export function useSkipOccurrence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { rule_id: number; due_date: string }) =>
      api.post<void>("/recurring/occurrences/skip", input),
    onSuccess: () => invalidateRecurringViews(client),
  });
}

// ------------------------------------------------------------------- Sparziele

export function useSavingsGoals() {
  return useQuery({
    queryKey: ["savings", "goals"],
    queryFn: () => api.get<SavingsGoal[]>("/savings-goals"),
  });
}

function invalidateSavings(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ["savings"] });
}

export function useCreateSavingsGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SavingsGoalInput) => api.post<SavingsGoal>("/savings-goals", input),
    onSuccess: () => invalidateSavings(client),
  });
}

export function useUpdateSavingsGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<SavingsGoalInput> & { is_active?: boolean } }) =>
      api.patch<SavingsGoal>(`/savings-goals/${id}`, patch),
    onSuccess: () => invalidateSavings(client),
  });
}

export function useDeleteSavingsGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/savings-goals/${id}`),
    onSuccess: () => invalidateSavings(client),
  });
}

// -------------------------------------------------------------------- Kalender

export function useCalendarEntries(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["calendar", dateFrom, dateTo],
    queryFn: () =>
      api.get<CalendarEntry[]>(`/calendar${buildQuery({ date_from: dateFrom, date_to: dateTo })}`),
  });
}

function invalidateCalendar(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ["calendar"] });
}

export function useCreateCalendarEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarEntryInput) => api.post<CalendarEntry>("/calendar", input),
    onSuccess: () => invalidateCalendar(client),
  });
}

export function useDeleteCalendarEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/calendar/${id}`),
    onSuccess: () => invalidateCalendar(client),
  });
}

// --------------------------------------------------------------- Import/Export

export function usePreviewImport() {
  return useMutation({
    mutationFn: (input: ImportRequest) => api.post<ImportPreview>("/io/import/preview", input),
  });
}

export function useCommitImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ input, skipDuplicates }: { input: ImportRequest; skipDuplicates: boolean }) =>
      api.post<ImportResult>(`/io/import${buildQuery({ skip_duplicates: skipDuplicates })}`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["transactions"] });
      void client.invalidateQueries({ queryKey: ["analytics"] });
      void client.invalidateQueries({ queryKey: ["savings"] });
    },
  });
}
