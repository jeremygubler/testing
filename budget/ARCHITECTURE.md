# Architektur

Dieses Dokument beschreibt das Datenmodell und die Berechnungslogik. Es wird während der
Entwicklung mitgepflegt; wenn Code und Dokument auseinanderlaufen, ist das ein Bug.

## Leitgedanken

1. **Splits statt Personenspalten.** Die Excel-Vorlage hatte je Person eine Betragsspalte
   und fünf feste Typ-Spalten. Beides skaliert nicht. Hier ist die Aufteilung eine eigene
   Tabelle und der „Typ“ ein Attribut der Kategorie.
2. **Kein redundant gespeichertes Ergebnis.** Jede Kennzahl wird aus `txn` und `txn_split`
   berechnet. Es gibt keine Saldo-, Summen- oder Fortschrittsfelder, die gepflegt werden
   müssten. Einzige Ausnahme ist `txn.amount_minor`, und das ist eine von der Datenbank
   selbst gepflegte Ableitung (siehe unten).
3. **Kein Float.** Beträge sind `int` in Minoreinheiten (Rappen), Feldname `*_minor`. Das
   gilt auch für die API. Formatiert wird ausschließlich im Frontend.
4. **Nichts wird hart gelöscht, was Historie trägt.** Personen und Kategorien werden
   deaktiviert (`is_active = false`), damit alte Buchungen intakt bleiben.

## Datenmodell

```
Household 1──n Member
     │            │
     │            └──── n TransactionSplit ──1 Transaction ──1 Category
     │                        (Betrag)             │              │
     ├──n Category ───────────────────────────────┘              │
     │        ├──n Budget  (Default oder Monat)                   │
     │        └──n SavingsGoal                                    │
     ├──n RecurringRule ──n RecurringRuleSplit                    │
     │        └──n RecurringSkip                                  │
     └──n CalendarEntry                                           │
```

### Household
`name`, `currency`, `locale`, `timezone`, `opening_balance_minor` (Startsaldo),
`settlement_basis`.

`timezone` bestimmt, was „heute" heisst — nicht die Systemzeit des Servers. Das ist
relevant, sobald der Server anderswo steht als der Haushalt: am Monatsanfang und -ende
läge „heute" sonst um einen Tag daneben, und damit auch die Vorschlagslogik und der
Fortschritt von Sparzielen (`services/clock.py`).

`settlement_basis` beantwortet eine Frage, die die Spezifikation offenlässt: *Woran misst
sich der „Anteil“, den eine Person tragen sollte?* Zwei Antworten sind sinnvoll:

* `WEIGHT` (Standard) — nach dem hinterlegten Verteilschlüssel (`Member.share_weight`).
* `INCOME` — nach dem tatsächlichen Einkommensanteil der Periode. Wer mehr verdient,
  trägt anteilig mehr.

### Member
`name`, `color` (für Charts), `is_active`, `sort_order`, `share_weight`.

`share_weight` ist der Verteilschlüssel. Ein 60/40-Haushalt trägt bei Anna `60` und bei
Ben `40` ein. Damit ist der in der Spezifikation als „am Haushalt hinterlegtes Verhältnis“
beschriebene Schlüssel referenziell sauber an den Personen modelliert statt als JSON-Blob
am Haushalt — inhaltlich dasselbe, aber ohne verwaiste Personen-IDs.

### Category
`name`, `flow` (`INCOME` | `EXPENSE`), `group` (`EINKOMMEN`, `FIXKOSTEN`, `VARIABEL`,
`SPAREN`, `SCHULDEN`), `icon`, `color`, `is_active`, `sort_order`.

Die Gruppe ersetzt die alten Excel-Typspalten. `EINKOMMEN` ist die einzige Gruppe mit
`flow = INCOME`; alle übrigen sind Ausgaben. Die Zuordnung steht in `enums.GROUP_FLOW` und
wird serverseitig erzwungen, damit keine Kategorie „Einkommen als Ausgabe“ entstehen kann.

### Budget
`category_id`, `year`, `month`, `amount_minor`, `is_default`.

