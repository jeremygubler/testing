# reiseapp

Self-hostbares, offline-first Reise-Tracking – die Polarsteps-Alternative, bei der die
Bewegungsdaten im eigenen Homelab bleiben.

**Status: Phase 0 (Setup) abgeschlossen.**

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
│   │   ├── api/v1/          Router (aktuell: health)
│   │   ├── core/            Settings (pydantic-settings, REISEAPP_*)
│   │   ├── db/              Declarative Base, Async-Session
│   │   ├── models/          User, Trip, TripMember, Waypoint, Stop, Photo, JournalEntry
│   │   ├── schemas/         Pydantic-I/O-Modelle
│   │   └── storage/         S3/MinIO-Client
│   ├── alembic/             Migrationen (0001 = PostGIS + Kernschema)
│   ├── tests/               pytest (unit + `-m integration` gegen echtes PostGIS)
│   └── Dockerfile           Multi-Stage: `runtime` (schlank) / `dev` (Reload + Dev-Deps)
├── mobile/                  Expo + TypeScript (ab Phase 1)
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
| `CORS_ORIGINS` | `REISEAPP_CORS_ORIGINS` | leer | kommagetrennte Browser-Origins |
| `REISEAPP_ENV` | `REISEAPP_ENV` | `production` | `production` blendet `/docs` aus |
| `BACKEND_TARGET` | – | `runtime` | auf `dev` stellen für Hot-Reload |
| `RUN_MIGRATIONS_ON_STARTUP` | `REISEAPP_RUN_MIGRATIONS_ON_STARTUP` | `true` | Alembic im Entrypoint |

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

Fallstrick, der hier schon zugeschlagen hat: GeoAlchemy2 schreibt die Nullability der
Spalte auf das *Typ-Objekt* zurück. Ein geteiltes `Geography(...)`-Objekt schleppt damit
`NOT NULL` von einer Tabelle in die nächste. Deshalb erzeugt `point_geography()` pro Spalte
eine frische Instanz – nicht wegräumen.

## Phasen

- [x] **0 – Setup:** Monorepo, Compose-Stack, Alembic, Kernschema, Health-Endpoints, CI
- [ ] **1 – Auth & Trips:** JWT (Argon2), Trip-CRUD, Rollen; Mobile: Auth + Trip-Liste
- [ ] **2 – Karte & manuelle Wegpunkte:** MapLibre, Route rendern, Stops setzen
- [ ] **3 – Background-GPS-Tracking:** `expo-task-manager`, Batch-Upload, adaptive Intervalle
- [ ] **4 – Fotos:** Upload zu MinIO, EXIF (Zeit + GPS), automatische Stop-Zuordnung
- [ ] **5 – Journal & Timeline**
- [ ] **6 – Offline-Sync:** WatermelonDB-Sync-Protokoll, Konfliktauflösung
- [ ] **7 – Import:** GPX, Polarsteps-Export, Google Timeline
- [ ] **8 – Export:** GPX, JSON, PDF-Reisebuch
- [ ] **9 – Sharing & Web-Viewer**
- [ ] **10 – Stats & Polish**
