import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMonth } from "@/hooks/useMonth";
import { t } from "@/i18n";
import { currentMonth } from "@/lib/date";

const YEAR_SPAN = 3;

/** Pfeile plus Direktauswahl. Der Monat lebt in der URL (siehe useMonth). */
export function MonthNavigator() {
  const { month, setMonth, shift, isCurrent } = useMonth();
  const thisYear = currentMonth().year;
  const years = Array.from({ length: YEAR_SPAN * 2 + 1 }, (_, index) => thisYear - YEAR_SPAN + index);

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label={t.month.previous}>
        <ChevronLeft />
      </Button>

      <div className="flex items-center gap-1">
        <Select
          value={String(month.month)}
          onValueChange={(value) => setMonth({ ...month, month: Number(value) })}
        >
          <SelectTrigger className="h-8 w-[7.5rem] border-0 bg-transparent px-2 font-medium shadow-none hover:bg-accent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {t.month.names.map((name, index) => (
              <SelectItem key={name} value={String(index + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(month.year)} onValueChange={(value) => setMonth({ ...month, year: Number(value) })}>
          <SelectTrigger className="h-8 w-[5.5rem] border-0 bg-transparent px-2 font-medium tabular shadow-none hover:bg-accent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((year) => (
              <SelectItem key={year} value={String(year)} className="tabular">
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label={t.month.next}>
        <ChevronRight />
      </Button>

      {!isCurrent && (
        <Button variant="ghost" size="sm" className="ml-1 text-xs" onClick={() => setMonth(currentMonth())}>
          {t.month.current}
        </Button>
      )}
    </div>
  );
}
