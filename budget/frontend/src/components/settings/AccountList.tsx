import { useState } from "react";
import { Plus, Trash2, Undo2 } from "lucide-react";

import {
  useAccountBalances,
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
} from "@/api/hooks";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABEL, type Account, type AccountKind } from "@/api/types";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { parseAmountInput, toDecimalString } from "@/lib/money";

/** Sparkonten zählen standardmäßig nicht zum frei verfügbaren Geld. */
function defaultsFor(kind: AccountKind): { include_in_available: boolean } {
  return { include_in_available: kind !== "SAVINGS" };
}

export function AccountList() {
  const { data: accounts = [] } = useAccounts();
  const { data: balances = [] } = useAccountBalances();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<AccountKind>("CHECKING");
  const [error, setError] = useState<string | null>(null);

  const balanceOf = new Map(balances.map((row) => [row.account_id, row]));
  const activeCount = accounts.filter((account) => account.is_active).length;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  async function add() {
    if (!newName.trim()) return;
    await run(async () => {
      await create.mutateAsync({
        name: newName.trim(),
        kind: newKind,
        sort_order: accounts.length,
        ...defaultsFor(newKind),
      });
      setNewName("");
      setNewKind("CHECKING");
    });
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-[9rem]">Art</TableHead>
            <TableHead className="w-[8rem] text-right">Startsaldo</TableHead>
            <TableHead className="w-[8rem] text-right">Stand</TableHead>
            <TableHead className="w-[7rem] text-center">Verfügbar</TableHead>
            <TableHead className="w-[7rem]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              balanceMinor={balanceOf.get(account.id)?.balance_minor ?? null}
              canDeactivate={account.is_active && activeCount > 1}
              onPatch={(patch) => void run(() => update.mutateAsync({ id: account.id, patch }))}
              onDelete={() => void run(() => remove.mutateAsync(account.id))}
            />
          ))}
        </TableBody>
      </Table>

      <p className="text-xs text-muted-foreground">
        Der Stand ist der Startsaldo plus alles, was auf dem Konto zu- und abgeflossen ist —
        Umbuchungen eingerechnet. Nichts davon wird gespeichert, alles wird gerechnet. Konten
        ohne Buchungen lassen sich löschen, benutzte nur deaktivieren.
      </p>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Neues Konto"
          className="max-w-xs"
          aria-label="Name des neuen Kontos"
        />
        <Select value={newKind} onValueChange={(value) => setNewKind(value as AccountKind)}>
          <SelectTrigger className="w-[10rem]" aria-label="Art des neuen Kontos">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {ACCOUNT_KIND_LABEL[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={!newName.trim() || create.isPending}>
          <Plus />
          {t.app.add}
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function AccountRow({
  account,
  balanceMinor,
  canDeactivate,
  onPatch,
  onDelete,
}: {
  account: Account;
  balanceMinor: number | null;
  canDeactivate: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  return (
    <TableRow className={account.is_active ? undefined : "opacity-60"}>
      <TableCell>
        <Input
          key={account.name}
          defaultValue={account.name}
          aria-label={`Name ${account.name}`}
          className="h-8"
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value && value !== account.name) onPatch({ name: value });
          }}
        />
      </TableCell>
      <TableCell>
        <Select value={account.kind} onValueChange={(value) => onPatch({ kind: value })}>
          <SelectTrigger className="h-8" aria-label={`Art ${account.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {ACCOUNT_KIND_LABEL[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right">
        <Input
          key={account.opening_balance_minor}
          inputMode="decimal"
          defaultValue={toDecimalString(account.opening_balance_minor)}
          aria-label={`Startsaldo ${account.name}`}
          className="h-8 text-right tabular"
          onBlur={(event) => {
            const value = parseAmountInput(event.target.value);
            if (value !== null && value !== account.opening_balance_minor) {
              onPatch({ opening_balance_minor: value });
            }
          }}
        />
      </TableCell>
      <TableCell className="text-right">
        {balanceMinor === null ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          <Money value={balanceMinor} />
        )}
      </TableCell>
      <TableCell className="text-center">
        <Switch
          checked={account.include_in_available}
          aria-label={`${account.name} zählt zum verfügbaren Geld`}
          onCheckedChange={(checked) => onPatch({ include_in_available: checked })}
        />
      </TableCell>
      <TableCell>
        {account.is_active ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={!canDeactivate}
            onClick={onDelete}
            title="Ohne Buchungen wird gelöscht, sonst deaktiviert."
          >
            <Trash2 />
            Entfernen
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onPatch({ is_active: true })}>
            <Undo2 />
            Aktivieren
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
