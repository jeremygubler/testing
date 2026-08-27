import { useState } from "react";
import { CalendarCheck, Check, Loader2, SkipForward } from "lucide-react";

import { useConfirmOccurrences, useOccurrences, useSkipOccurrence } from "@/api/hooks";
import type { Occurrence } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { parseAmountInput, toDecimalString } from "@/lib/money";

interface PendingSuggestionsProps {
  year: number;
  month: number;
  /** Kompakte Variante für die Übersicht. */
  compact?: boolean;
}

/**
 * Offene Vorschläge aus wiederkehrenden Regeln.
 *
 * Nichts wird automatisch gebucht: Der Betrag ist vor dem Bestätigen editierbar
 * (die Stromrechnung schwankt), Überspringen legt den Termin still, ohne zu buchen.
 */
export function PendingSuggestions({ year, month, compact = false }: PendingSuggestionsProps) {
  const { dateShort } = useHouseholdContext();
  const { data: occurrences = [], isLoading } = useOccurrences(year, month, true);
  const confirm = useConfirmOccurrences();
  const skip = useSkipOccurrence();

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const key = (entry: Occurrence) => `${entry.rule_id}:${entry.due_date}`;

  function amountFor(entry: Occurrence): number {
    const text = amounts[key(entry)];
    if (text === undefined) return entry.amount_minor;
    return parseAmountInput(text) ?? entry.amount_minor;
  }

  async function confirmMany(entries: Occurrence[]) {
    setError(null);
    try {
      await confirm.mutateAsync(
        entries.map((entry) => ({
          rule_id: entry.rule_id,
          due_date: entry.due_date,
          amount_minor: amountFor(entry),
        })),
      );
      setAmounts({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t.app.loading}</p>;
  }

  if (occurrences.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck />}
        title="Nichts offen"
        description="Alle erwarteten Buchungen dieses Monats sind bestätigt oder übersprungen."
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {occurrences.length} erwartete {occurrences.length === 1 ? "Buchung" : "Buchungen"}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void confirmMany(occurrences)}
          disabled={confirm.isPending}
        >
          {confirm.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          Alle bestätigen
        </Button>
      </div>

      <ul className="divide-y rounded-md border">
        {occurrences.map((entry) => (
          <li key={key(entry)} className="p-2">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs tabular text-muted-foreground">
                {dateShort(entry.due_date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm" title={entry.description}>
                {entry.description}
              </span>
                <Input
                aria-label={`Betrag ${entry.description}`}
                inputMode="decimal"
                className="h-7 w-[5.5rem] shrink-0 text-right tabular"
                value={amounts[key(entry)] ?? toDecimalString(entry.amount_minor)}
                onChange={(event) => setAmounts((state) => ({ ...state, [key(entry)]: event.target.value }))}
              />
              <span className="flex shrink-0 gap-0.5">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${t.app.confirm}: ${entry.description}`}
                  title={t.app.confirm}
                  onClick={() => void confirmMany([entry])}
                  disabled={confirm.isPending}
                >
                  <Check />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${t.app.skip}: ${entry.description}`}
                  title={t.app.skip}
                  onClick={() => skip.mutate({ rule_id: entry.rule_id, due_date: entry.due_date })}
                  disabled={skip.isPending}
                >
                  <SkipForward />
                </Button>
              </span>
            </div>
            {!compact && (
              <p className="pl-[3.75rem] text-xs text-muted-foreground">{entry.category_name}</p>
            )}
          </li>
        ))}
      </ul>

      <p className="text-right text-xs text-muted-foreground">
        Summe offen{" "}
        <Money
          value={occurrences.reduce((sum, entry) => sum + amountFor(entry), 0)}
          bare
          colored={false}
          className="font-medium text-foreground"
        />
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
