import { useMemo } from "react";
import { ArrowUpRight, ScanEye } from "lucide-react";

import { useComparison } from "@/api/hooks";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";

/** Ab hier lohnt sich der Hinweis — darunter ist es Rauschen. */
const MIN_RATIO = 0.25;
const MIN_ABSOLUTE_MINOR = 5000; // 50.–
const MAX_ROWS = 5;

/**
 * Kategorien, die deutlich über ihrem eigenen Schnitt liegen.
 *
 * Nicht jede Abweichung ist eine Nachricht. Es braucht sowohl einen spürbaren Anteil
 * als auch einen spürbaren Betrag, sonst meldet die Karte jeden Kaffee als Ausreisser.
 *
 * Nach unten wird bewusst nicht gemeldet: Ein Jahresabo, das elf Monate lang nicht
 * anfällt, stünde sonst jeden Monat mit „−100 %" da — richtig gerechnet und trotzdem
 * ohne jeden Wert. Handeln muss man, wenn etwas mehr kostet als sonst.
 */
export function Outliers({ year, month }: { year: number; month: number }) {
  const { percent } = useHouseholdContext();
  const { data = [], isLoading } = useComparison(year, month, 6);

  const rows = useMemo(
    () =>
      data
        .filter(
          (row) =>
            row.flow === "EXPENSE" &&
            row.delta_ratio !== null &&
            row.delta_ratio >= MIN_RATIO &&
            row.delta_minor >= MIN_ABSOLUTE_MINOR,
        )
        .sort((a, b) => b.delta_minor - a.delta_minor)
        .slice(0, MAX_ROWS),
    [data],
  );

  const months = data[0]?.based_on_months ?? 0;

  if (isLoading && data.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Wird geladen …</p>;
  }

  if (months < 2) {
    return (
      <EmptyState
        icon={<ScanEye />}
        title="Noch kein Vergleich"
        description="Ab dem zweiten erfassten Monat vergleicht die App jede Kategorie mit ihrem eigenen Schnitt."
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ScanEye />}
        title="Nichts Auffälliges"
        description={`Keine Kategorie liegt deutlich über ihrem Schnitt der letzten ${months} erfassten Monate.`}
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Über dem Schnitt der letzten {months} erfassten Monate.
      </p>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          return (
            <li key={row.category_id} className="flex items-baseline gap-2 text-sm">
              <ArrowUpRight className="size-3.5 shrink-0 self-center text-destructive" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="shrink-0 tabular text-destructive">
                +{percent(row.delta_ratio === null ? null : row.delta_ratio * 100, 0)}
              </span>
              <span className="w-24 shrink-0 text-right tabular text-muted-foreground">
                <Money value={row.actual_minor} bare colored={false} />
                {" / "}
                <Money value={row.average_minor} bare colored={false} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-right text-[11px] text-muted-foreground">Ist / Schnitt</p>
    </div>
  );
}
