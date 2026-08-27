import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { HouseholdProvider } from "@/components/HouseholdProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BudgetPage } from "@/pages/BudgetPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { RecurringPage } from "@/pages/RecurringPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TransactionsPage } from "@/pages/TransactionsPage";

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
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<OverviewPage />} />
                <Route path="buchungen" element={<TransactionsPage />} />
                <Route path="budget" element={<BudgetPage />} />
                <Route path="wiederkehrend" element={<RecurringPage />} />
                <Route path="kalender" element={<CalendarPage />} />
                <Route path="einstellungen" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </TooltipProvider>
        </HouseholdProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
