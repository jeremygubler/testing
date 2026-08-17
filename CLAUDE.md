# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`autobattler/` is **Aetherclash**, a commercially-oriented Teamfight-Tactics-style
auto-battler in **Godot 4.3 / GDScript**, built platform-agnostically so a licensed
Switch/eShop port can be added later without touching game logic. (`subway-surfers.html`
at the repo root is an unrelated single-file demo — ignore it for autobattler work.)

Original IP only — no Riot/TFT assets, names, or designs.

## Working without a local Godot editor

There is **no local Godot binary here** — do not try to run the game or tests locally.
**GitHub Actions CI is the validator.** The loop is: edit → commit → push → read the CI
run. `.github/workflows/godot-ci.yml` downloads headless Godot 4.3 and runs (in order):
a double `--import`, `parse_check.gd`, `TestRunner.gd`, the sandbox, and the four
balance harnesses. All must stay green.

For fast iteration *before* pushing, validate data with Python (`python3 tools/gen_data.py`
regenerates + implicitly checks JSON; ad-hoc `python3` snippets check `data_files/*.json`
invariants) and reason about sim math directly. Godot warnings are **treated as errors**
in CI, so a `:=` that infers `Variant` (e.g. from `GameDatabase.cfg()`, which returns
`Variant`) fails parse-check — type those locals explicitly (`var x: Dictionary = ...`).

## Common commands

```bash
# (all run in CI; shown for reference — needs Godot 4.3 headless)
godot --headless --path autobattler -s res://tests/TestRunner.gd     # deterministic test suite
godot --headless --path autobattler -s res://tools/parse_check.gd    # compile-check every .gd
godot --headless --path autobattler -s res://tools/sandbox.gd        # combat + cosmetics smoke
godot --headless --path autobattler -s res://tools/balance.gd        # per-hero DPS by cost
godot --headless --path autobattler -s res://tools/comps.gd          # comp win% + per-trait value
godot --headless --path autobattler -s res://tools/simrun.gd         # full-run pacing (greedy bot)
godot --headless --path autobattler -s res://tools/items.gd          # per-item value matrix

python3 autobattler/tools/gen_data.py   # regenerate heroes.json / perks.json / skins.json
```

**Tests** live in `tests/TestSuite.gd` as `test_*` methods, each registered with a
`_run("name", test_fn)` call in `TestSuite.run()`. There is no per-test CLI filter — to
run one in isolation, temporarily comment out the other `_run(...)` lines. Assertions are
a tiny built-in framework (`_check`, `_eq`, `_approx`); a suite returns its failure count
and CI fails on non-zero.

## Architecture — three strict layers

```
src/sim/          (a) simulation / game logic — deterministic, headless, no rendering
src/presentation/ (b) reads sim state, draws, animates (Main.gd/.tscn)
src/platform/     (c) Save / Store / Entitlement / Input behind interfaces + local mocks
```

**The rule:** `src/sim/` never imports from `presentation/` or a concrete platform API,
and uses **only `DeterministicRng`** for randomness — never `randi()`/`randf()`.
Presentation and platform depend inward on the sim, never the reverse. All platform
selection happens in one place: `src/platform/PlatformServices.gd → _resolve_platform()`.

### Determinism is the core invariant

`CombatEngine` runs a fixed tickrate (30/s) and draws all randomness from a seedable
`DeterministicRng` (Park-Miller MINSTD; the method to reseed is `reseed()`, **not**
`seed()` — a method named `seed()` shadows GDScript's global and silently breaks seeding).
Same seed + same inputs ⇒ byte-identical fight. This is what makes balance regression
tests, `Replay.capture/run/verify` (anti-cheat / future ranked), and `GameState.serialize`
(which snapshots RNG state) work. **Never introduce non-deterministic behavior into
`src/sim/`.**

`CombatEngine._init(team0, team1, seed, player_mods={}, apply_traits=true, stall=true)`
has two opt-out flags used *only by measurement benches*: `apply_traits=false` isolates a
trait package (ON vs OFF), and `stall=false` disables the sudden-death chip so it can't
corrupt a full-duration DPS reading against a giant-HP dummy. Normal play uses the defaults.

### The `-s` entry-script gotcha

Scripts run via `godot -s res://...` (`extends SceneTree`) are compiled **before autoloads
register**, so they must NOT reference `GameDatabase` / `PlatformServices` directly. The
pattern throughout `tools/` and `tests/`: a tiny entry script (`balance.gd`) that
`load()`s a runtime `_impl.gd` (`balance_impl.gd`) inside `_initialize()`, where autoloads
exist. Follow this when adding a new headless tool. `parse_check.gd` uses
`can_instantiate()` (not `reload()`) to detect compile failures without colliding with
user-defined `reload()` methods or live autoload instances.

## Data-driven content — tune JSON, not code

All balance content is in `autobattler/data_files/*.json`, loaded by the `GameDatabase`
autoload (`src/data/Database.gd`): `heroes.json` (40 heroes), `perks.json` (20 traits,
2/4/6 breakpoints), `items.json` (8 components → full 36-item recipe grid),
`augments.json` (19), `creeps.json` (10 + data-driven bosses), `skins.json`, and
`game_config.json` (economy / shop odds / xp curve / combat constants incl. sudden-death).

- **Ability magnitudes are data too**: each hero ability carries a `params` dict
  (`nova.aoe_factor`, `empower.ad_pct`, `execute.factor`, …) read by `CombatEngine`.
  Tuning an outlier is a JSON edit, not an engine change.
- **`gen_data.py` regenerates ONLY `heroes.json`, `perks.json`, `skins.json`** — items,
  augments, creeps, and game_config are **hand-maintained** (edit the JSON directly).
  Per-hero tuning that must survive regeneration is encoded in `gen_data.py` (e.g.
  `ABILITY_PARAM_OVERRIDES`, the trait effect tables), then regenerated.
- **JSON numbers parse as float**, so `Array.has(some_int)` misses list membership — use
  the `_int_array_has()` helper pattern (see `GameState`) for round-membership checks
  (creep rounds, augment offer rounds). This bug is subtle and has bitten before.
- Augment/trait effect keys are **shared** between `TraitSystem.apply` and
  `CombatEngine._apply_global_mods`; adding a new effect means wiring the key into
  `_apply_global_mods` (they default to 0, so it's backward-compatible).

## Harness-driven balancing

The discipline that runs through this project: **build the measurement before tuning the
numbers.** Four headless harnesses read the same deterministic engine —
`balance` (per-hero DPS), `comps` (comp win-rate tournament + per-trait package value),
`items` (per-item phys/mage/burst/survival value), `simrun` (full-run pacing: timeouts,
win rate, level curve). Tune a JSON value, push, and compare the harness output before/after
on CI. Hard-won lessons encoded in the tooling: trait-breakpoint % is a *second-order*
lever for comp win-rate (archetype structure dominates); comp benches must use realistic
hybrid boards (carry core + tank front), not mono-comps; measurement benches must disable
`stall`/`apply_traits` to avoid corrupting readings.

## Git workflow

Development happens on a feature branch; PRs are **squash-merged** to `main`. Because a
squash-merge rewrites history, after a merge either reset the branch to `origin/main`
(`git checkout -B <branch> origin/main`) or **rebase new commits onto it**
(`git rebase --onto origin/main <old-branch-head>`) before pushing again — otherwise the
next PR shows a merge conflict. A `--force-with-lease` push is expected after such a rebase.
Verify a clean PR diff with `git diff --stat origin/main...HEAD` (should show only your
intended files).
