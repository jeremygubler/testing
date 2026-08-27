import { useState } from "react";
import { ArrowRight, Check, Loader2, Undo2 } from "lucide-react";

import { useDeleteSettlement, useRecordSettlement } from "@/api/hooks";
import type { MemberFigure, Member, Payment, Settlement } from "@/api/types";
import { Money } from "@/components/Money";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { todayIso } from "@/lib/date";

interface MemberBreakdownProps {
  members: Member[];
  figures: MemberFigure[];
  settlement: Settlement | undefined;
  year: number;
  month: number;
}

/**
 * Wer hat wie viel eingenommen und getragen — und wer schuldet wem was.
 * Bewusst als konkrete Zahlungsempfehlung statt als Schuldenmatrix.
 */
export function MemberBreakdown({
  members,
  figures,
  settlement,
  year,
  month,
}: MemberBreakdownProps) {
  const byId = new Map(members.map((member) => [member.id, member]));
  const name = (id: number) => byId.get(id)?.name ?? "?";

  if (figures.length === 0) {
    return <EmptyState title="Keine Personen" description="Lege im Bereich Einstellungen mindestens eine Person an." />;
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.transactions.person}</TableHead>
            <TableHead className="text-right">Einnahmen</TableHead>
            <TableHead className="text-right">Getragen</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {figures.map((figure) => {
            const member = byId.get(figure.member_id);
            return (
              <TableRow key={figure.member_id}>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: member?.color ?? "currentColor" }}
                    />
                    {member?.name ?? "?"}
                    {member && !member.is_active && (
                      <span className="text-[11px] text-muted-foreground">inaktiv</span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Money value={figure.income_minor} bare colored={false} />
                </TableCell>
                <TableCell className="text-right">
                  <Money value={figure.expense_minor} bare colored={false} />
                </TableCell>
                <TableCell className="text-right">
                  <Money value={figure.balance_minor} bare className="font-medium" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <SettlementBox settlement={settlement} name={name} year={year} month={month} />
    </div>
  );
}


/**
 * Der Ausgleich als Vorgang, nicht nur als Anzeige.
 *
 * Eine Empfehlung lässt sich als geflossen festhalten; danach ist sie erledigt und
 * taucht im Folgemonat nicht wieder auf. Ohne das begann jede Periode wieder bei null
 * und offene Beträge verschwanden lautlos.
 */
function SettlementBox({
  settlement,
  name,
  year,
  month,
}: {
  settlement: Settlement | undefined;
  name: (id: number) => string;
  year: number;
  month: number;
}) {
  const { date: formatDate } = useHouseholdContext();
  const record = useRecordSettlement();
  const remove = useDeleteSettlement();
  const [error, setError] = useState<string | null>(null);

  async function markPaid(payment: Payment) {
    setError(null);
    try {
      await record.mutateAsync({
        from_member_id: payment.from_member_id,
        to_member_id: payment.to_member_id,
        amount_minor: payment.amount_minor,
        // Bezahlt wird heute, ausgeglichen wird der angezeigte Monat -- das ist
        // typischerweise nicht dasselbe.
        date: todayIso(),
        period_year: year,
        period_month: month,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.app.error);
    }
  }

  const recorded = settlement?.recorded ?? [];

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
      <p className="text-xs font-medium text-muted-foreground">
        Ausgleich {settlement?.basis === "INCOME" ? "(nach Einkommensanteil)" : "(nach Schlüssel)"}
      </p>

      {!settlement || settlement.payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {settlement && settlement.total_expense_minor > 0
            ? recorded.length > 0
              ? "Ausgeglichen — alles Offene ist beglichen."
              : "Alle haben ihren Anteil getragen — nichts auszugleichen."
            : "In diesem Monat gibt es noch keine Ausgaben."}
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {settlement.payments.map((payment) => (
            <li
              key={`${payment.from_member_id}-${payment.to_member_id}`}
              className="flex flex-wrap items-center gap-1.5"
            >
              <span className="font-medium">{name(payment.from_member_id)}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-label="überweist" />
              <span className="font-medium">{name(payment.to_member_id)}</span>
              <Money value={payment.amount_minor} colored={false} className="ml-auto font-medium" />
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-xs"
                disabled={record.isPending}
                onClick={() => void markPaid(payment)}
              >
                {record.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                Beglichen
              </Button>
            </li>
          ))}
        </ul>
      )}

      {recorded.length > 0 && (
        <ul className="space-y-1 border-t pt-1.5 text-xs text-muted-foreground">
          {recorded.map((entry) => (
            <li key={entry.id} className="group flex items-center gap-1.5">
              <Check className="size-3 shrink-0" aria-hidden />
              <span className="truncate">
                {name(entry.from_member_id)} → {name(entry.to_member_id)}
              </span>
              <Money value={entry.amount_minor} bare colored={false} />
              <span className="tabular">am {formatDate(entry.date)}</span>
              <Button
                size="icon-sm"
                variant="ghost"
                className="ml-auto shrink-0 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                aria-label={`Zahlung zurücknehmen: ${name(entry.from_member_id)} an ${name(entry.to_member_id)}`}
                title="Zurücknehmen"
                disabled={remove.isPending}
                onClick={() => remove.mutate(entry.id)}
              >
                <Undo2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
