# mobile

Expo (React Native) + TypeScript. Wird in **Phase 1** angelegt.

Warum Expo und kein PWA: das Kernfeature ist Background-Location-Tracking
(`expo-location` + `expo-task-manager`). Ein Browser kann Positionen nicht zuverlässig
aufzeichnen, wenn der Screen aus ist – genau dann läuft aber die Reise.

Geplante Bausteine:

- `@maplibre/maplibre-react-native` – Karte, Route, Stops
- WatermelonDB (SQLite) – lokale, reaktive DB als Source of Truth offline
- Expo Router, TypeScript strict
- EAS Build für Store-Builds; Dev-Client, weil MapLibre und WatermelonDB Native-Code haben
