import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { t } from "@/i18n";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={t.app.theme.toggle} title={t.app.theme.toggle}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
