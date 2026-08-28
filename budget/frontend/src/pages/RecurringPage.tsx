import { useMemo, useState } from "react";
import { AlertTriangle, Pencil, Plus, Repeat } from "lucide-react";

import { useDeactivateRule, useRecurringRules } from "@/api/hooks";
import type { IntervalKind, RecurringRule } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { PendingSuggestions } from "@/components/recurring/PendingSuggestions";
import { RuleDialog } from "@/components/recurring/RuleDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMonth } from "@/hooks/useMonth";
import { t } from "@/i18n";
import { monthLabel } from "@/lib/format";

const INTERVAL_ORDER: IntervalKind[] = ["MONTHLY", "QUARTERLY", "YEARLY", "WEEKLY"];

/** Ab so vielen unbestätigten Fälligkeiten in Folge ist ein Hinweis fällig. */
const STALE_THRESHOLD = 3;

export function RecurringPage() {
  const { month } = useMonth();
  const { data: rules = [], isLoading } = useRecurringRules();
  const deactivate = useDeactivateRule();

  const [onlySubscriptions, setOnlySubscriptions] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const visible = useMemo(
    () =>
      rules.filter(
        (rule) =>
          (rule.is_active || showInactive) &&
          (!onlySubscriptions || rule.category_group === "FIXKOSTEN"),
      ),
    [rules, onlySubscriptions, showInactive],
  );

  const grouped = useMemo(
    () =>
      INTERVAL_ORDER.map((interval) => ({
        interval,
        rules: visible.filter((rule) => rule.interval === interval),
      })).filter((entry) => entry.rules.length > 0),
    [visible],
  );

  const active = visible.filter((rule) => rule.is_active);
  const monthlyTotal = active.reduce((sum, rule) => sum + signed(rule, rule.monthly_estimate_minor), 0);
  const yearlyTotal = active.reduce((sum, rule) => sum + signed(rule, rule.yearly_estimate_minor), 0);
  const stale = active.filter((rule) => rule.open_streak >= STALE_THRESHOLD);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold">{t.nav.recurring}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="only-subs" checked={onlySubscriptions} onCheckedChange={setOnlySubscriptions} />
            <Label htmlFor="only-subs" className="cursor-pointer">
              Nur Abos
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="rules-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="rules-inactive" className="cursor-pointer">
              Inaktive zeigen
            </Label>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus />
            Regel
          </Button>
        </div>
      </div>

      {onlySubscriptions && (
        <p className="text-xs text-muted-foreground">
          „Abos" sind keine eigene Datenart, sondern Regeln mit einer Kategorie der Gruppe Fixkosten.
          Dieser Schalter filtert nur.
        </p>
      )}

      {stale.length > 0 && (
        <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="font-medium">Vermutlich vergessen</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {stale.map((rule) => (
                <li key={rule.id}>
                  <span className="text-foreground">{rule.description}</span> — seit {rule.open_streak}{" "}
                  Fälligkeiten weder gebucht noch übersprungen. Läuft das Abo noch?
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle>Hochrechnung Monat</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold tabular">
                  <Money value={monthlyTotal} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {active.length} aktive {active.length === 1 ? "Regel" : "Regeln"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle>Hochrechnung Jahr</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold tabular">
                  <Money value={yearlyTotal} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">Einnahmen abzüglich Ausgaben</p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-lg border bg-card">
            {isLoading ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t.app.loading}</p>
            ) : grouped.length === 0 ? (
              <EmptyState
                icon={<Repeat />}
                title={onlySubscriptions ? "Keine Abos" : "Noch keine wiederkehrenden Buchungen"}
                description="Miete, Lohn und Abos einmal anlegen — danach bestätigst du sie nur noch."
                action={
                  <Button size="sm" onClick={() => setDialogOpen(true)}>
                    <Plus />
                    Erste Regel anlegen
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead className="w-[10rem]">{t.transactions.category}</TableHead>
                    <TableHead className="w-[6rem]">Termin</TableHead>
                    <TableHead className="w-[7rem] text-right">Betrag</TableHead>
                    <TableHead className="w-[7rem] text-right">pro Monat</TableHead>
                    <TableHead className="w-[4.5rem]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map(({ interval, rules: entries }) => (
                    <IntervalSection
                      key={interval}
                      interval={interval}
                      rules={entries}
                      onEdit={(rule) => {
                        setEditing(rule);
                        setDialogOpen(true);
                      }}
                      onDeactivate={(rule) => deactivate.mutate(rule.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Offen im {monthLabel(month.year, month.month)}</CardTitle>
          </CardHeader>
          <CardContent>
            <PendingSuggestions year={month.year} month={month.month} />
          </CardContent>
        </Card>
      </div>

      <RuleDialog open={dialogOpen} onOpenChange={setDialogOpen} rule={editing} />
    </div>
  );
}

/** Einnahmen zählen positiv, Ausgaben negativ — sonst wäre die Summe sinnlos. */
function signed(rule: RecurringRule, amount: number): number {
  return rule.category_group === "EINKOMMEN" ? amount : -amount;
}

function IntervalSection({
  interval,
  rules,
  onEdit,
  onDeactivate,
}: {
  interval: IntervalKind;
  rules: RecurringRule[];
  onEdit: (rule: RecurringRule) => void;
  onDeactivate: (rule: RecurringRule) => void;
}) {
  const { dateShort } = useHouseholdContext();
  const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={6} className="py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t.interval[interval]}
        </TableCell>
      </TableRow>
      {rules.map((rule) => (
        <TableRow key={rule.id} className="group">
          <TableCell>
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{rule.description}</span>
              {!rule.is_active && <Badge variant="outline">inaktiv</Badge>}
              {rule.is_active && rule.open_streak >= STALE_THRESHOLD && (
                <Badge variant="warning">{rule.open_streak}× offen</Badge>
              )}
              {rule.end_date && (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  bis {dateShort(rule.end_date)}
                </span>
              )}
            </span>
          </TableCell>
          <TableCell>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: rule.category_color }} />
              <span className="truncate">{rule.category_name}</span>
            </span>
          </TableCell>
          <TableCell className="text-xs tabular text-muted-foreground">
            {interval === "WEEKLY"
              ? weekdays[rule.day_of_period - 1]
              : `${rule.day_of_period}.`}
            {rule.anchor_month && interval !== "MONTHLY" ? ` ${t.month.short[rule.anchor_month - 1]}` : ""}
          </TableCell>
          <TableCell className="text-right">
            <Money value={rule.amount_minor} bare colored={false} />
          </TableCell>
          <TableCell className="text-right text-muted-foreground">
            <Money value={rule.monthly_estimate_minor} bare colored={false} />
          </TableCell>
          <TableCell className="text-right">
            <span className="inline-flex gap-0.5 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
              <Button size="icon-sm" variant="ghost" onClick={() => onEdit(rule)} aria-label={t.app.edit}>
                <Pencil />
              </Button>
              {rule.is_active && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Deaktivieren"
                  title="Deaktivieren"
                  onClick={() => {
                    if (window.confirm(`„${rule.description}" deaktivieren? Gebuchte Transaktionen bleiben.`)) {
                      onDeactivate(rule);
                    }
                  }}
                >
                  <span aria-hidden className="text-xs">✕</span>
                </Button>
              )}
            </span>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
