import { useEffect } from "react";

export interface Shortcut {
  /** Taste in Kleinschreibung, z. B. "n" oder "arrowleft". */
  key: string;
  handler: (event: KeyboardEvent) => void;
  /** Auch feuern, während ein Eingabefeld den Fokus hat (z. B. für Escape). */
  allowInInput?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Globale Tastenkürzel.
 *
 * Modifier-Kombinationen bleiben dem Browser überlassen, und während der Fokus in
 * einem Eingabefeld steht, passiert nichts — ein „n" im Beschreibungsfeld soll ein
 * Buchstabe sein und kein Befehl.
 */
export function useShortcuts(shortcuts: Shortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const typing = isTypingTarget(event.target);
      for (const shortcut of shortcuts) {
        if (shortcut.key !== key) continue;
        if (typing && !shortcut.allowInInput) continue;
        event.preventDefault();
        shortcut.handler(event);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, enabled]);
}
