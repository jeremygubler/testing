# Richtung

Festgehaltene Absichten für die Weiterentwicklung, Stand 31.08.2026, und was
daraus **heute schon** für den Code folgt. Kein Zeitplan, keine Zusagen — eine
Liste von Weichen, damit sie nicht unbemerkt in die falsche Richtung gestellt
werden.

Der aktuelle Stand ist ein Einzelplatz-System für ein Homelab: invite-only, eine
Familie, kein Geld im Spiel. Alle vier Absichten unten brechen mindestens eine
dieser Annahmen.

---

## 1. Kommerziell mit Abo

**Absicht:** Bezahlprodukt mit Basis- und Plus-Abo.

### Was das heute schon entscheidet

**Kartenkacheln.** Von den frei verfügbaren Diensten trägt für ein Bezahlprodukt
keiner:

| Dienst | Kommerziell |
|---|---|
| MapLibre-Demo-Tiles | ausdrücklich nicht für Produktion |
| MapTiler, Stadia (Gratis-Stufe) | nur nicht-kommerziell |
| Carto Basemaps | freie Nutzung ist nicht-kommerziell |
| OpenFreeMap | erlaubt, aber spendenfinanziert und ohne Zusage |

Der eigene `tileserver-gl` mit OSM-Extrakt ist damit nicht mehr die schönere,
sondern die einzige tragfähige Variante. OSM-Daten stehen unter ODbL:
kommerziell nutzbar, Namensnennung „© OpenStreetMap contributors" verpflichtend.
Nebeneffekt: Offline-Karten, und die sind für eine Reise-App ein
Verkaufsargument.

**Zahlungen.** Apple und Google verlangen für digitale Abos ihre eigene
Kaufabwicklung, 15–30 %. Das prägt das Preismodell und lässt sich nicht am Ende
nachrüsten. Wer über das Web verkauft und die App nur als Zugang mitliefert,
umgeht das teilweise; die Regeln dazu bewegen sich gerade in der EU.

**Mandantenfähigkeit.** Heute fehlt alles, was zahlende Fremde brauchen:
Registrierung ohne Einladung, Passwort-Zurücksetzen, Mail-Bestätigung,
Ratenlimit, **Kontingente pro Konto**. Ohne Kontingente lädt der erste Kunde
200 GB Fotos hoch.

**Datenschutz.** Standortverläufe sind besonders schützenswerte Personendaten.
revDSG, bei EU-Kunden zusätzlich DSGVO: Datenschutzerklärung, Löschkonzept,
Auftragsverarbeitung, dokumentierte Einwilligung fürs Hintergrund-Tracking. Der
JSON-Export ist bereits ein Baustein der Auskunftspflicht.

**Lizenzprüfung.** Rund 1400 Pakete liegen in `node_modules`. Vor dem Verkauf
gehört da ein Audit drüber.

### Offen

Wofür zahlen die Leute — gehostete Bequemlichkeit, Plus-Funktionen oder Support?
Die Antwort entscheidet, ob es eine Edition gibt oder zwei.

---

## 2. Browser und App

**Absicht:** Die volle Anwendung auch im Browser, nicht nur die App.

### Entscheidung: eine Codebasis über Expo Web

Keine zweite React-Anwendung. API-Client, Typen, Auth mit Token-Rotation,
Sync-Engine und Timeline-Aufbereitung sind bereits plattformneutrales
TypeScript; Expo Router bildet Dateien auf URLs ab. Eine zweite App hiesse:
jede Funktion zweimal bauen, jeden Fehler zweimal beheben.

Vorarbeit ist da: `src/auth/tokens.ts` hat schon einen Web-Zweig, `react-dom`
ist installiert. Es fehlen `react-native-web` und `@expo/metro-runtime`.

### Vier Baustellen

1. **Karte** — `@maplibre/maplibre-react-native` ist nur nativ. Es braucht ein
   `TripMap.web.tsx` mit `maplibre-gl`; dieselbe Bibliothek liegt bereits in
   `web/vendor/` für den Freigabe-Viewer, samt Route, Stops und Bounds.
2. **Token im Browser** — heute `localStorage`, bei XSS also offen. Für ein
   Bezahlprodukt gehört der Refresh-Token in ein httpOnly-Cookie mit
   CSRF-Schutz. Backend-Änderung, und der einzige Sicherheitspunkt hier, der
   nicht warten sollte.
3. **Offline-Cache** — `expo-sqlite` läuft im Browser über WASM, aber heikel.
   Web zunächst online-first ohne lokalen Cache.
4. **CORS** — `CORS_ORIGINS` auf die Web-Domain.

### Rollenteilung, absichtlich

