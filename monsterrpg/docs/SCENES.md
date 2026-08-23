# Szenen-Referenz — Knoten-Hierarchien

Alle Szenen liegen fertig im Projekt. Diese Datei beschreibt, **welcher Knoten
wo hängt und warum** — als Nachschlagewerk beim Erweitern und als Bauanleitung,
falls du eine Szene von Hand nachbauen oder anders aufteilen willst.

Skript-Zuordnung steht jeweils in `[Klammern]`. Bei Instanzen (`⇒`) wird eine
andere Szene eingebettet (**Szene instanziieren**, Kettensymbol im Editor).

---

## 1. `scenes/Main.tscn` — Titelbildschirm (Hauptszene)

```
Main                    Control            [scenes/Main.gd]   Vollbild-Anker
└── Center              CenterContainer                       Vollbild-Anker
    └── Box             VBoxContainer                         min. Breite 420
        ├── TitleLabel      Label          Schriftgröße 40
        ├── StatusLabel     Label          zeigt Slot-0-Infos / Datenbankstand
        ├── NewGameButton   Button         "Neues Spiel"
        ├── ContinueButton  Button         deaktiviert ohne Speicherstand
        ├── OverworldButton Button         nur Overworld testen
        ├── BattleButton    Button         nur Kampf testen
        └── QuitButton      Button
```

`Main.gd` sucht die Knöpfe über feste Pfade (`Center/Box/NewGameButton`, …).
Umbenennen ⇒ die Konstanten oben im Skript anpassen.

---

## 2. `scenes/overworld/Player.tscn` — Spieler + Kamera

```
Player                  CharacterBody3D    [scripts/overworld/PlayerController.gd]
│                                          collision_layer/mask = 1
├── Collision           CollisionShape3D   CapsuleShape3D r 0.42 / h 1.7, y = 0.85
├── Body                Node3D             dreht sich in Laufrichtung (nur Optik!)
│   ├── Mesh            MeshInstance3D     CapsuleMesh + blaues Material
│   ├── Snout           MeshInstance3D     BoxMesh, zeigt die Blickrichtung
│   └── InteractRay     RayCast3D          target_position = (0, 0, -1.8)
└── CameraPivot         Node3D             [scripts/overworld/CameraRig.gd]  y = 1.4
    └── SpringArm3D                        spring_length 6, um -20° gekippt
        └── Camera3D                       fov 70
```

**Warum `Body` als Extra-Knoten?** Der `CharacterBody3D` bleibt unrotiert.
Würde er sich drehen, würde die Kamera (als Kind) mitdrehen und die Steuerung
würde sich aufschaukeln. Also dreht sich nur `Body`.

**Warum `CameraPivot` als Kind?** So folgt die Kamera dem Spieler ohne
Nachführ-Code. `CameraRig` schließt den Spieler-Collider aus dem `SpringArm3D`
aus, damit die Kamera nicht am eigenen Körper hängen bleibt.

Wichtige Inspector-Felder (`PlayerController`):

| Gruppe | Feld | Bedeutung |
|---|---|---|
| Bewegung | `movement_mode` | `FREE` (frei) oder `GRID` (Raster) |
| Bewegung | `walk_speed`, `sprint_multiplier`, `acceleration` | Tempo |
| Bewegung | `jump_velocity`, `gravity_multiplier` | nur `FREE` |
| Raster | `grid_size`, `grid_step_time` | Zellgröße / Dauer pro Schritt |
| Knoten | `body_path`, `camera_pivot_path`, `interact_ray_path` | umbenannte Knoten nachziehen |

Signale zum Andocken: `moved(distance)`, `stepped(cell)`, `interacted(collider)`.

---

## 3. `scenes/overworld/EncounterZone.tscn` — Begegnungsbereich

```
EncounterZone           Area3D             [scripts/overworld/EncounterZone.gd]
│                                          collision_layer 0, collision_mask 1
├── Shape               CollisionShape3D   BoxShape3D 20 × 4 × 20, y = 2
└── Marker              MeshInstance3D     flache, grün-transparente Box (nur Sichthilfe)
```

`collision_layer = 0` ist Absicht: die Zone soll nur *erkennen*, nicht selbst
erkannt werden. `collision_mask = 1` passt zum Spieler auf Layer 1.

Inspector: `zone_name`, `table` (eine `EncounterTable`-Resource), `enabled`,
`start_battle_on_encounter` sowie drei Überschreibungen
(`distance_per_check_override`, `chance_override`, `cooldown_override`) — bei 0
gilt der Wert aus der Tabelle.

