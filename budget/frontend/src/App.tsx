import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { HouseholdGate } from "@/components/HouseholdGate";
import { HouseholdProvider } from "@/components/HouseholdProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TransactionsPage } from "@/pages/TransactionsPage";

/**
 * Erfassen ist der häufigste Weg in die App und wird direkt geladen. Alles Weitere
 * kommt bei Bedarf nach: die Diagrammbibliothek allein wiegt mehr als der ganze Rest
 * und hat auf dem Handy nichts im ersten Ladevorgang zu suchen.
 */
const OverviewPage = lazy(() =>
  import("@/pages/OverviewPage").then((m) => ({ default: m.OverviewPage })),
);
const YearPage = lazy(() => import("@/pages/YearPage").then((m) => ({ default: m.YearPage })));
const BudgetPage = lazy(() => import("@/pages/BudgetPage").then((m) => ({ default: m.BudgetPage })));
const RecurringPage = lazy(() =>
  import("@/pages/RecurringPage").then((m) => ({ default: m.RecurringPage })),
);
const CalendarPage = lazy(() =>
  import("@/pages/CalendarPage").then((m) => ({ default: m.CalendarPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);

function PageFallback() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <span className="sr-only">Wird geladen …</span>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <HouseholdProvider>
          <TooltipProvider delayDuration={300}>
            <HouseholdGate>
              <Routes>
                <Route
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <AppShell />
                    </Suspense>
                  }
                >
                  <Route index element={<OverviewPage />} />
                  <Route path="jahr" element={<YearPage />} />
                  <Route path="buchungen" element={<TransactionsPage />} />
                  <Route path="budget" element={<BudgetPage />} />
                  <Route path="wiederkehrend" element={<RecurringPage />} />
                  <Route path="kalender" element={<CalendarPage />} />
                  <Route path="einstellungen" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </HouseholdGate>
          </TooltipProvider>
        </HouseholdProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