* `is_default = true` → `year` und `month` sind `NULL`. Gilt für jeden Monat, für den kein
  spezifischer Eintrag existiert.
* `is_default = false` → beide gesetzt. Übersteuert den Default für genau diesen Monat.

Zwei partielle Unique-Indizes erzwingen das (`ddl.py`): ein Default je Kategorie, ein
Monatsbudget je (Kategorie, Jahr, Monat). Eine CHECK-Constraint erzwingt zusätzlich, dass
die beiden Formen nicht vermischt werden.

Auflösung zur Laufzeit: `budget(kategorie, jahr, monat)` = Monatseintrag, sonst Default,
sonst `0`.

### Transaction / TransactionSplit
`Transaction`: `date`, `category_id`, `description`, `note`, `recurring_rule_id`,
`recurring_occurrence_date`, `amount_minor` *(abgeleitet)*.
`TransactionSplit`: `txn_id`, `member_id`, `amount_minor`.

Die Tabellen heißen `txn` / `txn_split`, weil `transaction` in mehreren SQL-Dialekten ein
reserviertes Wort ist.

**Vorzeichenkonvention.** Beträge werden so gespeichert, wie sie erfasst wurden, also
normalerweise positiv. Die Richtung ergibt sich aus `Category.flow`. Der *Effekt* auf den
Saldo ist `+betrag` bei `INCOME` und `−betrag` bei `EXPENSE`. Negative Beträge sind
zulässig und bedeuten eine Korrektur (Rückerstattung auf einer Ausgabenkategorie,
Lohnrückbuchung auf einer Einnahmenkategorie).

**Wie die Split-Konsistenz erzwungen wird.** Die Spezifikation verlangt (a) dass der
Betrag nicht in der Transaction steht und (b) dass die Konsistenz der Split-Summe per
Datenbank-Constraint erzwungen wird. Beides zusammen geht nicht: eine CHECK-Constraint
kann nicht über Kindzeilen aggregieren, und ohne gespeicherten Gesamtbetrag gibt es nichts,
wogegen geprüft werden könnte. Auflösung:

`txn.amount_minor` existiert als **ausschließlich abgeleitete** Spalte. Quelle der Wahrheit
bleiben die Splits. Drei Trigger (`ddl.py`) garantieren auf DB-Ebene:

| Trigger | Garantie |
| --- | --- |
| `trg_txn_split_ai/au/ad` | `txn.amount_minor` ist stets exakt `SUM(txn_split.amount_minor)` |
| `trg_txn_split_ai/au` | die Splits einer Buchung haben nie gemischte Vorzeichen |
| `trg_txn_bi_amount`, `trg_txn_au_amount` | ein direkter Schreibzugriff auf `txn.amount_minor` wird abgelehnt |

Dazu kommen `CHECK (amount_minor <> 0)` je Split und ein Unique auf
`(txn_id, member_id)` — pro Person höchstens ein Split je Buchung.

Was die DB *nicht* prüfen kann, prüft die Service-Schicht (`services/splits.py`): mindestens
ein Split je Buchung, und dass die Summe dem im Request angegebenen Gesamtbetrag entspricht.
Nebeneffekt der abgeleiteten Spalte: Filtern und Sortieren nach Betrag braucht keinen
Aggregat-Join.

### RecurringRule / RecurringRuleSplit / RecurringSkip
`category_id`, `description`, `amount_minor`, `interval` (`WEEKLY`, `MONTHLY`,
`QUARTERLY`, `YEARLY`), `day_of_period`, `anchor_month`, `start_date`, `end_date`,
`is_active`, `split_template`, `split_member_id`.

* `day_of_period` ist bei `MONTHLY`/`QUARTERLY`/`YEARLY` der Tag im Monat (1–31, wird auf
  den Monatsletzten geklemmt — der „31.“ ist im Februar der 28./29.), bei `WEEKLY` der
  Wochentag (1 = Montag … 7 = Sonntag).
* `anchor_month` legt bei `QUARTERLY`/`YEARLY` fest, in welchem Monat das Raster liegt.
* `RecurringRuleSplit` trägt die Standard-Aufteilung, wenn `split_template = MANUAL`.
* `RecurringSkip` merkt sich bewusst übersprungene Termine.

