import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  addMonths,
  currentMonth,
  monthRange,
  parseMonthParam,
  toMonthParam,
  type MonthKey,
} from "@/lib/date";

/**
 * Der gewählte Monat gilt app-weit und steht in der URL (`?m=2026-03`).
 * Dadurch funktionieren Teilen des Links und der Browser-Zurück-Knopf.
 */
export function useMonth() {
  const [params, setParams] = useSearchParams();
  const month = useMemo(
    () => parseMonthParam(params.get("m")) ?? currentMonth(),
    [params],
  );

  const setMonth = useCallback(
    (next: MonthKey) => {
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);
          updated.set("m", toMonthParam(next));
          return updated;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const shift = useCallback((delta: number) => setMonth(addMonths(month, delta)), [month, setMonth]);

  return {
    month,
    setMonth,
    shift,
    range: monthRange(month),
    isCurrent:
      month.year === currentMonth().year && month.month === currentMonth().month,
  };
}
