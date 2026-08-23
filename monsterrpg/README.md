# Monster-RPG Grundgerüst (Godot 4)

Lauffähiges Grundgerüst für ein **3D-Monster-Sammel-RPG** in Godot 4.3+ mit
GDScript. Alles ist eigene IP, alle Assets sind Platzhalter-Primitive
(Kapseln, Boxen, Zylinder) — es gibt keine fremden Namen, Grafiken oder
Designs im Projekt.

**Was funktioniert bereits:**

| Baustein | Datei(en) | Stand |
|---|---|---|
| Overworld-Spieler (3D, WASD, Maus/Gamepad-Kamera) | `scripts/overworld/PlayerController.gd`, `CameraRig.gd` | frei **oder** rasterbasiert, umschaltbar |
| Monster-Definitionen als Resource | `scripts/monsters/MonsterSpecies.gd` + `resources/monsters/*.tres` | 12 Arten, 24 Attacken |
| Zentrale Datenbank | `scripts/autoload/MonsterDatabase.gd` | Autoload, ID-basiert |
| Rundenkampf | `scripts/battle/BattleManager.gd` + `scenes/battle/Battle.tscn` | Angriff / Wechsel / Item / Flucht, Fangen, EP, Entwicklung |
| Typen-Effektivität + Schadensformel | `data/type_chart.json`, `scripts/battle/DamageCalculator.gd` | 10 Typen, datengetrieben |
| Zufallsbegegnungen | `scripts/overworld/EncounterZone.gd` (Area3D) | streckenbasiert, gewichtete Tabellen |
| Team & Inventar | `scripts/autoload/GameState.gd` | max. 6 im Team + Box, Items, Geld, Flags |
| Speichern/Laden | `scripts/autoload/SaveSystem.gd` | JSON (FileAccess) **und** .tres (ResourceSaver) |
| Headless-Tests & Balance-Tools | `tests/`, `tools/` | Testsuite + Kampfsimulator |

---

## 1. Schritt für Schritt: anlegen, starten, testen

### 1.1 Projekt öffnen

1. **Godot 4.3 oder neuer** installieren (Standard-Version, nicht .NET nötig).
2. Godot starten → **Importieren** → die Datei `monsterrpg/project.godot`
   auswählen → **Importieren & Bearbeiten**.
3. Godot importiert einmalig alle Dateien. Das erzeugt den Ordner `.godot/`
   (ist per `.gitignore` ausgeschlossen).
4. Beim ersten Start prüfen: In der Ausgabe unten muss stehen
   `[MonsterDatabase] 12 Arten, 24 Attacken, 6 Items, 2 Zonen geladen.`
   Steht dort 0, hat Godot die `.tres`-Dateien noch nicht indexiert →
   **Projekt → Projekt neu laden**.

> **Kein Editor da?** Das Projekt lässt sich komplett headless prüfen:
> ```bash
> godot --headless --path monsterrpg --import        # zweimal ausführen
> godot --headless --path monsterrpg -s res://tools/parse_check.gd
> godot --headless --path monsterrpg -s res://tests/TestRunner.gd
> ```

### 1.2 Ganzes Spiel starten

**F5** startet `scenes/Main.tscn` (Titelbildschirm). Von dort:

* **Neues Spiel** → frischer Spielstand + Overworld
* **Fortsetzen** → lädt Slot 0 (nur aktiv, wenn ein Speicherstand da ist)
* **Nur Overworld testen** / **Nur Kampf testen** → springt direkt in einen Teil

### 1.3 Overworld einzeln testen

`scenes/overworld/Overworld.tscn` öffnen und **F6** drücken.

Die Szene ist eigenständig lauffähig: `GameState` baut beim Start automatisch
das Standardteam aus `data/game_config.json`. Zu testen:

1. Mit **WASD** laufen, mit der **rechten Maustaste** (gehalten) oder gefangener
   Maus (**Esc**) die Kamera drehen, mit dem **Mausrad** zoomen.
2. In eine der grün markierten Flächen laufen — die Kurzmeldung unten links
   zeigt `Du betrittst: Blütenwiese`.
3. Dort **weiterlaufen**, bis eine Begegnung auslöst (im Schnitt alle ~4 m mit
   18 % Chance). Es wechselt automatisch in den Kampf.
