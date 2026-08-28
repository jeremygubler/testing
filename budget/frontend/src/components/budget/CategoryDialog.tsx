import { useRef, useState } from "react";

import { useCreateCategory, useUpdateCategory } from "@/api/hooks";
import type { Category, CategoryGroup } from "@/api/types";
import { CATEGORY_GROUPS } from "@/api/types";
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

const PRESET_COLORS = [
  "#1e3a5f", "#334155", "#0f766e", "#166534", "#b45309",
  "#c2410c", "#7f1d1d", "#4b5563", "#7c2d12", "#155e75",
];

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
  /** Vorbelegter Name, wenn der Dialog aus der Kategoriesuche heraus geöffnet wird. */
  defaultName?: string;
  onCreated?: (category: Category) => void;
}

/**
 * Der Inhalt wird nur gerendert, solange der Dialog offen ist, und trägt einen
 * `key` aus der bearbeiteten Kategorie. Dadurch startet das Formular bei jedem
 * Öffnen frisch — ohne einen Effekt, der Zustand aus Props zurücksetzt.
 */
export function CategoryDialog({
  open,
  onOpenChange,
  category,
  defaultName,
  onCreated,
}: CategoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && (
          <CategoryForm
            key={`${category?.id ?? "neu"}:${defaultName ?? ""}`}
            category={category}
            defaultName={defaultName}
            onCreated={onCreated}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  category,
  defaultName,
  onCreated,
  onClose,
}: {
  category?: Category | null;
  defaultName?: string;
  onCreated?: (category: Category) => void;
  onClose: () => void;
}) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(category?.name ?? defaultName ?? "");
  const [group, setGroup] = useState<CategoryGroup>(category?.group ?? "VARIABEL");
  const [color, setColor] = useState(category?.color ?? PRESET_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      if (category) {
        await update.mutateAsync({ id: category.id, patch: { name, group, color } });
      } else {
        const created = await create.mutateAsync({ name, group, color });
        onCreated?.(created);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{category ? "Kategorie bearbeiten" : "Neue Kategorie"}</DialogTitle>
        <DialogDescription>
          Die Gruppe bestimmt, ob es sich um eine Einnahme oder eine Ausgabe handelt.
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
          <Label htmlFor="category-name">Name</Label>
          <Input
            id="category-name"
            ref={nameRef}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="z. B. Lebensmittel"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="category-group">Gruppe</Label>
          <Select value={group} onValueChange={(value) => setGroup(value as CategoryGroup)}>
            <SelectTrigger id="category-group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              // Radix gibt den Fokus nach dem Schliessen an das Auswahlfeld zurück.
              // Tab geht von dort vorwärts zu den Farben — am Namensfeld vorbei, das
              // ja davor steht. Wer die Gruppe zuerst wählt, tippt sonst ins Leere.
              onCloseAutoFocus={(event) => {
                if (name.trim()) return;
                event.preventDefault();
                nameRef.current?.focus();
              }}
            >
              {CATEGORY_GROUPS.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {t.group[entry]} · {entry === "EINKOMMEN" ? t.flow.INCOME : t.flow.EXPENSE}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Farbe</Label>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setColor(preset)}
                aria-label={`Farbe ${preset}`}
                aria-pressed={color === preset}
                className="size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-foreground"
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.app.cancel}
          </Button>
          <Button type="submit" disabled={!name.trim() || create.isPending || update.isPending}>
            {t.app.save}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
