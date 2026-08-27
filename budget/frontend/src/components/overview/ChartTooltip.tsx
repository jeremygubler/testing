import type { ReactNode } from "react";

/** Einheitlicher Tooltip für alle Charts, in den Farben der App statt Recharts-Default. */
export function ChartTooltip({ title, rows }: { title: string; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-muted-foreground">
            {row.color && <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: row.color }} />}
            <span>{row.label}</span>
            <span className="ml-auto font-medium tabular text-popover-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
