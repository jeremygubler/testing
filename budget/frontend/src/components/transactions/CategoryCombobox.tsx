import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import type { Category, CategoryGroup } from "@/api/types";
import { CATEGORY_GROUPS } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

interface CategoryComboboxProps {
  categories: Category[];
  value: number | null;
  onChange: (categoryId: number) => void;
  /** Wird nach einer Auswahl aufgerufen — damit der Fokus weiterwandern kann. */
  onCommit?: () => void;
  placeholder?: string;
  className?: string;
  triggerRef?: React.Ref<HTMLButtonElement>;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Kategorieauswahl mit Tippsuche, gruppiert nach Kategoriegruppe. */
export function CategoryCombobox({
  categories,
  value,
  onChange,
  onCommit,
  placeholder,
  className,
  triggerRef,
  disabled,
  open: controlledOpen,
  onOpenChange,
}: CategoryComboboxProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const selected = categories.find((category) => category.id === value) ?? null;

  const grouped = useMemo(() => {
    const map = new Map<CategoryGroup, Category[]>();
    for (const group of CATEGORY_GROUPS) map.set(group, []);
    for (const category of categories) {
      if (!category.is_active && category.id !== value) continue;
      map.get(category.group)?.push(category);
    }
    return [...map.entries()].filter(([, items]) => items.length > 0);
  }, [categories, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: selected.color }}
              />
            )}
            <span className="truncate">{selected?.name ?? placeholder ?? t.transactions.quickCategory}</span>
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(20rem,90vw)] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const haystack = itemValue.toLowerCase();
            const needle = search.toLowerCase().trim();
            if (!needle) return 1;
            if (haystack.startsWith(needle)) return 1;
            return haystack.includes(needle) ? 0.5 : 0;
          }}
        >
          <CommandInput placeholder={t.transactions.quickCategory} />
          <CommandList>
            <CommandEmpty>Keine Kategorie gefunden.</CommandEmpty>
            {grouped.map(([group, items]) => (
              <CommandGroup key={group} heading={t.group[group]}>
                {items.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={category.name}
                    onSelect={() => {
                      onChange(category.id);
                      setOpen(false);
                      onCommit?.();
                    }}
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="truncate">{category.name}</span>
                    {!category.is_active && (
                      <span className="ml-auto text-[11px] text-muted-foreground">inaktiv</span>
                    )}
                    {category.id === value && <Check className="ml-auto size-3.5" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
