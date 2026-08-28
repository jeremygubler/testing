import { Construction } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";

/** Platzhalter für Bereiche, die in einer späteren Phase gebaut werden. */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-3">
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={<Construction />}
          title="Dieser Bereich entsteht noch"
          description={`Geplant für ${phase}.`}
        />
      </div>
    </div>
  );
}