| | |
|---|---|
| **App** | aufzeichnen, unterwegs, offline, fotografieren |
| **Browser** | planen, schreiben, Fotos verwalten, Reisebuch bauen, teilen |

Hintergrund-Tracking gibt es im Web nicht — kein Browser zeichnet auf, wenn der
Bildschirm aus ist. Das ist keine Lücke, sondern die Aufteilung, und sie trägt
das Abo mit: einen Reisebericht am Telefon zu tippen ist eine Qual, am Laptop
ist es das, wofür Leute zahlen.

Der bestehende Viewer unter `web/` bleibt separat: read-only, ohne Login, für
Freigabelinks. Eine öffentlich geteilte Reise soll nicht die ganze Anwendung
laden.

### Reihenfolge

1. Expo Web zum Laufen bringen — Login, Trip-Liste, Trip-Detail ohne Karte
2. `TripMap.web.tsx` auf Basis des Viewer-Codes
3. Timeline, Journal, Fotos
4. httpOnly-Cookies und CORS

---

## 3. Druckfertiger Export fürs Fotobuch

**Absicht:** Die Route so exportieren, dass daraus ein Fotobuch bei CEWE oder
einem vergleichbaren Anbieter entstehen kann.

Das PDF-Reisebuch existiert, ist aber zum Ansehen gebaut. Für den Druck fehlen
vier Dinge:

**Auflösung.** Ins Buch kommen heute Thumbnails mit 512 px. Druck braucht
300 dpi, bei 20 cm Bildbreite also rund 2400 px. Der Druckpfad muss die
**Originale** ziehen. Dass Fotos byteweise unverändert gespeichert werden, zahlt
sich hier aus — mit Rekompression beim Upload wäre das verloren.

**Anschnitt.** 3 mm Beschnittzugabe, Sicherheitsabstände, und das Seitenformat
muss zum Anbieter passen (CEWE-Quadrat 21×21, A4 quer, …).

**PDF/X.** Druckereien erwarten PDF/X-3 oder X-4. Reportlab erzeugt das nicht
direkt; dafür käme ein Ghostscript-Schritt dahinter.

**Karte.** Die Vektor-Routenskizze war die richtige Entscheidung: sie skaliert
verlustfrei auf jede Druckgröße. Bei Kacheln bräuchte es 300-dpi-Raster und eine
geklärte Lizenz für gedruckte Weitergabe. Mit OSM geht das — die Namensnennung
muss dann **mitgedruckt** werden.

**Entscheidung:** kein Anbieter-Anschluss, sondern ein druckfertiges PDF zum
Hochladen. CEWE, Saal und Pixum nehmen PDFs an, offene APIs haben sie nicht. Das
spart eine Partnerabhängigkeit und ist eine saubere Plus-Funktion.

Nebenprodukt: ein **Routen-Poster** — eine Seite, Route plus Kennzahlen. Fällt
fast nebenbei ab und verkauft sich für sich.

---

## 4. Umzug auf einen gemieteten Server

**Absicht:** Sobald es läuft, statt im Homelab auf einer gemieteten Maschine
betreiben.

**Die Migration ist schon geschrieben.** Das Backup-Verfahren aus der Anleitung —
`pg_dump` plus das MinIO-Volume — *ist* der Umzug: Dump einspielen, Volume
auspacken, `.env` anpassen.

**Speicher ist der Kostentreiber**, nicht die Datenbank. Originalfotos.
Kontingente pro Konto braucht es, bevor der erste Fremde hochlädt.

**Gerichtsstand.** Standortverläufe von Schweizer und EU-Kunden gehören auf einen
Schweizer oder EU-Anbieter — Infomaniak, Exoscale, Hetzner. Bei DSGVO und revDSG
ist das kein Detail.

**TLS wandert mit.** Zuhause macht das der NGINX Proxy Manager, auf einer
Mietkiste übernimmt Caddy oder Traefik direkt auf dem Host.

**Secrets.** Heute liegt `.env` im Klartext auf der Platte. Auf einer fremden
Maschine gehören sie in Docker Secrets oder einen Tresor.

Self-hostbar bleiben und gehostet verkaufen widerspricht sich nicht: dasselbe
Image, anderer Betreiber. Genau dafür ist der Stack gebaut.

---

## Was zuerst zu beweisen ist

Nichts davon lohnt, solange der Kern nicht auf echter Hardware belegt ist. Der
Stack läuft, die App startet, die Karte rendert. Offen ist die Kette vom Sensor
bis in die Datenbank:

```bash
docker compose exec db psql -U reiseapp -d reiseapp \
  -c "select count(*), max(recorded_at) from waypoints;"
```

Stehen dort nach einem Spaziergang Punkte, ist das Fundament belegt. Vorher eine
zweite Plattform aufzumachen verdoppelt nur die Fehlersuche.
