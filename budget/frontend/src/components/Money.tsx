import { cn } from "@/lib/utils";
import { useHouseholdContext } from "./HouseholdProvider";
import type { MoneyFormatOptions } from "@/lib/format";

interface MoneyProps extends MoneyFormatOptions {
  value: number;
  className?: string;
  /**
   * Negative Werte werden rot. Positive bleiben neutral — nicht alles grün einzufärben
   * ist Absicht: Farbe soll Bedeutung tragen, nicht Stimmung.
   */
  colored?: boolean;
  /** Positive Werte zusätzlich grün, z. B. für einen Saldo im Plus. */
  colorPositive?: boolean;
}

export function Money({ value, className, colored = true, colorPositive = false, ...options }: MoneyProps) {
  const { money } = useHouseholdContext();
  return (
    <span
      className={cn(
        "tabular",
        colored && value < 0 && "text-destructive",
        colorPositive && value > 0 && "text-grp-sparen",
        className,
      )}
    >
      {money(value, options)}
    </span>
  );
}
