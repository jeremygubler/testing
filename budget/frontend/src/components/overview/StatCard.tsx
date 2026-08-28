import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}

/** Kennzahlkarte: eine Zahl, gross und rechtsbündig lesbar, plus eine Einordnung. */
export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-1">
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-xl font-semibold tabular")}>{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground tabular">{hint}</div>}
      </CardContent>
    </Card>
  );
}
