#!/usr/bin/env python3
"""Compare Corsair Charts' exotics and prototype hulls with their closest stock
equivalents, from the stock data ($ES_DATA, default /root/fork/argosy/data)
and the generated data/charts *.txt. Prints one block per item: the numbers
DESIGN.md's "Niche" lines rest on (per second, per ton of outfit space).

    python3 mods/corsair_charts/tools/niche.py
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import esdata  # noqa: E402

STOCK = esdata.index(esdata.load(), "outfit")
STOCK_SHIPS = esdata.index(esdata.load(), "ship")
MOD = {}
MOD_SHIPS = {}
for f in ("charts outfits.txt", "charts ships.txt"):
    for n in esdata.parse_file(os.path.join(HERE, "..", "data", f)):
        if n.toks[:1] == ["outfit"] and len(n.toks) == 2:
            MOD[n.toks[1]] = n
        if n.toks[:1] == ["ship"] and len(n.toks) == 2:
            MOD_SHIPS[n.toks[1]] = n

# exotic -> stock outfits it is measured against
REFS = {
    "Bilge Siphon": ["Energy Blaster", "S-270 Regenerator", "Pulse Cannon"],
    "Tattletale Scoop": ["Ramscoop", "Catalytic Ramscoop", "Cargo Scanner", "Surveillance Pod"],
    "False Bulkhead": ["Cargo Expansion", "Interference Plating"],
    "Leech Turret": ["Pulse Turret", "Heavy Laser Turret", "D67-TM Shield Generator"],
    "Tollkeeper Ion Repeater": ["Pulse Cannon", "Ion Cannon", "Fuel Processor"],
    "Ghost Lattice": ["Decoy Plating", "Large Radar Jammer", "Interference Plating", "Cooling Ducts"],
    "Smugglers' Run Thruster": ["X3700 Ion Thruster", "Volcano Afterburner", "Ramscoop"],
    "Blackwake Broadside": ["Particle Cannon", "Plasma Cannon", "Small Nanite Fabricator"],
    "Mutineer's Heart": ["Breeder Reactor", "Fusion Reactor", "D67-TM Shield Generator"],
    "Graverobber's Coil": ["Small Recovery Module", "Small Nanite Fabricator", "Systems Core (Small)"],
    "Deadeye Lance": ["Electron Beam", "Heavy Laser", "Sunbeam"],
    "Widow's Kiss": ["Plasma Cannon", "Particle Cannon", "Ion Cannon"],
    "Black Flag Reaver": ["Plasma Turret", "Electron Turret", "Thrasher Turret"],
    "Phantom Veil": ["Cloaking Device"],
}
PROTO_REFS = {"Sirocco": "Argosy", "Nightjar": "Raven", "Black Kestrel": "Kestrel", "Hellion": "Vanguard", "Matriarch": "Bactrian"}

KEYS = ["outfit space", "mass", "cost", "ramscoop", "cargo space", "cargo scan power", "outfit scan power", "scan interference",
        "radar jamming", "optical jamming", "cooling", "thrust", "afterburner thrust", "energy generation", "heat generation",
        "shield generation", "shield energy", "hull repair rate", "hull energy", "cloak", "cloaked firing", "cloaking energy"]
PER_SECOND = {"shield generation", "shield energy", "hull repair rate", "hull energy", "energy generation", "heat generation",
              "ramscoop", "cooling", "cloaking energy"}


def row(name, n):
    out = {}
    for k in KEYS:
        v = n.num(k, None) if n.get(k) is not None else None
        if v is None:
            continue
        if k in PER_SECOND:
            v *= 60
        out[k] = v
    w = n.get("weapon")
    if w is not None:
        reload = w.num("reload", 1) or 1
        burst = w.num("burst count", 1)
        rate = 60 / reload
        for k in ("shield damage", "hull damage", "ion damage", "heat damage", "relative hull damage", "firing energy",
                  "firing heat", "firing shields", "firing hull", "firing fuel"):
            v = w.num(k, None) if w.get(k) is not None else None
            if v is not None:
                out[k + "/s"] = round(v * rate, 3)
        vel, life = w.num("velocity", 0), w.num("lifetime", 0)
        out["range"] = round(vel * life, 1)
    space = -n.num("outfit space", 0)
    s = ", ".join(f"{k} {v:g}" for k, v in out.items() if k not in ("outfit space",))
    return f"  {name:30s} space {space:>4g}: {s}"


def ship_row(name, n):
    a = n.get("attributes")
    keys = ["cost", "shields", "hull", "required crew", "cargo space", "outfit space", "weapon capacity", "engine capacity",
            "heat dissipation", "energy generation", "shield generation", "hull repair rate", "cloak", "jump drive", "ramscoop",
            "afterburner thrust", "radar jamming", "scan interference"]
    vals = [(k, a.num(k, None)) for k in keys if a.get(k) is not None]
    return f"  {name:16s} " + ", ".join(f"{k} {v:g}" for k, v in vals)


def main():
    for ex, refs in REFS.items():
        print(ex)
        print(row("* " + ex, MOD[ex]))
        for r in refs:
            print(row(r, STOCK[r]))
    print("\nPrototype hulls")
    for p, base in PROTO_REFS.items():
        print(ship_row("* " + p, MOD_SHIPS[p]))
        print(ship_row(base, STOCK_SHIPS[base]))


if __name__ == "__main__":
    main()
