import { cn } from "@/lib/utils";

/**
 * Auslastungsbalken. Bis 100 % neutral gefüllt, darüber wird nur der überschiessende
 * Teil markiert — eine ganze Zeile rot einzufärben wäre Alarm ohne Information.
 */
export function UsageBar({ usage, className }: { usage: number | null; className?: string }) {
  if (usage === null) {
    return <div className={cn("h-1.5 rounded-full bg-muted", className)} aria-hidden />;
  }

  const percent = Math.max(0, usage) * 100;
  const filled = Math.min(percent, 100);
  const over = Math.min(Math.max(percent - 100, 0), 100);

  return (
    <div
      className={cn("flex h-1.5 overflow-hidden rounded-full bg-muted", className)}
      role="img"
      aria-label={`${Math.round(percent)} % des Budgets`}
    >
      <div
        className={cn("h-full", over > 0 ? "bg-muted-foreground/50" : "bg-foreground/60")}
        style={{ width: `${filled}%` }}
      />
      {over > 0 && <div className="h-full bg-destructive" style={{ width: `${over}%` }} />}
    </div>
  );
}
