import { Link } from "react-router-dom";

import { useForecast, useMembers, useMonthSummary, useSettlement } from "@/api/hooks";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { CategoryPie } from "@/components/overview/CategoryPie";
import { GroupBudgetChart } from "@/components/overview/GroupBudgetChart";
import { MemberBreakdown } from "@/components/overview/MemberBreakdown";
import { Outliers } from "@/components/overview/Outliers";
import { StatCard } from "@/components/overview/StatCard";
import { TrendChart } from "@/components/overview/TrendChart";
import { PendingSuggestions } from "@/components/recurring/PendingSuggestions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonth } from "@/hooks/useMonth";
import { t } from "@/i18n";
import { monthLabel } from "@/lib/format";
import { toMonthParam } from "@/lib/date";

export function OverviewPage() {
  const { month } = useMonth();
  const { percent } = useHouseholdContext();
  const { data: summary, isLoading } = useMonthSummary(month.year, month.month);
  const { data: settlement } = useSettlement(month.year, month.month);
  const { data: forecast } = useForecast(month.year, month.month);
  const { data: members = [] } = useMembers();

  if (isLoading && !summary) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[5.5rem]" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const savingsHint =
    summary.savings_ratio === null
      ? "keine Einnahmen erfasst"
      : `Fixkosten ${percent(
          summary.fixed_cost_ratio === null ? null : summary.fixed_cost_ratio * 100,
          0,
        )}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-base font-semibold">
          {t.nav.overview} · <span className="font-normal text-muted-foreground">{monthLabel(month.year, month.month)}</span>
        </h1>
        <div className="flex gap-4">
          <Link
            to={{ pathname: "/jahr", search: `?m=${toMonthParam(month)}` }}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Jahr {month.year}
          </Link>
          <Link
            to={{ pathname: "/buchungen", search: `?m=${toMonthParam(month)}` }}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Alle Buchungen ansehen
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Einnahmen" value={<Money value={summary.income_minor} colored={false} />} />
        <StatCard label="Ausgaben" value={<Money value={summary.expense_minor} colored={false} />} />
        <StatCard
          label="Saldo"
          value={<Money value={summary.balance_minor} />}
          hint={
            <>
              ohne Sparen <Money value={summary.balance_excl_savings_minor} bare colored={false} />
              {" · verfügbar "}
              <Money value={summary.available_minor} bare colored={false} />
              {forecast && forecast.open_count > 0 && (
                <>
                  <br />
                  {/* Die Zahl, die man wirklich wissen will: nicht der Stand jetzt,
                      sondern der Stand am Monatsende. */}
                  erwartet zum Monatsende{" "}
                  <Money value={forecast.projected_balance_minor} bare />
                  {` (${forecast.open_count} offen)`}
                </>
              )}
            </>
          }
        />
        <StatCard
          label="Sparquote"
          value={percent(summary.savings_ratio === null ? null : summary.savings_ratio * 100)}
          hint={savingsHint}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Budget gegen Ist je Gruppe</CardTitle>
          </CardHeader>
          <CardContent>
            <GroupBudgetChart groups={summary.groups} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ausgaben nach Kategorie</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryPie categories={summary.categories} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Verlauf</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart year={month.year} month={month.month} />
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Personen</CardTitle>
          </CardHeader>
          <CardContent>
            <MemberBreakdown members={members} figures={summary.members} settlement={settlement} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offene Vorschläge</CardTitle>
          </CardHeader>
          <CardContent>
            <PendingSuggestions year={month.year} month={month.month} compact />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auffällig diesen Monat</CardTitle>
        </CardHeader>
        <CardContent>
          <Outliers year={month.year} month={month.month} />
        </CardContent>
      </Card>
    </div>
  );
}
