import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useHousehold } from "@/api/hooks";
import type { Household } from "@/api/types";
import { formatDate, formatDateShort, formatMoney, formatPercent, type MoneyFormatOptions } from "@/lib/format";

interface HouseholdContextValue {
  household: Household | undefined;
  isLoading: boolean;
  currency: string;
  locale: string;
  money: (amountMinor: number, options?: MoneyFormatOptions) => string;
  percent: (value: number | null, digits?: number) => string;
  date: (iso: string) => string;
  dateShort: (iso: string) => string;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

/** Währung und Sprache kommen vom Haushalt, nicht aus einer Konstanten im Code. */
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { data: household, isLoading } = useHousehold();

  const value = useMemo<HouseholdContextValue>(() => {
    const currency = household?.currency ?? "CHF";
    const locale = household?.locale ?? "de-CH";
    return {
      household,
      isLoading,
      currency,
      locale,
      money: (amountMinor, options) => formatMoney(amountMinor, { currency, locale, ...options }),
      percent: (percentValue, digits) => formatPercent(percentValue, locale, digits),
      date: (iso) => formatDate(iso, locale),
      dateShort: (iso) => formatDateShort(iso, locale),
    };
  }, [household, isLoading]);

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHouseholdContext(): HouseholdContextValue {
  const context = useContext(HouseholdContext);
  if (!context) throw new Error("useHouseholdContext ausserhalb von HouseholdProvider");
  return context;
}
