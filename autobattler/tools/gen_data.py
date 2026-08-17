#!/usr/bin/env python3
"""Baseline content generator for Aetherclash.

Emits the editable source-of-truth data files consumed by the game:
    data_files/perks.json   (20 traits: 10 origins + 10 classes)
    data_files/heroes.json  (40 heroes, 8 per cost tier)
    data_files/skins.json   (cosmetic catalogue)

The JSON files are hand-editable afterwards; this script only produces a
consistent starting baseline so stats/thresholds line up. Re-running it
regenerates the baseline (careful: it overwrites manual edits).

Design constants agreed with the team:
    * 5 cost tiers, more low-cost copies in the pool.
    * Star scaling x1.8 per star for HP and DMG (applied at runtime).
    * Trait thresholds 2 / 4 / 6 (clamped to how many heroes actually own a trait).
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data_files")

# --- Trait catalogue ---------------------------------------------------------
# Origins (world factions) and Classes (combat archetypes). Descriptions are
# original IP. Effects are simple, engine-understood buffs applied to units that
# share the active trait once a threshold is met.

ORIGINS = {
    "emberkin":    ("Emberkin",    "Born of the volcanic Cinderreach; their aether burns hot."),
    "tidecaller":  ("Tidecaller",  "Keepers of the Sunken Spires who bend the deep currents."),
    "stoneborn":   ("Stoneborn",   "Living mountain-folk quarried from the Bedrock Vaults."),
    "stormwing":   ("Stormwing",   "Sky-nomads riding the thunderheads above the Shatterlands."),
    "verdant":     ("Verdant",     "The overgrown remnant of the World-Root, part plant, part soul."),
    "umbral":      ("Umbral",      "Dwellers of the Nightseam who drink the light around them."),
    "lumen":       ("Lumen",       "Radiants sworn to the Dawn Spire and its unbroken beacon."),
    "clockwork":   ("Clockwork",   "Aether-driven automatons of the lost Gearwright dynasty."),
    "frostborn":   ("Frostborn",   "Exiles of the Rimewaste, hearts slowed to a glacial calm."),
    "voidtouched": ("Voidtouched", "Marked by the Rift; reality frays where they walk."),
}

CLASSES = {
    "vanguard":   ("Vanguard",   "Frontline bulwarks that soak the first blows."),
    "blademaster":("Blademaster","Masters of the blade who stack rapid strikes."),
    "ranger":     ("Ranger",     "Ranged marksfolk dealing steady physical fire."),
    "arcanist":   ("Arcanist",   "Aether-casters who erupt in area magic."),
    "warden":     ("Warden",     "Protectors who mend and shield their allies."),
    "assassin":   ("Assassin",   "Divers that leap the line to gut the backline."),
    "sentinel":   ("Sentinel",   "Armored anchors that harden under fire."),
    "berserker":  ("Berserker",  "Frenzied attackers whose speed climbs mid-fight."),
    "summoner":   ("Summoner",   "Callers who flood the board with conjured aid."),
    "skirmisher": ("Skirmisher", "Mobile duelists that reposition and pick targets."),
}

# Trait effect per threshold tier. Each effect is a dict the trait system applies
# additively to units possessing the trait (only when the trait is ACTIVE).
# Keys are stat modifiers understood by the sim's TraitSystem.
ORIGIN_EFFECTS = {
    "emberkin":    [{"burn_dps": 0.012}, {"burn_dps": 0.025}, {"burn_dps": 0.045}],  # % max hp/s burn on hit (harness: burn overscaled vs high-HP targets)
    "tidecaller":  [{"mana_on_hit_bonus": 4}, {"mana_on_hit_bonus": 8}, {"mana_on_hit_bonus": 14}],
    "stoneborn":   [{"armor_add": 20}, {"armor_add": 45}, {"armor_add": 90}],
    "stormwing":   [{"attack_speed_pct": 0.10}, {"attack_speed_pct": 0.22}, {"attack_speed_pct": 0.40}],
    "verdant":     [{"regen_pct": 0.01}, {"regen_pct": 0.02}, {"regen_pct": 0.04}],  # % max hp/s
    "umbral":      [{"omnivamp_pct": 0.10}, {"omnivamp_pct": 0.20}, {"omnivamp_pct": 0.35}],
    "lumen":       [{"shield_pct": 0.18}, {"shield_pct": 0.38}],                     # start-of-combat shield (harness: package barely registered)
    "clockwork":   [{"ad_pct": 0.12}, {"ad_pct": 0.28}, {"ad_pct": 0.50}],
    "frostborn":   [{"mr_add": 20}, {"mr_add": 45}, {"mr_add": 90}],
    "voidtouched": [{"true_damage_pct": 0.15}, {"true_damage_pct": 0.35}],           # % of dmg as true (harness: near-zero package value)
}

CLASS_EFFECTS = {
    "vanguard":    [{"hp_pct": 0.10}, {"hp_pct": 0.22}, {"hp_pct": 0.40}],           # realistic-meta pass: tank comp too stally (77.8% win)
    "blademaster": [{"double_strike_chance": 0.12}, {"double_strike_chance": 0.25}, {"double_strike_chance": 0.42}],  # healthy mid (55.6%), left
    "ranger":      [{"ad_pct": 0.10}, {"ad_pct": 0.26}, {"ad_pct": 0.46}],           # realistic-meta pass: top carry (81.5%), trimmed
    "arcanist":    [{"ability_power_pct": 0.26}, {"ability_power_pct": 0.52}, {"ability_power_pct": 0.88}],  # realistic-meta pass: only underperforming carry (14.8%), buffed
    "warden":      [{"heal_pct": 0.20}, {"heal_pct": 0.45}],                         # support trait: standalone-weak by design (splashes into carries)
    "assassin":    [{"crit_bonus_pct": 0.20}, {"crit_bonus_pct": 0.45}],
    "sentinel":    [{"armor_add": 32}, {"armor_add": 75}],                           # defensive splash trait: standalone-weak by design
    "berserker":   [{"ramp_as_per_hit": 0.025}, {"ramp_as_per_hit": 0.05}],         # realistic-meta pass: strong carry (75.9%), trimmed
    "summoner":    [{"summon_hp_pct": 0.25}, {"summon_hp_pct": 0.60}],              # realistic-meta pass: strong carry (68.5%), trimmed
    "skirmisher":  [{"dodge_pct": 0.22}, {"dodge_pct": 0.42}],                       # mobility splash trait: standalone-weak by design
}

# --- Hero roster -------------------------------------------------------------
# (name, cost, origin, class, ability_kind). ability_kind must be one of the
# kinds the CombatEngine implements: burst, nova, heal, shield, empower, execute,
# summon. Lore is generated from the origin flavour.

# 8 heroes per cost tier. Roughly: low cost = simpler/tankier commons,
# high cost = carries with strong abilities.
ROSTER = [
    # cost 1 (8)
    ("Cinderos",   1, "emberkin",    "blademaster", "burst"),
    ("Nerida",     1, "tidecaller",  "warden",      "heal"),
    ("Gravik",     1, "stoneborn",   "vanguard",    "shield"),
    ("Cirrus",     1, "stormwing",   "ranger",      "empower"),
    ("Mosswick",   1, "verdant",     "sentinel",    "shield"),
    ("Vesper",     1, "umbral",      "assassin",    "execute"),
    ("Lucen",      1, "lumen",       "vanguard",    "shield"),
    ("Tik",        1, "clockwork",   "skirmisher",  "empower"),
    # cost 2 (8)
    ("Ashvin",     2, "emberkin",    "berserker",   "empower"),
    ("Coralis",    2, "tidecaller",  "arcanist",    "nova"),
    ("Boulderon",  2, "stoneborn",   "sentinel",    "shield"),
    ("Galewind",   2, "stormwing",   "skirmisher",  "empower"),
    ("Bramblewick",2, "verdant",     "summoner",    "summon"),
    ("Nyx",        2, "umbral",      "blademaster", "burst"),
    ("Solara",     2, "lumen",       "warden",      "heal"),
    ("Rimeheart",  2, "frostborn",   "ranger",      "burst"),
    # cost 3 (8)
    ("Pyra",       3, "emberkin",    "arcanist",    "nova"),
    ("Marould",    3, "tidecaller",  "vanguard",    "shield"),
    ("Cragmaw",    3, "stoneborn",   "berserker",   "empower"),
    ("Zephyra",    3, "stormwing",   "ranger",      "burst"),
    ("Sylvara",    3, "verdant",     "warden",      "heal"),
    ("Umbros",     3, "umbral",      "assassin",    "execute"),
    ("Gearwright", 3, "clockwork",   "summoner",    "summon"),
    ("Glacius",    3, "frostborn",   "vanguard",    "nova"),
    # cost 4 (8)
    ("Emberlyn",   4, "emberkin",    "arcanist",    "nova"),
    ("Tidus",      4, "tidecaller",  "blademaster", "burst"),
    ("Terran",     4, "stoneborn",   "vanguard",    "shield"),
    ("Skarn",      4, "stormwing",   "assassin",    "execute"),
    ("Thornwood",  4, "verdant",     "sentinel",    "heal"),
    ("Cogsworth",  4, "clockwork",   "ranger",      "empower"),
    ("Icevein",    4, "frostborn",   "arcanist",    "nova"),
    ("Nullis",     4, "voidtouched", "skirmisher",  "execute"),
    # cost 5 (8)
    ("Ignarok",    5, "emberkin",    "berserker",   "empower"),
    ("Abyssia",    5, "voidtouched", "arcanist",    "nova"),
    ("Kaelen",     5, "lumen",       "warden",      "heal"),
    ("Automa",     5, "clockwork",   "vanguard",    "summon"),
    ("Frostine",   5, "frostborn",   "ranger",      "burst"),
    ("Riftmaw",    5, "voidtouched", "assassin",    "execute"),
    ("Nimbuscar",  5, "stormwing",   "blademaster", "empower"),
    ("Verdania",   5, "verdant",     "summoner",    "summon"),
]

assert len(ROSTER) == 40, "expected 40 heroes"

# --- Pool sizes (copies available per cost) ---------------------------------
# More low-cost copies, TFT-style.
POOL_COPIES = {1: 29, 2: 22, 3: 18, 4: 12, 5: 10}

# --- Base stats by cost (1-star) --------------------------------------------
COST_HP = {1: 550, 2: 650, 3: 750, 4: 900, 5: 1100}
COST_AD = {1: 45, 2: 52, 3: 62, 4: 74, 5: 90}

# Role templates: multipliers/values over the cost baseline.
# range in hexes, aps = attacks/sec, armor/mr flat, mana start/max.
ROLE = {
    "vanguard":   dict(hp=1.45, ad=0.80, aps=0.55, rng=1, armor=45, mr=45, m0=0,  mmax=100, atk="physical"),
    "sentinel":   dict(hp=1.55, ad=0.75, aps=0.55, rng=1, armor=55, mr=40, m0=0,  mmax=90,  atk="physical"),
    "blademaster":dict(hp=1.00, ad=1.15, aps=0.75, rng=1, armor=25, mr=25, m0=10, mmax=60,  atk="physical"),
    "berserker":  dict(hp=1.05, ad=1.05, aps=0.85, rng=1, armor=30, mr=30, m0=10, mmax=70,  atk="physical"),
    "assassin":   dict(hp=0.90, ad=1.20, aps=0.70, rng=1, armor=20, mr=20, m0=0,  mmax=80,  atk="physical"),
    "skirmisher": dict(hp=0.95, ad=1.05, aps=0.72, rng=1, armor=25, mr=25, m0=10, mmax=70,  atk="physical"),
    "ranger":     dict(hp=0.85, ad=1.10, aps=0.75, rng=4, armor=20, mr=20, m0=0,  mmax=70,  atk="physical"),
    "arcanist":   dict(hp=0.80, ad=0.55, aps=0.60, rng=3, armor=20, mr=20, m0=30, mmax=110, atk="magic"),
    "warden":     dict(hp=1.00, ad=0.65, aps=0.60, rng=3, armor=30, mr=30, m0=40, mmax=100, atk="magic"),
    "summoner":   dict(hp=0.90, ad=0.70, aps=0.65, rng=3, armor=25, mr=25, m0=30, mmax=100, atk="magic"),
}

ABILITY_TEXT = {
    "burst":   "unleashes a focused aether bolt at the current target for heavy magic damage.",
    "nova":    "erupts in an aether nova, dealing magic damage to all enemies nearby.",
    "heal":    "channels restorative aether, healing the most wounded ally.",
    "shield":  "raises an aether ward, shielding itself from incoming damage.",
    "empower": "enters a surge, sharply raising its attack damage and speed for a time.",
    "execute": "strikes with lethal intent, dealing massive damage that scales up against low-health foes.",
    "summon":  "conjures an aether construct to fight alongside it.",
}


def round_to(v, step=5):
    return int(round(v / step) * step)


def build_heroes():
    heroes = []
    for name, cost, origin, klass, kind in ROSTER:
        r = ROLE[klass]
        hp = round_to(COST_HP[cost] * r["hp"], 10)
        ad = round_to(COST_AD[cost] * r["ad"], 1)
        # Ability power scales with cost so 4/5-costs feel like carries.
        ability_power = round_to((40 + cost * 25), 5)
        lore = f"{ORIGINS[origin][1]} {name} {ABILITY_TEXT[kind]}"
        heroes.append({
            "id": name.lower(),
            "name": name,
            "cost": cost,
            "origin": origin,
            "lore": lore,
            "perks": [origin, klass],
            "stats": {
                "hp": hp,
                "attack_damage": ad,
                "attack_speed": r["aps"],
                "attack_range": r["rng"],
                "armor": r["armor"],
                "magic_resist": r["mr"],
                "mana_start": r["m0"],
                "mana_max": r["mmax"],
                "move_speed": 2.0,  # hexes per second
                "attack_type": r["atk"],
            },
            "ability": {
                "id": f"{name.lower()}_ult",
                "name": _ability_name(name, kind),
                "kind": kind,
                "power": ability_power,
                "radius": 1 if kind == "nova" else 0,
                "duration": 4.0 if kind in ("empower", "shield") else 0.0,
                "description": f"{name} {ABILITY_TEXT[kind]}",
                # Per-kind tunable magnitudes (data-driven so balancing is a JSON
                # edit, not an engine change), plus per-hero balance overrides.
                "params": _hero_ability_params(name, kind),
            },
        })
    return heroes


def _ability_params(kind):
    return {
        "burst":   {"burst_factor": 1.0},
        "nova":    {"aoe_factor": 0.7},
        "heal":    {"heal_factor": 1.0},
        "shield":  {"shield_factor": 1.0},
        "empower": {"ad_pct": 0.4, "star_ad_pct": 0.1, "as_add": 0.4},
        "execute": {"factor": 1.5, "lowhp_mult": 2.0, "lowhp_threshold": 0.5},
        "summon":  {"minion_hp_factor": 3.0, "minion_ad_factor": 0.5},
    }.get(kind, {})


# Per-hero ability-param tweaks from the balance pass (harness-driven).
#  - Cirrus/Ashvin: Surge over-performed for their cost -> weaker AD buff.
#  - Abyssia/Icevein/Emberlyn: 4/5-cost AoE mages under-performed -> stronger nova.
ABILITY_PARAM_OVERRIDES = {
    "cirrus":   {"ad_pct": 0.25},
    "ashvin":   {"ad_pct": 0.25},
    "abyssia":  {"aoe_factor": 0.85},
    "icevein":  {"aoe_factor": 0.85},
    "emberlyn": {"aoe_factor": 0.85},
}


def _hero_ability_params(name, kind):
    p = dict(_ability_params(kind))
    p.update(ABILITY_PARAM_OVERRIDES.get(name.lower(), {}))
    return p


def _ability_name(name, kind):
    themes = {
        "burst": "Aether Lance",
        "nova": "Rift Nova",
        "heal": "Mending Tide",
        "shield": "Bulwark Ward",
        "empower": "Surge",
        "execute": "Culling Strike",
        "summon": "Conjure Construct",
    }
    return f"{name}'s {themes[kind]}"


def trait_thresholds(count, tiers):
    """Clamp the desired tier list to how many heroes own the trait."""
    reachable = [t for t in tiers if t <= count]
    if not reachable:
        reachable = [min(tiers[0], max(count, 1))]
    return reachable


def build_perks(heroes):
    # Count trait membership.
    counts = {}
    for h in heroes:
        for p in h["perks"]:
            counts[p] = counts.get(p, 0) + 1

    perks = []
    for key, (label, desc) in ORIGINS.items():
        tiers = trait_thresholds(counts.get(key, 0), [2, 4, 6])
        effects = ORIGIN_EFFECTS[key][:len(tiers)]
        perks.append(_perk(key, label, "origin", desc, tiers, effects))
    for key, (label, desc) in CLASSES.items():
        tiers = trait_thresholds(counts.get(key, 0), [2, 4, 6])
        effects = CLASS_EFFECTS[key][:len(tiers)]
        perks.append(_perk(key, label, "class", desc, tiers, effects))
    return perks


def _perk(key, label, category, desc, tiers, effects):
    breakpoints = []
    for i, t in enumerate(tiers):
        breakpoints.append({"count": t, "effect": effects[i] if i < len(effects) else effects[-1]})
    return {
        "id": key,
        "name": label,
        "category": category,
        "description": desc,
        "breakpoints": breakpoints,
    }


def build_skins(heroes):
    # Cosmetic-only catalogue. A handful of hero skins across rarities, plus
    # board and effect skins. price_tier maps to MockStoreService.PRICE_BY_TIER.
    skins = []

    def hero_skin(hero_id, suffix, display, rarity):
        skins.append({
            "id": f"skin_{hero_id}_{suffix}",
            "type": "hero",
            "hero_id": hero_id,
            "name": display,
            "rarity": rarity,
            "price_tier": rarity,
            "assets": {
                "sprite": f"res://assets/skins/{hero_id}/{suffix}.png",
                "tint": _rarity_tint(rarity),
            },
        })

    # Give the marquee 4- and 5-cost carries premium skins.
    featured = {
        "abyssia": [("voidqueen", "Abyssia, Void Sovereign", "legendary"),
                    ("tidewrought", "Abyssia, Tidewrought", "epic")],
        "ignarok": [("magmalord", "Ignarok, Magma Lord", "legendary")],
        "kaelen":  [("dawnwarden", "Kaelen, Dawn Warden", "epic")],
        "riftmaw": [("nullblade", "Riftmaw, Nullblade", "epic")],
        "frostine":[("aurora", "Frostine, Aurora", "rare")],
        "pyra":    [("emberdancer", "Pyra, Ember Dancer", "rare")],
        "nerida":  [("coralmaiden", "Nerida, Coral Maiden", "common")],
        "gravik":  [("obsidian", "Gravik, Obsidian", "common")],
    }
    for hero_id, variants in featured.items():
        for suffix, display, rarity in variants:
            hero_skin(hero_id, suffix, display, rarity)

    # Board skins (visual arena themes).
    for bid, name, rarity in [
        ("board_cinderreach", "Cinderreach Arena", "rare"),
        ("board_sunkenspire", "Sunken Spire Arena", "epic"),
        ("board_dawnspire", "Dawn Spire Arena", "legendary"),
    ]:
        skins.append({
            "id": bid, "type": "board", "hero_id": "", "name": name,
            "rarity": rarity, "price_tier": rarity,
            "assets": {"background": f"res://assets/boards/{bid}.png"},
        })

    # Effect skins (attack/ability VFX palettes).
    for eid, name, rarity in [
        ("fx_gold", "Gilded Impacts", "epic"),
        ("fx_void", "Void Rifts", "legendary"),
    ]:
        skins.append({
            "id": eid, "type": "effect", "hero_id": "", "name": name,
            "rarity": rarity, "price_tier": rarity,
            "assets": {"palette": f"res://assets/fx/{eid}.tres"},
        })

    return skins


def _rarity_tint(rarity):
    return {
        "common": "#c9d1d9",
        "rare": "#4ea1ff",
        "epic": "#b061ff",
        "legendary": "#ffb347",
    }[rarity]


def main():
    heroes = build_heroes()
    perks = build_perks(heroes)
    skins = build_skins(heroes)

    os.makedirs(DATA, exist_ok=True)
    _write("perks.json", {"perks": perks})
    _write("heroes.json", {"pool_copies": POOL_COPIES, "heroes": heroes})
    _write("skins.json", {"skins": skins})

    print(f"Wrote {len(heroes)} heroes, {len(perks)} perks, {len(skins)} skins to {DATA}")


def _write(fname, obj):
    path = os.path.join(DATA, fname)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
