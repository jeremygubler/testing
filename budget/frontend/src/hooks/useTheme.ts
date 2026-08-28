import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "budget.theme";

function readStored(): "light" | "dark" | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Dark Mode ist von Anfang an vorgesehen: das Theme wird bereits in `index.html`
 * vor dem ersten Paint gesetzt, dieser Hook hält es nur noch synchron.
 */
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => readStored() ?? (document.documentElement.classList.contains("dark") ? "dark" : "light"),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* Privater Modus: dann eben nur für diese Sitzung. */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((value) => (value === "dark" ? "light" : "dark")), []);

  return { theme, setTheme, toggle };
}