**Wie es auslöst:** Betritt der Spieler die Zone, verbindet sich die Zone mit
seinem `moved`-Signal und summiert die Strecke. Pro `distance_per_check` Meter
wird einmal mit `encounter_chance` gewürfelt. Stehen bleiben löst nichts aus.
Nach einer Begegnung greift `cooldown_seconds`.

**Isoliert testen:** `start_battle_on_encounter` ausschalten und
`encounter_triggered(monster, zone)` beobachten — dann passiert außer dem Signal
nichts. `force_encounter()` erzwingt eine Begegnung per Skript.

---

## 4. `scenes/overworld/Overworld.tscn` — Spielwelt

```
Overworld               Node3D             [scripts/overworld/Overworld.gd]
├── WorldEnvironment    WorldEnvironment   Himmelsfarbe + Umgebungslicht
├── Sun                 DirectionalLight3D Schatten an
├── Ground              StaticBody3D
│   ├── Mesh            MeshInstance3D     BoxMesh 80 × 1 × 80, y = -0.5
│   └── Collision       CollisionShape3D   BoxShape3D, gleiche Maße
├── Obstacles           Node3D             Testhindernisse (Rastermodus!)
│   ├── Block1          StaticBody3D → Mesh + Collision   (4, 1, -4)
│   ├── Block2          StaticBody3D → Mesh + Collision   (-6, 1, 2)
│   └── Block3          StaticBody3D → Mesh + Collision   (10, 1, 8)
├── SpawnPoint          Marker3D           Startposition ohne Speicherstand
├── Zones               Node3D
│   ├── MeadowZone   ⇒ EncounterZone.tscn  (-16, 0, -12), Tabelle "meadow"
│   └── RidgeZone    ⇒ EncounterZone.tscn  (18, 0, 14),  Tabelle "cinder_ridge"
├── Player           ⇒ Player.tscn
└── OverworldHUD     ⇒ ui/OverworldHUD.tscn
```

`Overworld.gd` erwartet die Knotennamen `Player`, `OverworldHUD` und
`SpawnPoint` (im Inspector als NodePath änderbar). Es stellt die Position aus
`GameState` wieder her, schreibt sie im Viertelsekunden-Takt zurück (für
Speichern und Kampfstart), verbindet alle Zonen und behandelt F1/F5/F9.

**Neue Zone einfügen:** `Zones` anwählen → **Szene instanziieren** →
`EncounterZone.tscn` → positionieren → `zone_name` + `table` setzen. Fertig, das
Verbinden macht `Overworld.gd` automatisch beim Start.

---

## 5. `scenes/battle/MonsterView.tscn` — Platzhalter-Monster

```
MonsterView             Node3D             [scripts/battle/MonsterView.gd]
└── Body                Node3D             wird skaliert / gekippt / eingefärbt
    ├── Torso           MeshInstance3D     CapsuleMesh r 0.5 / h 1.5
    └── Snout           MeshInstance3D     BoxMesh (Blickrichtung)
```

`show_monster(instance)` färbt alle Meshes mit `placeholder_color` der Art und
skaliert `Body` mit `placeholder_scale`. `play_faint()` kippt das Monster zur
Seite. Leerlauf-Wippen über `bob_amplitude` / `bob_speed`.

**Echte Modelle einbauen:** `Torso`/`Snout` durch dein Modell ersetzen und
`show_monster()` anpassen — der Kampfcode kennt diese Klasse nicht, `Battle.gd`
hängt sie nur an die Signale.

---

## 6. `scenes/battle/Battle.tscn` — Kampfszene

```
Battle                  Node3D             [scripts/battle/Battle.gd]
├── BattleManager        Node               [scripts/battle/BattleManager.gd]
├── Stage                Node3D
│   ├── WorldEnvironment WorldEnvironment
│   ├── Sun              DirectionalLight3D
│   ├── Camera3D                            (0, 3.6, 8.6), um -15° gekippt
│   ├── Ground           MeshInstance3D      BoxMesh 26 × 0.5 × 18
│   ├── PlayerSlot       Node3D              (-3.2, 0, 2.2)
│   │   ├── Pad          MeshInstance3D      CylinderMesh (Standfläche)
│   │   └── MonsterView ⇒ MonsterView.tscn
│   └── EnemySlot        Node3D              (3.6, 0, -2.6), um 180° gedreht
│       ├── Pad          MeshInstance3D
│       └── MonsterView ⇒ MonsterView.tscn
└── BattleUI          ⇒ ui/BattleUI.tscn
```

