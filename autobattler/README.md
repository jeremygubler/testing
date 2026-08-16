# Aetherclash — Auto-Battler (Teamfight-Tactics-style, original IP)

A commercially-oriented auto-battler built **platform-agnostically in Godot 4**,
designed so a **licensed Switch port** and **eShop monetisation** can be added
later without touching the game logic. All content is original IP — no Riot / TFT
assets, names, or designs.

> Working title **Aetherclash**, world of floating aether-islands. Rename freely
> in `project.godot` and `data_files/`.

---

## 1. Why Godot 4 (not Unity)

For a title that will eventually ship on the Switch eShop through a licensed
porting partner, Godot 4 wins on the three axes that matter here:

| Axis | Godot 4 | Unity |
|---|---|---|
| **Switch port** | No first-party console export; done via a **licensed porting partner** (W4 Games / Lone Wolf, etc.). Our strict platform-service abstraction is exactly what such a partner plugs into. | First-party console support, but requires Nintendo dev status + NDA regardless. |
| **Monetisation / cost** | MIT license — **no royalties, no runtime fee**. Revenue stays with the studio. | 2023 "Runtime Fee" episode created real cost/trust risk for commercial titles. |
| **Determinism** | We own a hand-written fixed-tick sim + seeded RNG; no hidden engine state to fight. | Achievable, but more engine ballast to control. |

The only real Godot drawback — no DIY console export — is already covered by the
porting-partner route, which is *precisely why* every platform-specific concern
(save, store/IAP, input) sits behind an interface here.

Prototype language is **GDScript** for iteration speed; the deterministic core is
kept presentation-free so hot paths can be rewritten in C# later if a port needs
it.

---

## 2. Architecture

Three strictly separated layers:

```
(a) Simulation / game logic   src/sim/       deterministic, headless, testable
(b) Presentation              src/presentation/  reads sim state, draws, animates
(c) Platform services         src/platform/  Save / Store / Entitlement / Input
                                             behind interfaces + local mocks
```

**The rule:** `src/sim/` never imports from `presentation/` or a concrete
platform API, and never uses non-deterministic randomness (only
`DeterministicRng`). Presentation and platform code depend inward on the sim, not
the other way around.

### Determinism

`CombatEngine` runs a fixed tickrate (30/s) and draws all randomness from a
seedable `DeterministicRng` (xorshift128+). Same seed + same inputs ⇒ identical
fight, every time and on every platform. This is what makes balance regression
tests possible today and server-side ranked validation possible later.

### Folder structure

```
autobattler/
├── project.godot
├── data_files/            # EDITABLE balance data (JSON) — source of truth
│   ├── heroes.json        #   40 heroes, 8 per cost tier
│   ├── perks.json         #   20 traits (10 origin + 10 class), 2/4/6 breakpoints
│   ├── skins.json         #   cosmetic catalogue
│   └── game_config.json   #   economy / shop odds / xp curve / combat constants
├── src/
│   ├── sim/               # (a) simulation
│   │   ├── rng/           #   DeterministicRng
│   │   ├── board/         #   HexGrid (7x4 per player, 7x8 combat field)
│   │   ├── economy/       #   Economy, Shop, HeroPool
│   │   ├── combat/        #   CombatUnit, TraitSystem, CombatEngine
│   │   ├── GameUnit.gd    #   owned unit (bench/board, star level)
│   │   ├── OpponentFactory.gd
│   │   └── GameState.gd   #   round loop, roster, buy/sell/place, combine
│   ├── data/              # HeroDef / PerkDef / SkinDef + Database autoload
│   ├── presentation/      # (b) Main.tscn + Main.gd (board, shop, playback)
│   └── platform/          # (c) interfaces + local/ mock implementations
├── tools/
│   ├── gen_data.py        # regenerates the JSON baseline (content is hand-editable after)
│   └── sandbox.gd         # headless combat + cosmetics sandbox
└── tests/TestRunner.gd    # headless deterministic-sim tests
```

---

## 3. Core gameplay

Round loop: **shop / buy → position on hex board → auto-combat → result → next
round**.

- **Economy** (all in `game_config.json`): base income 5, **interest 10 % of
  banked gold capped at 5 (max at 50 gold)**, win/loss streak bonuses, reroll 2
  gold, buy XP 4 gold.
- **Level** drives board size (units = level) and shop odds per cost tier.
- **Player HP** starts at 100; losing a round costs HP scaled by the enemy's
  surviving units; 0 HP = eliminated.
- **Heroes:** 40 across 5 cost tiers with TFT-style pool sizes (more low-cost
  copies). Star-up: 3×1★ → 2★, 3×2★ → 3★. Stats scale **×1.8 per star** (HP &
  DMG). Each hero has 1 ultimate that fires at full mana.
