import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";

import { useCategories, useCreateTransaction, useMembers } from "@/api/hooks";
import type { SplitTemplate } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryCombobox } from "./CategoryCombobox";
import { SplitEditor, emptySplitState, toSplitSpec, type SplitState } from "./SplitEditor";
import { t } from "@/i18n";
import { todayIso } from "@/lib/date";
import { parseAmountInput } from "@/lib/money";
import { cn } from "@/lib/utils";

const TEMPLATE_KEY = "budget.lastSplitTemplate";

function readTemplate(): SplitTemplate {
  try {
    const value = localStorage.getItem(TEMPLATE_KEY);
    if (value === "SINGLE" || value === "EQUAL" || value === "KEY" || value === "MANUAL") return value;
  } catch {
    /* egal */
  }
  return "KEY";
}

/**
 * Erfassen in drei Interaktionen: Betrag tippen → Enter, Kategorie tippen → Enter,
 * Enter speichert. Datum und Aufteilungsvorlage bleiben zwischen Buchungen stehen,
 * der Fokus springt nach dem Speichern zurück auf den Betrag.
 */
export function QuickEntry({ defaultDate, className }: { defaultDate?: string; className?: string }) {
  const { data: categories = [] } = useCategories();
  const { data: members = [] } = useMembers();
  const create = useCreateTransaction();

  const amountRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);

  const [amountText, setAmountText] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaultDate ?? todayIso());
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [split, setSplit] = useState<SplitState>(() => emptySplitState([], readTemplate()));
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (split.singleMemberId === null && members.length > 0) {
      setSplit((state) => ({ ...state, singleMemberId: members.find((m) => m.is_active)?.id ?? null }));
    }
  }, [members, split.singleMemberId]);

  useEffect(() => {
    if (defaultDate) setDate(defaultDate);
  }, [defaultDate]);

  useEffect(() => {
    try {
      localStorage.setItem(TEMPLATE_KEY, split.template);
    } catch {
      /* egal */
    }
  }, [split.template]);

  const amountMinor = parseAmountInput(amountText);
  const canSubmit = amountMinor !== null && amountMinor !== 0 && categoryId !== null && !create.isPending;

  async function submit() {
    if (!canSubmit || amountMinor === null || categoryId === null) return;
    setError(null);
    try {
      await create.mutateAsync({
        date,
        category_id: categoryId,
        description: description.trim(),
        amount_minor: amountMinor,
        split: toSplitSpec(split, members, amountMinor),
      });
      setAmountText("");
      setDescription("");
      setCategoryId(null);
      setSplit((state) => ({ ...state, manual: {} }));
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
      amountRef.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  return (
    <form
      className={cn("rounded-lg border bg-card p-2.5", className)}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[8rem_13rem_minmax(0,1fr)_9.5rem_auto]">
        <div>
          <Label htmlFor="quick-amount" className="sr-only">
            {t.transactions.amount}
          </Label>
          <Input
            id="quick-amount"
            ref={amountRef}
            autoFocus
            inputMode="decimal"
            placeholder={t.transactions.quickAmount}
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (amountMinor !== null && amountMinor !== 0) setCategoryOpen(true);
              }
            }}
            className={cn(
              "text-right tabular",
              amountText && amountMinor === null && "border-destructive focus-visible:ring-destructive",
            )}
            aria-invalid={Boolean(amountText) && amountMinor === null}
          />
        </div>

        <CategoryCombobox
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          open={categoryOpen}
          onOpenChange={setCategoryOpen}
          onCommit={() => descriptionRef.current?.focus()}
          className="w-full"
        />

        <div>
          <Label htmlFor="quick-description" className="sr-only">
            {t.transactions.description}
          </Label>
          <Input
            id="quick-description"
            ref={descriptionRef}
            placeholder={t.transactions.quickDescription}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="quick-date" className="sr-only">
            {t.transactions.date}
          </Label>
          <Input
            id="quick-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="tabular"
          />
        </div>

        <Button type="submit" disabled={!canSubmit} className="lg:w-28">
          {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          {t.transactions.save}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <SplitEditor
          members={members}
          totalMinor={amountMinor ?? 0}
          value={split}
          onChange={setSplit}
          compact
          className={cn("flex-1", split.template === "MANUAL" ? "min-w-[16rem]" : "min-w-0")}
        />
        {justSaved && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5" />
            {t.transactions.savedHint}
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </form>
  );
}