4. **F1** erzwingt sofort einen Testkampf, **F5** speichert, **F9** lädt.

### 1.4 Kampf einzeln testen

`scenes/battle/Battle.tscn` öffnen und **F6** drücken.

Ohne Kontext aus der Overworld baut sich die Szene selbst einen Testkampf. Im
Inspector des Wurzelknotens `Battle` steht dafür die Gruppe
**Debug-Direktstart**:

| Feld | Wirkung |
|---|---|
| `debug_enemy_species` | Art des Gegners (leer = letzte Art der Datenbank) |
| `debug_enemy_level` | Level des Gegners |
| `debug_player_species` | eigenes Monster erzwingen (leer = Team aus `GameState`) |
| `debug_seed` | fester Seed ⇒ **exakt reproduzierbarer** Kampf |
| `print_log` | schreibt das Kampflog zusätzlich in die Godot-Konsole |

Bedienung: **Angriff / Wechsel / Item / Flucht** mit Maus oder Tastatur
(Pfeiltasten + Enter). **Leertaste/Enter** spult den Kampftext vor.

### 1.5 Alles headless prüfen (wie die CI)

```bash
cd <repo>
godot --headless --path monsterrpg -s res://tools/parse_check.gd   # kompiliert jedes Skript
godot --headless --path monsterrpg -s res://tools/scene_check.gd   # lädt jede .tscn/.tres
godot --headless --path monsterrpg -s res://tests/TestRunner.gd    # Testsuite
godot --headless --path monsterrpg -s res://tools/battle_sim.gd    # Determinismus + Balance
python3 monsterrpg/tools/gen_content.py                            # resources/ neu erzeugen
```

Genau diese fünf Schritte laufen in `.github/workflows/monsterrpg-ci.yml`.

---

## 2. Steuerung

| Aktion | Tastatur / Maus | Gamepad |
|---|---|---|
| Laufen | `WASD` / Pfeiltasten | linker Stick |
| Kamera | rechte Maustaste halten, oder `Esc` (Maus fangen) | rechter Stick |
| Zoom | Mausrad | — |
| Springen (nur freier Modus) | `Leertaste` | A |
| Rennen | `Shift` halten | B halten |
| Interagieren | `E` | A |
| Maus freigeben / fangen | `Esc` | Start |
| Testkampf erzwingen | `F1` | — |
| Schnellspeichern / -laden | `F5` / `F9` | — |

Die Belegung steht in `project.godot` (Abschnitt `[input]`) und ist im Editor
unter **Projekt → Projekteinstellungen → Eingabezuordnung** änderbar. Fehlt eine
Aktion, legt das Autoload `InputActions` sie beim Start automatisch an — das
Projekt läuft also auch mit leerer Eingabezuordnung.

---

## 3. Projektstruktur

```
monsterrpg/
├── project.godot            Autoloads, Eingabezuordnung, Renderer
├── data/                    reine Tuning-Daten (JSON, von Hand pflegbar)
│   ├── type_chart.json      Typen-Effektivitätsmatrix (10 Typen)
│   └── game_config.json     Teamgröße, Kampfkonstanten, Startausrüstung
├── resources/               Inhalte als .tres (im Inspector bearbeitbar)
│   ├── monsters/            12 Arten
│   ├── moves/               24 Attacken
│   ├── items/               6 Gegenstände
│   └── encounters/          2 Begegnungstabellen
├── scripts/
│   ├── core/                Enums + Mathematik (Elements, Stats, Status, Effekte)
│   ├── monsters/            Resource-Klassen + MonsterInstance (Spielstand)
│   ├── autoload/            MonsterDatabase, GameState, SaveSystem, GameFlow, InputActions
│   ├── battle/              BattleManager, DamageCalculator, BattleAI, ...
│   └── overworld/           PlayerController, CameraRig, EncounterZone, Overworld
├── scenes/
│   ├── Main.tscn/.gd        Titelbildschirm (Hauptszene)
│   ├── overworld/           Overworld.tscn, Player.tscn, EncounterZone.tscn
│   └── battle/              Battle.tscn, MonsterView.tscn
├── ui/                      BattleUI.tscn/.gd, OverworldHUD.tscn/.gd
├── tools/                   gen_content.py, parse_check, scene_check, battle_sim
├── tests/                   TestRunner.gd, TestSuite.gd
└── docs/SCENES.md           vollständige Knoten-Hierarchien aller Szenen
```

