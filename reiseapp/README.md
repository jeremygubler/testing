# reiseapp

Self-hostbares, offline-first Reise-Tracking – die Polarsteps-Alternative, bei der die
Bewegungsdaten im eigenen Homelab bleiben.

**Status: Phase 6a (Sync-Protokoll, serverseitig) abgeschlossen.**

## Warum

| | Polarsteps | reiseapp |
|---|---|---|
| Datenhoheit | Cloud des Anbieters | eigener Docker-Stack, kein Account-Zwang nach aussen |
| Offline | teilweise | offline-first, Sync mit Konfliktauflösung |
| Fotos | rekomprimiert | Original-Bytes, EXIF bleibt erhalten |
| Karten | proprietär | MapLibre + OSM, eigene Tiles möglich |
| Export | Print-Produkt (kostenpflichtig) | GPX, JSON, selbst generiertes PDF-Reisebuch |
| Import | – | Polarsteps-Export, Google Timeline, GPX |
| Kollaboration | eingeschränkt | mehrere Personen pro Reise (owner/editor/viewer) |

## Architektur

```
reiseapp/
├── backend/                 FastAPI + SQLAlchemy 2 (async) + PostGIS
│   ├── app/
│   │   ├── api/v1/          Router: health, auth, trips
│   │   ├── core/            Settings (pydantic-settings, REISEAPP_*)
│   │   ├── db/              Declarative Base, Async-Session
│   │   ├── models/          User, Trip, TripMember, Waypoint, Stop, Photo, JournalEntry,
│   │   │                     RefreshToken, Invite
│   │   ├── services/        Domänenlogik (auth, trips, geo, photos, exif)
│   │   ├── schemas/         Pydantic-I/O-Modelle
│   │   ├── storage/         ObjectStore-Interface: MinIO oder lokales Volume
│   │   └── cli.py           Admin-CLI (ersten Account anlegen, Invites ausstellen)
│   ├── alembic/             Migrationen (0001 Kern, 0002 Auth, 0003 Fotos, 0004 Sync)
│   ├── tests/               pytest (unit + `-m integration` gegen echtes PostGIS)
│   └── Dockerfile           Multi-Stage: `runtime` (schlank) / `dev` (Reload + Dev-Deps)
├── mobile/                  Expo SDK 57 + TypeScript strict (expo-router)
├── web/                     Read-only Web-Viewer (ab Phase 9)
├── docker-compose.yml       Postgres/PostGIS + MinIO + Backend
└── .env.example
```

### Datenmodell

`User` → `Trip` (mit `TripMember`-Rollen) → `Waypoint` (getrackte Route),
`Stop` (benannter Ort), `Photo`, `JournalEntry` (mit geordneter Fotoliste).

Zwei Entscheide, die sich durchziehen:

- **UUID-Primärschlüssel, clientseitig erzeugt.** Offline-first heisst, dass das Handy
  Datensätze ohne Server-Roundtrip anlegen können muss.
- **Keine redundanten Aggregate.** Distanz, Länder, Höhenmeter und Zeit pro Ort werden aus
  `waypoints` per PostGIS berechnet (`geography(Point,4326)` ⇒ `ST_Distance` liefert Meter),
  nicht gespeichert. Was nicht gespeichert wird, kann nicht driften.
- **`updated_at` + `deleted_at` auf allen synchronisierten Tabellen.** Ein hartes `DELETE`
  lässt sich einem Client, der gerade offline ist, nicht mitteilen – deshalb Soft-Delete.

## Quickstart (Homelab / Proxmox-LXC oder -VM)

Voraussetzung: Docker + Compose-Plugin.

```bash
git clone <dieses-repo> && cd reiseapp
cp .env.example .env

# Secrets erzeugen und eintragen
openssl rand -hex 32   # -> JWT_SECRET
openssl rand -hex 24   # -> POSTGRES_PASSWORD
openssl rand -hex 24   # -> S3_SECRET_KEY

docker compose up -d
curl -s localhost:8000/health/ready | jq

# Invite-only: ersten Account anlegen (fragt nach dem Passwort)
docker compose exec backend python -m app.cli create-user \
    --email du@example.com --display-name "Du" --admin
```

Erwartet:

```json
{ "status": "ok", "database": true, "postgis": "3.4.x", "object_storage": true }
```

