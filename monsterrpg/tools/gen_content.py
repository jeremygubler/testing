#!/usr/bin/env python3
"""Generiert die Inhalts-Resources (.tres) für das Monster-RPG.

Warum ein Generator?  Die 24 Attacken / 12 Arten / 6 Items sind stark
strukturierte Daten -- als Python-Tabelle sind sie übersichtlich, diff-bar und
in einem Rutsch balancierbar.  Godot liest am Ende ganz normale .tres-Dateien,
die man auch komplett im Inspector weiterbearbeiten kann.

    python3 tools/gen_content.py            # schreibt resources/**/*.tres

WICHTIG: Handänderungen in resources/ werden beim nächsten Lauf
überschrieben.  Dauerhafte Balance-Änderungen also hier eintragen (oder den
Generator gar nicht mehr benutzen und nur noch im Editor arbeiten).
"""

from __future__ import annotations

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- Enum-Spiegel (müssen zu scripts/core/*.gd passen) --------------------
NEUTRAL, EMBER, TIDE, VERDANT, SPARK, FROST, STONE, GALE, TOXIN, UMBRA = range(10)
PHYS, SPEC, STATUS = 0, 1, 2
E_NONE, E_STAT, E_INFLICT, E_DRAIN, E_RECOIL, E_HEAL = range(6)
HP, ATK, DEF, SPA, SPD, SPE = range(6)
S_NONE, S_BURN, S_POISON, S_PARALYZE, S_SLEEP = range(5)
K_HEAL, K_CURE, K_REVIVE, K_CAPTURE = range(4)

SCRIPTS = {
    "move": "res://scripts/monsters/MoveDefinition.gd",
    "species": "res://scripts/monsters/MonsterSpecies.gd",
    "learn": "res://scripts/monsters/LearnsetEntry.gd",
    "item": "res://scripts/monsters/ItemDefinition.gd",
    "entry": "res://scripts/monsters/EncounterEntry.gd",
    "table": "res://scripts/monsters/EncounterTable.gd",
}

# --- Attacken --------------------------------------------------------------
# id, Name, Typ, Kategorie, Power, Acc, PP, Prio, HighCrit, Effekt-Dict, Text
MOVES = [
    ("tackle", "Rempler", NEUTRAL, PHYS, 40, 100, 35, 0, False, {},
     "Ein simpler Körperstoß. Trifft fast immer."),
    ("fury_focus", "Wutfokus", NEUTRAL, STATUS, 0, 0, 20, 0, False,
     {"effect": E_STAT, "self": True, "stat": ATK, "stages": 1},
     "Der Anwender sammelt Wut und erhöht seinen Angriff."),
    ("mend", "Flicken", NEUTRAL, STATUS, 0, 0, 10, 0, False,
     {"effect": E_HEAL, "self": True, "ratio": 0.5},
     "Der Anwender heilt die Hälfte seiner maximalen KP."),
    ("lull_hymn", "Wiegenlied", NEUTRAL, STATUS, 0, 70, 15, 0, False,
     {"effect": E_INFLICT, "status": S_SLEEP},
     "Eine leise Melodie, die das Ziel einschläfern kann."),
    ("ember_spit", "Glutspucke", EMBER, SPEC, 45, 100, 25, 0, False,
     {"effect": E_INFLICT, "status": S_BURN, "chance": 10},
     "Ein Funkenstoß, der leichte Verbrennungen verursachen kann."),
    ("flame_lash", "Flammenpeitsche", EMBER, SPEC, 85, 95, 12, 0, False,
     {"effect": E_INFLICT, "status": S_BURN, "chance": 15},
     "Eine Peitsche aus Flammen. Kann Verbrennungen verursachen."),
    ("water_jet", "Wasserdüse", TIDE, SPEC, 45, 100, 25, 0, False, {},
     "Ein scharfer Wasserstrahl."),
    ("tide_crush", "Flutschlag", TIDE, PHYS, 80, 95, 15, 0, False, {},
     "Eine heranrollende Welle aus Wucht."),
    ("leaf_cutter", "Blattschnitt", VERDANT, PHYS, 55, 100, 25, 0, True, {},
     "Scharfe Blätter. Landet oft Volltreffer."),
    ("bloom_drain", "Blütensauger", VERDANT, SPEC, 55, 100, 15, 0, False,
     {"effect": E_DRAIN, "ratio": 0.5},
     "Entzieht Lebenskraft und heilt den Anwender."),
    ("vine_snare", "Rankenfalle", VERDANT, STATUS, 0, 95, 20, 0, False,
     {"effect": E_STAT, "stat": SPE, "stages": -1},
     "Ranken fesseln das Ziel und senken seine Initiative."),
    ("spark_bolt", "Funkenblitz", SPARK, SPEC, 50, 100, 25, 0, False,
     {"effect": E_INFLICT, "status": S_PARALYZE, "chance": 10},
     "Ein kurzer Blitz. Kann paralysieren."),
    ("thunder_fang", "Donnerzahn", SPARK, PHYS, 75, 95, 15, 0, False,
     {"effect": E_INFLICT, "status": S_PARALYZE, "chance": 15},
     "Ein aufgeladener Biss. Kann paralysieren."),
    ("frost_breath", "Frostatem", FROST, SPEC, 60, 100, 20, 0, False,
     {"effect": E_STAT, "stat": SPE, "stages": -1, "chance": 25},
     "Eisiger Atem, der das Ziel verlangsamen kann."),
    ("icicle_spike", "Eiszapfen", FROST, PHYS, 75, 95, 15, 0, False, {},
     "Ein geschleuderter Eiszapfen."),
    ("rock_toss", "Steinwurf", STONE, PHYS, 65, 90, 20, 0, False, {},
     "Ein grober Felsbrocken, ungenau aber wirksam."),
    ("stone_guard", "Steinpanzer", STONE, STATUS, 0, 0, 15, 0, False,
     {"effect": E_STAT, "self": True, "stat": DEF, "stages": 2},
     "Eine Steinschicht erhöht die Verteidigung deutlich."),
    ("quick_gust", "Windstoß", GALE, PHYS, 40, 100, 30, 1, False, {},
     "Ein blitzschneller Windstoß -- greift zuerst an."),
    ("gale_slash", "Sturmklinge", GALE, PHYS, 65, 100, 20, 0, False, {},
     "Eine Klinge aus verdichteter Luft."),
    ("reckless_dive", "Sturzflug", GALE, PHYS, 95, 90, 10, 0, False,
     {"effect": E_RECOIL, "ratio": 0.25},
     "Ein Sturzflug mit voller Wucht -- kostet auch eigene KP."),
    ("venom_fang", "Giftzahn", TOXIN, PHYS, 60, 100, 20, 0, False,
     {"effect": E_INFLICT, "status": S_POISON, "chance": 20},
     "Ein giftiger Biss."),
    ("toxic_spore", "Giftspore", TOXIN, STATUS, 0, 90, 20, 0, False,
     {"effect": E_INFLICT, "status": S_POISON},
     "Sporen, die das Ziel zuverlässig vergiften."),
    ("bite", "Biss", UMBRA, PHYS, 60, 100, 25, 0, False, {},
     "Ein Biss aus dem Hinterhalt."),
    ("shadow_claw", "Schattenkralle", UMBRA, PHYS, 70, 100, 15, 0, True, {},
     "Klauen aus Schatten. Landet oft Volltreffer."),
]

# --- Arten -----------------------------------------------------------------
# id, Name, Typen, [hp,atk,def,spa,spd,spe], Fangrate, BasisEP,
# Lernliste [(Level, MoveId)], (Entwicklung, Level), Farbe, Skalierung, Text
SPECIES = [
    ("cindercub", "Glutwelp", [EMBER], [45, 55, 45, 60, 50, 60], 190, 62,
     [(1, "tackle"), (1, "ember_spit"), (7, "fury_focus"), (12, "bite"),
      (18, "flame_lash"), (24, "mend")],
     ("pyrelynx", 16), (0.90, 0.40, 0.22), 0.95,
     "Ein verspielter Welpe, dessen Fell bei Aufregung Funken schlägt."),
    ("pyrelynx", "Flammenluchs", [EMBER, GALE], [65, 80, 60, 85, 65, 95], 90, 142,
     [(1, "tackle"), (1, "ember_spit"), (12, "bite"), (16, "quick_gust"),
      (20, "flame_lash"), (28, "reckless_dive")],
     ("", 0), (0.95, 0.30, 0.18), 1.20,
     "Jagt in der Abendhitze und bewegt sich schneller als der Rauch, den es hinterlässt."),
    ("dripling", "Tropfling", [TIDE], [50, 45, 55, 60, 60, 45], 190, 60,
     [(1, "tackle"), (1, "water_jet"), (8, "mend"), (14, "tide_crush"),
      (20, "frost_breath")],
     ("tidalmaw", 18), (0.24, 0.56, 0.90), 0.85,
     "Sammelt Morgentau in seiner Rücken-Mulde und teilt ihn mit Artgenossen."),
    ("tidalmaw", "Flutschlund", [TIDE, FROST], [75, 85, 75, 75, 75, 55], 85, 148,
     [(1, "tackle"), (1, "water_jet"), (14, "tide_crush"), (18, "icicle_spike"),
      (26, "frost_breath")],
     ("", 0), (0.18, 0.42, 0.78), 1.30,
     "Bewacht kalte Küstenhöhlen und lässt niemanden ohne Kraftprobe hinein."),
    ("sproutle", "Keimling", [VERDANT], [55, 50, 55, 55, 60, 40], 190, 60,
     [(1, "tackle"), (1, "leaf_cutter"), (9, "vine_snare"), (15, "bloom_drain"),
      (21, "stone_guard")],
     ("thornmane", 18), (0.34, 0.74, 0.34), 0.85,
     "Trägt seinen Setzling wie einen Rucksack und sucht ständig helle Plätze."),
    ("thornmane", "Dornmähne", [VERDANT, STONE], [80, 85, 85, 60, 70, 45], 85, 150,
     [(1, "tackle"), (1, "leaf_cutter"), (15, "rock_toss"), (19, "stone_guard"),
      (25, "bloom_drain")],
     ("", 0), (0.28, 0.58, 0.30), 1.35,
     "Seine Mähne besteht aus verholzten Dornen, die Steinschlag abfangen."),
    ("voltnip", "Voltbiss", [SPARK], [45, 50, 40, 65, 50, 85], 170, 66,
     [(1, "tackle"), (1, "spark_bolt"), (10, "quick_gust"), (16, "thunder_fang"),
      (22, "fury_focus")],
     ("", 0), (0.96, 0.84, 0.26), 0.80,
     "Nagt an Blitzableitern und lädt sich dabei wie eine Batterie auf."),
    ("gustwing", "Windschwinge", [GALE, NEUTRAL], [50, 55, 45, 45, 45, 80], 175, 64,
     [(1, "tackle"), (1, "quick_gust"), (12, "gale_slash"), (18, "reckless_dive")],
     ("", 0), (0.74, 0.88, 0.82), 0.90,
     "Segelt tagelang auf Aufwinden und landet nur zum Fressen."),
    ("mirefang", "Sumpfzahn", [TOXIN], [60, 65, 60, 50, 55, 50], 150, 78,
     [(1, "tackle"), (1, "venom_fang"), (11, "toxic_spore"), (17, "bite"),
      (23, "mend")],
     ("", 0), (0.60, 0.34, 0.70), 1.05,
     "Lauert im Schlamm und markiert sein Revier mit bitterem Nebel."),
    ("shadepup", "Schattenwelpe", [UMBRA], [50, 60, 45, 55, 50, 70], 150, 72,
     [(1, "tackle"), (1, "bite"), (13, "shadow_claw"), (19, "lull_hymn")],
     ("", 0), (0.30, 0.26, 0.40), 0.90,
     "Schlüpft durch Schatten und taucht dort auf, wo man es nicht erwartet."),
    ("pebbling", "Kieselchen", [STONE], [60, 70, 85, 35, 45, 30], 180, 68,
     [(1, "tackle"), (1, "rock_toss"), (10, "stone_guard"), (16, "fury_focus")],
     ("", 0), (0.64, 0.56, 0.42), 0.80,
     "Rollt bergab schneller als es laufen kann -- was es selten bereut."),
    ("frostkit", "Frostkätzchen", [FROST], [50, 50, 50, 65, 60, 65], 165, 70,
     [(1, "tackle"), (1, "frost_breath"), (12, "icicle_spike"), (18, "mend"),
      (22, "lull_hymn")],
     ("", 0), (0.66, 0.88, 0.96), 0.85,
     "Atmet kleine Eisblumen, mit denen es seine Schlafhöhle auskleidet."),
]

# --- Items ----------------------------------------------------------------
# id, Name, Art, amount, ratio, catch_mult, Preis, Text
ITEMS = [
    ("potion", "Heiltrank", K_HEAL, 25, 0.0, 1.0, 200,
     "Stellt 25 KP eines Monsters wieder her."),
    ("super_potion", "Starker Heiltrank", K_HEAL, 70, 0.0, 1.0, 600,
     "Stellt 70 KP eines Monsters wieder her."),
    ("salve", "Kräutersalbe", K_CURE, 0, 0.0, 1.0, 250,
     "Heilt Verbrennung, Vergiftung, Paralyse oder Schlaf."),
    ("revive_charm", "Wiederbeleber", K_REVIVE, 0, 0.5, 1.0, 1200,
     "Belebt ein besiegtes Monster mit der Hälfte seiner KP wieder."),
    ("capture_orb", "Fangkugel", K_CAPTURE, 0, 0.0, 1.0, 150,
     "Standardkugel für Fangversuche bei wilden Monstern."),
    ("fine_orb", "Feine Fangkugel", K_CAPTURE, 0, 0.0, 1.8, 500,
     "Deutlich bessere Fangchance als eine normale Fangkugel."),
]

# --- Begegnungstabellen ---------------------------------------------------
# id, Name, Distanz/Wurf, Chance, Cooldown, [(species, weight, min, max)]
TABLES = [
    ("meadow", "Blütenwiese", 4.0, 0.18, 6.0, [
        ("sproutle", 30, 2, 5),
        ("voltnip", 25, 2, 4),
        ("gustwing", 25, 3, 5),
        ("pebbling", 20, 3, 6),
    ]),
    ("cinder_ridge", "Glutkamm", 5.0, 0.22, 6.0, [
        ("cindercub", 25, 5, 8),
        ("pebbling", 25, 5, 8),
        ("mirefang", 25, 6, 9),
        ("shadepup", 15, 6, 9),
        ("frostkit", 10, 5, 7),
    ]),
]


def write(rel_path: str, text: str) -> None:
    full = os.path.join(ROOT, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as handle:
        handle.write(text)


def header(script_class: str, load_steps: int, ext: list[str]) -> str:
    out = '[gd_resource type="Resource" script_class="%s" load_steps=%d format=3]\n\n' % (
        script_class, load_steps)
    out += "".join(ext) + "\n"
    return out


def ext_script(path: str, ident: str) -> str:
    return '[ext_resource type="Script" path="%s" id="%s"]\n' % (path, ident)


def ext_res(path: str, ident: str) -> str:
    return '[ext_resource type="Resource" path="%s" id="%s"]\n' % (path, ident)


def gen_moves() -> None:
    for (mid, name, element, category, power, acc, pp, prio, high_crit, fx,
         text) in MOVES:
        body = header("MoveDefinition", 2, [ext_script(SCRIPTS["move"], "1_s")])
        body += "[resource]\n"
        body += 'script = ExtResource("1_s")\n'
        body += 'id = "%s"\n' % mid
        body += 'display_name = "%s"\n' % name
        body += 'description = "%s"\n' % text
        body += "element = %d\n" % element
        body += "category = %d\n" % category
        body += "power = %d\n" % power
        body += "accuracy = %d\n" % acc
        body += "max_pp = %d\n" % pp
        body += "priority = %d\n" % prio
        body += "high_crit = %s\n" % ("true" if high_crit else "false")
        body += "effect = %d\n" % fx.get("effect", E_NONE)
        body += "effect_chance = %d\n" % fx.get("chance", 100)
        body += "targets_self = %s\n" % ("true" if fx.get("self") else "false")
        body += "effect_stat = %d\n" % fx.get("stat", ATK)
        body += "effect_stages = %d\n" % fx.get("stages", 0)
        body += "effect_status = %d\n" % fx.get("status", S_NONE)
        body += "effect_ratio = %s\n" % repr(round(float(fx.get("ratio", 0.5)), 3))
        write("resources/moves/%s.tres" % mid, body)


def gen_species() -> None:
    for (sid, name, types, stats, catch, base_exp, learnset, evo, color, scale,
         text) in SPECIES:
        move_ids = sorted({m for _, m in learnset})
        ext = [ext_script(SCRIPTS["species"], "1_s"),
               ext_script(SCRIPTS["learn"], "2_l")]
        move_ident = {}
        for index, move_id in enumerate(move_ids):
            ident = "m%d_%s" % (index, move_id)
            move_ident[move_id] = ident
            ext.append(ext_res("res://resources/moves/%s.tres" % move_id, ident))

        subs = ""
        sub_ids = []
        for index, (level, move_id) in enumerate(sorted(learnset)):
            sub_id = "LE%d" % index
            sub_ids.append(sub_id)
            subs += '[sub_resource type="Resource" id="%s"]\n' % sub_id
            subs += 'script = ExtResource("2_l")\n'
            subs += "level = %d\n" % level
            subs += 'move = ExtResource("%s")\n\n' % move_ident[move_id]

        load_steps = len(ext) + len(sub_ids) + 1
        body = header("MonsterSpecies", load_steps, ext) + subs
        body += "[resource]\n"
        body += 'script = ExtResource("1_s")\n'
        body += 'id = "%s"\n' % sid
        body += 'display_name = "%s"\n' % name
        body += 'codex_text = "%s"\n' % text
        body += "primary_type = %d\n" % types[0]
        body += "has_secondary_type = %s\n" % ("true" if len(types) > 1 else "false")
        body += "secondary_type = %d\n" % (types[1] if len(types) > 1 else types[0])
        for key, value in zip(
                ["base_hp", "base_atk", "base_def", "base_spa", "base_spd", "base_spe"],
                stats):
            body += "%s = %d\n" % (key, value)
        body += "catch_rate = %d\n" % catch
        body += "base_exp = %d\n" % base_exp
        body += "learnset = Array[LearnsetEntry]([%s])\n" % ", ".join(
            'SubResource("%s")' % s for s in sub_ids)
        body += 'evolves_into = "%s"\n' % evo[0]
        body += "evolve_level = %d\n" % evo[1]
        body += "placeholder_color = Color(%s, %s, %s, 1)\n" % (
            color[0], color[1], color[2])
        body += "placeholder_scale = Vector3(%s, %s, %s)\n" % (scale, scale, scale)
        write("resources/monsters/%s.tres" % sid, body)


def gen_items() -> None:
    for iid, name, kind, amount, ratio, catch_mult, price, text in ITEMS:
        body = header("ItemDefinition", 2, [ext_script(SCRIPTS["item"], "1_s")])
        body += "[resource]\n"
        body += 'script = ExtResource("1_s")\n'
        body += 'id = "%s"\n' % iid
        body += 'display_name = "%s"\n' % name
        body += 'description = "%s"\n' % text
        body += "kind = %d\n" % kind
        body += "amount = %d\n" % amount
        body += "ratio = %s\n" % repr(round(float(ratio), 3))
        body += "catch_multiplier = %s\n" % repr(round(float(catch_mult), 3))
        body += "usable_in_battle = true\n"
        body += "usable_in_overworld = %s\n" % (
            "false" if kind == K_CAPTURE else "true")
        body += "price = %d\n" % price
        write("resources/items/%s.tres" % iid, body)


def gen_tables() -> None:
    for tid, name, distance, chance, cooldown, rows in TABLES:
        ext = [ext_script(SCRIPTS["table"], "1_s"), ext_script(SCRIPTS["entry"], "2_e")]
        subs = ""
        sub_ids = []
        for index, (species_id, weight, lo, hi) in enumerate(rows):
            sub_id = "EE%d" % index
            sub_ids.append(sub_id)
            subs += '[sub_resource type="Resource" id="%s"]\n' % sub_id
            subs += 'script = ExtResource("2_e")\n'
            subs += 'species_id = "%s"\n' % species_id
            subs += "weight = %d\n" % weight
            subs += "min_level = %d\n" % lo
            subs += "max_level = %d\n\n" % hi
        body = header("EncounterTable", len(ext) + len(sub_ids) + 1, ext) + subs
        body += "[resource]\n"
        body += 'script = ExtResource("1_s")\n'
        body += 'id = "%s"\n' % tid
        body += 'display_name = "%s"\n' % name
        body += "entries = Array[EncounterEntry]([%s])\n" % ", ".join(
            'SubResource("%s")' % s for s in sub_ids)
        body += "distance_per_check = %s\n" % repr(round(float(distance), 3))
        body += "encounter_chance = %s\n" % repr(round(float(chance), 3))
        body += "cooldown_seconds = %s\n" % repr(round(float(cooldown), 3))
        write("resources/encounters/%s.tres" % tid, body)


def validate() -> None:
    """Kleine Konsistenzprüfung -- fängt Tippfehler vor dem Godot-Start."""
    move_ids = {m[0] for m in MOVES}
    species_ids = {s[0] for s in SPECIES}
    problems = []
    for species in SPECIES:
        for level, move_id in species[6]:
            if move_id not in move_ids:
                problems.append("%s: unbekannte Attacke '%s'" % (species[0], move_id))
            if not 1 <= level <= 100:
                problems.append("%s: Level %d außerhalb 1..100" % (species[0], level))
        evo_id, evo_level = species[7]
        if evo_id and evo_id not in species_ids:
            problems.append("%s: unbekannte Entwicklung '%s'" % (species[0], evo_id))
        if bool(evo_id) != bool(evo_level):
            problems.append("%s: Entwicklung/Level unvollständig" % species[0])
    for table in TABLES:
        for species_id, weight, lo, hi in table[5]:
            if species_id not in species_ids:
                problems.append("%s: unbekannte Art '%s'" % (table[0], species_id))
            if lo > hi:
                problems.append("%s: min_level > max_level bei '%s'" % (
                    table[0], species_id))
    if problems:
        raise SystemExit("Inhaltsfehler:\n  " + "\n  ".join(problems))


if __name__ == "__main__":
    validate()
    gen_moves()
    gen_species()
    gen_items()
    gen_tables()
    print("Generiert: %d Attacken, %d Arten, %d Items, %d Zonen." % (
        len(MOVES), len(SPECIES), len(ITEMS), len(TABLES)))
