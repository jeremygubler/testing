import { useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

import { useBudgetProposal, useBulkUpsertBudgets } from "@/api/hooks";
import type { BudgetProposalRow } from "@/api/types";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type Source = "AVERAGE" | "LAST_MONTH";

interface ProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
}

/**
 * Budgets aus dem tatsächlichen Verlauf vorschlagen.
 *
 * Wie beim Import wird erst gezeigt, dann geschrieben — und jede Zeile lässt sich
 * einzeln abwählen. Ein Vorschlag, der ungefragt 20 Budgets überschreibt, wäre
 * schlimmer als gar keiner.
 */
export function ProposalDialog({ open, onOpenChange, year, month }: ProposalDialogProps) {
  const [source, setSource] = useState<Source>("AVERAGE");
  const [months, setMonths] = useState(6);
  const [target, setTarget] = useState<"DEFAULT" | "MONTH">("DEFAULT");
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data, isFetching } = useBudgetProposal(year, month, source, months, open);
  const apply = useBulkUpsertBudgets();

  // Beim Oeffnen und bei jeder Aenderung der Grundlage gilt die bisherige Abwahl nicht
  // mehr -- die Zeilen zeigen dann andere Zahlen. Angeglichen waehrend des Renderns.
  const signature = `${open}:${source}:${months}`;
  const [lastSignature, setLastSignature] = useState(signature);
  if (lastSignature !== signature) {
    setLastSignature(signature);
    setSkipped(new Set());
    setError(null);
  }

  // Zeilen ohne Vorschlag und ohne bisheriges Budget sind nur Rauschen.
  const rows = useMemo(
    () => (data?.rows ?? []).filter((row) => row.proposed_minor > 0 || row.current_minor !== null),
    [data],
  );
  const selected = rows.filter((row) => !skipped.has(row.category_id));

  async function submit() {
    if (selected.length === 0) return;
    setError(null);
    try {
      await apply.mutateAsync({
        entries: selected.map((row) => ({
          category_id: row.category_id,
          amount_minor: row.proposed_minor,
        })),
        ...(target === "MONTH" ? { year, month } : {}),
      });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Budgets vorschlagen</DialogTitle>
          <DialogDescription>
            Aus dem, was tatsächlich gebucht wurde. Nichts wird geschrieben, bis du unten
            übernimmst.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="proposal-source">Grundlage</Label>
            <Select value={source} onValueChange={(value) => setSource(value as Source)}>
              <SelectTrigger id="proposal-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AVERAGE">Durchschnitt</SelectItem>
                <SelectItem value="LAST_MONTH">Vormonat</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {source === "AVERAGE" && (
            <div className="space-y-1">
              <Label htmlFor="proposal-months">Zeitraum</Label>
              <Select value={String(months)} onValueChange={(value) => setMonths(Number(value))}>
                <SelectTrigger id="proposal-months">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 6, 12].map((entry) => (
                    <SelectItem key={entry} value={String(entry)}>
                      {entry} Monate
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="proposal-target">Setzen als</Label>
            <Select value={target} onValueChange={(value) => setTarget(value as "DEFAULT" | "MONTH")}>
              <SelectTrigger id="proposal-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEFAULT">Standardbudget</SelectItem>
                <SelectItem value="MONTH">Nur {monthLabel(year, month)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Gerechnet wird über die abgeschlossenen Monate vor {monthLabel(year, month)} — der
          laufende Monat ist unvollständig und würde den Schnitt nach unten ziehen. Beträge
          sind auf ganze Franken gerundet.
        </p>

        <div className="max-h-72 overflow-y-auto rounded-md border">
          {isFetching && rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t.app.loading}</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Für diesen Zeitraum gibt es noch keine Buchungen, aus denen sich etwas
              ableiten liesse.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.transactions.category}</TableHead>
                  <TableHead className="w-[7.5rem] text-right">Bisher</TableHead>
                  <TableHead className="w-[7.5rem] text-right">Vorschlag</TableHead>
                  <TableHead className="w-[6rem] text-right">Übernehmen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <ProposalRow
                    key={row.category_id}
                    row={row}
                    selected={!skipped.has(row.category_id)}
                    onToggle={() =>
                      setSkipped((state) => {
                        const next = new Set(state);
                        if (next.has(row.category_id)) next.delete(row.category_id);
                        else next.add(row.category_id);
                        return next;
                      })
                    }
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.app.cancel}
          </Button>
          <Button onClick={() => void submit()} disabled={selected.length === 0 || apply.isPending}>
            {apply.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {selected.length} übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposalRow({
  row,
  selected,
  onToggle,
}: {
  row: BudgetProposalRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const unchanged = row.current_minor === row.proposed_minor;

  return (
    <TableRow className={cn(!selected && "opacity-50")}>
      <TableCell className="truncate">{row.name}</TableCell>
      <TableCell className="text-right">
        {row.current_minor === null ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          <Money value={row.current_minor} bare colored={false} className="text-muted-foreground" />
        )}
      </TableCell>
      <TableCell className="text-right">
        <Money
          value={row.proposed_minor}
          bare
          colored={false}
          className={cn(!unchanged && "font-medium")}
        />
      </TableCell>
      <TableCell className="text-right">
        <Switch
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`${row.name} übernehmen`}
        />
      </TableCell>
    </TableRow>
  );
}
