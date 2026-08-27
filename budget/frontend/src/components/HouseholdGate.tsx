import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { useHousehold } from "@/api/hooks";
import { ApiError } from "@/api/client";
import { SetupPage } from "@/pages/SetupPage";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/**
 * Entscheidet, was überhaupt angezeigt wird: die App, die Erstinbetriebnahme
 * oder ein ehrlicher Fehler. Ohne das würde eine frische Installation auf eine
 * leere Oberfläche schauen, die aussieht, als sei etwas kaputt.
 */
export function HouseholdGate({ children }: { children: ReactNode }) {
  const { data, isLoading, error, refetch, isFetching } = useHousehold();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">{t.app.loading}</span>
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    return <SetupPage />;
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle className="size-6 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Keine Verbindung zum Server</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Das Backend antwortet nicht. Läuft es auf dem erwarteten Port?
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching && <Loader2 className="animate-spin" />}
          {t.app.retry}
        </Button>
      </div>
    );
  }

  if (!data) return null;
  return <>{children}</>;
}