- API-Docs: `http://<host>:8000/docs` (nur wenn `REISEAPP_ENV != production`)
- MinIO-Console: `http://<host>:9001`
- Migrationen laufen im Entrypoint des Backend-Containers (`RUN_MIGRATIONS_ON_STARTUP`).
  Bei mehreren Backend-Replikas auf `false` setzen und `alembic upgrade head` einmalig
  separat fahren, sonst rennen die Replikas um die `alembic_version`-Tabelle.

**Wichtig fürs Handy:** `S3_PUBLIC_ENDPOINT_URL` muss die URL sein, unter der das Telefon
MinIO erreicht (z. B. `https://media.reise.example`). Intern spricht das Backend über
`http://minio:9000` – presigned URLs mit dem internen Hostnamen laufen auf dem Handy ins Leere.

Hinter einem Reverse Proxy (Traefik/Caddy/NPM) zusätzlich `CORS_ORIGINS` setzen, sobald der
Web-Viewer dazukommt.

## Accounts & Invites

Registrierung ist per Default **geschlossen** (`ALLOW_REGISTRATION=false`) – eine
self-hosted Instanz am offenen Netz soll nicht jedem einen Account geben, der die URL
kennt. Der Weg rein:

```bash
# 1. Erster Account (umgeht Invites, wird Admin)
docker compose exec backend python -m app.cli create-user \
    --email du@example.com --display-name "Du" --admin

# 2. Weitere Personen einladen – Code erscheint genau einmal
docker compose exec backend python -m app.cli create-invite --email freund@example.com
# oder über die API: POST /api/v1/auth/invites  (nur Admins)

# 3. Registrieren
curl -X POST localhost:8000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"freund@example.com","display_name":"Freund","password":"...","invite_code":"..."}'
```

`ALLOW_REGISTRATION=true` öffnet die Registrierung ohne Code – nur sinnvoll, solange die
Instanz nicht öffentlich erreichbar ist.

### Tokens

- **Access-Token**: JWT, kurzlebig (Default 15 min), `Authorization: Bearer <token>`.
- **Refresh-Token**: undurchsichtiger Zufallsstring, in der DB liegt nur der SHA-256.
  Ein JWT lässt sich vor Ablauf nicht zurückziehen – ohne diese Trennung gäbe es kein
  funktionierendes Logout.
- **Rotation mit Wiederverwendungserkennung**: jeder `/auth/refresh` gibt ein neues
  Refresh-Token aus und entwertet das alte. Taucht ein bereits entwertetes Token
  nochmal auf, ist es abgeflossen — dann werden **alle** Sessions dieses Users entwertet.

## API (Stand Phase 1)

| Methode | Pfad | Rolle |
|---|---|---|
| POST | `/api/v1/auth/register` | – (Invite-Code nötig) |
| POST | `/api/v1/auth/login` | – |
| POST | `/api/v1/auth/refresh` | – (Refresh-Token) |
| POST | `/api/v1/auth/logout` | – (Refresh-Token) |
| GET | `/api/v1/auth/me` | eingeloggt |
| POST/GET | `/api/v1/auth/invites` | Admin |
| POST/GET | `/api/v1/trips` | eingeloggt |
| GET/PATCH/DELETE | `/api/v1/trips/{id}` | viewer / editor / owner |
| GET/POST | `/api/v1/trips/{id}/members` | viewer / owner |
| PATCH/DELETE | `/api/v1/trips/{id}/members/{user_id}` | owner |
| POST/GET | `/api/v1/trips/{id}/waypoints` | editor / viewer |
| GET | `/api/v1/trips/{id}/route` | viewer |
| POST/GET | `/api/v1/trips/{id}/stops` | editor / viewer |
| POST/GET | `/api/v1/trips/{id}/photos` | editor / viewer |
| GET/PATCH/DELETE | `/api/v1/trips/{id}/photos/{photo_id}` | viewer / editor |
| GET | `/api/v1/trips/{id}/photos/{photo_id}/file?variant=` | viewer |
| POST/GET | `/api/v1/trips/{id}/journal` | editor / viewer |
| GET/PATCH/DELETE | `/api/v1/trips/{id}/journal/{entry_id}` | viewer / editor |
| GET | `/api/v1/trips/{id}/timeline` | viewer |
| GET | `/api/v1/trips/{id}/sync/pull` | viewer |
| POST | `/api/v1/trips/{id}/sync/push` | editor |
| GET/PATCH/DELETE | `/api/v1/trips/{id}/stops/{stop_id}` | viewer / editor |