**Abos sind keine eigene Entität**, sondern Regeln mit einer Kategorie der Gruppe
`FIXKOSTEN`. Die Abo-Ansicht ist ein Filter, keine zweite Logik.

### SavingsGoal
`name`, `target_amount_minor`, `target_date`, `category_id`, `start_date`, `is_active`.
Der Fortschritt wird aus den Buchungen der Kategorie ab `start_date` berechnet und nie
gespeichert.

### CalendarEntry
`title`, `date`, `member_id` (optional), `note`. Kein Geldbezug.

## Berechnungslogik

### Aufteilung (`services/splits.py`)

Vorlagen sind reine Eingabe-Helfer; gespeichert wird immer das aufgelöste Ergebnis. Eine
spätere Änderung am Verteilschlüssel verfälscht dadurch keine alten Buchungen.

| Vorlage | Regel |
| --- | --- |
| `SINGLE` | alles auf eine Person |
| `EQUAL` | gleichmäßig auf alle **aktiven** Personen |
| `KEY` | nach `share_weight` der aktiven Personen |
| `MANUAL` | freie Eingabe, muss exakt auf den Gesamtbetrag aufgehen |

### Verteilung ohne Rundungsverlust (`services/money.py`)

`allocate(total, weights)` verteilt nach dem Verfahren des **größten Rests**: Ganzzahlanteile
zuerst, die verbleibenden Rappen gehen an die größten Reste. Bei Gleichstand gewinnt die
frühere Position — dadurch landet der Rundungsrest bei gleichmäßiger Verteilung automatisch
bei der ersten Person, wie in der Spezifikation gefordert. Es gilt immer
`sum(allocate(t, w)) == t`, auch bei negativem `t`.

Beispiel: `allocate(1000, [1,1,1])` → `[334, 333, 333]`.

### Kennzahlen (`services/analytics.py`)

Für einen Monat `(jahr, monat)`, gerechnet über alle Splits der Buchungen in diesem Monat:

| Kennzahl | Formel |
| --- | --- |
| Einnahmen | Σ Beträge auf Kategorien mit `flow = INCOME` |
| Ausgaben | Σ Beträge auf Kategorien mit `flow = EXPENSE` |
| Monatssaldo | Einnahmen − Ausgaben |
| Verfügbar | `opening_balance_minor` + Σ Monatssalden bis einschließlich Monat |
| Budget-Auslastung | Ist ÷ aufgelöstes Budget der Kategorie |
| Sparquote | Σ Gruppe `SPAREN` ÷ Einnahmen |
| Fixkostenquote | Σ Gruppe `FIXKOSTEN` ÷ Einnahmen |
| Pro Person | Einnahmen / getragene Ausgaben / Saldo, gruppiert über `txn_split.member_id` |

Anmerkung zur Sparquote: Buchungen der Gruppe `SPAREN` sind Ausgaben (Geld verlässt das
Konto) und mindern damit den Monatssaldo. Ein Monat mit hoher Sparquote kann also einen
negativen Saldo haben, ohne dass Vermögen verloren ging. Die Übersicht weist deshalb neben
dem Saldo auch den Saldo *ohne* Sparen aus.

Quoten werden als Verhältnis in Basispunkten oder als `null` geliefert, wenn der Nenner 0
ist — nie als „0 %“, weil das etwas anderes bedeutet.

### Ausgleich zwischen Personen (`services/settlement.py`)

1. Betrachtet werden die **Ausgaben** der Periode (Gruppen ≠ `EINKOMMEN`).
2. `getragen_i` = Σ der Ausgaben-Splits von Person *i*.
3. `soll_i` = Gesamtausgaben, verteilt nach `settlement_basis` — `WEIGHT` nach
   `share_weight`, `INCOME` nach dem Einkommensanteil der Periode. Verteilt wird wieder mit
   `allocate`, damit `Σ soll_i` exakt den Gesamtausgaben entspricht.
