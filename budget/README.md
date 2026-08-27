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
# Für den echten Einsatz: leer starten, die App führt durch die Einrichtung
docker compose up --build

# Zum Ausprobieren mit Beispielhaushalt (2 Personen, 3 Monate Buchungen):
# .env.example nach .env kopieren -- oder unter macOS/Linux direkt
BUDGET_SEED_DEMO=1 docker compose up --build
```

Unter Windows/PowerShell funktioniert das Voranstellen der Variablen nicht; dort
`copy .env.example .env` und dann `docker compose up --build`.

* Oberfläche: <http://localhost:8080>
* API-Dokumentation: <http://localhost:8000/docs>

Beim ersten Start werden die Migrationen ausgeführt. Die Daten liegen im Docker-Volume
`budget-data` und überleben ein `docker compose down`. Wirklich bei null anfangen:

```bash
docker compose down -v && docker compose up --build
```

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

## Erste Inbetriebnahme

Findet die App keinen Haushalt, zeigt sie statt einer leeren Oberfläche einen
Einrichtungsschritt: Name, Währung, Startsaldo, Personen und optional ein kurzer Satz
Startkategorien. Danach ist die App sofort benutzbar. `python seed.py` ist nur für die
Demo gedacht und tut nichts, wenn bereits ein Haushalt existiert.

## Tastaturbedienung

Ausserhalb von Eingabefeldern:

| Taste | Wirkung |
| --- | --- |
| `←` `→` | Einen Monat zurück / vor |
| `h` | Zum aktuellen Monat |
| `n` | Neue Buchung erfassen (springt in die Liste und fokussiert den Betrag) |
| `1` … `6` | Bereich wechseln |
| `d` | Hell / Dunkel umschalten |
| `?` | Übersicht aller Kürzel |

Im Erfassungsformular: `Enter` im Betragsfeld öffnet die Kategoriesuche, `Enter` in der
Suche übernimmt die Kategorie, `Enter` im Formular speichert und lässt das Formular für
die nächste Buchung offen. Damit kostet eine Buchung drei Interaktionen.

Findet die Kategoriesuche nichts, legt der letzte Eintrag die Kategorie mit dem
eingetippten Namen an. Und wer die Beschreibung zuerst schreibt, bekommt einen
Kategorievorschlag aus früheren Buchungen — anklickbar, nie automatisch.

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
| 2 | API für Personen, Kategorien, Buchungen mit Splits, Tests | ✅ |
| 3 | Frontend-Grundgerüst, Monatskontext, Buchungsliste + Erfassung | ✅ |
| 4 | Budgets, Übersichtsseite mit Kennzahlen und Charts | ✅ |
| 5 | Wiederkehrende Buchungen mit Vorschlagslogik | ✅ |
| 6 | Kalender, Sparziele, Import, Export | ✅ |
| 7 | Feinschliff: Tastatur, Dark Mode, Responsivität, leere Zustände | ✅ |
