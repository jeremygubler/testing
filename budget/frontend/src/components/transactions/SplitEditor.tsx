import { useMemo } from "react";

import type { Member, SplitLine, SplitTemplate } from "@/api/types";
import { Money } from "@/components/Money";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/i18n";
import { parseAmountInput, toDecimalString } from "@/lib/money";
import { resolveSplit } from "@/lib/splits";
import { cn } from "@/lib/utils";

export interface SplitState {
  template: SplitTemplate;
  singleMemberId: number | null;
  manual: Record<number, number>;
}

interface SplitEditorProps {
  members: Member[];
  totalMinor: number;
  value: SplitState;
  onChange: (next: SplitState) => void;
  className?: string;
  compact?: boolean;
}

export function emptySplitState(members: Member[], preferred: SplitTemplate = "KEY"): SplitState {
  return { template: preferred, singleMemberId: members[0]?.id ?? null, manual: {} };
}

/**
 * Vorlage wählen statt Beträge tippen. Bei „Manuell" wird der offene Rest live angezeigt,
 * damit man sieht, wann die Aufteilung aufgeht.
 */
export function SplitEditor({ members, totalMinor, value, onChange, className, compact }: SplitEditorProps) {
  const active = useMemo(() => members.filter((member) => member.is_active), [members]);

  const manualLines: SplitLine[] = active.map((member) => ({
    member_id: member.id,
    amount_minor: value.manual[member.id] ?? 0,
  }));

  const result = resolveSplit(value.template, totalMinor, active, {
    singleMemberId: value.singleMemberId,
    manual: manualLines,
  });

  const preview = new Map(result.lines.map((line) => [line.member_id, line.amount_minor]));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Select
          value={value.template}
          onValueChange={(next) => {
            const template = next as SplitTemplate;
            onChange({
              ...value,
              template,
              // Beim Wechsel auf Manuell die bisherige Verteilung als Startwert übernehmen.
              manual:
                template === "MANUAL" && Object.keys(value.manual).length === 0
                  ? Object.fromEntries(result.lines.map((line) => [line.member_id, line.amount_minor]))
                  : value.manual,
            });
          }}
        >
          <SelectTrigger className={cn(compact ? "h-9 w-[11rem]" : "w-full")} aria-label={t.transactions.split}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["SINGLE", "EQUAL", "KEY", "MANUAL"] as SplitTemplate[]).map((template) => (
              <SelectItem key={template} value={template}>
                {t.splitTemplate[template]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {value.template === "SINGLE" && (
          <Select
            value={value.singleMemberId ? String(value.singleMemberId) : ""}
            onValueChange={(next) => onChange({ ...value, singleMemberId: Number(next) })}
          >
            <SelectTrigger className={cn(compact ? "h-9 w-[8rem]" : "w-full")} aria-label={t.transactions.person}>
              <SelectValue placeholder={t.transactions.person} />
            </SelectTrigger>
            <SelectContent>
              {active.map((member) => (
                <SelectItem key={member.id} value={String(member.id)}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {value.template === "MANUAL" ? (
        <div className="space-y-1.5 rounded-md border p-2">
          {active.map((member) => (
            <div key={member.id} className="flex items-center gap-2">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: member.color }} />
              <Label htmlFor={`split-${member.id}`} className="w-24 shrink-0 truncate text-foreground">
                {member.name}
              </Label>
              <Input
                id={`split-${member.id}`}
                inputMode="decimal"
                className="h-8 text-right tabular"
                defaultValue={value.manual[member.id] ? toDecimalString(value.manual[member.id]) : ""}
                onChange={(event) => {
                  const parsed = parseAmountInput(event.target.value) ?? 0;
                  onChange({ ...value, manual: { ...value.manual, [member.id]: parsed } });
                }}
                placeholder="0.00"
              />
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-1.5 text-xs">
            <span className="text-muted-foreground">{t.transactions.remaining}</span>
            <Money
              value={result.remainderMinor}
              colored={false}
              className={cn(
                "text-xs font-medium",
                result.remainderMinor !== 0 ? "text-destructive" : "text-muted-foreground",
              )}
            />
          </div>
          {result.error && <p className="text-xs text-destructive">{result.error}</p>}
        </div>
      ) : (
        active.length > 1 &&
        totalMinor !== 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {active.map((member) => (
              <span key={member.id} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: member.color }} />
                {member.name}
                <Money value={preview.get(member.id) ?? 0} colored={false} className="font-medium text-foreground" />
              </span>
            ))}
          </div>
        )
      )}
    </div>
  );
}

/** Übersetzt den Editor-Zustand in das, was die API erwartet. */
export function toSplitSpec(state: SplitState, members: Member[], totalMinor: number) {
  const active = members.filter((member) => member.is_active);
  if (state.template === "SINGLE") {
    return { template: "SINGLE" as const, member_id: state.singleMemberId };
  }
  if (state.template === "MANUAL") {
    const lines = active
      .map((member) => ({ member_id: member.id, amount_minor: state.manual[member.id] ?? 0 }))
      .filter((line) => line.amount_minor !== 0);
    return { template: "MANUAL" as const, lines };
  }
  void totalMinor;
  return { template: state.template };
}
