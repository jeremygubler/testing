import { useCallback, useSyncExternalStore } from "react";

/**
 * Media Query als React-State — für Layoutentscheidungen, die CSS nicht treffen kann.
 *
 * Über `useSyncExternalStore` statt über einen Effekt mit `setState`: die Media Query
 * ist ein externer Speicher, den React direkt abfragen kann. Das vermeidet den
 * Zwischenzustand nach dem ersten Rendern, in dem der Wert noch nicht stimmt.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  // Ohne Fenster (Serverrendern, Tests) gibt es keine Media Query.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