Rollen: `owner` > `editor` > `viewer`. Wer keine Rolle auf einer Reise hat, bekommt
**404 statt 403** – sonst verrät die API die Existenz fremder privater Reisen.

### Route & Wegpunkte

`POST /waypoints` nimmt bis zu 5000 Punkte pro Request und ist **idempotent**: die
Wegpunkt-`id` kommt vom Client, der Insert läuft mit `ON CONFLICT DO NOTHING`. Ein
Retry nach einer abgebrochenen Verbindung – der Normalfall beim Hintergrund-Tracking
in Phase 3 – speichert also nichts doppelt. Die Antwort sagt, wie viele Punkte neu
waren:

```json
{ "received": 240, "stored": 0, "duplicates": 240 }
```

`GET /route` liefert die Spur als GeoJSON-LineString plus `distance_m` (via
`ST_Length` auf `geography`, also echte Meter) und `bounds` in der Reihenfolge
`[west, south, east, north]` – genau das Format, das MapLibres `fitBounds` erwartet.
`?simplify_m=` reduziert die Punktzahl fürs Rendering per Douglas-Peucker;
`point_count` und `distance_m` beschreiben weiterhin die **echte** Spur.

## Fotos

Originale werden **byte-für-byte** gespeichert: keine Rekompression, EXIF bleibt drin.
Daneben legt der Server ein JPEG-Thumbnail für die Galerie an.

Die Bytes laufen durch das Backend, nicht über presigned URLs direkt zum Objektspeicher.
Ein Hostname, ein Zertifikat, ein Reverse-Proxy – auf einem Homelab ist das deutlich
weniger, was schiefgehen kann; die doppelte Bandbreite im LAN stört dort niemanden.

**Zuordnung**, in dieser Reihenfolge:

1. **GPS aus dem Bild.** Der Server liest EXIF aus dem Original – er ist die Quelle der
   Wahrheit, nicht die App. Auch HEIC von iPhones (via `pillow-heif`).
2. **Position aus der Route berechnet.** Hat das Foto keine Koordinaten, aber einen
   Zeitstempel, wird zwischen den beiden umgebenden Wegpunkten interpoliert. Das ist der
   Punkt, an dem Tracking und Fotos zusammenspielen: wenn das Handy aufgezeichnet hat,
   wissen wir, wo die Kamera war – auch wenn die Kamera es nicht wusste. Über
   unplausible Lücken (mehr als vier Stunden zwischen zwei Punkten) wird bewusst *nicht*
   interpoliert.
3. **Stop.** Zuerst der nächste Stop innerhalb von 500 m, sonst der Stop, in dessen
   Zeitfenster das Foto fällt.

`position_source` (`exif` / `interpolated` / `manual` / `none`) wird mitgeliefert, damit
in der App eine geschätzte Position nie wie eine gemessene aussieht.

Ein erneuter Upload derselben Bytes ist ein No-op: der SHA-256 wird pro Reise geprüft
und das bestehende Foto zurückgegeben – Retrys nach Verbindungsabbruch erzeugen keine
Dubletten.

## Sync-Protokoll

`GET /sync/pull?since=<cursor>` liefert alles, was sich seit dem Cursor geändert hat;
`POST /sync/push` schickt lokale Änderungen zurück.

**Konfliktauflösung ist feldweise.** Zwei Personen, die dieselbe Reise offline
bearbeiten, ist bei einer geteilten Reise der Normalfall, nicht der Sonderfall. Würde
pro Datensatz aufgelöst, überschriebe der spätere Push stillschweigend einen Titel, den
jemand anders Stunden früher geändert hat. Jeder Datensatz darf `field_updated_at`
mitschicken; fehlt ein Feld darin, gilt das `updated_at` des Datensatzes — dadurch sind
gewöhnliche REST-Schreibvorgänge und Sync-Pushes vergleichbar, ohne dass jeder
Schreibpfad Feld-Zeitstempel pflegen muss.

Felder, die der Server behalten hat, kommen als `conflicts` zurück — der Client kann sie
anzeigen, statt eine Änderung spurlos zu verlieren. Gleichstand geht an den gespeicherten
Wert, sonst würden zwei Geräte mit synchronen Uhren denselben Wert endlos hin- und
herschieben.

**Löschen ist nur ein weiteres Feld.** `deleted_at` unterliegt derselben Regel: eine
Löschung schlägt eine ältere Bearbeitung, und eine neuere Bearbeitung holt den Datensatz
zurück.