Der `BattleManager` ist ein **eigener Knoten ohne Kinder** — er enthält reine
Logik. Das ist der Grund, warum Tests ihn per `BattleManager.new()` ohne Szene
benutzen können.

`Battle.gd` erwartet die Pfade `BattleManager`, `BattleUI`,
`Stage/PlayerSlot/MonsterView`, `Stage/EnemySlot/MonsterView` (alle im
Inspector änderbar) und die Gruppe **Debug-Direktstart** für F6-Tests.

---

## 7. `ui/BattleUI.tscn` — Kampf-Oberfläche

```
BattleUI                CanvasLayer        [ui/BattleUI.gd]   layer 2
└── Root                Control            Vollbild, mouse_filter = Ignore
    ├── EnemyPanel      PanelContainer     oben rechts
    │   └── Box         VBoxContainer
    │       ├── NameLabel  Label
    │       ├── HPBar      ProgressBar     ohne Prozentanzeige
    │       └── InfoLabel  Label           KP, Typen, Status
    ├── PlayerPanel     PanelContainer     unten links über dem Log
    │   └── Box         VBoxContainer      NameLabel / HPBar / InfoLabel
    ├── LogPanel        PanelContainer     unten, volle Breite bis zum Menü
    │   └── Margin      MarginContainer
    │       └── LogLabel   RichTextLabel   Kampftext
    ├── ActionPanel     PanelContainer     unten rechts (versteckt)
    │   └── Grid        GridContainer      2 Spalten: Angriff/Wechsel/Item/Flucht
    ├── SubMenu         PanelContainer     unten rechts, breiter (versteckt)
    │   └── Box         VBoxContainer
    │       ├── TitleLabel Label
    │       ├── List       VBoxContainer   Knöpfe werden hier erzeugt
    │       └── BackButton Button
    └── ResultPanel     PanelContainer     zentriert (versteckt)
        └── Box         VBoxContainer
            ├── ResultLabel     Label
            └── ContinueButton  Button
```

**Alle Knöpfe außer `BackButton`/`ContinueButton` werden zur Laufzeit erzeugt** —
Attacken, Team- und Item-Listen sind ja dynamisch. `BattleUI.gd` bindet die
Knoten über die `P_*`-Konstanten oben im Skript; fehlt einer, meldet es das beim
Start per `push_error` statt still zu versagen. Umbauen heißt also: Szene ändern
**und** Konstante anpassen.

Ablauf in der UI: `attach(manager)` verbindet alle Signale → Log-Zeilen laufen
in einen Puffer → ist der Puffer leer, erscheint das passende Menü
(Aktionsmenü, Zwangswechsel oder Ergebnis).

---

## 8. `ui/OverworldHUD.tscn` — Overworld-HUD

```
OverworldHUD            CanvasLayer        [ui/OverworldHUD.gd]   layer 1
└── Root                Control            Vollbild, mouse_filter = Ignore
    ├── TopLeft         PanelContainer     oben links
    │   └── PartyLabel  Label              Geld, Bälle, Team mit KP
    ├── TopRight        PanelContainer     oben rechts
    │   └── ZoneLabel   Label              aktueller Zonenname
    └── Bottom          VBoxContainer      unten
        ├── ToastLabel  Label              Kurzmeldungen (2.5 s)
        └── HintLabel   Label              Tastenhilfe
```

Öffentliche Methoden für andere Szenen: `show_toast(text)` und
`set_zone_name(name)`. `Overworld.gd` ruft sie über `has_method()` auf — fehlt
das HUD, läuft die Overworld trotzdem.

---

## Wiederkehrende Muster

1. **Knotenpfade als Konstante oder `@export NodePath`, immer mit
   `get_node_or_null()`.** Nichts stürzt ab, wenn ein Knoten fehlt; es gibt eine
   klare Meldung.
2. **Signale nach oben, Aufrufe nach unten.** Logik-Knoten (`BattleManager`,
   `EncounterZone`, `PlayerController`) senden Signale; UI und Wurzel-Skripte
   hören zu und rufen zurück. Kein Logik-Knoten kennt eine UI.
3. **Jede Szene ist alleine startbar.** Alles, was sonst von außen käme,
   besorgen sich die Wurzel-Skripte notfalls selbst (`GameState` erzeugt ein
   Standardteam, `Battle` einen Debug-Kampf).
4. **Platzhalter sind Primitive** (`CapsuleMesh`, `BoxMesh`, `CylinderMesh`) mit
   `StandardMaterial3D`. Farbe und Größe kommen aus der Art, nicht aus der Szene
   — echte Modelle ersetzen später nur `MonsterView`.
