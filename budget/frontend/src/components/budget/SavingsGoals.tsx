import { useState } from "react";
import { PiggyBank, Plus, Trash2 } from "lucide-react";

import {
  useCategories,
  useCreateSavingsGoal,
  useDeleteSavingsGoal,
  useSavingsGoals,
} from "@/api/hooks";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { CategoryCombobox } from "@/components/transactions/CategoryCombobox";
import { UsageBar } from "@/components/budget/UsageBar";
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
import { t } from "@/i18n";
import { todayIso } from "@/lib/date";
import { parseAmountInput } from "@/lib/money";

/**
 * Sparziele. Der Fortschritt wird aus den Buchungen der verknüpften Kategorie
 * berechnet — es gibt kein separat gepflegtes „bereits gespart"-Feld, das
 * auseinanderlaufen könnte.
 */
export function SavingsGoals() {
  const { data: goals = [] } = useSavingsGoals();
  const { percent, date: formatDate } = useHouseholdContext();
  const remove = useDeleteSavingsGoal();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-3">
      {goals.length === 0 ? (
        <EmptyState
          icon={<PiggyBank />}
          title="Noch keine Sparziele"
          description="Ein Ziel verknüpft einen Betrag mit einer Sparkategorie — der Fortschritt ergibt sich dann von selbst."
          action={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus />
              Erstes Ziel anlegen
            </Button>
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {goals.map((goal) => (
              <li key={goal.id} className="group space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 self-center rounded-full"
                    style={{ backgroundColor: goal.category_color }}
                  />
                  <span className="font-medium">{goal.name}</span>
                  <span className="text-xs text-muted-foreground">{goal.category_name}</span>
                  <span className="ml-auto tabular">
                    <Money value={goal.saved_minor} bare colored={false} />
                    <span className="text-muted-foreground">
                      {" / "}
                      <Money value={goal.target_amount_minor} bare colored={false} />
                    </span>
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="transition-opacity md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
                    aria-label={`${t.app.delete}: ${goal.name}`}
                    onClick={() => {
                      if (window.confirm(`Sparziel „${goal.name}" löschen? Die Buchungen bleiben.`)) {
                        remove.mutate(goal.id);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <UsageBar usage={goal.progress} />
                <p className="text-xs text-muted-foreground">
                  {percent(goal.progress === null ? null : goal.progress * 100, 0)} erreicht
                  {goal.target_date && (
                    <>
                      {" · bis "}
                      {formatDate(goal.target_date)}
                      {goal.monthly_needed_minor !== null && goal.remaining_minor > 0 && (
                        <>
                          {" · noch "}
                          <Money value={goal.monthly_needed_minor} bare colored={false} />
                          {" pro Monat nötig"}
                        </>
                      )}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus />
            Sparziel
          </Button>
        </>
      )}

      <GoalDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function GoalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: categories = [] } = useCategories();
  const create = useCreateSavingsGoal();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(todayIso().slice(0, 8) + "01");
  const [error, setError] = useState<string | null>(null);

  const targetMinor = parseAmountInput(target);
  const canSubmit = Boolean(name.trim()) && categoryId !== null && targetMinor !== null && targetMinor > 0;

  const savingsCategories = categories.filter((category) => category.group === "SPAREN");

  async function submit() {
    if (!canSubmit || categoryId === null || targetMinor === null) return;
    setError(null);
    try {
      await create.mutateAsync({
        name: name.trim(),
        target_amount_minor: targetMinor,
        target_date: targetDate || null,
        category_id: categoryId,
        start_date: startDate || null,
      });
      setName("");
      setTarget("");
      setTargetDate("");
      setCategoryId(null);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Sparziel</DialogTitle>
          <DialogDescription>
            Der Fortschritt kommt aus den Buchungen der gewählten Kategorie ab dem Startdatum.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="goal-name">Name</Label>
            <Input id="goal-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Kategorie</Label>
            <CategoryCombobox
              categories={savingsCategories.length > 0 ? savingsCategories : categories}
              value={categoryId}
              onChange={setCategoryId}
              className="w-full"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="goal-target">Zielbetrag</Label>
              <Input
                id="goal-target"
                inputMode="decimal"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className="text-right tabular"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="goal-date">Zieldatum (optional)</Label>
              <Input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="tabular"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="goal-start">Zählt ab</Label>
            <Input
              id="goal-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="tabular"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t.app.cancel}
            </Button>
            <Button type="submit" disabled={!canSubmit || create.isPending}>
              {t.app.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