---

## 4. Architektur in fünf Minuten

**Drei Schichten, eine Richtung.**

```
   data/ + resources/        (Inhalte, kein Code)
            │  liest
            ▼
   MonsterDatabase ──► GameState ──► SaveSystem      (Autoloads: Zustand)
            │              │
            ▼              ▼
   BattleManager      EncounterZone / PlayerController   (Regeln, Simulation)
            │  Signale        │  Signale
            ▼                 ▼
   BattleUI            OverworldHUD                      (Darstellung)
```

Drei Regeln, die das Ganze zusammenhalten:

1. **Regeln kennen keine UI.** `BattleManager` sendet nur Signale
   (`message`, `hp_changed`, `battle_ended`). Deshalb kann die Testsuite einen
   kompletten Kampf ohne Fenster durchspielen.
2. **Inhalte werden über IDs referenziert**, nicht über Dateipfade. Ein
   Speicherstand enthält `"species_id": "cindercub"` — die `.tres` darf danach
   beliebig umgebaut oder verschoben werden.
3. **Zufall kommt immer aus einem übergebenen `RandomNumberGenerator`**
   (`BattleManager.rng`, `GameState.encounter_rng`), nie aus `randi()`. Gleicher
   Seed ⇒ gleicher Kampf. Das ist die Grundlage für die Regressionstests.

**Kampf-Zustand vs. Spielstand:** `MonsterInstance` ist der dauerhafte Zustand
(Level, EP, KP, Status, PP). `BattleCombatant` legt sich darüber und hält nur
das Kampf-Flüchtige (Stat-Stufen). Buffs können den Spielstand also nicht
verbiegen; Schaden und Statusprobleme bleiben dagegen absichtlich bestehen.

**Szenenwechsel:** `GameFlow` lagert den `BattleContext` zwischen, statt ihn als
Argument zu übergeben. Genau deshalb sind `Overworld.tscn` und `Battle.tscn`
einzeln startbar — findet `Battle` keinen Kontext, baut es sich einen Debug-Kampf.

---

## 5. Kampfsystem im Detail

### Rundenablauf

```
submit_player_action(action)
  1. KI wählt ihre Aktion (BattleAI)
  2. Reihenfolge: Priorität → Initiative → RNG-Münzwurf
     Flucht(+7) > Item/Wechsel(+6) > Attacke (deren eigene Priorität)
  3. Aktionen ausführen (Abbruch, sobald der Kampf entschieden ist)
  4. Rundenende: Statusschaden (Gift 1/8, Verbrennung 1/16 der max. KP)
  5. K.O.-Abwicklung: EP verteilen, Levelaufstieg, Entwicklung, nachsenden
  6. nächste Runde  ODER  Zwangswechsel  ODER  battle_ended
```

Der ganze Aufruf läuft **synchron** durch — kein `await` im Regelwerk. Das
Text-Pacing macht allein `ui/BattleUI.gd`, das die Log-Zeilen puffert.

### Schadensformel (`scripts/battle/DamageCalculator.gd`)

```
level_term = 2 * Level / 5 + 2
roh        = level_term * Power * ANG / VET / damage_divisor + 2
Schaden    = floor(roh * STAB * Effektivität * Volltreffer * Streuung)
```

* `ANG/VET` = ATK/DEF (physisch) bzw. SPA/SPD (speziell), inkl. Stat-Stufen und
  Statusmali (Verbrennung halbiert ATK, Paralyse halbiert Initiative)
* `STAB` = 1.5, wenn der Attackentyp einem Typ des Anwenders entspricht
* `Effektivität` = Produkt aus der Typenmatrix (0 / 0.5 / 1 / 2 **pro** Zieltyp)
* `Volltreffer` = 1.5 bei 1/16 Chance (1/8 bei `high_crit`)
* `Streuung` = 0.85 … 1.00 aus dem Kampf-RNG

Alle Konstanten stehen in `data/game_config.json` unter `combat`.

