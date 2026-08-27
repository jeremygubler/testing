import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useYearSummary } from "@/api/hooks";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { GroupBadge } from "@/components/GroupBadge";
import { StatCard } from "@/components/overview/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { t } from "@/i18n";
import { toMonthParam } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * Zwölf Monate am Stück. Der Monatskontext der App bleibt gültig — das Jahr ergibt
 * sich aus dem gewählten Monat, und ein Klick auf eine Zeile springt dorthin zurück.
 */
export function YearPage() {
  const { month, setMonth } = useMonth();
  const { percent } = useHouseholdContext();
  const { data, isLoading } = useYearSummary(month.year);

  if (isLoading && !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[5.5rem]" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const recorded = data.months.filter((point) => point.has_data);
  const expenseCategories = data.categories
    .filter((figure) => figure.flow === "EXPENSE" && figure.actual_minor !== 0)
    .sort((a, b) => b.actual_minor - a.actual_minor);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-1 text-base font-semibold">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Vorheriges Jahr"
            onClick={() => setMonth({ ...month, year: month.year - 1 })}
          >
            <ChevronLeft />
          </Button>
          Jahr <span className="tabular">{data.year}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Nächstes Jahr"
            onClick={() => setMonth({ ...month, year: month.year + 1 })}
          >
            <ChevronRight />
          </Button>
        </h1>
        <Link
          to={{ pathname: "/", search: `?m=${toMonthParam(month)}` }}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Zurück zum Monat
        </Link>
      </div>

      {recorded.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            title={`Für ${data.year} ist nichts erfasst`}
            description="Wähle ein anderes Jahr oder erfasse Buchungen."
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Einnahmen" value={<Money value={data.income_minor} colored={false} />} />
            <StatCard label="Ausgaben" value={<Money value={data.expense_minor} colored={false} />} />
            <StatCard
              label="Saldo"
              value={<Money value={data.balance_minor} />}
              hint={`${recorded.length} von 12 Monaten erfasst`}
            />
            <StatCard
              label="Sparquote"
              value={percent(data.savings_ratio === null ? null : data.savings_ratio * 100)}
              hint={
                <>
                  gespart <Money value={data.savings_minor} bare colored={false} /> · Fixkosten{" "}
                  {percent(data.fixed_cost_ratio === null ? null : data.fixed_cost_ratio * 100, 0)}
                </>
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Monate</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Monat</TableHead>
                    <TableHead className="text-right">Einnahmen</TableHead>
                    <TableHead className="text-right">Ausgaben</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Gespart</TableHead>
                    <TableHead className="pr-4 text-right">Verfügbar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.months.map((point) => (
                    <TableRow
                      key={point.month}
                      className={cn("cursor-pointer", !point.has_data && "text-muted-foreground")}
                      onClick={() => setMonth({ year: point.year, month: point.month })}
                    >
                      <TableCell className="pl-4">{t.month.names[point.month - 1]}</TableCell>
                      {point.has_data ? (
                        <>
                          <TableCell className="text-right">
                            <Money value={point.income_minor} bare colored={false} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Money value={point.expense_minor} bare colored={false} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Money value={point.balance_minor} bare className="font-medium" />
                          </TableCell>
                          <TableCell className="hidden text-right sm:table-cell">
                            <Money value={point.savings_minor} bare colored={false} />
                          </TableCell>
                        </>
                      ) : (
                        /* Ein Monat ohne Buchungen ist kein Monat mit Nullen. */
                        <TableCell colSpan={4} className="text-center text-xs">
                          nichts erfasst
                        </TableCell>
                      )}
                      <TableCell className="pr-4 text-right">
                        <Money value={point.available_minor} bare colored={false} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="pl-4 text-xs text-muted-foreground">{t.app.total}</TableCell>
                    <TableCell className="text-right">
                      <Money value={data.income_minor} bare colored={false} className="font-semibold" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={data.expense_minor} bare colored={false} className="font-semibold" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={data.balance_minor} bare className="font-semibold" />
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      <Money value={data.savings_minor} bare colored={false} className="font-semibold" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Nach Gruppe</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {data.groups
                  .filter((group) => group.actual_minor !== 0)
                  .map((group) => (
                    <div key={group.group} className="flex items-baseline gap-2 text-sm">
                      <GroupBadge group={group.group} />
                      <span className="flex-1" />
                      <Money value={group.actual_minor} bare colored={false} />
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Grösste Ausgabenkategorien</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {expenseCategories.slice(0, 10).map((figure) => (
                    <li key={figure.category_id} className="flex items-baseline gap-2">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 self-center rounded-full"
                        style={{ backgroundColor: figure.color }}
                      />
                      <span className="min-w-0 flex-1 truncate">{figure.name}</span>
                      <span className="tabular text-muted-foreground">
                        {percent(
                          data.expense_minor
                            ? (figure.actual_minor / data.expense_minor) * 100
                            : null,
                          0,
                        )}
                      </span>
                      <Money
                        value={figure.actual_minor}
                        bare
                        colored={false}
                        className="w-24 shrink-0 text-right"
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
