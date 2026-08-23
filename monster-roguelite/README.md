# Aetherbeasts

Ein 2D-Roguelite im Browser: Top-Down-Echtzeitkampf im Stil von *Binding of
Isaac* / *Risk of Rain*, kombiniert mit Monster-Sammeln à la *Pokémon*.
Du steuerst einen Trainer mit **einem** aktiven Begleitmonster, kämpfst dich
durch prozedural erzeugte Räume, fängst geschwächte Gegner und stapelst
Relikte. Deine Monster steigen im Run Stufen auf, Elite-Gegner geben den
Kampfräumen Spitzen, und ein Laden pro Etage stellt dich vor die Wahl: jetzt
Stärke kaufen oder für das Basislager sparen. Stirbst du, bleibt die
Meta-Währung — und schaltet für den nächsten Run neue Monster und Relikte frei.

**Stack:** TypeScript · Phaser 3 · Vite · `localStorage` (kein Backend)

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # Typprüfung + Produktionsbuild nach dist/
npm run typecheck
npm run smoke      # automatisierter Durchspiel-Test (Dev-Server muss laufen)
```

## Steuerung

| Eingabe | Wirkung |
| --- | --- |
| `W` `A` `S` `D` | Trainer bewegen |
| Maus | zielen, gedrückt halten = Dauerfeuer |
| `E` | geschwächten Gegner fangen (unter 30 % HP, in Reichweite) |
| `Q` | nächstes Monster |
| `1`–`4` | Monster direkt wählen |
| `E` (im Laden) | Angebot kaufen, auf dem du stehst |
| `M` | Ton an/aus (wird gemerkt) |

Türen öffnen sich, sobald der Raum leergekämpft ist. Truhen lassen sich erst
danach öffnen. Der Laden-Raum liegt spät auf der Etage — meist kurz vor dem
Boss, damit du dort schon etwas verdient hast. Nach dem Boss erscheint ein
Portal zur nächsten Etage.

## Architektur

Die Leitidee: **Spiellogik kennt Phaser nicht.** Alles, was Regeln enthält,
liegt in reinem TypeScript und ist ohne Renderer testbar. Phaser taucht nur in
`scenes/` und `entities/` auf.

```
src/
├── config/GameConfig.ts     Alle Balancing-Konstanten an einem Ort
├── data/                    Reine Inhaltsdaten — hier tunt man, nicht im Code
│   ├── types.ts             6 Elementartypen + Effektivitätsmatrix
│   ├── monsters.ts          14 Arten (10 fangbar, 4 Bosse), je mit minFloor
│   └── relics.ts            16 stapelbare Relikte
├── core/
│   ├── Rng.ts               Seedbarer Zufall (mulberry32) — reproduzierbare Etagen
│   ├── StatBlock.ts         Summiert Relikt-Stapel zu einem Wertepaket
│   ├── RunState.ts          Run-Zustand: Team mit Stufen/XP, Relikte, Etage
│   └── EventBus.ts          Typisierte Events: Gameplay → UI, nie umgekehrt
├── audio/Sfx.ts             Prozedurale Klänge über WebAudio, keine Dateien
├── meta/MetaSave.ts         Einziges Modul, das localStorage kennt
├── world/
│   ├── FloorGenerator.ts    Raum-Graph per Random Walk; Boss = grösste BFS-Distanz,
│   │                        Laden = entfernteste freie Sackgasse, Elites gestreut
│   └── RoomLayout.ts        Kachelgitter, Türen, Hindernisse
├── systems/                 Reine Funktionen: Schaden, Fangchance, Relikt-Ziehung
├── entities/                Phaser-Sprites (Player, Companion, Enemy, Projectile,
│                            Chest, ShopStand)
├── ui/Widgets.ts            Canvas-Buttons, kein DOM
└── scenes/                  Boot · Hub · Game · Hud · GameOver
```

**Abhängigkeitsrichtung:** `scenes` → `entities` → `systems`/`core`/`data`.
Nie zurück. `GameScene` ist die einzige Stelle mit Physik-Kollisionen; sie
delegiert jede Regelentscheidung nach innen.

### Warum die Trennung trägt

* `RunState` ist die einzige Wahrheit für den laufenden Run. HUD und
  Game-Over-Screen lesen dieselbe Quelle — kein doppelt geführter Zustand.
* Relikte sind **rein additiv**: `StatBlock.aggregate()` multipliziert jeden
  Effektwert mit der Stapelzahl. Es gibt keinen Sonderfall für "zweites
  Exemplar", deshalb ist Stapeln vorhersagbar und neue Relikte kosten meist
  null Code — nur einen Eintrag in `relics.ts`.
* Ein neues Monster ist ein Objekt in `monsters.ts`. Ein neues Angriffsmuster
  braucht zusätzlich einen `case` in `GameScene.firePattern` und einen Faktor
  in `PATTERN_DAMAGE`.

## Systeme

**Typen-Effektivität.** Feuer → Pflanze → Wasser → Feuer, dazu Elektro und
Gestein als Querbeziehungen; Normal ist überall neutral. Der Multiplikator
(0,5× / 1× / 2×) geht in jede Schadensberechnung ein — auch in die des
Trainers, der im Typ seines aktiven Monsters schiesst.

**Schadensnormalisierung.** Angriffsmuster mit mehreren Projektilen
(`spread3`, `burst3`) würden mit vollem Schaden pro Projektil die dreifache
DPS eines Einzelschusses machen. `PATTERN_DAMAGE` in `systems/CombatSystem.ts`
skaliert den Schaden pro Geschoss, damit die Angriffswerte in `monsters.ts`
untereinander vergleichbar bleiben.

**Fangen.** Nur unter 30 % Rest-HP und in 150 px Reichweite. Die Chance läuft
linear von der Fangschwelle bis 0 HP hoch, multipliziert mit der `catchRate`
der Art plus Relikt-/Meta-Boni. Damit das Fenster nutzbar bleibt, verschont
das Begleitmonster fangbare Ziele, solange es andere Gegner gibt.

**Stufen.** Jedes Teammitglied hat Stufe und XP. Kills speisen das aktive
Monster voll, die Bank zur Hälfte — ein Wechsel lohnt sich, ohne die Reserve
abzuhängen. Gefangene Monster starten auf Höhe der Etage; ohne das wäre ein
Fang ab Etage 2 wertlos, weil ein frisches Monster mit Grundwerten gegen ein
hochgestapeltes Team nicht ankommt. Die Kurve ist flach (+11 % pro Stufe):
Stufen sollen ein Nachziehen erlauben, nicht die Relikte als Hauptquelle für
Stärke ablösen.

**Elite-Gegner.** Verstärkte Varianten normaler Arten (doppelte HP, +35 %
Schaden, goldener Ring), gestreut ab Etage 2 mit steigender Quote (gemessen:
6 % auf Etage 2 bis 24 % auf Etage 8). Etage 1 bleibt bewusst frei — dort hat
man ein Startmonster auf Stufe 1 und kein Relikt. Sie geben das Fünffache an
Ätherstaub und mit 35 % ein zusätzliches Relikt.

**Laden im Run.** Ein Raum pro Etage mit zwei Relikten und einem Heiltrank,
bezahlt mit derselben Währung, die am Ende in den Meta-Fortschritt fliesst.
Das ist die eigentliche Entscheidung des Systems: jetzt Stärke kaufen und
weiter kommen, oder sparen und im Basislager dauerhaft freischalten. Gekauft
wird per `E` auf dem Podest, nicht durchs Drüberlaufen — ein versehentlicher
Kauf wäre nicht rückgängig zu machen.

**Sound.** `audio/Sfx.ts` erzeugt jeden Effekt zur Laufzeit als kurze
Oszillator-Rampe mit Hüllkurve; das Projekt bleibt damit asset-frei. Der
AudioContext wird von Phaser übernommen statt ein zweiter geöffnet.

**Meta-Progression.** Ätherstaub aus Kills, Fängen, geräumten Räumen und
Etagen überlebt den Tod. Im Hub kaufst du dauerhafte Stat-Stufen, neue
Start-Monster und neue Relikte für den Run-Pool. Gefangene Arten landen
dauerhaft im Dex. Beschädigte Spielstände fallen still auf einen frischen
Stand zurück; neue Standardinhalte werden in alte Spielstände nachgezogen.

## Testen

Es gibt keinen Unit-Test-Runner — der Validator ist ein Bot, der das Spiel im
echten Browser spielt (`tools/smoke.mjs`, Playwright + Chromium). Er besteht
aus zwei Teilen:

**1. Generator-Check.** Erzeugt 320 Etagen (8 Etagen × 40 Seeds) und misst die
Struktur nach: Verteilung der Raumtypen, Elite-Quote pro Etage,
Start-Distanz von Laden und Boss, und ob jeder Raum vom Start aus erreichbar
ist. Das läuft unabhängig davon, wie weit der Bot im Spiel kommt — auf
Spielglück zu warten wäre kein Nachweis.

**2. Spiel-Durchlauf.** Hub → Run starten → Räume räumen → Türen nehmen →
Truhen öffnen → fangen → im Laden kaufen → Boss → nächste Etage. Meldet Kills,
Fänge, Relikt-Stapel, erreichte Stufen, HP-Minima von Trainer und Monster, den
Todesort und den geschriebenen `localStorage`. Jeder Konsolenfehler lässt den
Lauf fehlschlagen.

Der Bot weicht bewusst seitlich aus statt still zu stehen und fängt erst, wenn
nur noch ein Gegner übrig ist — gegen einen Strohmann zu balancieren würde das
Spiel für echte Spieler verzerren. Die HP-Minima im Report sind der eigentliche
Balance-Indikator.

**Grenze der Messung:** headless rendert ohne GPU, Phasers Spielzeit läuft dort
etwa dreimal langsamer als die Wanduhr. Der Bot hat damit weniger
Entscheidungen pro Spielsekunde als ein Mensch — er ist ein bewusst
pessimistischer Massstab, kein Referenzspieler.

```bash
npm run dev &
npm run smoke
# Optional: CHROMIUM_PATH, SMOKE_URL, SMOKE_STEPS, SMOKE_BUDGET_MS, SMOKE_FLOOR
# SMOKE_FLOOR=5 springt direkt auf Etage 5 — Elites und Laden ohne langes Spielen
```

## Stand & nächste Schritte

Vollständig spielbar: Bewegung, Kampf, Typensystem, prozedurale Etagen mit
Boss und Portal, Fangen, Monster-Stufen mit XP, Teamwechsel, 16 stapelbare
Relikte, Truhen, Elite-Gegner, Laden-Raum, prozeduraler Sound, Meta-Shop,
Dex, Game-Over mit Statistik.

Naheliegende Erweiterungen: Raum-Modifikatoren (Nebel, Dornenboden), aktive
Fähigkeiten auf einem zweiten Slot, Monster-Entwicklungen im Dex-Stil,
Ausdauer/Ressource für den Trainer, und mehr Boss-Muster statt nur
Artwechsel.