- **Traits (20):** 10 origins + 10 classes, breakpoints at **2 / 4 / 6** (clamped
  per trait to how many heroes can supply it). Each hero has 1 origin + 1 class.
- **Items:** 8 basic components combine into 14 completed items (`items.json`).
  Items grant flat combat-stat bundles (HP, AD, ability power, attack speed,
  armor, MR, mana, crit, omnivamp), up to 3 per unit. Click a tray item then a
  unit to equip; a second component that matches a recipe combines in place.
  Selling a unit returns its items to the inventory.

### Design decisions (locked with the team)

| Decision | Value |
|---|---|
| Board layout | **7×4 hex** per player (TFT-standard) |
| Interest | **10 %, capped at 5** (max at 50 gold) |
| Star scaling | **×1.8 per star** (HP & DMG) |
| Skin rarity tiers | **Common / Rare / Epic / Legendary** |

---

## 4. Build & run

Requires **Godot 4.3+** (standard build; no C# needed).

```bash
# Open the project in the editor
godot --path autobattler -e

# Or run directly
godot --path autobattler
```

### Controls (prototype)

- **Click a shop slot** to buy (auto-combines to higher stars).
- **Click a unit, then a board hex** to place it; **click a bench slot** to move
  a unit back to the bench.
- **Right-click** a unit to sell.
- **D** reroll (2g) · **F** buy XP (4g) · **Space** fight / next round.
- Debug: **F1** +10 gold · **F2** add a random unit · **F3** +10 HP.

Input flows through `IInputService` (`PlatformServices.input`), so remapping to a
controller/touch later is a platform-layer change only.

---

## 5. Testing & sandbox

Headless, no external addons:

```bash
# Deterministic simulation tests (exit code 0 = all pass; CI-friendly)
godot --headless --path autobattler -s res://tests/TestRunner.gd

# Combat + cosmetics sandbox (prints a reproducible fight + store demo)
godot --headless --path autobattler -s res://tools/sandbox.gd
```

The tests cover RNG reproducibility, economy math (interest cap, streaks,
leveling), star scaling, pool/combine rules, trait activation, and — critically —
that identical seeds produce identical combat outcomes.

---

## 6. Editing content (balancing)

Everything is data-driven in `data_files/*.json`:

- Tweak a hero's stats/ability → `heroes.json`.
- Change trait effects/breakpoints → `perks.json`.
- Retune economy, shop odds, xp curve, combat constants → `game_config.json`.
- Add cosmetics → `skins.json`.

`GameDatabase` (autoload) loads these at startup; call `GameDatabase.reload()` to
hot-reload. `tools/gen_data.py` can regenerate the *baseline* if you want to start
over, but the JSON is meant to be hand-edited directly.

---

## 7. Monetisation (cosmetic-only, no pay-to-win)

Skins are purely visual. The purchase/ownership flow is fully abstracted:

- `IStoreService` — purchasing (products, prices, purchase/restore).
- `IEntitlementService` — ownership + applying skins (`owns`, `grant`,
  `apply_skin`).
- `SkinDef` — skin data model (id, hero_id, rarity, price_tier, assets).

During development, `MockStoreService` + `LocalEntitlementService` fulfil
purchases instantly against a local wallet and persist ownership via
`LocalSaveService` — see `tools/sandbox.gd` for a working buy→own→apply demo.

---

## 8. Hooking up the Switch / eShop layer later

Everything platform-specific is created in **one place**:
`src/platform/PlatformServices.gd → _resolve_platform()`.

To bring up the console build, the porting partner:

1. Adds `src/platform/switch/` with implementations of the four interfaces:
   - `SwitchSaveService : ISaveService` → Nintendo save-data API.
   - `SwitchStoreService : IStoreService` → **real eShop IAP** (replaces the mock).
   - `SwitchEntitlementService : IEntitlementService` → account-validated ownership.
   - `SwitchInputService : IInputService` → Joy-Con / Pro Controller / touch.
2. Flips the selection in `_resolve_platform()` (already stubbed behind an
   `OS.has_feature("switch")` guard).

No changes to `src/sim/` or `src/presentation/` are required — they only ever talk
to the interfaces. Because the combat sim is deterministic and seed-driven, the
same balance tests validate the ported build, and the architecture is ready for a
future networked/ranked mode.

**No proprietary Nintendo SDK APIs are referenced anywhere in this repo.** The
Switch layer is added by the licensed partner, outside this codebase.

---

## 9. Legal / assets

Only original or clearly license-free assets. All hero names, lore, traits, and
world flavour are original IP created for this project. No Riot/TFT material.
Placeholder art is procedural (drawn in code); replace with your own commissioned
assets before release.
