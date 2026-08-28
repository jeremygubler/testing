import { useState } from "react";
import { Check, Copy, Paperclip, Pencil, Trash2, X } from "lucide-react";

import {
  useAccounts,
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from "@/api/hooks";
import type { Category, Member, Transaction } from "@/api/types";
import { AttachmentDialog } from "@/components/attachments/AttachmentDialog";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { CategoryCombobox } from "./CategoryCombobox";
import { SplitEditor, toSplitSpec, type SplitState } from "./SplitEditor";
import { t } from "@/i18n";
import { todayIso } from "@/lib/date";
import { parseAmountInput, toDecimalString } from "@/lib/money";
import { detectTemplate } from "@/lib/splits";
import { cn } from "@/lib/utils";

/** Wert des Select-Eintrags "keine Umbuchung" — Radix erlaubt keinen leeren String. */
const NO_TRANSFER = "none";

interface TransactionRowProps {
  transaction: Transaction;
  categories: Category[];
  members: Member[];
  showYear?: boolean;
  /** Kontoname unter der Kategorie zeigen — sinnvoll erst ab zwei Konten. */
  showAccount?: boolean;
}

export function TransactionRow({
  transaction,
  categories,
  members,
  showYear = true,
  showAccount = false,
}: TransactionRowProps) {
  const { date: formatDate, dateShort } = useHouseholdContext();
  const { data: accounts = [] } = useAccounts();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const duplicate = useCreateTransaction();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(transaction, members));
  const [error, setError] = useState<string | null>(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  const memberById = new Map(members.map((member) => [member.id, member]));
  const amountMinor = editing ? parseAmountInput(draft.amountText) : transaction.amount_minor;
  // Eine Umbuchung ist weder Einnahme noch Ausgabe -- ihr ein Vorzeichen zu geben
  // waere geraten: sie belastet ein Konto und speist ein anderes.
  const signedAmount = transaction.is_transfer
    ? transaction.amount_minor
    : transaction.category_flow === "INCOME"
      ? transaction.amount_minor
      : -transaction.amount_minor;

  const selectableAccounts = accounts.filter(
    (account) => account.is_active || account.id === transaction.account_id || account.id === transaction.counter_account_id,
  );

  function startEditing() {
    setDraft(toDraft(transaction, members));
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (amountMinor === null || amountMinor === 0 || draft.categoryId === null) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: transaction.id,
        patch: {
          date: draft.date,
          category_id: draft.categoryId,
          account_id: draft.accountId,
          counter_account_id: draft.counterAccountId,
          description: draft.description,
          amount_minor: amountMinor,
          split: toSplitSpec(draft.split, members, amountMinor),
        },
      });
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  if (editing) {
    return (
      <TableRow className="bg-muted/30 align-top">
        <TableCell colSpan={6} className="p-2">
          <div className="grid gap-2 md:grid-cols-[9rem_13rem_minmax(0,1fr)_8rem_auto]">
            <Input
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              className="tabular"
              aria-label={t.transactions.date}
            />
            <CategoryCombobox
              categories={categories}
              value={draft.categoryId}
              onChange={(categoryId) => setDraft({ ...draft, categoryId })}
            />
            <Input
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder={t.transactions.description}
              aria-label={t.transactions.description}
            />
            <Input
              inputMode="decimal"
              value={draft.amountText}
              onChange={(event) => setDraft({ ...draft, amountText: event.target.value })}
              className="text-right tabular"
              aria-label={t.transactions.amount}
            />
            <div className="flex gap-1">
              <Button size="icon" onClick={() => void save()} disabled={update.isPending} aria-label={t.app.save}>
                <Check />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditing(false)} aria-label={t.app.cancel}>
                <X />
              </Button>
            </div>
          </div>

          {selectableAccounts.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <Label htmlFor={`txn-account-${transaction.id}`} className="text-muted-foreground">
                Konto
              </Label>
              <Select
                value={String(draft.accountId)}
                onValueChange={(value) => {
                  const next = Number(value);
                  setDraft((state) => ({
                    ...state,
                    accountId: next,
                    // Quelle und Ziel duerfen nicht dasselbe Konto sein.
                    counterAccountId: state.counterAccountId === next ? null : state.counterAccountId,
                  }));
                }}
              >
                <SelectTrigger id={`txn-account-${transaction.id}`} className="h-8 w-[11rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectableAccounts.map((account) => (
                    <SelectItem key={account.id} value={String(account.id)}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Label htmlFor={`txn-counter-${transaction.id}`} className="text-muted-foreground">
                Umbuchung auf
              </Label>
              <Select
                value={draft.counterAccountId === null ? NO_TRANSFER : String(draft.counterAccountId)}
                onValueChange={(value) =>
                  setDraft((state) => ({
                    ...state,
                    counterAccountId: value === NO_TRANSFER ? null : Number(value),
                  }))
                }
              >
                <SelectTrigger id={`txn-counter-${transaction.id}`} className="h-8 w-[11rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TRANSFER}>— keine —</SelectItem>
                  {selectableAccounts
                    .filter((account) => account.id !== draft.accountId)
                    .map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <SplitEditor
            members={members}
            totalMinor={amountMinor ?? 0}
            value={draft.split}
            onChange={(split) => setDraft({ ...draft, split })}
            compact
            className="mt-2"
          />
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="group">
      <TableCell className="whitespace-nowrap tabular text-muted-foreground">
        {showYear ? formatDate(transaction.date) : dateShort(transaction.date)}
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: transaction.category_color }}
          />
          <span className="truncate">{transaction.category_name}</span>
        </span>
        {(transaction.is_transfer || showAccount) && (
          <span className="block truncate pl-4 text-xs text-muted-foreground">
            {transaction.is_transfer
              ? `${transaction.account_name} → ${transaction.counter_account_name ?? "?"}`
              : transaction.account_name}
          </span>
        )}
      </TableCell>
      <TableCell className="max-w-[1px] truncate">
        {transaction.description || <span className="text-muted-foreground">–</span>}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap lg:table-cell">
        <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {transaction.splits.map((split) => {
            const member = memberById.get(split.member_id);
            return (
              <span key={split.member_id} className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: member?.color ?? "currentColor" }}
                />
                {member?.name ?? "?"}
                {transaction.splits.length > 1 && (
                  <Money value={split.amount_minor} colored={false} className="tabular" bare />
                )}
              </span>
            );
          })}
        </span>
      </TableCell>
      <TableCell className="text-right">
        {/* Negativ rot, positiv neutral -- Farbe traegt Bedeutung, nicht Stimmung.
            Umbuchungen bleiben neutral, sie sind kein Gewinn und kein Verlust. */}
        <Money
          value={signedAmount}
          bare
          colored={!transaction.is_transfer}
          className={transaction.is_transfer ? "font-medium text-muted-foreground" : "font-medium"}
        />
      </TableCell>
      <TableCell className="w-[8rem] text-right">
        <span className="inline-flex flex-nowrap items-center gap-0.5">
        {/* Der Belegknopf bleibt sichtbar, sobald einer da ist -- die Zahl ist eine
            Information über die Buchung, nicht eine Aktion, die man erst suchen soll. */}
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setAttachmentsOpen(true)}
          aria-label={
            transaction.attachment_count > 0
              ? `${transaction.attachment_count} Belege zu ${transaction.description || transaction.category_name}`
              : `Beleg zu ${transaction.description || transaction.category_name} anhängen`
          }
          title="Belege"
          className={cn(
            "relative transition-opacity",
            transaction.attachment_count === 0 &&
              "md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100",
          )}
        >
          <Paperclip />
          {transaction.attachment_count > 0 && (
            <span className="absolute right-0 top-0 min-w-3.5 rounded-full bg-primary px-1 text-[0.625rem] font-medium leading-3.5 text-primary-foreground tabular">
              {transaction.attachment_count}
            </span>
          )}
        </Button>
        <span className="inline-flex flex-nowrap gap-0.5 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
          <Button size="icon-sm" variant="ghost" onClick={startEditing} aria-label={t.app.edit}>
            <Pencil />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Duplizieren: ${transaction.description || transaction.category_name}`}
            title="Als neue Buchung von heute kopieren"
            disabled={duplicate.isPending}
            onClick={() =>
              duplicate.mutate({
                date: todayIso(),
                category_id: transaction.category_id,
                account_id: transaction.account_id,
                counter_account_id: transaction.counter_account_id,
                description: transaction.description,
                note: transaction.note,
                amount_minor: transaction.amount_minor,
                // Die Aufteilung exakt uebernehmen statt die Vorlage neu aufzuloesen --
                // ein zwischenzeitlich geaenderter Schluessel soll die Kopie nicht
                // anders aufteilen als das Original.
                split: { template: "MANUAL", lines: transaction.splits },
              })
            }
          >
            <Copy />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t.app.delete}
            onClick={() => {
              if (window.confirm(t.transactions.deleteConfirm)) remove.mutate(transaction.id);
            }}
          >
            <Trash2 />
          </Button>
        </span>
        </span>

        <AttachmentDialog
          txnId={transaction.id}
          label={`${formatDate(transaction.date)} · ${transaction.description || transaction.category_name}`}
          open={attachmentsOpen}
          onOpenChange={setAttachmentsOpen}
        />
      </TableCell>
    </TableRow>
  );
}

function toDraft(transaction: Transaction, members: Member[]) {
  const active = members.filter((member) => member.is_active);
  const template = detectTemplate(transaction.splits, active);
  const split: SplitState = {
    template,
    singleMemberId: transaction.splits[0]?.member_id ?? null,
    manual: Object.fromEntries(transaction.splits.map((line) => [line.member_id, line.amount_minor])),
  };
  return {
    date: transaction.date,
    categoryId: transaction.category_id as number | null,
    accountId: transaction.account_id,
    counterAccountId: transaction.counter_account_id,
    description: transaction.description,
    amountText: toDecimalString(transaction.amount_minor),
    split,
  };
}
