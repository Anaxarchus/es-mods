#!/usr/bin/env python3
"""Generate Corsair Charts' data files and its code tables from one place.

    python3 mods/corsair_charts/tools/gen.py

Writes data/charts outfits.txt, data/charts ships.txt, data/charts fleets.txt
and src/Tables.dados. The exotics and the prototype hulls start from stock
definitions (read from $ES_DATA, default /root/fork/argosy/data), so their
sprites, thumbnails, sounds, hardpoints and effects are stock ones; only the
listed keys change. Idempotent. See DESIGN.md for the reasoning behind every
number here, and tools/niche.py for the comparison with stock outfits.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import esdata  # noqa: E402

STOCK = esdata.load()
OUT = esdata.index(STOCK, "outfit")
SHIPS = esdata.index(STOCK, "ship")

TIERS = ["easy", "medium", "hard", "elite"]

# ---- Cargo items ----
CLUES = [
    ("Scorched Star Chart", "Scorched Star Charts", 4000,
     "A half-burned navigation chart pulled from a pirate's dying transmission. The coordinates on it lead somewhere, if you can read them."),
    ("Coded Star Chart", "Coded Star Charts", 12000,
     "A pirate chart in a cipher their crews use among themselves. Someone thought it was worth encrypting."),
    ("Bloodied Star Chart", "Bloodied Star Charts", 30000,
     "A chart that a pirate captain kept on their person. The stains are not ink."),
    ("Black Star Chart", "Black Star Charts", 80000,
     "A chart of the kind pirates whisper about: the last route of an infamous captain, to wherever they hid what they took."),
]
FRAGMENT = "Chart Fragment"
MANIFEST = "Corsair Manifest"
BOND = "Corsair Bearer Bond"
BOND_VALUE = 25000

# ---- Exotics: (name, tier, base stock outfit, category, cost, attribute changes, weapon changes, description) ----
# None removes a key. Values are per frame, as the data writes them (x60 per second).
EXOTICS = [
    # Easy
    ("Bilge Siphon", 0, "Energy Blaster", "Guns", 240000,
     {"mass": 10, "outfit space": -12, "weapon capacity": -12},
     {"reload": 10, "shield damage": 9, "hull damage": 6, "firing energy": 6, "firing heat": 16, "firing shields": -5},
     "A pirate engineer's answer to a ship with too little room for a shield generator: a blaster whose return loop bleeds charge back into the firer's shield emitters. Each shot restores a little shielding, even while the generators are still recovering from a hit."),
    ("Tattletale Scoop", 0, "Ramscoop", "Systems", 160000,
     {"mass": 6, "outfit space": -6, "ramscoop": 2.5, "cargo scan power": 12, "cargo scan efficiency": 8,
      "outfit scan power": 6, "outfit scan efficiency": 8},
     None,
     "A ramscoop whose collector field doubles as a crude scanner array, the favourite of pirates who like to know what a freighter carries before they decide to rob it."),
    ("False Bulkhead", 0, "Cargo Expansion", "Systems", 120000,
     {"mass": 6, "outfit space": -15, "cargo space": 18, "scan interference": 1.5, "unplunderable": None},
     None,
     "A smuggler's hidden hold: a section of fake hull plating with cargo racks behind it and a lining that confuses cargo scanners. Customs officers hate these."),
    # Medium
    ("Leech Turret", 1, "Pulse Turret", "Turrets", 900000,
     {"mass": 30, "outfit space": -30, "weapon capacity": -30},
     {"reload": 6, "shield damage": 22, "hull damage": 16, "firing energy": 14, "firing heat": 30, "firing shields": -3.5},
     "Stolen from a Syndicate test range and rebuilt by people who did not read the safety notes: a pulse turret that siphons its own discharge back into the ship's shields. A ship with a few of these heals while it fights."),
    ("Tollkeeper Ion Repeater", 1, "Ion Cannon", "Guns", 520000,
     {"mass": 18, "outfit space": -18, "weapon capacity": -18},
     {"reload": 8, "shield damage": 18, "hull damage": 8, "ion damage": 0.6, "firing energy": 9, "firing heat": 20, "firing fuel": -0.3},
     "Pirates who prey on the long empty routes want a gun that refuels them. This one cracks a little deuterium out of its own ion stream with every shot and returns it to the ship's tanks."),
    ("Ghost Lattice", 1, "Decoy Plating", "Systems", 420000,
     {"mass": 9, "outfit space": -10, "scan interference": 2.5, "radar jamming": 6, "optical jamming": 0.6, "cooling": 6},
     None,
     "A lattice of emitters woven into a ship's skin, copied from wreckage of something that was not built by humans. It spoofs radar, smears optical tracking and confuses scanners, and the emitters double as heat radiators."),
    ("Smugglers' Run Thruster", 1, "X3700 Ion Thruster", "Engines", 380000,
     {"mass": 40, "outfit space": -40, "engine capacity": -40, "thrust": 38, "thrusting energy": 1.8, "thrusting heat": 3.0,
      "afterburner thrust": 45, "afterburner fuel": 0.12, "afterburner heat": 9, "afterburner effect": "afterburner", "ramscoop": 0.5},
     None,
     "An ion thruster rebuilt for runners who cannot afford to be caught: a fuel-injection stage bolted to the nozzle gives it an afterburner, and the intake skims a little hydrogen while it cruises."),
    # Hard
    ("Blackwake Broadside", 2, "Particle Cannon", "Guns", 1800000,
     {"mass": 34, "outfit space": -34, "weapon capacity": -34},
     {"reload": 22, "shield damage": 70, "hull damage": 85, "firing energy": 40, "firing heat": 140, "firing hull": -6, "hit force": 60},
     "The signature gun of Captain Ysolde Blackwake, who boasted that her ship never needed a drydock. Its recoil dampers feed nanite slurry into the hull with every shot: while it fires, it mends the ship that carries it."),
    ("Mutineer's Heart", 2, "Breeder Reactor", "Power", 5200000,
     {"mass": 70, "outfit space": -70, "energy generation": 14, "heat generation": 36, "shield generation": 0.8, "shield energy": 0.4},
     None,
     "A reactor torn out of a Navy cruiser by the crew that mutinied on it. Its containment field was designed to double as an emergency shield emitter, and it does both, efficiently."),
    ("Graverobber's Coil", 2, "Small Recovery Module", "Systems", 1500000,
     {"mass": 22, "outfit space": -24, "hull repair rate": 0.7, "hull energy": 0.35, "hull heat": 0.1,
      "shield generation": 0.7, "shield energy": 0.35, "shield heat": 0.3},
     None,
     "Salvaged from a hospital ship that pirates looted and left to drift: a recovery coil that knits hull and shields together at half the energy of anything the shipyards sell."),
    ("Deadeye Lance", 2, "Electron Beam", "Guns", 2400000,
     {"mass": 30, "outfit space": -36, "weapon capacity": -36},
     {"velocity": 900, "shield damage": 3.0, "hull damage": 3.6, "firing energy": 3.4, "firing heat": 7},
     "A beam lens ground by a sniper who called herself Deadeye. It focuses an electron beam to twice the range of any beam a human shipyard sells, so that her victims never saw where the shot came from."),
    # Elite
    ("Widow's Kiss", 3, "Plasma Cannon", "Guns", 9000000,
     {"mass": 30, "outfit space": -30, "weapon capacity": -30},
     {"reload": 15, "shield damage": 30, "hull damage": 20, "relative hull damage": 0.006, "heat damage": None,
      "firing energy": 40, "firing heat": 90},
     "The gun that ended the Kestrel Wars, or so pirates say. Its bolts carry a resonance tuned to hull lattices, so the bigger the ship it hits, the more it tears away: a few of these will gut a battleship."),
    ("Black Flag Reaver", 3, "Plasma Turret", "Turrets", 12000000,
     {"mass": 60, "outfit space": -60, "weapon capacity": -60, "required crew": 2},
     {"reload": 6, "shield damage": 45, "hull damage": 40, "heat damage": None, "firing energy": 30, "firing heat": 70,
      "firing shields": -6, "firing hull": -2},
     "The turret of the pirate fleet's most feared flagship, the Black Flag. It drinks the energy of its own shots back into the ship's shields and hull, so the longer a fight lasts, the less it matters what you hit it with."),
    ("Phantom Veil", 3, "Cloaking Device", "Systems", 15000000,
     {"mass": 15, "outfit space": -25, "cloak": 0.02, "cloaked firing": 0.004, "cloaking energy": 3, "cloaking fuel": 0.2,
      "cloaked regen multiplier": -0.5, "cloaked repair multiplier": -0.5},
     None,
     "A stolen prototype of a cloak that does not drop when its ship fires. Each shot thins it a little, but a ship wearing it can kill from nowhere and vanish again. Nothing like it has ever been sold."),
]

# ---- Prototype hulls: (name, tier, base stock ship, facility lore, attribute changes, ship-level changes, description) ----
PROTOTYPES = [
    ("Sirocco", 2, "Argosy", "Southbound Shipyards' R&D bench on Tarazed",
     {"cost": 2900000, "cargo space": 165, "hull": 2400, "required crew": 3, "ramscoop": 2, "scan interference": 2.5,
      "cargo scan power": 20, "cargo scan efficiency": 10},
     "A prototype of the Argosy that Southbound's research bench built for an unnamed client and that never arrived: a freighter-raider with a larger hold, a ramscoop worked into its hull and a skin that blinds cargo scanners. It was stolen from the bench the night before its trials."),
    ("Nightjar", 2, "Raven", "Lionheart Industries' experimental yard",
     {"cost": 3100000, "shields": 4500, "afterburner thrust": 60, "afterburner fuel": 0.3, "afterburner heat": 14,
      "afterburner effect": "afterburner", "radar jamming": 4, "required crew": 4},
     "A Raven that Lionheart's experimental yard fitted with a built-in afterburner and a radar-jamming skin, meant as a Navy courier. Pirates took it from the test range with the test pilot still aboard."),
    ("Black Kestrel", 3, "Kestrel", "a black-site Kestrel line on Tarazed",
     {"cost": 24000000, "shields": 17500, "required crew": 40, "cloak": 0.008, "cloaking energy": 7, "cloaking fuel": 0.3,
      "cloaked regen multiplier": -1, "cloaked repair multiplier": -1},
     "A Kestrel from a line that does not officially exist: its hull is woven through with cloaking emitters, so it needs no device to vanish. Its automated systems need a much smaller crew. It disappeared from the black site in the only way it could."),
    ("Hellion", 3, "Vanguard", "the Syndicate's weapons-integration yard",
     {"cost": 14000000, "weapon capacity": 280, "outfit space": 640, "energy generation": 6, "shield generation": 1.5,
      "heat dissipation": 0.35, "required crew": 18},
     "The Syndicate built this Vanguard to see how many guns a warship could carry before it melted. A reactor and a shield emitter were built into its frame to make room. The answer turned out to be more than the Syndicate wanted pirates to have."),
    ("Matriarch", 3, "Bactrian", "Lionheart's deep-space carrier program",
     {"cost": 30000000, "cargo space": 400, "required crew": 50, "jump drive": 1, "jump fuel": 200, "jump speed": 0.25,
      "hull repair rate": 1.2, "hull energy": 0.6, "shield generation": 2, "shield energy": 2},
     "Lionheart's answer to a carrier that could go anywhere: a Bactrian with a jump drive and self-repair systems built into its keel. The prototype was hijacked on its maiden jump, and its makers have been looking for it ever since."),
]

# ---- Cache hulls (not prototypes), uncapturable: (variant base, tier) ----
CACHE_HULLS = {
    0: ["Freighter", "Clipper", "Hauler"],
    1: ["Argosy", "Bounder", "Hauler"],
    2: ["Behemoth", "Bulk Freighter", "Marauder Firebird"],
    3: ["Marauder Leviathan", "Marauder Falcon", "Behemoth"],
}
# What the cache's hold carries, by tier: bonds and high-value commodities.
CACHE_HOLD = {
    0: (4, [("Luxury Goods", 12), ("Electronics", 8)]),
    1: (10, [("Luxury Goods", 20), ("Heavy Metals", 15), ("Medical", 10)]),
    2: (20, [("Luxury Goods", 40), ("Heavy Metals", 30), ("Electronics", 20)]),
    3: (48, [("Luxury Goods", 60), ("Heavy Metals", 40), ("Electronics", 40), ("Medical", 30)]),
}
# Bonds a hot/cold cache gives, by tier.
SCAN_BONDS = [1, 2, 4, 8]

# ---- Couriers, guards and rivals ----
COURIER_HULL = ["Sparrow", "Quicksilver (Proton)", "Headhunter (Strike)", "Firebird (Plasma)"]
COURIER_ESCORTS = [[], ["Fury (Bomber)"], ["Splinter (Laser)", "Splinter (Laser)"], ["Manta (Proton)", "Manta (Proton)", "Marauder Leviathan"]]
GUARDS = {2: ["Firebird (Plasma)", "Splinter (Laser)", "Splinter (Laser)"],
          3: ["Marauder Falcon", "Marauder Leviathan", "Marauder Manta", "Marauder Manta"]}
RIVALS = {2: ["Marauder Firebird", "Marauder Raven"],
          3: ["Marauder Leviathan", "Marauder Firebird", "Marauder Firebird"]}

# ---- Reward tables (DESIGN.md "Rewards") ----
# Finale hull: (kind, name or index, weight); "cache" k = CACHE_HULLS[tier][k], "proto" = prototype name.
FINALE = {
    0: [("cache", 0, 1), ("cache", 1, 1), ("cache", 2, 1)],
    1: [("cache", 0, 1), ("cache", 1, 1), ("cache", 2, 1)],
    2: [("cache", 0, 3), ("cache", 1, 3), ("cache", 2, 2), ("proto", "Sirocco", 1), ("proto", "Nightjar", 1)],
    3: [("cache", 0, 2), ("cache", 1, 2), ("cache", 2, 1), ("proto", "Black Kestrel", 2), ("proto", "Hellion", 2),
        ("proto", "Matriarch", 2), ("proto", "Sirocco", 1), ("proto", "Nightjar", 1)],
}
# Strongbox: rolls per tier, and entries (kind, what, count, weight): "exotic" t = a random exotic of tier t,
# "item" = a stock outfit, "bonds" = bearer bonds.
STRONGBOX_ROLLS = [1, 1, 2, 2]
STRONGBOX = {
    0: [("exotic", 0, 1, 55), ("bonds", "", 2, 45)],
    1: [("exotic", 1, 1, 70), ("exotic", 0, 1, 20), ("bonds", "", 4, 10)],
    2: [("exotic", 2, 1, 60), ("exotic", 1, 1, 25), ("item", "NDR-114 Android", 2, 15)],
    3: [("exotic", 3, 1, 45), ("exotic", 2, 1, 25), ("item", "Cloaking Device", 1, 15), ("item", "NDR-114 Android", 3, 15)],
}


def q(s):
    return '`' + s + '`' if '"' in s else '"' + s + '"'


def fmt(v):
    if isinstance(v, str):
        return q(v)
    if isinstance(v, float):
        s = ("%.6f" % v).rstrip("0").rstrip(".")
        return s
    return str(v)


def node_lines(node, depth=0):
    yield "\t" * depth + node.raw
    for k in node.kids:
        yield from node_lines(k, depth + 1)


def apply_changes(kids, changes, depth):
    """Rewrite a list of child nodes: keys in `changes` are replaced (or removed with None), the rest added."""
    out, done = [], set()
    for k in kids:
        key = k.toks[0] if k.toks else ""
        if key in changes:
            done.add(key)
            if changes[key] is None:
                continue
            out.append("\t" * depth + q(key) + " " + fmt(changes[key]))
        else:
            out.extend(node_lines(k, depth))
    for key, v in changes.items():
        if key not in done and v is not None:
            out.append("\t" * depth + q(key) + " " + fmt(v))
    return out


def outfit_text(name, base, category, cost, attrs, weapon, desc):
    n = OUT[base]
    lines = ["outfit " + q(name)]
    lines.append("\tcategory " + q(category))
    lines.append("\tcost " + str(cost))
    lines.append("\tplural " + q(name if name.endswith("s") else name + "s"))
    skip = {"category", "cost", "description", "licenses", "series", "index", "unique", "plural", "display name"}
    kids = [k for k in n.kids if k.toks and k.toks[0] not in skip and k.toks[0] != "weapon"]
    lines += apply_changes(kids, attrs, 1)
    w = n.get("weapon")
    if w is not None:
        lines.append("\tweapon")
        lines += apply_changes(w.kids, weapon or {}, 2)
    lines.append("\tdescription " + q(desc))
    return "\n".join(lines)


def item_text(name, plural, cost, thumb, desc, mass=0):
    return "\n".join([
        "outfit " + q(name),
        '\tcategory "Special"',
        "\tplural " + q(plural),
        "\tcost " + str(cost),
        "\tthumbnail " + q(thumb),
        '\t"mass" ' + fmt(mass),
        '\t"installable" -1',
        "\tdescription " + q(desc),
    ])


def proto_text(name, base, lore, attrs, desc):
    n = SHIPS[base]
    lines = ["ship " + q(name)]
    for k in n.kids:
        key = k.toks[0]
        if key == "attributes":
            lines.append("\tattributes")
            a = dict(attrs)
            a.setdefault("category", None)
            lines += apply_changes(k.kids, {kk: vv for kk, vv in a.items() if kk != "category"}, 2)
        elif key == "description":
            continue
        elif key in ("display name", "plural", "noun"):
            continue
        else:
            lines.extend(node_lines(k, 1))
    lines.append("\tdescription " + q(desc + " (Lost from " + lore + ".)"))
    return "\n".join(lines)


def cargo_space(base, attrs=None):
    if attrs and "cargo space" in attrs:
        return attrs["cargo space"]
    return SHIPS[base].get("attributes").num("cargo space")


def cargo_block(bonds, commodities, depth=1, manifest=True, space=None):
    """A ship's `cargo` node; the commodities are scaled down to fit `space` tons."""
    t = "\t" * depth
    total = sum(n for _, n in commodities)
    if space is not None and total > space:
        commodities = [(c, int(n * space / total)) for c, n in commodities]
        commodities = [(c, n) for c, n in commodities if n > 0]
    lines = [t + "cargo", t + "\toutfits"]
    if manifest:
        lines.append(t + "\t\t" + q(MANIFEST) + " 1")
    if bonds:
        lines.append(t + "\t\t" + q(BOND) + " " + str(bonds))
    if commodities:
        lines.append(t + "\tcommodities")
        for c, n in commodities:
            lines.append(t + "\t\t" + q(c) + " " + str(n))
    return lines