**Der wichtigste Regler ist `combat/damage_divisor`** (Standard 100): er
bestimmt die Kampflänge. Gemessen mit `tools/battle_sim.gd` (200 Kämpfe,
Level 12): bei 50 dauert ein Kampf 3,1 Runden — zu kurz, um das Menü überhaupt
zu benutzen — bei 100 rund 6. Höher = längere, taktischere Kämpfe.

### Typenmatrix

10 Typen: `neutral, ember (Glut), tide (Flut), verdant (Flora), spark (Blitz),
frost, stone (Fels), gale (Wind), toxin, umbra`. Die Matrix in
`data/type_chart.json` listet nur Abweichungen von 1.0 — alles Ungenannte ist
neutral. Drei Immunitäten sind gesetzt: Fels ist immun gegen Blitz, Umbra gegen
Neutral, Neutral gegen Umbra.

### Statusprobleme

| Status | Wirkung |
|---|---|
| Verbrennung | 1/16 max. KP pro Runde, halbierter physischer Angriff |
| Vergiftung | 1/8 max. KP pro Runde |
| Paralyse | halbierte Initiative, 25 % Chance auf Zugausfall |
| Schlaf | setzt 1–3 Runden aus, wacht danach automatisch auf |

### Fangen und Flucht

```
Fangchance = Fangrate/255 · Kugel-Bonus · (1 + 0.66·(1-KP-Anteil))
             · Status-Bonus (Schlaf 2.0, sonstige 1.5) · Level-Dämpfung
             begrenzt auf 3 % … 95 %

Fluchtchance = 0.30 + 0.35·(eigene/fremde Initiative − 1) + 0.15·Fehlversuche
```

Beides ist über `data/game_config.json` (`capture`, `flee`) einstellbar.

---

## 6. Eigene Inhalte hinzufügen

### Neue Attacke

1. Im FileSystem-Panel Rechtsklick auf `resources/moves/` →
   **Neu → Ressource… → MoveDefinition**.
2. `id` (eindeutig, snake_case), `display_name`, Typ, Kategorie, Power,
   Genauigkeit, PP setzen. Für einen Zusatzeffekt die Gruppe
   **Zusatzeffekt** ausfüllen (`effect`, `effect_chance`, `targets_self`, …).
3. Fertig — `MonsterDatabase` findet die Datei beim nächsten Start selbst.

### Neue Art

1. `resources/monsters/` → **Neu → Ressource… → MonsterSpecies**.
2. Typen, Basiswerte, `catch_rate`, `base_exp`, Platzhalter-Farbe/-Größe setzen.
3. `learnset`: Array-Größe erhöhen, je Eintrag ein **LearnsetEntry** anlegen
   (`level` + `move`).
4. Optional `evolves_into` (ID der Zielart) + `evolve_level`.
5. In eine `EncounterTable` aufnehmen, damit die Art auch vorkommt.

### Neue Zone

1. `resources/encounters/` → **Neu → Ressource… → EncounterTable**, Einträge als
   `EncounterEntry` (Art, Gewicht, Min-/Max-Level) anlegen.
2. In `Overworld.tscn` unter `Zones` eine Instanz von
   `scenes/overworld/EncounterZone.tscn` einfügen (**Szene instanziieren**),
   positionieren, `zone_name` und `table` im Inspector setzen.
3. Zum Testen: `start_battle_on_encounter` abschalten und nur das Signal
   `encounter_triggered` beobachten.

### Neuer Attacken-Effekt (der einzige Fall, der Code braucht)

1. In `scripts/core/MoveEffects.gd` einen Enum-Eintrag ergänzen (und den Key in
   `KEYS`).
2. In `BattleManager._apply_move_effect()` einen `match`-Zweig hinzufügen.
3. Attacken-.tres auf den neuen Effekt umstellen. Sonst ändert sich nichts.

### Balance ändern

Zahlen in `data/game_config.json` oder in den `.tres`-Dateien anpassen, dann

```bash
godot --headless --path monsterrpg -s res://tools/battle_sim.gd
```

vergleicht Siegquoten je Art vor/nach der Änderung (Rundenturnier aller Arten).

