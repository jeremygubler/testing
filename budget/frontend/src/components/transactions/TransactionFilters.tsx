import { Search, X } from "lucide-react";

import type { Account, Category, CategoryGroup, Member } from "@/api/types";
import { CATEGORY_GROUPS } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export interface FilterState {
  from: string;
  to: string;
  q: string;
  categoryIds: number[];
  groups: CategoryGroup[];
  memberIds: number[];
  accountIds: number[];
  /** true = nur Umbuchungen, false = keine, null = alle. */
  transfers: boolean | null;
}

interface TransactionFiltersProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  onReset: () => void;
  categories: Category[];
  members: Member[];
  accounts: Account[];
  isFiltered: boolean;
}

export function TransactionFilters({
  value,
  onChange,
  onReset,
  categories,
  members,
  accounts,
  isFiltered,
}: TransactionFiltersProps) {
  function toggle<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
  }

  return (
    <div className="space-y-2.5 rounded-lg border bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.q}
            onChange={(event) => onChange({ ...value, q: event.target.value })}
            placeholder={t.transactions.search}
            className="pl-8"
            aria-label={t.transactions.search}
          />
        </div>
        <div>
          <Label htmlFor="filter-from" className="sr-only">
            {t.transactions.from}
          </Label>
          <Input
            id="filter-from"
            type="date"
            value={value.from}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
            className="tabular"
          />
        </div>
        <div>
          <Label htmlFor="filter-to" className="sr-only">
            {t.transactions.to}
          </Label>
          <Input
            id="filter-to"
            type="date"
            value={value.to}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
            className="tabular"
          />
        </div>
        {isFiltered && (
          <Button variant="ghost" onClick={onReset} className="justify-self-start text-xs">
            <X />
            {t.transactions.reset}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORY_GROUPS.map((group) => (
          <FilterChip
            key={group}
            active={value.groups.includes(group)}
            onClick={() => onChange({ ...value, groups: toggle(value.groups, group) })}
          >
            {t.group[group]}
          </FilterChip>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {members
          .filter((member) => member.is_active || value.memberIds.includes(member.id))
          .map((member) => (
            <FilterChip
              key={member.id}
              active={value.memberIds.includes(member.id)}
              onClick={() => onChange({ ...value, memberIds: toggle(value.memberIds, member.id) })}
            >
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: member.color }} />
              {member.name}
            </FilterChip>
          ))}
      </div>

      {(accounts.length > 1 || value.transfers !== null) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {accounts
            .filter((account) => account.is_active || value.accountIds.includes(account.id))
            .map((account) => (
              <FilterChip
                key={account.id}
                active={value.accountIds.includes(account.id)}
                onClick={() => onChange({ ...value, accountIds: toggle(value.accountIds, account.id) })}
              >
                {account.name}
              </FilterChip>
            ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <FilterChip
            active={value.transfers === true}
            onClick={() => onChange({ ...value, transfers: value.transfers === true ? null : true })}
          >
            Nur Umbuchungen
          </FilterChip>
          <FilterChip
            active={value.transfers === false}
            onClick={() => onChange({ ...value, transfers: value.transfers === false ? null : false })}
          >
            Ohne Umbuchungen
          </FilterChip>
        </div>
      )}

      {value.categoryIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {value.categoryIds.map((id) => {
            const category = categories.find((entry) => entry.id === id);
            return (
              <FilterChip key={id} active onClick={() => onChange({ ...value, categoryIds: toggle(value.categoryIds, id) })}>
                {category?.name ?? id}
                <X className="size-3" />
              </FilterChip>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary/30 bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