def main():
    for t in range(4):
        for base in CACHE_HULLS[t] + [COURIER_HULL[t]] + COURIER_ESCORTS[t] + GUARDS.get(t, []) + RIVALS.get(t, []):
            assert base in SHIPS or any(n.toks[:1] == ["ship"] and len(n.toks) == 3 and n.toks[2] == base for n in STOCK), base
    for e in EXOTICS:
        assert e[2] in OUT, e[2]
    for p in PROTOTYPES:
        assert p[2] in SHIPS, p[2]
    for t, rows in STRONGBOX.items():
        for kind, what, _, _ in rows:
            if kind == "item":
                assert what in OUT, what

    hdr = "# Generated by tools/gen.py: edit that, not this file.\n\n"
    # ---- Outfits ----
    parts = []
    for k, (name, plural, cost, desc) in enumerate(CLUES):
        parts.append(item_text(name, plural, cost, "outfit/map", desc))
    parts.append(item_text(FRAGMENT, FRAGMENT + "s", 1000, "outfit/unknown",
                           "A torn strip of a pirate chart, carried by a courier. It holds the next leg of a treasure trail."))
    parts.append(item_text(MANIFEST, MANIFEST + "s", 1000, "outfit/unknown",
                           "The manifest of a pirate's hidden cache, and the key to its strongbox."))
    parts.append(item_text(BOND, BOND + "s", BOND_VALUE, "outfit/harvested gold",
                           "A bearer bond from a bank that asks no questions, payable to whoever holds it. Any outfitter will cash it at face value."))
    for name, tier, base, cat, cost, attrs, weapon, desc in EXOTICS:
        parts.append(outfit_text(name, base, cat, cost, attrs, weapon, desc))
    write("data/charts outfits.txt", hdr + "\n\n".join(parts) + "\n")

    # ---- Ships ----
    parts = []
    for name, tier, base, lore, attrs, desc in PROTOTYPES:
        parts.append(proto_text(name, base, lore, attrs, desc))
    for t in range(4):
        bonds, com = CACHE_HOLD[t]
        for k, base in enumerate(CACHE_HULLS[t]):
            parts.append("\n".join(["ship " + q(base) + " " + q(cache_variant(t, k)), "\tuncapturable"] + cargo_block(bonds, com, space=cargo_space(base))))
    for name, tier, base, lore, attrs, desc in PROTOTYPES:
        bonds, com = CACHE_HOLD[tier]
        parts.append("\n".join(["ship " + q(name) + " " + q(name + " (Charts Cache)")]
                                + cargo_block(bonds, com, space=cargo_space(base, attrs))))
    for t in range(4):
        # A variant's base must be a model: a stock variant's loadout is copied onto its model.
        model, kids = variant_source(COURIER_HULL[t])
        lines = ["ship " + q(model) + " " + q(courier_variant(t)), "\tuncapturable"]
        for k in kids:
            if k.toks and k.toks[0] not in ("uncapturable", "cargo"):
                lines.extend(node_lines(k, 1))
        lines += ["\tcargo", "\t\toutfits", "\t\t\t" + q(FRAGMENT) + " 1"]
        parts.append("\n".join(lines))
    write("data/charts ships.txt", hdr + "\n\n".join(parts) + "\n")

    # ---- Fleets ----
    parts = []

    def fleet(name, gov, personality, ships, names="charts corsair"):
        lines = ["fleet " + q(name), "\tgovernment " + q(gov), "\tnames " + q(names), "\tpersonality", "\t\t" + personality, "\tvariant 1"]
        counts = {}
        for s in ships:
            counts[s] = counts.get(s, 0) + 1
        for s, c in counts.items():
            lines.append("\t\t" + q(s) + ("" if c == 1 else " " + str(c)))
        parts.append("\n".join(lines))

    for t in range(4):
        for k in range(len(CACHE_HULLS[t])):
            fleet(cache_fleet(t, k), "Charts Derelict", "derelict mute", [cache_variant(t, k)], "charts wreck")
    for name, tier, *_ in PROTOTYPES:
        fleet(proto_fleet(name), "Charts Derelict", "derelict mute", [name + " (Charts Cache)"], "charts wreck")
    for t in range(4):
        fleet(courier_fleet(t), "Charts Corsair", "staying coward target", [courier_variant(t)] + COURIER_ESCORTS[t], "charts courier")
    for t, ships in GUARDS.items():
        fleet(guard_fleet(t), "Charts Corsair", "staying daring", ships)
    for t, ships in RIVALS.items():
        fleet(rival_fleet(t), "Charts Rival", "daring hunting nemesis", ships)
    write("data/charts fleets.txt", hdr + "\n\n".join(parts) + "\n")

    write_tables()


