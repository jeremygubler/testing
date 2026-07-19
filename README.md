# ⚔ Triforce Quest — Mario × Zelda × Pokémon

Ein Browser-Spiel, das drei Genre-Klassiker mischt. Alles steckt in einer
einzigen `index.html` (HTML5 Canvas, keine Abhängigkeiten, kein Build).

## Spielen

`index.html` im Browser öffnen — fertig.

## Genre-Mix

| Element | Quelle | Umsetzung |
|---|---|---|
| Top-Down-Overworld, Schwert, Herzen, Truhen | **Zelda** | Rasterbewegung, Schwertangriff in Blickrichtung, Herz-Leiste |
| Münzen, zerschlagbare Ziegelblöcke, Warp-Röhre | **Mario** | Münzen sammeln, Blöcke mit dem Schwert zerschlagen, Röhre teleportiert |
| Zufallsbegegnungen, rundenbasierte Kämpfe, Fangen | **Pokémon** | Hohes Gras löst Kämpfe aus — Kämpfen / Fangen / Fliehen, gefangene Kreaturen bilden dein Team |

## Steuerung

- **← ↑ → ↓** oder **WASD** — Bewegen
- **Leertaste** / **J** / **A** — Schwert schwingen
- **Enter** / **B** — Reden / Bestätigen (Menüs, Dialoge)
- **P** — Pokédex öffnen
- **M** — Musik an/aus
- **Touch:** D-Pad + A/B (Handy)

## Features

- **Welt:** 6 verbundene Räume (Dorf, Wiese, Wald, Höhle, Ruinen, Boss-Arena)
  mit Fade-Übergängen; NPCs mit Dialogen und einer kleinen Story
- **Kampf:** rundenbasiert mit **mehreren Attacken**, **Typen-Vorteilen**
  (🔥→🌿→💧) und **Statuseffekten** (Gift, Brand, Schlaf); XP & Level-Ups;
  Kreatur mitten im Kampf **wechseln**
- **Sammeln:** 7 Kreaturen inkl. 2 **seltener** Arten, **Pokédex** mit
  gesehen/gefangen-Status, „fang sie alle" als Bonusziel
- **Ökonomie:** Münzen → **Shop** (Fangbälle, Tränke, Herz-Container),
  **Heil-Statue** im Dorf, Truhen
- **Bosse:** optionaler **Golem-Wächter** in den Ruinen (Schatz + seltene
  Kreatur) und der finale **Schattenkönig**
- **Politur:** Chiptune-Musik, Sound-Effekte, Partikel, Screen-Shake,
  Animationen, Speichern (localStorage), Titelbildschirm

## Ziel

Wähle deinen Starter, finde die **3 Triforce-Splitter** in Wiese, Wald und
Höhle, öffne damit das Tor und besiege den Schattenkönig. Verlierst du alle
Herzen, ist es Game Over.
