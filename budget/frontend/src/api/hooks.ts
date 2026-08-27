import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

import { api, buildQuery } from "./client";
import type {
  Category,
  Household,
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
    ...options,
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
