# reiseapp

Self-hostbares, offline-first Reise-Tracking – die Polarsteps-Alternative, bei der die
Bewegungsdaten im eigenen Homelab bleiben.

**Status: Phase 2 (Karte & manuelle Wegpunkte) abgeschlossen.**

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
│   │   ├── services/        Domänenlogik (auth, trips) – ohne FastAPI-Abhängigkeit
│   │   ├── schemas/         Pydantic-I/O-Modelle
│   │   ├── storage/         S3/MinIO-Client
│   │   └── cli.py           Admin-CLI (ersten Account anlegen, Invites ausstellen)
│   ├── alembic/             Migrationen (0001 Kernschema, 0002 Auth)
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

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
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
- [ ] **3 – Background-GPS-Tracking:** `expo-task-manager`, Batch-Upload, adaptive Intervalle
- [ ] **4 – Fotos:** Upload zu MinIO, EXIF (Zeit + GPS), automatische Stop-Zuordnung
- [ ] **5 – Journal & Timeline**
- [ ] **6 – Offline-Sync:** WatermelonDB-Sync-Protokoll, Konfliktauflösung
- [ ] **7 – Import:** GPX, Polarsteps-Export, Google Timeline
- [ ] **8 – Export:** GPX, JSON, PDF-Reisebuch
- [ ] **9 – Sharing & Web-Viewer**
- [ ] **10 – Stats & Polish**