> `tools/gen_content.py` erzeugt `resources/**` neu und **überschreibt
> Handänderungen**. Entweder die Balance-Werte dort eintragen (empfohlen,
> solange viel umgebaut wird) oder den Generator ab jetzt nicht mehr benutzen
> und nur im Editor arbeiten. Die CI prüft, dass beide Stände übereinstimmen.

---

## 7. Bewegungsmodus umschalten

`Player`-Knoten anwählen → Inspector → **Bewegung → Movement Mode**:

* **FREE** — freie 3D-Bewegung relativ zur Kamera, mit Beschleunigung,
  Schwerkraft und Sprung.
* **GRID** — feldweise Bewegung: `grid_size` (Kantenlänge) und `grid_step_time`
  (Dauer pro Schritt). Hindernisse werden vor dem Schritt per `test_move()`
  geprüft, Diagonalen gibt es nicht. Der Rastermodus geht von flachem Boden aus;
  für Hänge einen Boden-Raycast pro Schritt ergänzen.

Beide Modi melden die gelaufene Strecke über `PlayerController.moved` — das
Begegnungssystem funktioniert unverändert in beiden.

---

## 8. Speichern und Laden

`SaveSystem` schreibt in beiden Formaten denselben Inhalt
(`GameState.to_dict()`), umschaltbar über `SaveSystem.format`:

* `Format.JSON` → `user://slot_0.json`, mit Tabs eingerückt, diff-bar und im
  Texteditor lesbar. **Standard.**
* `Format.TRES` → `user://slot_0.tres` über `ResourceSaver` und die
  `SaveGame`-Resource.

Geladen wird formatübergreifend: `load_game()` nimmt, was da ist. `user://`
liegt unter Linux in `~/.local/share/godot/app_userdata/<Projektname>/`.

```gdscript
SaveSystem.save_game(0)          # speichern
SaveSystem.load_game(0)          # laden
SaveSystem.peek(0)               # Kurzinfo für ein Ladenmenü
SaveSystem.delete_save(0)
```

---

## 9. Tests

`tests/TestSuite.gd` enthält 17 Testgruppen (Datenbank, Typenmatrix,
Statuswerte, EP/Level/Entwicklung, Team-Limit, Inventar, beide Speicherformate,
Schadensformel, Statusprobleme, Zugreihenfolge, kompletter Kampf,
Determinismus, Fangen/Flucht, Begegnungstabellen).

Neuen Test anlegen: Methode `test_xyz()` schreiben und in `run()` mit
`_run("Name", test_xyz)` registrieren. Zusicherungen sind `_check`, `_eq`,
`_approx`. Einen Test isoliert laufen lassen: die anderen `_run(...)`-Zeilen
vorübergehend auskommentieren (es gibt bewusst keinen CLI-Filter).

---

## 10. Grenzen und nächste Schritte

Bewusst **nicht** enthalten (damit das Gerüst schlank bleibt):

* Kein Team-/Box-Menü in der Overworld (nur die HUD-Übersicht) — `GameState`
  hat alle nötigen Funktionen, es fehlt reine UI.
* Keine NPCs/Trainerkämpfe in der Welt. `BattleContext.trainer()` gibt es
  schon; es fehlt der auslösende `Area3D`/Dialog.
* Kein Attacken-Ersetzen-Dialog: ist die Attackenliste voll, wird auf Level-up
  nichts Neues gelernt (`MonsterInstance.learn_move(move, replace_index)` kann
  es, die UI fragt noch nicht).
* Gegner wechseln ihr Monster nicht aus (Spieler kann es).
* Keine Animationen, Sounds, Partikel; ein Monster ist eine Kapsel mit Farbe.
* Kein Shop/Ökonomie-Loop, obwohl Items einen `price` haben.

**Export-Hinweis:** die Dateien unter `data/*.json` werden per `FileAccess`
gelesen. Im Export-Dialog unter *Ressourcen → Filter für nicht-Ressourcen-
Dateien* `data/*.json` eintragen, sonst fehlen sie im fertigen Build.

**Renderer:** eingestellt ist `gl_compatibility` (läuft überall, auch in CI).
Für bessere Optik in Projekteinstellungen → Rendering auf `forward_plus`
umstellen.
