import { useState } from "react";

import { Input } from "@/components/ui/input";
import { parseAmountInput, toDecimalString } from "@/lib/money";
import { cn } from "@/lib/utils";

interface BudgetAmountInputProps {
  value: number | null;
  onCommit: (amountMinor: number | null) => void;
  placeholder?: string;
  className?: string;
  "aria-label": string;
}

/**
 * Betragsfeld, das erst beim Verlassen oder mit Enter speichert — sonst würde jeder
 * Tastendruck eine Anfrage auslösen. Leeren + Enter entfernt den Eintrag.
 */
export function BudgetAmountInput({ value, onCommit, placeholder, className, ...rest }: BudgetAmountInputProps) {
  const [text, setText] = useState(value === null ? "" : toDecimalString(value));

  // Aendert sich der gespeicherte Betrag von aussen, das Feld angleichen. Das
  // passiert waehrend des Renderns statt in einem Effekt -- so gibt es keinen
  // Durchgang, in dem das Feld noch den alten Wert zeigt.
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setText(value === null ? "" : toDecimalString(value));
  }

  function commit() {
    const trimmed = text.trim();
    if (trimmed === "") {
      if (value !== null) onCommit(null);
      return;
    }
    const parsed = parseAmountInput(trimmed);
    if (parsed === null || parsed < 0) {
      setText(value === null ? "" : toDecimalString(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  }

  return (
    <Input
      {...rest}
      value={text}
      inputMode="decimal"
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === "Escape") setText(value === null ? "" : toDecimalString(value));
      }}
      className={cn("h-8 text-right tabular", className)}
    />
  );
}