4. `saldo_i = getragen_i − soll_i`. Positiv = hat vorgelegt, negativ = schuldet.
5. Greedy-Ausgleich: größter Schuldner zahlt an größten Gläubiger, Betrag = Minimum der
   beiden Beträge; wiederholen. Das erzeugt höchstens `n − 1` Zahlungen und ist damit
   minimal in der Anzahl, solange keine Teilmenge exakt auf null aufgeht.

Ausgegeben wird eine Liste konkreter Empfehlungen („Anna überweist Ben 240.50“), keine
Matrix.

### Vorschläge aus wiederkehrenden Buchungen (`services/recurring.py`)

Regeln buchen **nie automatisch**. Für einen Monat werden alle Fälligkeitstermine aller
aktiven Regeln erzeugt und mit dem Ist-Zustand abgeglichen:

* Es gibt eine Buchung mit dieser `recurring_rule_id` und `recurring_occurrence_date`
  → `CONFIRMED`.
* Es gibt einen `RecurringSkip` für Regel und Termin → `SKIPPED`.
* Sonst → `OPEN`, erscheint als Vorschlag.

**Eine Terminänderung erzeugt eine Nachfolgeregel.** Ändern sich `interval`,
`day_of_period`, `anchor_month` oder `start_date` an einer Regel, die bereits bestätigte
Buchungen hat, wird nicht in place geändert: die alte Regel bekommt ein `end_date` am Tag
vor dem Stichtag, und eine neue Regel mit dem neuen Raster beginnt am Stichtag. Sonst
passten die in `recurring_occurrence_date` gespeicherten Termine der bereits gebuchten
Transaktionen zu keinem erzeugten Termin mehr — die Vergangenheit erschiene wieder als
offener Vorschlag und liesse sich ein zweites Mal buchen. Änderungen an Betrag,
Beschreibung, Kategorie oder Aufteilung berühren das Raster nicht und werden weiterhin
direkt übernommen.

Beim Bestätigen sind Betrag, Datum und Aufteilung änderbar (die Stromrechnung schwankt).
Das ist bewusst kein Automatismus: eine App, die ungefragt bucht, hat nie einen Kontostand,
der mit der Realität übereinstimmt.

Eine Regel gilt als **verdächtig**, wenn ihre letzten Fälligkeiten nie bestätigt wurden.
`open_streak` zählt, wie viele fällige Termine zuletzt *in Folge* weder gebucht noch
übersprungen wurden (Rückschau 24 Monate). Ab drei warnt die Ansicht *Wiederkehrend* —
typischerweise ein vergessenes Abo. Bewusstes Überspringen bricht die Serie, denn das ist
eine Entscheidung und kein Versäumnis.

**Hochrechnung.** `yearly_estimate = Betrag × Fälligkeiten pro Jahr` (52 / 12 / 4 / 1),
`monthly_estimate` ist ein Zwölftel davon, kaufmännisch gerundet. Das ist eine Schätzung
und wird nirgends verbucht.

## Import und Export

**CSV-Export** (`/api/io/export/transactions.csv`): Semikolon-getrennt, mit BOM, damit
Excel Umlaute richtig liest. Beträge als Dezimalzahl mit Punkt, die Aufteilung als
`Person=Betrag` je Person.

**JSON-Backup** (`/api/io/export/household.json`): der vollständige Haushalt inklusive
Splits, Regeln, Sparzielen und Terminen — aber ohne abgeleitete Werte (kein
`txn.amount_minor`, keine Kennzahlen). Was sich berechnen lässt, gehört nicht ins Backup.

**CSV-Import** läuft in zwei Schritten und schreibt erst im zweiten:

1. Die Datei wird **im Browser** gelesen (`lib/csv.ts`: Trennzeichenerkennung, Quoting,
   eingebettete Zeilenumbrüche) und die Spaltenzuordnung geraten. Der Nutzer korrigiert sie.
2. `POST /api/io/import/preview` liefert für jede Zeile den Zustand: gelesenes Datum,
   Betrag, aufgelöste Kategorie, Dublette ja/nein, Fehlertext. Nichts wird geschrieben.
3. `POST /api/io/import` übernimmt die fehlerfreien Zeilen.

