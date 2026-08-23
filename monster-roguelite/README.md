# Aetherbeasts

Ein 2D-Roguelite im Browser: Top-Down-Echtzeitkampf im Stil von *Binding of
Isaac* / *Risk of Rain*, kombiniert mit Monster-Sammeln à la *Pokémon*.
Du steuerst einen Trainer mit **einem** aktiven Begleitmonster, kämpfst dich
durch prozedural erzeugte Räume, fängst geschwächte Gegner und stapelst
Relikte. Stirbst du, bleibt die Meta-Währung — und schaltet für den nächsten
Run neue Monster und Relikte frei.

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

Türen öffnen sich, sobald der Raum leergekämpft ist. Truhen lassen sich erst
danach öffnen. Nach dem Boss erscheint ein Portal zur nächsten Etage.

## Architektur

Die Leitidee: **Spiellogik kennt Phaser nicht.** Alles, was Regeln enthält,
liegt in reinem TypeScript und ist ohne Renderer testbar. Phaser taucht nur in
`scenes/` und `entities/` auf.

```
src/
├── config/GameConfig.ts     Alle Balancing-Konstanten an einem Ort
├── data/                    Reine Inhaltsdaten — hier tunt man, nicht im Code
│   ├── types.ts             6 Elementartypen + Effektivitätsmatrix
│   ├── monsters.ts          14 Arten (10 fangbar, 4 Bosse)
│   └── relics.ts            16 stapelbare Relikte
├── core/
│   ├── Rng.ts               Seedbarer Zufall (mulberry32) — reproduzierbare Etagen
│   ├── StatBlock.ts         Summiert Relikt-Stapel zu einem Wertepaket
│   ├── RunState.ts          Zustand des laufenden Runs (Team, Relikte, Etage)
│   └── EventBus.ts          Typisierte Events: Gameplay → UI, nie umgekehrt
├── meta/MetaSave.ts         Einziges Modul, das localStorage kennt
├── world/
│   ├── FloorGenerator.ts    Raum-Graph per Random Walk, Boss = grösste BFS-Distanz
│   └── RoomLayout.ts        Kachelgitter, Türen, Hindernisse
├── systems/                 Reine Funktionen: Schaden, Fangchance, Relikt-Ziehung
├── entities/                Phaser-Sprites (Player, Companion, Enemy, Projectile, Chest)
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

**Meta-Progression.** Ätherstaub aus Kills, Fängen, geräumten Räumen und
Etagen überlebt den Tod. Im Hub kaufst du dauerhafte Stat-Stufen, neue
Start-Monster und neue Relikte für den Run-Pool. Gefangene Arten landen
dauerhaft im Dex. Beschädigte Spielstände fallen still auf einen frischen
Stand zurück; neue Standardinhalte werden in alte Spielstände nachgezogen.

## Testen

Es gibt keinen Unit-Test-Runner — der Validator ist ein Bot, der das Spiel im
echten Browser spielt (`tools/smoke.mjs`, Playwright + Chromium):
Hub → Run starten → Räume räumen → Türen nehmen → Truhen öffnen → fangen →
Boss → Etage 2. Er meldet Kills, Fänge, Relikt-Stapel, HP-Minima von Trainer
und Monster sowie den geschriebenen `localStorage` und schlägt bei jedem
Konsolenfehler fehl.

Der Bot weicht bewusst seitlich aus statt still zu stehen — gegen einen
regungslosen Bot zu balancieren würde das Spiel für echte Spieler zu leicht
machen. Die HP-Minima im Report sind der eigentliche Balance-Indikator: sie
haben aufgedeckt, dass das Begleitmonster durch vertauschte Overlap-Argumente
überhaupt keinen Schaden nahm.

```bash
npm run dev &
npm run smoke
# Optional: CHROMIUM_PATH, SMOKE_URL, SMOKE_STEPS, SMOKE_BUDGET_MS
```

## Stand & nächste Schritte

Vollständig spielbar: Bewegung, Kampf, Typensystem, prozedurale Etagen mit
Boss und Portal, Fangen, Teamwechsel, 16 stapelbare Relikte, Truhen,
Meta-Shop, Dex, Game-Over mit Statistik.

Naheliegende Erweiterungen: Elite-Gegner und Raum-Modifikatoren, ein
Shop-Raum innerhalb des Runs, Monster-Level statt nur Arten, Sound, und ein
zweites Relikt-Slot-System für aktive Fähigkeiten.
