import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useTrend } from "@/api/hooks";
import { EmptyState } from "@/components/EmptyState";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { ChartTooltip } from "./ChartTooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { t } from "@/i18n";
import { axisTick } from "@/lib/chart";

/** Drei Serien, eine Achse — alle drei sind Geldbeträge derselben Grössenordnung. */
const SERIES = [
  { key: "income_minor", label: "Einnahmen", color: "var(--chart-1)" },
  { key: "expense_minor", label: "Ausgaben", color: "var(--chart-2)" },
  { key: "balance_minor", label: "Saldo", color: "var(--chart-3)" },
] as const;

const RANGES = [6, 12, 24] as const;

/**
 * Verlauf über mehrere Monate. Das ist die Ansicht, die eine Tabellenkalkulation
 * am schlechtesten kann: nicht der eine Monat, sondern die Richtung.
 */
export function TrendChart({ year, month }: { year: number; month: number }) {
  const [months, setMonths] = useState<number>(12);
  const { money } = useHouseholdContext();
  const narrow = useMediaQuery("(max-width: 640px)");
  const { data = [], isLoading } = useTrend(year, month, months);

  const points = useMemo(() => {
    // Monate vor der ersten Buchung sind keine Nullmonate, sondern Monate ohne Daten.
    // Sie als 0 zu zeichnen behauptete einen Einbruch, den es nie gab.
    const firstWithData = data.findIndex(
      (point) => point.income_minor !== 0 || point.expense_minor !== 0,
    );
    const relevant = firstWithData === -1 ? data : data.slice(firstWithData);
    return relevant.map((point) => ({
      ...point,
      label: `${t.month.short[point.month - 1]}${point.month === 1 || narrow ? ` ${String(point.year).slice(2)}` : ""}`,
    }));
  }, [data, narrow]);

  const hasData = points.some(
    (point) => point.income_minor !== 0 || point.expense_minor !== 0,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {SERIES.map((series) => (
            <li key={series.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: series.color }} />
              {series.label}
            </li>
          ))}
        </ul>
        <Tabs value={String(months)} onValueChange={(value) => setMonths(Number(value))}>
          <TabsList>
            {RANGES.map((range) => (
              <TabsTrigger key={range} value={String(range)}>
                {range} Mt.
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t.app.loading}</p>
      ) : !hasData ? (
        <EmptyState
          title="Noch kein Verlauf"
          description="Sobald in mehreren Monaten Buchungen erfasst sind, zeigt sich hier die Richtung."
        />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--chart-grid))" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={narrow ? 24 : 8}
              tick={{ fontSize: narrow ? 10 : 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              tickFormatter={axisTick}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            {/* Die Nulllinie ist beim Saldo die wichtigste Referenz. */}
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.4} />
            <Tooltip
              cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.3 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    title={String(label)}
                    rows={SERIES.map((series) => ({
                      label: series.label,
                      value: money(Number(payload[0]?.payload?.[series.key] ?? 0)),
                      color: series.color,
                    }))}
                  />
                ) : null
              }
            />
            {SERIES.map((series) => (
              <Line
                key={series.key}
                // Monatssummen sind einzelne Werte, keine stetige Kurve. Eine geglättete
                // Linie erfände Zwischenstände, die es nicht gibt.
                type="linear"
                dataKey={series.key}
                stroke={series.color}
                strokeWidth={2}
                dot={{ r: 3, fill: series.color, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