Fehlerhafte Zeilen werden **gemeldet, nicht stillschweigend übersprungen**.

*Dublettenerkennung* über Datum, Betrag und Beschreibung (ohne Beachtung der
Gross-/Kleinschreibung), sowohl gegen den Bestand als auch innerhalb derselben Datei.

*Vorzeichen*: Bankauszüge schreiben Ausgaben negativ, im Datenmodell steckt die Richtung
aber in der Kategorie. Standardmässig wird das Vorzeichen deshalb verworfen (`-89.00` auf
einer Ausgabenkategorie wird zu einer Ausgabe von 89.00). Wer Rückerstattungen als negative
Beträge importieren will, schaltet „Vorzeichen behalten" ein.

## Schichten

```
routers/    HTTP, Validierung der Ein-/Ausgabe, keine Fachlogik
services/   Fachlogik, arbeitet auf Modellen und einer Session
models/ddl  Persistenz und die DB-seitig erzwungenen Invarianten
```

Router rufen Services, nie umgekehrt. Fachliche Fehler werfen `SplitError` o. ä. und werden
zentral auf HTTP 422 abgebildet.

## Zustände der Oberfläche

Jede Ansicht hat drei mögliche Zustände, und alle drei sind gestaltet:

* **Lädt** — Skelette in der Form des späteren Inhalts, keine Spinner-Wüste.
* **Leer** — erklärt, was zu tun ist, statt „keine Daten" zu melden. Wichtig ist die
  Unterscheidung: „nichts offen" und „es gibt noch gar keine Regeln" sind verschiedene
  Aussagen und bekommen verschiedene Texte.
* **Fehler** — benennt, was nicht ging, und bietet einen Wiederholen-Knopf.

Zusätzlich gibt es einen vierten Zustand vor allen anderen: **keine Installation**. Liefert
`GET /api/household` ein 404, zeigt `HouseholdGate` die Erstinbetriebnahme statt der App.

## Mehrbenutzer-Fähigkeit

Version 1 kennt genau einen Haushalt (`BUDGET_SINGLE_HOUSEHOLD_ID = 1`) und keine
Registrierung. Alle Tabellen mit Nutzdaten tragen aber bereits eine `household_id`, sodass
Mandantenfähigkeit später nur Authentifizierung plus ein Filter ist — kein Schema-Umbau.


## Darstellung von Zahlen

* Alle Beträge stehen rechtsbündig in `font-variant-numeric: tabular-nums`, damit
  Stellen untereinander liegen.
* Negative Beträge sind rot, positive neutral. Nicht alles wird grün eingefärbt —
  Farbe soll Bedeutung tragen, nicht Stimmung.
* Das Währungssymbol steht einmal in der Spaltenüberschrift, nicht in jeder Zeile.
  `Intl.NumberFormat` setzt bei `de-CH` das Minus zwischen Symbol und Zahl
  (`CHF-88.29`); die App stellt es voran (`-CHF 88.29`), weil sich das in einer
  rechtsbündigen Spalte besser liest.

### Chart-Farben

Zwei getrennte Paletten mit zwei verschiedenen Aufgaben:

* **Kategoriegruppen** (`--grp-*`) — feste Bedeutung, überall dieselbe Farbe.
* **Kategoriale Chart-Palette** (`--chart-1` … `--chart-6`) — Identität einzelner
  Kategorien in Kuchen- und Balkendiagrammen. Die Reihenfolge ist fix und wird nie
  zyklisch fortgesetzt: ab der sechsten Kategorie fasst „Übrige" in einem neutralen
  Grau zusammen. Die Palette ist in beiden Modi auf Helligkeitsband, Chroma,
  Farbfehlsichtigkeits-Trennung und Kontrast geprüft; der dunkle Modus hat eigene
  Stufen und ist kein automatisches Umdrehen des hellen.

`--chart-reference` ist der zurückgenommene Budget-Balken: ein Referenzwert, keine
eigenständige Kategorie. Budget und Ist teilen sich **eine** Achse — zwei Skalen in
einem Diagramm gibt es nicht.
