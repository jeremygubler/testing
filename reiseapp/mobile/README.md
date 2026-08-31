# mobile

Expo (SDK 57) + React Native + TypeScript strict. Deckt **Phase 1 bis 6** ab: Auth, Trips, MapLibre-Karte mit Route und Stops,
Background-GPS-Tracking, Foto-Galerie, Timeline und Tagebuch — alles auf einem
lokalen SQLite-Cache mit Offline-Sync.

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

## Bauen unter Windows

Zwei Dinge, ohne die der Android-Build dort nicht durchläuft:

**Lange Pfade erlauben** — einmalig, als Administrator, danach neu starten:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
  -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

**CMake 4.x installieren** — im SDK Manager von Android Studio unter *SDK Tools*
mit gesetztem Häkchen bei *Show Package Details*.

Das Ausgelieferte CMake 3.22.1 bringt ein ninja von 2021 mit, das bei Pfaden
über 260 Zeichen aufgibt. Der Codegen von React Native bettet den absoluten
Quellpfad ein zweites Mal in den Objektpfad ein; die Shadow Nodes von
`react-native-gesture-handler` landen damit bei rund 380 Zeichen. Das Projekt zu
verschieben hilft nicht — 294 dieser Zeichen sind unabhängig vom Ablageort.

Dass Gradle das neuere CMake benutzt, stellt der Config-Plugin
`plugins/withCmakeVersion.js` sicher. `android/` wird generiert, eine
Handänderung an `app/build.gradle` wäre beim nächsten `prebuild` weg.

## Aufbau

```
app/                       expo-router: Dateisystem = Navigation
├── _layout.tsx            AuthProvider + Stack
├── index.tsx              Weiche: eingeloggt → /trips, sonst → /login
├── (auth)/                login, register   – nur ausgeloggt erreichbar
└── (app)/trips/           index, new, [id]/{index,timeline,journal}
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


## Offline-Sync (Phase 6)

Screens lesen **zuerst aus dem lokalen SQLite-Cache** und rendern sofort; danach läuft
ein Sync und sie lesen erneut. Ohne Netz funktioniert die erste Hälfte weiterhin — das
ist der ganze Punkt.

**Lokale Änderungen sammeln sich pro Datensatz in einer Outbox**, nicht als Log
einzelner Änderungen. Wer einen Titel fünfmal offline bearbeitet, schickt einen Titel,
nicht fünf. Pro Feld wird der Zeitpunkt der konkreten Bearbeitung mitgeführt — genau
das, was die feldweise Auflösung des Servers verarbeitet.

**Push vor Pull, immer.** Andersherum würde der Pull die Serverversion eines gerade
lokal bearbeiteten Datensatzes holen — und da der Pull Datensätze mit offenen
Änderungen überspringt, läge die lokale Bearbeitung hinter einer veralteten Ansicht
fest, bis zur nächsten Runde.

**Datensätze mit offenen lokalen Änderungen überschreibt der Pull nicht.** Löschungen
setzen sich trotzdem durch: der Datensatz ist serverseitig weg, eine offene Bearbeitung
würde beim Push ohnehin abgelehnt.

Die Outbox wird erst geleert, **nachdem** der Server die Änderungen angenommen hat. Ein
fehlgeschlagener Push lässt sie unangetastet — offline Geschriebenes kann nicht verloren
gehen.

### Was noch online braucht

- **Fotos**: Bytes brauchen eine Leitung, Upload und Thumbnails sind online-only. Die
  Metadaten liegen im Cache.
- **Route und Mitgliederliste**: serverseitig abgeleitet, werden noch direkt geholt.
- **Foto-Reihenfolge in Journal-Einträgen**: verweist auf Zeilen, die der Server kennen
  muss, und wird deshalb nachgeholt, sobald wieder Netz da ist. Der Eintrag selbst wird
  sofort lokal gespeichert.
