import type { CategoryGroup } from "@/api/types";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const GROUP_CLASS: Record<CategoryGroup, string> = {
  EINKOMMEN: "text-grp-einkommen border-grp-einkommen/40 bg-grp-einkommen/10",
  FIXKOSTEN: "text-grp-fixkosten border-grp-fixkosten/40 bg-grp-fixkosten/10",
  VARIABEL: "text-grp-variabel border-grp-variabel/40 bg-grp-variabel/10",
  SPAREN: "text-grp-sparen border-grp-sparen/40 bg-grp-sparen/10",
  SCHULDEN: "text-grp-schulden border-grp-schulden/40 bg-grp-schulden/10",
};

export const GROUP_COLOR_VAR: Record<CategoryGroup, string> = {
  EINKOMMEN: "hsl(var(--grp-einkommen))",
  FIXKOSTEN: "hsl(var(--grp-fixkosten))",
  VARIABEL: "hsl(var(--grp-variabel))",
  SPAREN: "hsl(var(--grp-sparen))",
  SCHULDEN: "hsl(var(--grp-schulden))",
};

export function GroupBadge({ group, className }: { group: CategoryGroup; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        GROUP_CLASS[group],
        className,
      )}
    >
      {t.group[group]}
    </span>
  );
}
