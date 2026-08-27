import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Receipt } from "lucide-react";

import { useAccounts, useCategories, useMembers, useTransactions } from "@/api/hooks";
import type { TransactionQuery } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { QuickEntry } from "@/components/transactions/QuickEntry";
import { TransactionFilters, type FilterState } from "@/components/transactions/TransactionFilters";
import { TransactionRow } from "@/components/transactions/TransactionRow";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMonth } from "@/hooks/useMonth";
import { interpolate, t } from "@/i18n";

const PAGE_SIZE = 100;

export function TransactionsPage() {
  const { range, month } = useMonth();
  const { data: categories = [] } = useCategories();
  const { data: members = [] } = useMembers();
  const { data: accounts = [] } = useAccounts();
  const { currency } = useHouseholdContext();
  const [searchParams] = useSearchParams();

  const initial: FilterState = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      q: "",
      categoryIds: [],
      groups: [],
      memberIds: [],
      accountIds: [],
      transfers: null,
    }),
    [range.from, range.to],
  );
  // Die Übersicht verlinkt auf ein einzelnes Konto (?konto=…). Das ist eine
  // Startbelegung des Filters, kein dauerhaft gebundener Zustand.
  const [filters, setFilters] = useState<FilterState>(() => {
    const konto = Number(searchParams.get("konto"));
    return Number.isInteger(konto) && konto > 0 ? { ...initial, accountIds: [konto] } : initial;
  });
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Der Monatswechsel setzt den Zeitraum neu, lässt die übrigen Filter aber stehen.
  const [lastRange, setLastRange] = useState(range);
  if (lastRange.from !== range.from) {
    setLastRange(range);
    setFilters((state) => ({ ...state, from: range.from, to: range.to }));
    setLimit(PAGE_SIZE);
  }

  const query: TransactionQuery = {
    date_from: filters.from || undefined,
    date_to: filters.to || undefined,
    q: filters.q.trim() || undefined,
    category_id: filters.categoryIds.length ? filters.categoryIds : undefined,
    group: filters.groups.length ? filters.groups : undefined,
    member_id: filters.memberIds.length ? filters.memberIds : undefined,
    account_id: filters.accountIds.length ? filters.accountIds : undefined,
    transfers: filters.transfers ?? undefined,
    limit,
    sort: "-date",
  };

  const { data, isLoading, isError, refetch } = useTransactions(query);
  const isFiltered =
    filters.q.trim() !== "" ||
    filters.categoryIds.length > 0 ||
    filters.groups.length > 0 ||
    filters.memberIds.length > 0 ||
    filters.accountIds.length > 0 ||
    filters.transfers !== null ||
    filters.from !== range.from ||
    filters.to !== range.to;

  const balance = (data?.sum_income_minor ?? 0) - (data?.sum_expense_minor ?? 0);
  const showYear = filters.from.slice(0, 7) !== filters.to.slice(0, 7);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-base font-semibold">{t.transactions.title}</h1>
        {data && (
          <p className="text-xs text-muted-foreground tabular">
            {interpolate(t.transactions.showing, {
              count: data.items.length,
              total: data.total,
            })}
          </p>
        )}
      </div>

      <QuickEntry defaultDate={defaultDateFor(month.year, month.month)} />

      <TransactionFilters
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setLimit(PAGE_SIZE);
        }}
        onReset={() => {
          setFilters(initial);
          setLimit(PAGE_SIZE);
        }}
        categories={categories}
        members={members}
        accounts={accounts}
        isFiltered={isFiltered}
      />

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-7 w-full" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            title={t.app.error}
            description="Die Buchungen konnten nicht geladen werden."
            action={
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                {t.app.retry}
              </Button>
            }
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title={isFiltered ? t.transactions.noMatch : t.transactions.empty}
            description={isFiltered ? undefined : t.transactions.emptyHint}
            action={
              isFiltered ? (
                <Button variant="outline" size="sm" onClick={() => setFilters(initial)}>
                  {t.transactions.reset}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[7.5rem]">{t.transactions.date}</TableHead>
                  <TableHead className="w-[8rem] sm:w-[12rem]">{t.transactions.category}</TableHead>
                  <TableHead>{t.transactions.description}</TableHead>
                  <TableHead className="hidden w-[14rem] lg:table-cell">{t.transactions.split}</TableHead>
                  <TableHead className="w-[9rem] text-right">
                    {t.transactions.amount} ({currency})
                  </TableHead>
                  <TableHead className="w-[4.5rem]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    categories={categories}
                    members={members}
                    showYear={showYear}
                    showAccount={accounts.filter((account) => account.is_active).length > 1}
                  />
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="text-xs text-muted-foreground lg:hidden">
                    {t.app.total}
                  </TableCell>
                  <TableCell colSpan={4} className="hidden text-xs text-muted-foreground lg:table-cell">
                    {t.app.total}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={balance} bare className="font-semibold" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>

            {data.total > data.items.length && (
              <div className="border-t p-2 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
                  {t.transactions.loadMore}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Beim Erfassen ist „heute" der richtige Standard — ausser man arbeitet gerade einen
 * vergangenen Monat auf, dann ist es dessen Monatsanfang.
 */
function defaultDateFor(year: number, month: number): string {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() + 1 === month) {
    return `${year}-${String(month).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
