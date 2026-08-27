import { useEffect, useState } from "react";

import { useCategories, useCreateRule, useMembers, useUpdateRule } from "@/api/hooks";
import type { IntervalKind, RecurringRule } from "@/api/types";
import { CategoryCombobox } from "@/components/transactions/CategoryCombobox";
import { SplitEditor, emptySplitState, toSplitSpec, type SplitState } from "@/components/transactions/SplitEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/i18n";
import { todayIso } from "@/lib/date";
import { parseAmountInput, toDecimalString } from "@/lib/money";

const INTERVALS: IntervalKind[] = ["MONTHLY", "QUARTERLY", "YEARLY", "WEEKLY"];
const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

interface RuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: RecurringRule | null;
}

export function RuleDialog({ open, onOpenChange, rule }: RuleDialogProps) {
  const { data: categories = [] } = useCategories();
  const { data: members = [] } = useMembers();
  const create = useCreateRule();
  const update = useUpdateRule();

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState("");
  const [interval, setInterval] = useState<IntervalKind>("MONTHLY");
  const [day, setDay] = useState(1);
  const [anchorMonth, setAnchorMonth] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState("");
  const [split, setSplit] = useState<SplitState>(() => emptySplitState(members, "KEY"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (rule) {
      setDescription(rule.description);
      setCategoryId(rule.category_id);
      setAmountText(toDecimalString(rule.amount_minor));
      setInterval(rule.interval);
      setDay(rule.day_of_period);
      setAnchorMonth(rule.anchor_month);
      setStartDate(rule.start_date);
      setEndDate(rule.end_date ?? "");
      setSplit({
        template: rule.split.template,
        singleMemberId: rule.split.member_id ?? members.find((m) => m.is_active)?.id ?? null,
        manual: Object.fromEntries((rule.split.lines ?? []).map((line) => [line.member_id, line.amount_minor])),
      });
    } else {
      setDescription("");
      setCategoryId(null);
      setAmountText("");
      setInterval("MONTHLY");
      setDay(1);
      setAnchorMonth(null);
      setStartDate(todayIso());
      setEndDate("");
      setSplit(emptySplitState(members.filter((m) => m.is_active), "KEY"));
    }
  }, [open, rule, members]);

  const amountMinor = parseAmountInput(amountText);
  const canSubmit = Boolean(description.trim()) && categoryId !== null && amountMinor !== null && amountMinor !== 0;

  async function submit() {
    if (!canSubmit || categoryId === null || amountMinor === null) return;
    setError(null);
    const input = {
      category_id: categoryId,
      description: description.trim(),
      amount_minor: amountMinor,
      interval,
      day_of_period: day,
      anchor_month: interval === "QUARTERLY" || interval === "YEARLY" ? anchorMonth : null,
      start_date: startDate,
      end_date: endDate || null,
      split: toSplitSpec(split, members, amountMinor),
    };
    try {
      if (rule) await update.mutateAsync({ id: rule.id, patch: input });
      else await create.mutateAsync(input);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  const isWeekly = interval === "WEEKLY";
  const needsAnchor = interval === "QUARTERLY" || interval === "YEARLY";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Regel bearbeiten" : "Neue wiederkehrende Buchung"}</DialogTitle>
          <DialogDescription>
            Die Regel bucht nie von selbst — sie erzeugt Vorschläge, die du bestätigst.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="rule-description">Beschreibung</Label>
              <Input
                id="rule-description"
                autoFocus
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="z. B. Miete Wohnung"
              />
            </div>

            <div className="space-y-1">
              <Label>{t.transactions.category}</Label>
              <CategoryCombobox categories={categories} value={categoryId} onChange={setCategoryId} className="w-full" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-amount">{t.transactions.amount}</Label>
              <Input
                id="rule-amount"
                inputMode="decimal"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                className="text-right tabular"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-interval">Intervall</Label>
              <Select value={interval} onValueChange={(value) => setInterval(value as IntervalKind)}>
                <SelectTrigger id="rule-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {t.interval[entry]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-day">{isWeekly ? "Wochentag" : "Buchungstag"}</Label>
              <Select value={String(day)} onValueChange={(value) => setDay(Number(value))}>
                <SelectTrigger id="rule-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isWeekly
                    ? WEEKDAYS.map((name, index) => (
                        <SelectItem key={name} value={String(index + 1)}>
                          {name}
                        </SelectItem>
                      ))
                    : Array.from({ length: 31 }, (_, index) => (
                        <SelectItem key={index} value={String(index + 1)}>
                          {index + 1}.
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              {!isWeekly && day > 28 && (
                <p className="text-[11px] text-muted-foreground">
                  In kürzeren Monaten wird auf den Monatsletzten gezogen.
                </p>
              )}
            </div>

            {needsAnchor && (
              <div className="space-y-1">
                <Label htmlFor="rule-anchor">Ankermonat</Label>
                <Select
                  value={anchorMonth ? String(anchorMonth) : ""}
                  onValueChange={(value) => setAnchorMonth(Number(value))}
                >
                  <SelectTrigger id="rule-anchor">
                    <SelectValue placeholder="Monat des Starts" />
                  </SelectTrigger>
                  <SelectContent>
                    {t.month.names.map((name, index) => (
                      <SelectItem key={name} value={String(index + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="rule-start">Start</Label>
              <Input
                id="rule-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="tabular"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-end">Ende (optional)</Label>
              <Input
                id="rule-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="tabular"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Standard-Aufteilung</Label>
            <SplitEditor
              members={members}
              totalMinor={amountMinor ?? 0}
              value={split}
              onChange={setSplit}
              compact
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t.app.cancel}
            </Button>
            <Button type="submit" disabled={!canSubmit || create.isPending || update.isPending}>
              {t.app.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
