# mobile

Expo (SDK 57) + React Native + TypeScript strict. Deckt **Phase 1 und 2** ab: Auth-Screens,
Trip-Liste, Trip-Anlage, Trip-Detail mit MapLibre-Karte, Route und Stops.

Warum Expo und kein PWA: das Kernfeature ist Background-Location-Tracking
(`expo-location` + `expo-task-manager`, Phase 3). Ein Browser kann Positionen nicht
zuverlässig aufzeichnen, wenn der Screen aus ist – genau dann läuft aber die Reise.

## Starten

```bash
cd reiseapp/mobile
npm install

# API-URL: auf einem echten Gerät ist "localhost" das Telefon selbst,
# also die LAN-Adresse des Homelabs eintragen.
export EXPO_PUBLIC_API_URL=http://192.168.1.50:8000

npm run prebuild          # erzeugt android/ und ios/ (gitignored, generiert)
npm run android           # bzw. npm run ios – baut den Dev-Client
```

**Expo Go reicht ab hier nicht mehr.** MapLibre bringt Native-Code mit (und
WatermelonDB in Phase 6 ebenfalls), es braucht also einen Dev-Client.

### Kartenkacheln

Der Style ist konfigurierbar; Default sind die freien **MapLibre-Demo-Tiles** – gut
zum Loslegen, ausdrücklich nicht für Produktion gedacht:

```bash
export EXPO_PUBLIC_MAP_STYLE_URL=http://192.168.1.50:8080/style.json
```

Für volle Datenhoheit auch bei der Karte: `tileserver-gl` im Homelab mit einem
OSM-Extrakt (z. B. von Geofabrik) und diese URL setzen. Der Rest der App ändert sich
dadurch nicht.

Checks (identisch zu CI):

```bash
npm run typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess
npm run lint
npx expo export --platform android   # Bundle-Smoke-Test
```

## Aufbau

```
app/                       expo-router: Dateisystem = Navigation
├── _layout.tsx            AuthProvider + Stack
├── index.tsx              Weiche: eingeloggt → /trips, sonst → /login
├── (auth)/                login, register   – nur ausgeloggt erreichbar
└── (app)/trips/           index, new, [id]  – nur eingeloggt erreichbar
src/
├── api/client.ts          fetch-Wrapper: Bearer, 401 → Refresh → Retry
├── api/{auth,trips}.ts    Endpoint-Funktionen
├── auth/tokens.ts         expo-secure-store (Keychain/Keystore)
├── auth/AuthContext.tsx   Session-Status fürs UI
└── ui/                    Button, Field, ErrorBanner, Theme
```

### Zwei Details, die nicht offensichtlich sind

**Refresh ist single-flight.** Das Backend rotiert Refresh-Tokens und wertet ein
wiederverwendetes Token als Leck – es entwertet dann *alle* Sessions. Würden zwei
Screens gleichzeitig refreshen, würde der zweite Request das gerade verbrauchte Token
erneut schicken und den User dauerhaft ausloggen. Deshalb teilen sich alle Aufrufer
dasselbe Refresh-Promise.

**Der API-Client schiebt Session-Änderungen ans UI.** Läuft der Refresh ins Leere,
räumt der Client die Tokens weg und meldet das über `onSessionChange`; der
`AuthProvider` hört mit und schaltet auf „ausgeloggt". Sonst hinge die App auf einem
Screen, dessen Requests alle 401 liefern.
