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

Tests, Lint und Format:

```bash
cd backend
.venv/bin/pytest          # Testsuite
.venv/bin/ruff check .    # Lint
.venv/bin/ruff format .   # Formatierung
```

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173, /api wird auf :8000 geproxyt
```

Tests, Typecheck und Lint:

```bash
cd frontend
npm test              # Vitest: die kritischen Berechnungen
npm run lint          # tsc --noEmit
npm run lint:eslint   # ESLint, vor allem die React-Hook-Regeln
```

## Automatische Prüfung

`.github/workflows/budget-ci.yml` läuft bei jeder Änderung unter `budget/` und prüft
beides: Backend (Ruff, pytest, Migrationen vorwärts *und* rückwärts, Seed-Lauf) und
Frontend (Typecheck, ESLint ohne Warnungen, Vitest, Build).

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
Einrichtungsschritt: Name, Währung, ein erstes Konto mit Startsaldo, Personen und optional
ein kurzer Satz Startkategorien. Danach ist die App sofort benutzbar. `python seed.py` ist
nur für die Demo gedacht und tut nichts, wenn bereits ein Haushalt existiert.

## Konten und Umbuchungen

Ein Haushalt kann mehrere Konten führen — Kontokorrent, Sparkonto, Bargeld, Kreditkarte —
anzulegen unter *Einstellungen → Konten*. Jedes trägt seinen eigenen Startsaldo; der
Kontostand wird immer gerechnet, nie gespeichert.

Wird beim Erfassen ein **Gegenkonto** gewählt, ist die Buchung eine **Umbuchung**: der
Betrag verlässt das eine Konto und erreicht das andere. Sie ist weder Einnahme noch
Ausgabe und ändert den Monatssaldo nicht — Geld aufs Sparkonto zu legen macht einen
Haushalt nicht ärmer. Für das Budget der Kategorie zählt sie trotzdem mit, sonst bliebe
jedes Sparbudget für immer bei 0 %.

Daraus ergeben sich zwei Zahlen statt einer:

* **Vermögen** — alle Konten zusammen.
* **Verfügbar** — nur die Konten, die als verfügbar markiert sind. Ein Sparkonto ist
  Vermögen, aber meist nicht das, was diesen Monat ausgegeben werden soll. Der Schalter
  sitzt je Konto in den Einstellungen.

Die **Sparquote** misst seither, was tatsächlich auf einem Sparkonto gelandet ist, statt
was am Monatsende zufällig übrig blieb.

Solange nur ein Konto existiert, blendet die Oberfläche das alles aus — die Erfassung
bleibt genauso kurz wie vorher.

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

## Belege

Zu jeder Buchung lassen sich Belege ablegen — Kassenzettel, Rechnungen, Quittungen.
Die Büroklammer in der Buchungszeile öffnet den Dialog; sobald ein Beleg da ist, steht
die Anzahl daneben. Drei Wege hinein, je nachdem welcher gerade der kürzeste ist:

* Datei wählen (auch mehrere auf einmal),
* per Drag & Drop hineinziehen,
* mit `Strg`+`V` einfügen — praktisch für einen Screenshot einer E-Rechnung.

Angenommen werden Bilder (JPEG, PNG, WebP, GIF) und PDF, bis 15 MB je Datei. **Fotos
werden beim Speichern verkleinert** (längste Kante 1600 px): ein Kassenzettel muss
lesbar sein, nicht ausstellungsreif. Aus einem 4-MB-Handyfoto werden so ein paar
hundert Kilobyte. PDFs bleiben unverändert.

Die Belege liegen **in der SQLite-Datei**, nicht daneben im Dateisystem. Damit bleibt
die Sicherung eine einzige Datei, und das Löschen einer Buchung nimmt ihre Belege
zuverlässig mit. Der JSON-Export enthält sie bewusst nicht — siehe unten.

## Datensicherung

Der JSON-Export lässt sich unter *Einstellungen → Nicht umkehrbar* wieder zurückspielen.
Dort liegt auch das Zurücksetzen — wahlweise nur die Buchungen oder alles inklusive
Stammdaten. Beides verlangt, das Wort `LÖSCHEN` zu tippen.


Die gesamte Anwendung lebt in einer SQLite-Datei (`backend/data/budget.db` bzw. dem
Docker-Volume `budget-data`). Ein Backup ist ein Kopieren dieser Datei. Zusätzlich bietet
die App unter *Einstellungen* einen vollständigen JSON-Export und einen CSV-Export aller
Buchungen.

**Belege sind nur in der SQLite-Datei.** Im JSON-Backup stehen sie nicht — als Base64
wäre es um Grössenordnungen grösser und kein lesbares Textformat mehr. Das Backup nennt
unter `attachments_excluded`, wie viele es gab, und die App warnt vor dem Zurückspielen.
Wer Belege sichern will, kopiert die Datenbankdatei.

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
| + | Ausgleichszahlungen, Jahresansicht, Prognose, Budgetvorschlag, CI | ✅ |
| + | Konten und Umbuchungen (Vermögen gegen Verfügbar, Sparen als Umbuchung) | ✅ |
| + | Belege an Buchungen (Kassenzettel, Rechnungen; Bilder werden verkleinert) | ✅ |
