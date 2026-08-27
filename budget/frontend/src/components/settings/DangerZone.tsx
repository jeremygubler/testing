import { useRef, useState } from "react";
import { AlertTriangle, FileJson, Loader2, RotateCcw, Trash2 } from "lucide-react";

import { useResetHousehold, useRestoreBackup } from "@/api/hooks";
import type { ResetScope } from "@/api/types";
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

const CONFIRM_WORD = "LÖSCHEN";

/**
 * Alles, was sich nicht rückgängig machen lässt, an einer Stelle und deutlich
 * abgesetzt: Backup zurückspielen und Haushalt leeren. Beides verlangt, das Wort
 * „LÖSCHEN" zu tippen — ein Klick allein ist zu wenig.
 */
export function DangerZone() {
  const fileRef = useRef<HTMLInputElement>(null);
  const restore = useRestoreBackup();
  const [backup, setBackup] = useState<{ name: string; data: unknown } | null>(null);
  const [reset, setReset] = useState<ResetScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setDone(null);
    try {
      setBackup({ name: file.name, data: JSON.parse(await file.text()) });
    } catch {
      setError("Die Datei ist kein gültiges JSON.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Backup zurückspielen</p>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
            event.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <FileJson />
          JSON-Backup wählen
        </Button>
        <p className="text-xs text-muted-foreground">
          Ersetzt den gesamten Haushalt durch den Stand aus der Datei. Alles, was seither
          erfasst wurde, geht verloren.
        </p>
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <p className="text-sm font-medium">Zurücksetzen</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setReset("TRANSACTIONS")}>
            <RotateCcw />
            Nur Buchungen löschen
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReset("ALL")}>
            <Trash2 />
            Alles löschen
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          „Nur Buchungen" behält Personen, Kategorien, Budgets, Regeln, Sparziele und Termine.
          „Alles" führt zurück zur Einrichtung.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {done && <p className="text-xs text-muted-foreground">{done}</p>}

      <ConfirmDialog
        open={backup !== null}
        onOpenChange={(next) => !next && setBackup(null)}
        title="Backup zurückspielen"
        description={
          <>
            <strong>{backup?.name}</strong> ersetzt den gesamten Haushalt. Alle aktuell
            erfassten Daten werden vorher gelöscht. Das lässt sich nicht rückgängig machen.
          </>
        }
        actionLabel="Zurückspielen"
        pending={restore.isPending}
        onConfirm={async () => {
          setError(null);
          try {
            const result = await restore.mutateAsync(backup?.data);
            setDone(
              `Zurückgespielt: ${result.restored.transactions ?? 0} Buchungen, ` +
                `${result.restored.categories ?? 0} Kategorien, ${result.restored.members ?? 0} Personen.`,
            );
            setBackup(null);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : t.app.error);
          }
        }}
      />

      <ResetDialog scope={reset} onClose={() => setReset(null)} onDone={setDone} onError={setError} />
    </div>
  );
}

function ResetDialog({
  scope,
  onClose,
  onDone,
  onError,
}: {
  scope: ResetScope | null;
  onClose: () => void;
  onDone: (text: string) => void;
  onError: (text: string) => void;
}) {
  const reset = useResetHousehold();

  return (
    <ConfirmDialog
      open={scope !== null}
      onOpenChange={(next) => !next && onClose()}
      title={scope === "ALL" ? "Alles löschen" : "Buchungen löschen"}
      description={
        scope === "ALL" ? (
          <>
            Löscht Buchungen, Personen, Kategorien, Budgets, Regeln, Sparziele und Termine.
            Danach beginnt die App wieder mit der Einrichtung. Ohne Backup ist das endgültig.
          </>
        ) : (
          <>
            Löscht alle Buchungen samt Aufteilungen. Personen, Kategorien, Budgets, Regeln,
            Sparziele und Termine bleiben erhalten.
          </>
        )
      }
      actionLabel={scope === "ALL" ? "Alles löschen" : "Buchungen löschen"}
      pending={reset.isPending}
      onConfirm={async () => {
        if (!scope) return;
        try {
          const result = await reset.mutateAsync({ scope, confirm: CONFIRM_WORD });
          onDone(
            result.household_deleted
              ? "Haushalt gelöscht — die Einrichtung beginnt von vorn."
              : `Gelöscht: ${result.removed.txn ?? 0} Buchungen.`,
          );
          onClose();
        } catch (cause) {
          onError(cause instanceof Error ? cause.message : t.app.error);
        }
      }}
    />
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  actionLabel: string;
  pending: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (matches) void onConfirm();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="confirm-word">
              Zur Bestätigung <span className="font-mono text-foreground">{CONFIRM_WORD}</span> eingeben
            </Label>
            <Input
              id="confirm-word"
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t.app.cancel}
            </Button>
            <Button type="submit" variant="destructive" disabled={!matches || pending}>
              {pending && <Loader2 className="animate-spin" />}
              {actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
