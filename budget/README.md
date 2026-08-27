# Haushaltsbudget

Budgetplanung für einen Haushalt mit 1–6 Personen. Läuft lokal oder auf einem kleinen
Server; keine Cloud, keine Registrierung, ein Haushalt pro Installation.

* **Frontend** React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui-Komponenten, Recharts
* **Backend** FastAPI + SQLAlchemy 2 auf SQLite, Alembic-Migrationen, Pydantic-Schemas
* **Beträge** ausschließlich ganzzahlige Minoreinheiten (Rappen/Cent) — in der DB *und* in
  der API. Formatiert wird nur im Frontend.
* **Sprache/Währung** konfigurierbar, ausgeliefert wird Deutsch / CHF.

Die Datenmodell- und Berechnungsdokumentation steht in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Schnellstart mit Docker

```bash
docker compose up --build
```

* Oberfläche: <http://localhost:8080>
* API-Dokumentation: <http://localhost:8000/docs>

Beim ersten Start werden Migrationen ausgeführt und ein Beispielhaushalt angelegt
(zwei Personen, drei Monate Buchungen). Existiert bereits ein Haushalt, passiert nichts.

## Entwicklung ohne Docker

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

alembic upgrade head          # Schema anlegen
python seed.py                # Beispieldaten (optional)
uvicorn app.main:app --reload # http://localhost:8000
```

Tests:

```bash
cd backend && .venv/bin/pytest
```

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173, /api wird auf :8000 geproxyt
```

Tests und Typecheck:

```bash
cd frontend
npm test        # Vitest: die kritischen Berechnungen
npm run lint    # tsc --noEmit
```

## Konfiguration

Alle Backend-Einstellungen lassen sich über Umgebungsvariablen mit dem Präfix `BUDGET_`
setzen (oder über eine `backend/.env`):

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `BUDGET_DATABASE_URL` | `sqlite:///./data/budget.db` | Datenbank |
| `BUDGET_DEFAULT_CURRENCY` | `CHF` | Währung neuer Haushalte |
| `BUDGET_DEFAULT_LOCALE` | `de-CH` | Sprache/Formatierung |
| `BUDGET_DEFAULT_TIMEZONE` | `Europe/Zurich` | Zeitzone |
| `BUDGET_CORS_ORIGINS` | `["http://localhost:5173", …]` | erlaubte Origins (JSON-Liste) |

Im Frontend steuert `VITE_API_TARGET` das Proxy-Ziel des Dev-Servers.

## Datensicherung

Die gesamte Anwendung lebt in einer SQLite-Datei (`backend/data/budget.db` bzw. dem
Docker-Volume `budget-data`). Ein Backup ist ein Kopieren dieser Datei. Zusätzlich bietet
die App unter *Einstellungen* einen vollständigen JSON-Export und einen CSV-Export aller
Buchungen.

## Projektstruktur

```
budget/
├── backend/
│   ├── alembic/            Migrationen
│   ├── app/
│   │   ├── models.py       SQLAlchemy-Modelle
│   │   ├── ddl.py          Trigger + partielle Indizes (DB-seitige Invarianten)
│   │   ├── schemas.py      Pydantic-Schemas der API
│   │   ├── routers/        FastAPI-Endpunkte
│   │   └── services/       Fachlogik (Splits, Ausgleich, Auswertungen, Regeln)
│   └── tests/              pytest
├── frontend/
│   └── src/
│       ├── api/            typisierter API-Client
│       ├── components/     UI-Bausteine
│       ├── pages/          Übersicht, Buchungen, Budget, Wiederkehrend, Kalender, Einstellungen
│       ├── lib/            Berechnungen und Formatierung
│       └── i18n/           Übersetzungen (aktuell nur `de`)
└── docker-compose.yml
```

## Entwicklungsstand

| Phase | Inhalt | Status |
| --- | --- | --- |
| 1 | Projektgerüst, Datenmodell, Migrationen, Seed-Daten | ✅ |
| 2 | API für Personen, Kategorien, Buchungen mit Splits, Tests | ⬜ |
| 3 | Frontend-Grundgerüst, Monatskontext, Buchungsliste + Erfassung | ⬜ |
| 4 | Budgets, Übersichtsseite mit Kennzahlen und Charts | ⬜ |
| 5 | Wiederkehrende Buchungen mit Vorschlagslogik | ⬜ |
| 6 | Kalender, Sparziele, Import, Export | ⬜ |
| 7 | Feinschliff: Tastatur, Dark Mode, Responsivität, leere Zustände | ⬜ |