def variant_source(name):
    """(model, child nodes to copy) for a stock model or a stock variant."""
    if name in SHIPS:
        return name, []
    for n in STOCK:
        if n.toks[:1] == ["ship"] and len(n.toks) == 3 and n.toks[2] == name:
            return n.toks[1], n.kids
    raise KeyError(name)


def cache_variant(t, k):
    return f"{CACHE_HULLS[t][k]} (Charts Cache {t + 1})"


def cache_fleet(t, k):
    return f"Charts Cache {t + 1}.{k + 1}"


def proto_fleet(name):
    return f"Charts Prototype {name}"


def courier_variant(t):
    return f"{COURIER_HULL[t].split(' (')[0]} (Charts Courier)"


def courier_fleet(t):
    return f"Charts Courier {t + 1}"


def guard_fleet(t):
    return f"Charts Guard {t + 1}"


def rival_fleet(t):
    return f"Charts Rival {t + 1}"


def dstr(v):
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'


def dlist(vals, kind):
    if kind == "string":
        return "[" + ", ".join(dstr(v) for v in vals) + "]"
    return "[" + ", ".join(str(v) for v in vals) + "]"


def write_tables():
    L = ["class Tables", "",
         "// Corsair Charts' names and reward tables, generated by tools/gen.py from the",
         "// same lists that write the data files: edit that, not this file.", ""]

    def field(kind, name, vals):
        L.append(f"[]{kind} {name} = {dlist(vals, kind)}")

    def field2(kind, name, rows):
        inner = ", ".join(dlist(r, kind) for r in rows)
        L.append(f"[][]{kind} {name} = [{inner}]")

    field("string", "clues", [c[0] for c in CLUES])
    L.append(f"string fragment = {dstr(FRAGMENT)}")
    L.append(f"string manifest = {dstr(MANIFEST)}")
    L.append(f"string bond = {dstr(BOND)}")
    L.append(f"int bond_value = {BOND_VALUE}")
    field("int", "scan_bonds", SCAN_BONDS)
    L.append("// The exotics (the collection log), and the tier each belongs to.")
    field("string", "exotics", [e[0] for e in EXOTICS])
    field("int", "exotic_tier", [e[1] for e in EXOTICS])
    L.append("// The prototype hulls, their tiers, and where they were stolen from.")
    field("string", "prototypes", [p[0] for p in PROTOTYPES])
    field("int", "prototype_tier", [p[1] for p in PROTOTYPES])
    field("string", "prototype_lore", [p[3] for p in PROTOTYPES])
    L.append("// Couriers (disable and board), finale guards and rivals, by tier (\"\" for none).")
    field("string", "courier_fleets", [courier_fleet(t) for t in range(4)])
    field("string", "guard_fleets", [guard_fleet(t) if t in GUARDS else "" for t in range(4)])
    field("string", "rival_fleets", [rival_fleet(t) if t in RIVALS else "" for t in range(4)])
    L.append("// The finale: per tier, the fleets the cache can be, their weights, and the")
    L.append("// prototype each is (\"\" for an ordinary cache hull).")
    field2("string", "finale_fleets", [[cache_fleet(t, w) if k == "cache" else proto_fleet(w) for k, w, _ in FINALE[t]] for t in range(4)])
    field2("int", "finale_weights", [[wt for _, _, wt in FINALE[t]] for t in range(4)])
    field2("string", "finale_protos", [["" if k == "cache" else w for k, w, _ in FINALE[t]] for t in range(4)])
    L.append("// The strongbox: rolls per tier, and per tier its entries: kind (0 an exotic")
    L.append("// of tier `what_tier`, 1 a stock outfit `what`, 2 bonds), count and weight.")
    field("int", "strongbox_rolls", STRONGBOX_ROLLS)
    kinds = {"exotic": 0, "item": 1, "bonds": 2}
    field2("int", "box_kind", [[kinds[r[0]] for r in STRONGBOX[t]] for t in range(4)])
    field2("int", "box_tier", [[r[1] if r[0] == "exotic" else 0 for r in STRONGBOX[t]] for t in range(4)])
    field2("string", "box_item", [[r[1] if r[0] == "item" else "" for r in STRONGBOX[t]] for t in range(4)])
    field2("int", "box_count", [[r[2] for r in STRONGBOX[t]] for t in range(4)])
    field2("int", "box_weight", [[r[3] for r in STRONGBOX[t]] for t in range(4)])
    L.append("// What a cache's hold carries, by tier (for the summary): bonds.")
    field("int", "hold_bonds", [CACHE_HOLD[t][0] for t in range(4)])
    write("src/Tables.dados", "\n".join(L) + "\n")


def write(rel, text):
    path = os.path.join(MOD, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print("wrote", rel)


if __name__ == "__main__":
    main()
