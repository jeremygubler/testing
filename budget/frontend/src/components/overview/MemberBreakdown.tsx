import { ArrowRight } from "lucide-react";

import type { MemberFigure, Member, Settlement } from "@/api/types";
import { Money } from "@/components/Money";
import { EmptyState } from "@/components/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";

interface MemberBreakdownProps {
  members: Member[];
  figures: MemberFigure[];
  settlement: Settlement | undefined;
}

/**
 * Wer hat wie viel eingenommen und getragen — und wer schuldet wem was.
 * Bewusst als konkrete Zahlungsempfehlung statt als Schuldenmatrix.
 */
export function MemberBreakdown({ members, figures, settlement }: MemberBreakdownProps) {
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

      <div className="rounded-md border bg-muted/30 p-2.5">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Ausgleich {settlement?.basis === "INCOME" ? "(nach Einkommensanteil)" : "(nach Schlüssel)"}
        </p>
        {!settlement || settlement.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {settlement && settlement.total_expense_minor > 0
              ? "Alle haben ihren Anteil getragen — nichts auszugleichen."
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
