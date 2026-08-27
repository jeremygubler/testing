import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { GroupFigure } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { ChartTooltip } from "./ChartTooltip";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { t } from "@/i18n";
import { axisTick, CHART_REFERENCE } from "@/lib/chart";

const IST_COLOR = "var(--chart-1)";

/**
 * Budget gegen Ist je Kategoriegruppe.
 *
 * Zwei Balken je Gruppe: Budget als zurückgenommene Referenz in Grau (ein
 * Referenzwert, keine eigenständige Kategorie), Ist in der ersten Serienfarbe.
 * Eine Achse, keine zweite Skala.
 */
export function GroupBudgetChart({ groups }: { groups: GroupFigure[] }) {
  const { money } = useHouseholdContext();
  // Auf schmalen Schirmen kürzere Beschriftungen, sonst lässt Recharts Ticks weg.
  const narrow = useMediaQuery("(max-width: 640px)");
  const data = groups
    .filter((group) => group.actual_minor !== 0 || group.budget_minor !== 0)
    .map((group) => ({
      key: group.group,
      label: narrow ? t.groupShort[group.group] : t.group[group.group],
      budget: group.budget_minor,
      actual: group.actual_minor,
    }));

  if (data.length === 0) {
    return <EmptyState title="Noch keine Zahlen" description="Sobald Buchungen oder Budgets erfasst sind, erscheint hier der Vergleich." />;
  }

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ background: CHART_REFERENCE }} />
          Budget
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ background: IST_COLOR }} />
          Ist
        </li>
      </ul>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="hsl(var(--chart-grid))" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: narrow ? 10 : 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            tickFormatter={axisTick}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--accent))", opacity: 0.5 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip
                  title={t.group[String(payload[0]?.payload.key) as keyof typeof t.group] ?? String(label)}
                  rows={[
                    { label: "Budget", value: money(Number(payload[0]?.payload.budget ?? 0)), color: CHART_REFERENCE },
                    { label: "Ist", value: money(Number(payload[0]?.payload.actual ?? 0)), color: IST_COLOR },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="budget" fill={CHART_REFERENCE} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="actual" fill={IST_COLOR} radius={[4, 4, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
