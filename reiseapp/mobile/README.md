# mobile

Expo (SDK 57) + React Native + TypeScript strict. Deckt **Phase 1 bis 4** ab: Auth-Screens, Trip-Liste, Trip-Anlage, Trip-Detail mit
MapLibre-Karte, Route und Stops, Background-GPS-Tracking und Foto-Galerie.

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
npm test            # Jest: reine Logik (Profil, Sync, IDs, Distanz)
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


## Background-Tracking (Phase 3)

Drei Dinge, die den Unterschied zwischen „funktioniert im Test" und „funktioniert auf
einer dreiwöchigen Reise" ausmachen:

**Jeder Fix landet zuerst in SQLite, nicht im Netz.** Punkte werden erst gelöscht,
nachdem der Server sie bestätigt hat. Ein Tal ohne Empfang kostet damit keinen Meter
Route – der Puffer läuft einfach voll und leert sich später.

**Wegpunkt-IDs werden abgeleitet, nicht gewürfelt.** Die ID ist ein SHA-256 aus
`(Geräte-ID, Zeitstempel)`. Liefert das Betriebssystem denselben Fix ein zweites Mal an
einen neu gestarteten Task – das passiert –, kollidiert er lokal (`INSERT OR IGNORE`)
und serverseitig (`ON CONFLICT DO NOTHING`), statt ein zweiter Punkt zu werden. Mit
Zufalls-IDs wäre jeder Replay eine Dublette in der Route.

**Die Aufzeichnungsdichte folgt der Bewegung.** Im Stehen alle 2 Minuten, zu Fuss alle
20 Sekunden, im Fahrzeug alle 10. Die Schwellen sind asymmetrisch: Hochschalten braucht
eine deutlich höhere Geschwindigkeit als Runterschalten eine niedrigere. Ohne diese
Hysterese würde jemand an einer Ampel im Sekundentakt zwischen Profilen springen – und
jeder Wechsel startet die Location-Updates neu.

Dazu: `pausesUpdatesAutomatically: false`. iOS entscheidet sonst selbst, dass man
stehengeblieben ist, und nimmt die Aufzeichnung stillschweigend nicht wieder auf.

### Berechtigungen

Erst Vordergrund, dann Hintergrund – in dieser Reihenfolge, weil beide Plattformen den
Hintergrund-Dialog verweigern, solange der Vordergrund nicht erteilt ist. Wird nur
„Während der Nutzung" gewährt, sagt die App das offen: die Spur bricht dann ab, sobald
sie in den Hintergrund geht.

Auf Android läuft die Aufzeichnung als Foreground-Service mit dauerhafter Notification –
das ist keine Design-Entscheidung, sondern Bedingung dafür, dass Android den Prozess am
Leben lässt.
