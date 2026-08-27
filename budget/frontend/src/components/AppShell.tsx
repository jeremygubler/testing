import { useCallback, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Keyboard,
  LayoutDashboard,
  Menu,
  Receipt,
  Repeat,
  Settings,
  Wallet,
} from "lucide-react";

import { MonthNavigator } from "@/components/MonthNavigator";
import { ShortcutHelp } from "@/components/ShortcutHelp";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useHouseholdContext } from "@/components/HouseholdProvider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMonth } from "@/hooks/useMonth";
import { useShortcuts, type Shortcut } from "@/hooks/useShortcuts";
import { useTheme } from "@/hooks/useTheme";
import { t } from "@/i18n";
import { currentMonth } from "@/lib/date";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: t.nav.overview, icon: LayoutDashboard, end: true },
  { to: "/buchungen", label: t.nav.transactions, icon: Receipt },
  { to: "/budget", label: t.nav.budget, icon: Wallet },
  { to: "/wiederkehrend", label: t.nav.recurring, icon: Repeat },
  { to: "/kalender", label: t.nav.calendar, icon: CalendarDays },
  { to: "/einstellungen", label: t.nav.settings, icon: Settings },
];

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { household } = useHouseholdContext();
  const location = useLocation();
  const navigate = useNavigate();
  const { shift, setMonth } = useMonth();
  const { toggle: toggleTheme } = useTheme();

  const go = useCallback(
    (to: string) => navigate({ pathname: to, search: location.search }),
    [navigate, location.search],
  );

  /** „Neue Buchung" springt zur Liste und setzt den Fokus ins Betragsfeld. */
  const focusQuickEntry = useCallback(() => {
    go("/buchungen");
    window.setTimeout(() => document.getElementById("quick-amount")?.focus(), 60);
  }, [go]);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { key: "arrowleft", handler: () => shift(-1) },
      { key: "arrowright", handler: () => shift(1) },
      { key: "h", handler: () => setMonth(currentMonth()) },
      { key: "n", handler: focusQuickEntry },
      { key: "d", handler: toggleTheme },
      { key: "?", handler: () => setHelpOpen(true) },
      ...NAV.map((entry, index) => ({
        key: String(index + 1),
        handler: () => go(entry.to),
      })),
    ],
    [shift, setMonth, focusQuickEntry, toggleTheme, go],
  );

  useShortcuts(shortcuts, !helpOpen);

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={{ pathname: to, search: location.search }}
          end={end}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-secondary font-medium text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )
          }
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r bg-card/40 p-3 md:flex md:flex-col">
        <div className="mb-4 px-2.5 pt-1">
          <p className="text-sm font-semibold leading-tight">{t.app.title}</p>
          <p className="truncate text-xs text-muted-foreground">{household?.name ?? "…"}</p>
        </div>
        {nav}
        <div className="mt-auto px-2.5 pb-1 text-[11px] text-muted-foreground tabular">
          {household ? `${household.currency} · ${household.locale}` : ""}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label="Menü"
            aria-expanded={mobileOpen}
          >
            <Menu />
          </Button>
          <MonthNavigator />
          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden sm:inline-flex"
                  onClick={() => setHelpOpen(true)}
                  aria-label="Tastenkürzel"
                >
                  <Keyboard />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Tastenkürzel <kbd className="ml-1 font-mono">?</kbd>
              </TooltipContent>
            </Tooltip>
            <ThemeToggle />
          </div>
        </header>

        {mobileOpen && (
          <div className="border-b bg-card p-2 md:hidden">{nav}</div>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto p-3 md:p-5">
          <Outlet />
        </main>
      </div>

      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