**Wegpunkte werden nur angehängt**, nie zusammengeführt — Dubletten fallen über die
bekannte ID weg.

### Der Cursor hinkt absichtlich nach

Der zurückgegebene Cursor liegt `SYNC_SAFETY_LAG` (5 s) hinter der Serveruhr. Eine
Transaktion, die vor dem Cursor beginnt aber danach committet, wäre sonst für immer
unsichtbar: ihr `updated_at` ist älter als der Cursor, den der Client schon überschritten
hat. Der Lag muss länger sein als die längste Schreibtransaktion.

Die Kehrseite ist harmlos: Ein Datensatz kann mehrfach geliefert werden. Da jeder
Datensatz eine client-erzeugte UUID hat und jeder Schreibvorgang idempotent ist, ändert
eine doppelte Zustellung nichts. Zu viel liefern ist sicher, zu wenig nicht — deshalb
diese Richtung.

## Timeline

`GET /timeline` führt Stops, Journal-Einträge und Fotos **serverseitig** zu einer
chronologischen Liste zusammen. Bewusst nicht im Client: App, Web-Viewer (Phase 9) und
PDF-Reisebuch (Phase 8) sollen dieselbe Reihenfolge und Gruppierung zeigen, ohne die
Regeln dreimal zu implementieren.

Zwei Regeln, die den Unterschied machen:

- **Fotos werden zu Momenten gebündelt.** Aufnahmen innerhalb einer Stunde am selben
  Stop werden ein Timeline-Eintrag statt fünfzig. Ein Ortswechsel trennt immer, auch
  innerhalb der Stunde.
- **Fotos eines Journal-Eintrags erscheinen nur dort**, nicht zusätzlich als loses
  Bündel.

Bei gleichem Zeitstempel gilt: ankommen → darüber schreiben → Fotos davon.

### Objektspeicher

`STORAGE_BACKEND=s3` (Default) schreibt nach MinIO, `filesystem` in ein Docker-Volume
unter `/srv/media`. Der zweite Weg ist für Setups gedacht, die kein MinIO betreiben
wollen – und er ist der Grund, warum die Foto-Pipeline in CI komplett getestet werden
kann, ohne einen Objektspeicher hochzufahren.

## Konfiguration

Alle Backend-Variablen tragen den Prefix `REISEAPP_`; `docker-compose.yml` mappt die
kürzeren Namen aus `.env` darauf.

| `.env` | Backend-Variable | Default | Zweck |
|---|---|---|---|
| `POSTGRES_USER` / `_PASSWORD` / `_DB` | – | `reiseapp` | Postgres-Credentials |
| – | `REISEAPP_DATABASE_URL` | aus Compose zusammengesetzt | asyncpg-DSN |
| `JWT_SECRET` | `REISEAPP_JWT_SECRET` | – (Pflicht) | Signatur Access/Refresh-Token |
| `ACCESS_TOKEN_TTL_MINUTES` | `REISEAPP_ACCESS_TOKEN_TTL_MINUTES` | `15` | Lebensdauer Access-Token |
| `REFRESH_TOKEN_TTL_DAYS` | `REISEAPP_REFRESH_TOKEN_TTL_DAYS` | `30` | Lebensdauer Refresh-Token |
| `STORAGE_BACKEND` | `REISEAPP_STORAGE_BACKEND` | `s3` | `s3` oder `filesystem` |
| `MAX_UPLOAD_BYTES` | `REISEAPP_MAX_UPLOAD_BYTES` | `67108864` | maximale Foto-Grösse |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `REISEAPP_S3_*` | – (Pflicht) | MinIO-Root-Credentials |
| `S3_BUCKET` | `REISEAPP_S3_BUCKET` | `reiseapp-media` | Bucket für Originalfotos |
| `S3_PUBLIC_ENDPOINT_URL` | `REISEAPP_S3_PUBLIC_ENDPOINT_URL` | `http://localhost:9000` | Basis für presigned URLs |
| `ALLOW_REGISTRATION` | `REISEAPP_ALLOW_REGISTRATION` | `false` | offene Registrierung statt Invite-only |
| `INVITE_TTL_DAYS` | `REISEAPP_INVITE_TTL_DAYS` | `14` | Gültigkeit neuer Invite-Codes |
| `CORS_ORIGINS` | `REISEAPP_CORS_ORIGINS` | leer | kommagetrennte Browser-Origins |
| `REISEAPP_ENV` | `REISEAPP_ENV` | `production` | `production` blendet `/docs` aus |
| `BACKEND_TARGET` | – | `runtime` | auf `dev` stellen für Hot-Reload |
| `RUN_MIGRATIONS_ON_STARTUP` | `REISEAPP_RUN_MIGRATIONS_ON_STARTUP` | `true` | Alembic im Entrypoint |

