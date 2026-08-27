import { useMemo, useState } from "react";
import { Plus, RotateCcw, Settings2, Wallet } from "lucide-react";

import {
  useBudgets,
  useCategories,
  useDeactivateCategory,
  useDeleteBudget,
  useMonthSummary,
  useUpsertBudget,
} from "@/api/hooks";
import type { Category, CategoryFigure, CategoryGroup } from "@/api/types";
import { CATEGORY_GROUPS } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { BudgetAmountInput } from "@/components/budget/BudgetAmountInput";
import { CategoryDialog } from "@/components/budget/CategoryDialog";
import { UsageBar } from "@/components/budget/UsageBar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMonth } from "@/hooks/useMonth";
import { t } from "@/i18n";
import { monthLabel } from "@/lib/format";

export function BudgetPage() {
  const { month } = useMonth();
  const { percent } = useHouseholdContext();
  const { data: summary } = useMonthSummary(month.year, month.month);
  const { data: budgets = [] } = useBudgets(month.year, month.month);
  const { data: categories = [] } = useCategories();
  const upsert = useUpsertBudget();
  const removeBudget = useDeleteBudget();
  const deactivate = useDeactivateCategory();

  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const defaultsByCategory = useMemo(() => {
    const map = new Map<number, number>();
    for (const budget of budgets) if (budget.is_default) map.set(budget.category_id, budget.amount_minor);
    return map;
  }, [budgets]);

  const overridesByCategory = useMemo(() => {
    const map = new Map<number, { id: number; amount_minor: number }>();
    for (const budget of budgets) {
      if (!budget.is_default) map.set(budget.category_id, { id: budget.id, amount_minor: budget.amount_minor });
    }
    return map;
  }, [budgets]);

  const figuresByCategory = useMemo(() => {
    const map = new Map<number, CategoryFigure>();
    for (const figure of summary?.categories ?? []) map.set(figure.category_id, figure);
    return map;
  }, [summary]);

  const grouped = useMemo(() => {
    const map = new Map<CategoryGroup, Category[]>();
    for (const group of CATEGORY_GROUPS) map.set(group, []);
    for (const category of categories) {
      if (!category.is_active && !showInactive) continue;
      map.get(category.group)?.push(category);
    }
    return [...map.entries()].filter(([, items]) => items.length > 0);
  }, [categories, showInactive]);

  function setBudget(categoryId: number, amountMinor: number | null, forMonth: boolean) {
    if (amountMinor === null) {
      if (forMonth) {
        const override = overridesByCategory.get(categoryId);
        if (override) removeBudget.mutate(override.id);
      } else {
        upsert.mutate({ category_id: categoryId, amount_minor: 0 });
      }
      return;
    }
    upsert.mutate({
      category_id: categoryId,
      amount_minor: amountMinor,
      ...(forMonth ? { year: month.year, month: month.month } : {}),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold">
          {t.nav.budget} ·{" "}
          <span className="font-normal text-muted-foreground">{monthLabel(month.year, month.month)}</span>
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive" className="cursor-pointer">
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
            Kategorie
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Das Standardbudget gilt für jeden Monat. Ein Wert in der Monatsspalte übersteuert ihn nur für{" "}
        {monthLabel(month.year, month.month)}; leeren stellt den Standard wieder her.
      </p>

      <div className="rounded-lg border bg-card">
        {grouped.length === 0 ? (
          <EmptyState
            icon={<Wallet />}
            title="Noch keine Kategorien"
            description="Ohne Kategorien lässt sich nichts erfassen und nichts budgetieren."
            action={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus />
                Erste Kategorie anlegen
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.transactions.category}</TableHead>
                <TableHead className="w-[8.5rem] text-right">Standard</TableHead>
                <TableHead className="w-[8.5rem] text-right">Dieser Monat</TableHead>
                <TableHead className="w-[7rem] text-right">Ist</TableHead>
                <TableHead className="w-[7rem] text-right">Differenz</TableHead>
                <TableHead className="w-[9rem]">Auslastung</TableHead>
                <TableHead className="w-[4.5rem]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(([group, items]) => (
                <GroupSection
                  key={group}
                  group={group}
                  items={items}
                  summaryGroup={summary?.groups.find((entry) => entry.group === group)}
                  figuresByCategory={figuresByCategory}
                  defaultsByCategory={defaultsByCategory}
                  overridesByCategory={overridesByCategory}
                  onSetBudget={setBudget}
                  onEdit={(category) => {
                    setEditing(category);
                    setDialogOpen(true);
                  }}
                  onDeactivate={(category) => deactivate.mutate(category.id)}
                  percent={percent}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <CategoryDialog open={dialogOpen} onOpenChange={setDialogOpen} category={editing} />
    </div>
  );
}

interface GroupSectionProps {
  group: CategoryGroup;
  items: Category[];
  summaryGroup: { actual_minor: number; budget_minor: number; has_budget: boolean } | undefined;
  figuresByCategory: Map<number, CategoryFigure>;
  defaultsByCategory: Map<number, number>;
  overridesByCategory: Map<number, { id: number; amount_minor: number }>;
  onSetBudget: (categoryId: number, amountMinor: number | null, forMonth: boolean) => void;
  onEdit: (category: Category) => void;
  onDeactivate: (category: Category) => void;
  percent: (value: number | null, digits?: number) => string;
}

function GroupSection({
  group,
  items,
  summaryGroup,
  figuresByCategory,
  defaultsByCategory,
  overridesByCategory,
  onSetBudget,
  onEdit,
  onDeactivate,
  percent,
}: GroupSectionProps) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={3} className="py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t.group[group]}
        </TableCell>
        <TableCell className="py-1 text-right text-xs">
          <Money value={summaryGroup?.actual_minor ?? 0} bare colored={false} className="font-medium" />
        </TableCell>
        <TableCell className="py-1 text-right text-xs">
          {summaryGroup?.has_budget ? (
            <Money
              value={(summaryGroup.budget_minor ?? 0) - (summaryGroup.actual_minor ?? 0)}
              bare
              className="font-medium"
            />
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </TableCell>
        <TableCell colSpan={2} className="py-1" />
      </TableRow>

      {items.map((category) => {
        const figure = figuresByCategory.get(category.id);
        const override = overridesByCategory.get(category.id);
        const actual = figure?.actual_minor ?? 0;
        const effective = override?.amount_minor ?? defaultsByCategory.get(category.id) ?? null;
        const difference = effective === null ? null : effective - actual;
        const usage = effective ? actual / effective : null;

        return (
          <TableRow key={category.id} className="group">
            <TableCell>
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="truncate">{category.name}</span>
                {!category.is_active && <span className="text-[11px] text-muted-foreground">inaktiv</span>}
              </span>
            </TableCell>

            <TableCell className="text-right">
              <BudgetAmountInput
                aria-label={`Standardbudget ${category.name}`}
                value={defaultsByCategory.get(category.id) ?? null}
                onCommit={(value) => onSetBudget(category.id, value, false)}
                placeholder="–"
              />
            </TableCell>

            <TableCell className="text-right">
              <div className="flex items-center gap-1">
                <BudgetAmountInput
                  aria-label={`Monatsbudget ${category.name}`}
                  value={override?.amount_minor ?? null}
                  onCommit={(value) => onSetBudget(category.id, value, true)}
                  placeholder="Standard"
                />
                {override && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onSetBudget(category.id, null, true)}
                        aria-label="Übersteuerung entfernen"
                      >
                        <RotateCcw />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Zurück zum Standardbudget</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TableCell>

            <TableCell className="text-right">
              <Money value={actual} bare colored={false} />
            </TableCell>

            <TableCell className="text-right">
              {difference === null ? (
                <span className="text-muted-foreground">–</span>
              ) : (
                <Money value={difference} bare className="font-medium" />
              )}
            </TableCell>

            <TableCell>
              <div className="flex items-center gap-2">
                <UsageBar usage={usage} className="flex-1" />
                <span className="w-11 shrink-0 text-right text-xs tabular text-muted-foreground">
                  {usage === null ? "–" : percent(usage * 100, 0)}
                </span>
              </div>
            </TableCell>

            <TableCell className="text-right">
              <span className="inline-flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button size="icon-sm" variant="ghost" onClick={() => onEdit(category)} aria-label={t.app.edit}>
                  <Settings2 />
                </Button>
                {category.is_active && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Deaktivieren"
                    title="Deaktivieren"
                    onClick={() => {
                      if (window.confirm(`„${category.name}" deaktivieren? Bestehende Buchungen bleiben erhalten.`)) {
                        onDeactivate(category);
                      }
                    }}
                  >
                    <span aria-hidden className="text-xs">✕</span>
                  </Button>
                )}
              </span>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
