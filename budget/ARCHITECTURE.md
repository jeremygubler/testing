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
     ├──n Account ────────────────────────────────┤              │
     │            (Konto und Gegenkonto)           │              │
     ├──n Category ───────────────────────────────┘              │
     │        ├──n Budget  (Default oder Monat)                   │
     │        └──n SavingsGoal                                    │
     ├──n RecurringRule ──n RecurringRuleSplit                    │
     │        └──n RecurringSkip                                  │
     └──n CalendarEntry                                           │
```

### Household
`name`, `currency`, `locale`, `timezone`, `settlement_basis`.

Der Startsaldo sitzt **nicht** am Haushalt, sondern je Konto (`Account`) — ein Haushalt
mit Kontokorrent und Sparkonto hat zwei Startsalden, keinen gemeinsamen.

`timezone` bestimmt, was „heute" heisst — nicht die Systemzeit des Servers. Das ist
relevant, sobald der Server anderswo steht als der Haushalt: am Monatsanfang und -ende
läge „heute" sonst um einen Tag daneben, und damit auch die Vorschlagslogik und der
Fortschritt von Sparzielen (`services/clock.py`).

`settlement_basis` beantwortet eine Frage, die die Spezifikation offenlässt: *Woran misst
sich der „Anteil“, den eine Person tragen sollte?* Zwei Antworten sind sinnvoll:

* `WEIGHT` (Standard) — nach dem hinterlegten Verteilschlüssel (`Member.share_weight`).
* `INCOME` — nach dem tatsächlichen Einkommensanteil der Periode. Wer mehr verdient,
  trägt anteilig mehr.

### Account
`name`, `kind` (`CHECKING`, `SAVINGS`, `CASH`, `CREDIT`), `opening_balance_minor`,
`color`, `include_in_available`, `is_active`, `sort_order`. Der Name ist je Haushalt
eindeutig.

Ohne Konten gäbe es nur einen einzigen Topf, und „Sparen" müsste eine Ausgabe sein,
obwohl das Geld den Haushalt nie verlässt. Mit Konten wird daraus eine **Umbuchung**:
`Transaction.counter_account_id` gesetzt heißt „belastet `account_id`, speist
`counter_account_id`" — weder Einnahme noch Ausgabe, nur ein Wechsel des Topfes. Eine
`CHECK`-Constraint verbietet, dass Konto und Gegenkonto dasselbe sind.

`include_in_available` trennt zwei Fragen, die gern verwechselt werden: *Was besitzt der
Haushalt?* (Vermögen, alle Konten) gegen *Was kann er diesen Monat ausgeben?* (Verfügbar,
nur die Konten mit dieser Markierung). Ein Sparkonto ist Vermögen, aber typischerweise
nicht verfügbar — deshalb ist das je Konto einstellbar und nicht an `kind` geknüpft.

Kontostände werden **nie gespeichert**, immer gerechnet (`services/accounts.py`):
`opening_balance_minor` + Einnahmen/Ausgaben auf dem Konto + Zu-/Abflüsse durch
Umbuchungen, wahlweise zu einem Stichtag.

Konten ohne Buchungen werden gelöscht, benutzte nur deaktiviert (`ondelete="RESTRICT"`);
das letzte aktive Konto ist geschützt, sonst hätte eine neue Buchung kein Ziel.

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
sonst „kein Budget" (`null`, nicht `0`).

**Vorschlagen statt tippen** (`GET /api/budgets/proposal`): Budgets lassen sich aus dem
tatsächlichen Verlauf ableiten — Durchschnitt über N Monate oder schlicht der Vormonat.
Zwei Entscheidungen dabei:

* Gerechnet wird über die **abgeschlossenen** Monate vor dem gewählten; der laufende ist
  unvollständig und zöge den Schnitt nach unten.
* Geteilt wird durch die Monate, **in denen überhaupt gebucht wurde**, nicht durch die
  Fensterbreite. Wer die App seit zwei Monaten benutzt und ein Halbjahr auswählt, bekäme
  sonst ein Drittel der Miete vorgeschlagen: Monate vor der ersten Buchung sind keine
  Monate ohne Ausgaben, sondern Monate ohne Daten. Innerhalb der erfassten Monate ist eine
  leere Kategorie dagegen eine echte Null.

Beträge werden auf ganze Währungseinheiten gerundet — 947.83 wäre eine Genauigkeit, die es
nicht gibt. Der Vorschlag wird wie beim Import erst gezeigt und einzeln abwählbar, bevor
`PUT /api/budgets/bulk` ihn schreibt.

### Transaction / TransactionSplit
`Transaction`: `date`, `category_id`, `account_id`, `counter_account_id`, `description`,
`note`, `recurring_rule_id`, `recurring_occurrence_date`, `amount_minor` *(abgeleitet)*.
`TransactionSplit`: `txn_id`, `member_id`, `amount_minor`.

Die Tabellen heißen `txn` / `txn_split`, weil `transaction` in mehreren SQL-Dialekten ein
reserviertes Wort ist.

**Vorzeichenkonvention.** Beträge werden so gespeichert, wie sie erfasst wurden, also
normalerweise positiv. Die Richtung ergibt sich aus `Category.flow`. Der *Effekt* auf den
Saldo ist `+betrag` bei `INCOME` und `−betrag` bei `EXPENSE`. Negative Beträge sind
zulässig und bedeuten eine Korrektur (Rückerstattung auf einer Ausgabenkategorie,
Lohnrückbuchung auf einer Einnahmenkategorie).

Ist `counter_account_id` gesetzt, ist die Buchung eine **Umbuchung**: `Category.flow`
sagt dann nichts über die Richtung, weil es keine gibt. Der Betrag verlässt `account_id`
und erreicht `counter_account_id`; für Einnahmen, Ausgaben und Saldo zählt er nicht.

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

### SettlementPayment
`from_member_id`, `to_member_id`, `amount_minor`, `date`, `period_year`, `period_month`,
`note`.

Eine tatsächlich geleistete Ausgleichszahlung. Ohne diese Tabelle war der Ausgleich nur
eine Anzeige: die App rechnete jeden Monat neu aus, wer wem was schuldet, aber eine
geleistete Überweisung liess sich nirgends festhalten — der Folgemonat begann wieder bei
null und offene Beträge verschwanden lautlos.

`date` und `period_*` sind bewusst getrennt: die Januar-Schuld begleicht man typischerweise
im Februar.

**Eine Ausgleichszahlung ist keine Buchung.** Sie verschiebt Geld zwischen Personen, ändert
aber weder Einnahmen noch Ausgaben des Haushalts und damit auch nicht den Kontostand.
Deshalb liegt sie in einer eigenen Tabelle und nicht in `txn` — eine Buchung daraus zu
machen würde die Ausgaben des Monats doppelt zählen.

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
| Einnahmen | Σ Beträge auf Kategorien mit `flow = INCOME`, **ohne Umbuchungen** |
| Ausgaben | Σ Beträge auf Kategorien mit `flow = EXPENSE`, **ohne Umbuchungen** |
| Monatssaldo | Einnahmen − Ausgaben |
| Verfügbar | Σ Kontostände der Konten mit `include_in_available`, zum Monatsende |
| Vermögen | Σ Kontostände aller Konten, zum Monatsende |
| Budget-Auslastung | Ist ÷ aufgelöstes Budget der Kategorie |
| Gespart | Σ Umbuchungen, deren Gegenkonto `kind = SAVINGS` hat |
| Sparquote | Gespart ÷ Einnahmen |
| Fixkostenquote | Σ Gruppe `FIXKOSTEN` ÷ Einnahmen |
| Pro Person | Einnahmen / getragene Ausgaben / Saldo, gruppiert über `txn_split.member_id` |

**Umbuchungen und das Ist einer Kategorie.** Eine Umbuchung ist keine Ausgabe — aber sie
ist sehr wohl das, was auf ihrer Kategorie passiert ist. Wer 1'400 aufs Sparkonto
budgetiert, will sehen, ob er 1'400 umgebucht hat; ohne das bliebe jedes Sparbudget für
immer bei 0 % Auslastung. Deshalb zählen Umbuchungen in `CategoryFigure.actual_minor`
(und damit ins Budget) mit, nicht aber in Einnahmen, Ausgaben und Saldo.
`CategoryFigure.transfer_minor` weist aus, welcher Anteil des Ist daher stammt — das
Kuchendiagramm „Ausgaben nach Kategorie" zieht ihn ab, sonst summierte es auf mehr als
die Kennzahl daneben.

Anmerkung zur Sparquote: Sparen mindert den Monatssaldo nicht mehr, seit es eine
Umbuchung ist — das Geld hat nur das Konto gewechselt. Dafür sinkt „Verfügbar", während
„Vermögen" gleich bleibt. Genau diese Trennung ist der Zweck der Konten.

Quoten werden als Verhältnis in Basispunkten oder als `null` geliefert, wenn der Nenner 0
ist — nie als „0 %“, weil das etwas anderes bedeutet.

### Prognose, Vergleich, Jahr (`services/analytics.py`)

**Prognose** (`/api/analytics/forecast`): Saldo und Kontostand, wenn die noch **offenen**
Vorschläge aus wiederkehrenden Regeln bestätigt würden. Bestätigte zählen nicht mit — sie
stecken schon im Ist —, übersprungene auch nicht, denn sie kommen nicht mehr. Das ist die
Zahl, die man wirklich wissen will: nicht der Stand jetzt, sondern der Stand am Monatsende.

**Vergleich** (`/api/analytics/comparison`): Ist des Monats gegen den Schnitt der
abgeschlossenen Vormonate. Geteilt wird wie beim Budgetvorschlag durch die Monate, in denen
tatsächlich gebucht wurde. Ohne Vergangenheit gibt es keine Abweichung in Prozent, sondern
`null` und nur einen Betrag.

Die Übersicht zeigt daraus nur **Überschreitungen** und nur, wenn sowohl der Anteil (≥ 25 %)
als auch der Betrag (≥ 50 Einheiten) spürbar sind. Nach unten wird bewusst nicht gemeldet:
ein Jahresabo, das elf Monate lang nicht anfällt, stünde sonst jeden Monat mit „−100 %" da —
richtig gerechnet und trotzdem ohne jeden Wert.

**Jahr** (`/api/analytics/year`): zwölf Monatszeilen plus Jahressummen je Gruppe und
Kategorie. Monate ohne Buchungen werden als solche markiert (`has_data`) statt als Nullen
ausgewiesen — sie tragen den Kontostand weiter, behaupten aber keine Ausgaben von 0.

**Vermögensverlauf**: `TrendPoint.available_minor` ist der Kontostand der verfügbaren
Konten zum jeweiligen Monatsende — je Monat neu gerechnet, nicht aus den Monatssalden
aufaddiert. Aufsummiert liefe die Linie von der Kennzahl auf der Übersicht weg, weil der
Saldo weder Umbuchungen kennt noch Buchungen auf Konten, die nicht zum verfügbaren Geld
zählen. Damit kennt das Fenster seine Vorgeschichte automatisch: ein späteres Fenster
verliert die Historie nicht. Im Diagramm ist das eine **eigene Ansicht**, keine vierte Linie —
Vermögen und Monatswerte liegen Grössenordnungen auseinander, und zwei Skalen in einem Bild
sind der zuverlässigste Weg, jemanden zu täuschen.

### Ausgleich zwischen Personen (`services/settlement.py`)

1. Betrachtet werden die **Ausgaben** der Periode (Gruppen ≠ `EINKOMMEN`).
2. `getragen_i` = Σ der Ausgaben-Splits von Person *i*.
3. `soll_i` = Gesamtausgaben, verteilt nach `settlement_basis` — `WEIGHT` nach
   `share_weight`, `INCOME` nach dem Einkommensanteil der Periode. Verteilt wird wieder mit
   `allocate`, damit `Σ soll_i` exakt den Gesamtausgaben entspricht.
4. `brutto_i = getragen_i − soll_i`. Positiv = hat vorgelegt, negativ = schuldet.
5. `beglichen_i` = erhaltene minus geleistete Ausgleichszahlungen der Periode.
   `offen_i = brutto_i − beglichen_i`.
6. Greedy-Ausgleich über die **offenen** Beträge: größter Schuldner zahlt an größten
   Gläubiger, Betrag = Minimum der beiden Beträge; wiederholen. Das erzeugt höchstens
   `n − 1` Zahlungen und ist damit minimal in der Anzahl, solange keine Teilmenge exakt
   auf null aufgeht.

Eine Teilzahlung lässt den Rest offen, eine Überzahlung dreht die Richtung um — beides
fällt ohne Sonderfall aus derselben Rechnung. Zahlungen wirken nur auf die Periode, für die
sie erfasst wurden; ein Fenster über mehrere Monate berücksichtigt entsprechend alle darin
liegenden.

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

### Kategorie aus der Beschreibung raten (`services/inference.py`)

Ein Haushalt bucht dieselben Dinge immer wieder. Wer „Coop" zwölfmal derselben
Kategorie zugeordnet hat, soll es nicht ein dreizehntes Mal tun müssen.

Geraten wird **ausschliesslich aus der eigenen Historie** — es gibt keine mitgelieferte
Händlerliste, die bei einem Quartierladen ohnehin danebenläge. Zuerst wird nach
identischer Beschreibung gesucht (`EXACT`, ein starkes Signal), erst wenn das nichts
ergibt nach gemeinsamen Stichwörtern (`TOKEN`, ein schwaches). Ziffern und Füllwörter wie
„Filiale" oder „Kartenzahlung" werden vorher entfernt. Findet sich nichts, kommt `None`
zurück — kein Vorschlag ist besser als ein falscher.

Der Vorschlag wird **nie stillschweigend angewendet**: das Erfassungsformular zeigt ihn
als anklickbaren Hinweis, der Import weist die Herkunft je Zeile als `CSV`, `HISTORY`
oder `FALLBACK` aus, und das Raten lässt sich im Dialog abschalten.

## Import und Export

**CSV-Export** (`/api/io/export/transactions.csv`): Semikolon-getrennt, mit BOM, damit
Excel Umlaute richtig liest. Beträge als Dezimalzahl mit Punkt, die Aufteilung als
`Person=Betrag` je Person. Die Spalten `konto` und `gegenkonto` nennen beide Seiten einer
Umbuchung; bei einer gewöhnlichen Buchung bleibt `gegenkonto` leer.

**JSON-Backup** (`/api/io/export/household.json`): der vollständige Haushalt inklusive
Splits, Regeln, Sparzielen, Terminen und Ausgleichszahlungen — aber ohne abgeleitete Werte
(kein `txn.amount_minor`, keine Kennzahlen). Was sich berechnen lässt, gehört nicht ins
Backup.

Das Format trägt eine Version. Version 2 führt `settlement_payments`, Version 3 die
Konten. Ältere Backups bleiben lesbar: fehlen die Konten, wird aus dem Startsaldo des
Haushalts ein „Hauptkonto" angelegt und — falls es Buchungen der Gruppe `SPAREN` gibt —
ein „Sparkonto", auf das diese Buchungen als Umbuchungen umgestellt werden. Das ist
dieselbe Übersetzung, die auch die Migration `0003` fährt.

**CSV-Import** läuft in zwei Schritten und schreibt erst im zweiten:

1. Die Datei wird **im Browser** gelesen (`lib/csv.ts`: Trennzeichenerkennung, Quoting,
   eingebettete Zeilenumbrüche) und die Spaltenzuordnung geraten. Der Nutzer korrigiert sie.
2. `POST /api/io/import/preview` liefert für jede Zeile den Zustand: gelesenes Datum,
   Betrag, aufgelöste Kategorie, Dublette ja/nein, Fehlertext. Nichts wird geschrieben.
3. `POST /api/io/import` übernimmt die fehlerfreien Zeilen.

Fehlerhafte Zeilen werden **gemeldet, nicht stillschweigend übersprungen**.

*Dublettenerkennung* über Datum, Betrag und Beschreibung (ohne Beachtung der
Gross-/Kleinschreibung), sowohl gegen den Bestand als auch innerhalb derselben Datei.

*Konto*: Ein Bankauszug gehört zu genau einem Konto — der Import bucht deshalb alle
Zeilen auf das gewählte (`account_id`), nicht auf das erstbeste.

*Vorzeichen*: Bankauszüge schreiben Ausgaben negativ, im Datenmodell steckt die Richtung
aber in der Kategorie. Standardmässig wird das Vorzeichen deshalb verworfen (`-89.00` auf
einer Ausgabenkategorie wird zu einer Ausgabe von 89.00). Wer Rückerstattungen als negative
Beträge importieren will, schaltet „Vorzeichen behalten" ein.

**Zurückspielen** (`POST /api/io/restore`) ersetzt den gesamten Haushalt durch den Stand
aus dem Backup. Die ursprünglichen IDs werden beibehalten — weil vorher vollständig
geleert wird, bleiben alle Querverweise des Backups gültig, ohne sie umschreiben zu müssen.
`txn.amount_minor` wird nicht aus dem Backup übernommen, sondern von den Triggern aus den
Splits neu berechnet; ein direkter Schreibzugriff darauf würde ohnehin abgelehnt.
Schlägt der Restore mitten in der Arbeit fehl — etwa weil eine Buchung im Backup keine
Aufteilung hat —, rollt die Transaktion zurück und der bisherige Haushalt steht unverändert.

**Zurücksetzen** (`POST /api/io/reset`) kennt zwei Umfänge: `TRANSACTIONS` löscht Buchungen,
Splits und Ausgleichszahlungen — Letztere gleichen konkrete Ausgaben aus und stünden ohne
diese als unbegründete Guthaben da —, `ALL` löscht auch die Stammdaten und den Haushalt selbst — danach
zeigt die App wieder ihre Einrichtung. Beides verlangt das Wort `LOESCHEN` im Request; ein
Klick allein ist zu wenig für etwas, das sich nicht rückgängig machen lässt.

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

## Werkzeuge

* **Ruff** ersetzt im Backend Flake8, isort und Black in einem Werkzeug (`ruff.toml`).
  Die Regeln `RUF001–003` sind aus: deutsche Kommentare enthalten Umlaute, und die als
  „ambiguous unicode" zu melden ist hier keine Verwechslungsgefahr, sondern Sprache.
* **ESLint** ist im Frontend vor allem wegen der React-Hook-Regeln da — der TypeScript-
  Compiler fängt ungenutzte Variablen und Typfehler bereits. Warnungen lässt CI nicht
  durch (`--max-warnings 0`), damit sich keine ansammeln.

Die Regel `react-hooks/set-state-in-effect` hat einen echten Missstand aufgedeckt:
mehrere Dialoge setzten ihren Zustand in einem Effekt aus Props zurück. Das ist jetzt
anders gelöst — der Dialoginhalt wird nur gerendert, solange er offen ist, und trägt
einen `key` aus dem bearbeiteten Objekt. Dadurch startet das Formular bei jedem Öffnen
frisch, ohne Effekt und ohne den Zwischenzustand mit alten Werten. Wo ein Zustand
tatsächlich einer Prop folgen muss, geschieht das während des Renderns über einen
Vergleich mit dem letzten Wert.

### Auslieferung

Die Seiten werden per Route nachgeladen (`React.lazy`). Erfassen ist der häufigste Weg
in die App und bleibt im Einstiegs-Bundle; die Diagrammbibliothek wiegt allein mehr als
der ganze Rest und hat auf dem Handy nichts im ersten Ladevorgang zu suchen. React und
Recharts liegen als eigene Dateien vor, damit sie über Versionen hinweg im Browser-Cache
bleiben.

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
