import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { CategoryFigure } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { ChartTooltip } from "./ChartTooltip";
import { toSlices } from "@/lib/chart";

/**
 * Ausgaben nach Kategorie.
 *
 * Ein Kuchendiagramm verträgt keine 20 Scheiben — ab der sechsten Kategorie fasst
 * „Übrige" zusammen (neutral eingefärbt). Die Legende trägt die Werte mit, damit
 * Identität nie nur an der Farbe hängt.
 */
export function CategoryPie({ categories }: { categories: CategoryFigure[] }) {
  const { money, percent } = useHouseholdContext();

  const slices = useMemo(
    () =>
      toSlices(
        categories
          .filter((figure) => figure.flow === "EXPENSE")
          .map((figure) => ({ id: figure.category_id, name: figure.name, value: figure.actual_minor })),
      ),
    [categories],
  );

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (slices.length === 0) {
    return <EmptyState title="Keine Ausgaben" description="In diesem Monat ist noch keine Ausgabe erfasst." />;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Feste Grösse: ein ResponsiveContainer ohne begrenzten Elternteil wächst
          unkontrolliert. Legende darunter statt daneben -- in einer schmalen Spalte
          bliebe neben dem Kreis keine Breite für die Kategorienamen. */}
      <div className="h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={48}
            outerRadius={82}
            paddingAngle={2}
            stroke="hsl(var(--card))"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((slice) => (
              <Cell key={slice.id} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <ChartTooltip
                  title={String(payload[0]?.name ?? "")}
                  rows={[
                    {
                      label: "Anteil",
                      value: `${money(Number(payload[0]?.value ?? 0))} · ${percent(
                        total ? (Number(payload[0]?.value ?? 0) / total) * 100 : null,
                      )}`,
                      color: String(payload[0]?.payload?.color ?? ""),
                    },
                  ]}
                />
              ) : null
            }
          />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="w-full min-w-0 space-y-1 text-sm">
        {slices.map((slice) => (
          <li key={slice.id} className="flex items-baseline gap-2">
            <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: slice.color }} />
            <span className="min-w-0 flex-1 truncate">{slice.name}</span>
            <span className="w-10 shrink-0 whitespace-nowrap text-right tabular text-muted-foreground">
              {percent(total ? (slice.value / total) * 100 : null, 0)}
            </span>
            <span className="w-20 shrink-0 text-right tabular">{money(slice.value, { bare: true })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
