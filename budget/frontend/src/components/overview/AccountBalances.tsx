import { Link } from "react-router-dom";

import { ACCOUNT_KIND_LABEL, type AccountBalance } from "@/api/types";
import { Money } from "@/components/Money";
import { toMonthParam } from "@/lib/date";
import type { MonthKey } from "@/lib/date";

/**
 * Kontostände zum Monatsende. Bewusst als schlichte Liste: die Zahl selbst ist die
 * Aussage, ein Diagramm über vier Zeilen wäre Dekoration.
 */
export function AccountBalances({
  accounts,
  netWorthMinor,
  availableMinor,
  month,
}: {
  accounts: AccountBalance[];
  netWorthMinor: number;
  availableMinor: number;
  month: MonthKey;
}) {
  const visible = accounts.filter((account) => account.is_active || account.balance_minor !== 0);
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">Noch kein Konto angelegt.</p>;
  }

  return (
    <div className="space-y-1.5">
      <table className="w-full text-sm">
        <tbody>
          {visible.map((account) => (
            <tr key={account.account_id} className="border-b border-border/50 last:border-0">
              <td className="py-1 pr-2">
                <Link
                  to={{
                    pathname: "/buchungen",
                    search: `?m=${toMonthParam(month)}&konto=${account.account_id}`,
                  }}
                  className="underline-offset-4 hover:underline"
                >
                  {account.name}
                </Link>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {ACCOUNT_KIND_LABEL[account.kind]}
                  {!account.include_in_available && " · nicht verfügbar"}
                </span>
              </td>
              <td className="py-1 text-right">
                <Money value={account.balance_minor} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t">
            <td className="pt-1.5 pr-2 font-medium">Vermögen</td>
            <td className="pt-1.5 text-right font-medium">
              <Money value={netWorthMinor} />
            </td>
          </tr>
          <tr>
            <td className="pr-2 text-xs text-muted-foreground">davon frei verfügbar</td>
            <td className="text-right text-xs text-muted-foreground">
              <Money value={availableMinor} bare colored={false} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