## Mobile-App

```bash
cd mobile && npm install
export EXPO_PUBLIC_API_URL=http://192.168.1.50:8000   # LAN-Adresse des Homelabs
npm start
```

Details, Aufbau und die Dev-Client-Frage: [`mobile/README.md`](mobile/README.md).

## Entwicklung

Python **3.12** – dieselbe Version wie im Container und in CI. Auf einer älteren
Version schlägt der Typecheck an Stubs von Drittbibliotheken fehl, die 3.12-Syntax
verwenden.

```bash
cd backend
python3.12 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"

docker compose up -d db minio          # nur Infrastruktur
export REISEAPP_DATABASE_URL=postgresql+asyncpg://reiseapp:<pw>@localhost:5432/reiseapp
alembic upgrade head
uvicorn app.main:app --reload
```

Checks (identisch zu CI, `.github/workflows/reiseapp-backend.yml`):

```bash
ruff check app tests alembic
mypy app                 # strict
pytest -q -m "not integration"   # ohne DB
pytest -q -m integration         # braucht laufendes PostGIS
alembic check                    # Migration vs. Modelle: kein Drift
```

### Migrationen

```bash
alembic revision --autogenerate -m "beschreibung"   # braucht laufende DB
alembic upgrade head
alembic downgrade -1
```

Zwei Fallstricke, die hier schon zugeschlagen haben. Erstens: **niemals SQL auf der
Migrations-Connection absetzen, bevor `context.configure()` gelaufen ist.** Das erste
Statement öffnet implizit eine Transaktion, Alembic macht daraufhin `begin_transaction()`
zum No-Op, und die Migration wird beim Schliessen zurückgerollt – erfolgreich aussehend
und wirkungslos. Zweitens: GeoAlchemy2 schreibt die Nullability der
Spalte auf das *Typ-Objekt* zurück. Ein geteiltes `Geography(...)`-Objekt schleppt damit
`NOT NULL` von einer Tabelle in die nächste. Deshalb erzeugt `point_geography()` pro Spalte
eine frische Instanz – nicht wegräumen.

## Phasen

- [x] **0 – Setup:** Monorepo, Compose-Stack, Alembic, Kernschema, Health-Endpoints, CI
- [x] **1 – Auth & Trips:** Argon2 + JWT, rotierende Refresh-Tokens, Invite-System,
      Trip-CRUD, TripMember-Rollen, Admin-CLI; Expo-App mit Auth-Screens, Trip-Liste,
      Trip-Anlage und Trip-Detail
- [x] **2 – Karte & manuelle Wegpunkte:** Waypoint-Batch-Upload (idempotent),
      Route als GeoJSON mit PostGIS-Distanz, Stop-CRUD; MapLibre in der App,
      Route und Stops auf der Karte, Stop per Long-Press
- [x] **3 – Background-GPS-Tracking:** `expo-task-manager` mit SQLite-Puffer,
      idempotenter Batch-Upload, adaptive Intervalle mit Hysterese, Start/Stop pro
      Reise, Permission-Flow für iOS und Android
- [x] **4 – Fotos:** Upload durchs Backend nach MinIO oder Volume, EXIF serverseitig
      (inkl. HEIC), Positions-Interpolation aus der Route, Stop-Zuordnung, Galerie
- [x] **5 – Journal & Timeline:** Journal-CRUD mit geordneten Fotos, serverseitig
      zusammengeführte Timeline mit Foto-Bündelung, Editor und Timeline-Ansicht in der App
- [x] **6a – Sync-Protokoll (Backend):** Pull mit nachhinkendem Cursor, Push mit
      feldweisem Last-Write-Wins, Konfliktmeldung, Append-Merge für Wegpunkte
- [ ] **6b – Lokaler Store (App):** Store-Entscheid steht aus, siehe Zwischenstand
- [ ] **7 – Import:** GPX, Polarsteps-Export, Google Timeline
- [ ] **8 – Export:** GPX, JSON, PDF-Reisebuch
- [ ] **9 – Sharing & Web-Viewer**
- [ ] **10 – Stats & Polish**
