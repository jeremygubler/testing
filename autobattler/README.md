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
seedable `DeterministicRng`. Same seed + same inputs ⇒ identical fight, every time
and on every platform. This is what makes balance regression tests possible today
and server-side ranked validation possible later.

**One trap is worth knowing about before touching `DeterministicRng`:** `randf`,
`randf_range` and `randi_range` are also `@GlobalScope` function names. An
unqualified call to one of those from *inside* the class binds to the global
function — Godot's entropy-seeded generator — rather than to the method next to
it. The call then returns a process-random value and never advances `_state`,
which is exactly how `chance()`, `randf_range()` and `weighted_index()` silently
made every crit/dodge roll, shop roll and opponent board non-reproducible while
the integer-only tests stayed green. The canonical float draw therefore lives
under a name `@GlobalScope` does not define (`next_float()`), and all internal
callers use it. The same hazard is why reseeding is called `reseed()`, not
`seed()`.

Because no in-process test can see this (one process's global stream looks stable
enough to pass a same-seed check), CI also runs the engagement harness twice in
separate processes and diffs the output.

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

- **Movement:** units path to the nearest hex from which they can attack their
  target via a breadth-first search over free hexes (`CombatEngine._path_step`),
  so they walk *around* allies and chokepoints. The search expands neighbours in
  `HexGrid.neighbors()`'s fixed order, so it stays deterministic. When no attack
  position is reachable at all, the unit still closes as far as the board allows
  rather than freezing.

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
- **Round rewards:** winning a round grants a small gold bonus plus scheduled
  item drops (`rewards` in `game_config.json`) — the in-game source of item
  components. Component choices are drawn from the deterministic RNG stream.
- **PvE creep rounds (`creeps.json`):** on scheduled rounds (`rounds.creep_rounds`)
  you fight neutral creeps (own IP — Aether Wisp, Cinder Hound, Stone Golem, Rift
  Spawn, and a boss Void Maw from `boss_round_threshold`) instead of a PvP-style
  board. Beating a creep round always drops an item component. Creeps are cost-0
  and never appear in the shop.
- **Augments (`augments.json`):** at set rounds you're offered 3 augments and
  pick 1 for a persistent bonus. *Economy* augments boost income / interest cap /
  gold / XP; *combat* augments apply a global stat bundle (HP, AD, AS, armor, MR,
  omnivamp, start-shield) to all your units each fight, passed into the
  `CombatEngine` alongside trait effects. Offers are deterministic per seed.
- **Deterministic replays / ranked-ready:** `Replay.capture()` records a fight's
  inputs (seed + both teams + player mods + a **content hash**) as a JSON-safe
  record; `Replay.run()` reproduces the exact fight anywhere, and
  `Replay.verify(record, signature)` re-runs it to confirm a claimed outcome.
  That's the anti-cheat primitive for a future ranked mode — a client submits
  {record, result signature}, a server re-runs and checks. `GameState` captures
  `last_replay`/`last_match_signature` each fight.
  A fight's result is a function of the balance data as well as the seed, so the
  record carries `GameDatabase.content_hash` (a digest of the combat-relevant
  `data_files/`, cosmetics excluded). `Replay.verify_detailed()` reports
  `content_mismatch` separately from `signature_mismatch`, so a record predating a
  balance patch reads as "cannot judge here" rather than as a forged result. The
  hash is a compatibility tag, not a security boundary — a real backend verifies
  against its own trusted content.
- **Save/resume:** `GameState.serialize()`/`load_from()` snapshot the whole run
  (roster, items, augments, economy, pool, RNG state, and the **round phase**).
  The presentation layer persists it through the `ISaveService` interface and
  auto-saves each phase, so a run resumes exactly on next launch — and the
  identical logic maps onto a console save backend later. (Hover the inspector
  shows unit/item details; F6 clears the save.)
  Restoring the phase is a correctness matter, not cosmetics: a run saved after a
  won round used to reload into the *shop* phase of that same round, so relaunching
  re-fought it and paid its rewards again. Rounds therefore also pay out at most
  once (`_rewards_granted_round`, serialized), which additionally covers force-quitting
  mid-combat. A finished run (`GAME_OVER`) is discarded on launch instead of
  resuming at 0 HP. Saves are versioned (`SAVE_VERSION`); v1 saves lack a phase and
  keep the original shop-phase behaviour.

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

# Balance harness (per-hero DPS vs a training dummy, sorted + per-cost averages)
godot --headless --path autobattler -s res://tools/balance.gd

# Engagement harness (do fights actually resolve? timeout rate + travel time)
godot --headless --path autobattler -s res://tools/engagement.gd
```

Where the balance harness asks *how hard does a hero hit*, the engagement harness
asks *do fights converge*: it runs 360 fixed-seed fights and reports how many are
still alive at the 30s cap (and therefore decided on remaining HP rather than
fought out), the mean fight length, and the unit-ticks spent closing on a target.
That last number is the movement cost of a fight — it is what shows whether a
pathfinding change is worth anything. Its output is byte-identical between runs,
which is what makes it usable as the cross-process determinism guard in CI.

The tests cover RNG reproducibility, economy math (interest cap, streaks,
leveling), star scaling, pool/combine rules (including that the shared pool never
grows past its configured stock), trait activation, save/load round-trips
(including the round phase and the once-only round rewards), sell refunds, board
capacity, shop rolls against a drained cost tier, replay content-hash handling,
and — critically — that identical seeds produce identical combat outcomes.

---

## 6. Editing content (balancing)

Everything is data-driven in `data_files/*.json`:

- Tweak a hero's stats → `heroes.json`. **Ability magnitudes are data-driven**
  too: each ability carries `params` (e.g. `nova.aoe_factor`, `empower.ad_pct` /
  `star_ad_pct` / `as_add`, `execute.factor` / `lowhp_mult` / `lowhp_threshold`),
  so tuning an outlier (e.g. an over-strong Surge) is a JSON edit, not an engine
  change. `nova` is centered on the target, so ranged mages land AoE on clusters.
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
