#!/usr/bin/env python3
"""Write plugin/data/charts tests.txt, Corsair Charts' in-game tests (run.sh runs them).

    python3 mods/corsair_charts/test/ingame/make_tests.py

Saves carry whole ship definitions (a ship in a save copies nothing from its
model), taken from this plugin's test ships and from the mod's data, so run it
again after tools/gen.py changes the prototypes. The mod's saved state is
written into the saves' "mod data" in the game's encoding.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(MOD, "tools"))
import esdata  # noqa: E402
import gen  # noqa: E402

TEST_SHIPS = '''ship "Charts Test Barge"
	sprite "ship/star barge"
	thumbnail "thumbnail/star barge"
	attributes
		category "Light Freighter"
		cost 190000
		mass 70
		bunks 20
		"cargo space" 400
		drag 2.1
		"engine capacity" 400
		"fuel capacity" 600
		"heat dissipation" 0.8
		hull 50000
		shields 50000
		"outfit space" 2000
		"required crew" 1
		"weapon capacity" 600
		thrust 60
		turn 900
		"energy generation" 40
		"energy capacity" 20000
		cooling 60
	outfits
		Hyperdrive
	engine -9 38 1
	engine 9 38 1
	gun -8 -20
	gun 8 -20
	gun -12 -10
	gun 12 -10
	gun -16 0
	gun 16 0
	turret 0 -5
	turret 0 5
	turret -5 0
	turret 5 0
	description "A test ship of Corsair Charts' in-game tests."

ship "Charts Test Gunboat"
	sprite "ship/gunboat"
	thumbnail "thumbnail/gunboat"
	attributes
		category "Light Warship"
		cost 1000000
		mass 200
		bunks 10
		"cargo space" 10
		drag 4
		"engine capacity" 200
		"fuel capacity" 600
		"heat dissipation" 0.8
		hull 20000
		shields 20000
		"outfit space" 600
		"required crew" 1
		"weapon capacity" 400
		thrust 50
		turn 900
		"energy generation" 40
		"energy capacity" 20000
		cooling 80
	outfits
		Hyperdrive
		"Heavy Laser Turret" 4
	engine -9 38 1
	engine 9 38 1
	turret -10 0 "Heavy Laser Turret"
	turret 10 0 "Heavy Laser Turret"
	turret 0 -10 "Heavy Laser Turret"
	turret 0 10 "Heavy Laser Turret"
	description "A test ship of Corsair Charts' in-game tests."

ship "Charts Test Pirate"
	sprite "ship/sparrow"
	thumbnail "thumbnail/sparrow"
	attributes
		category "Interceptor"
		cost 100000
		mass 50
		bunks 2
		drag 1
		"fuel capacity" 300
		"heat dissipation" 0.8
		hull 1500
		shields 0
		"outfit space" 30
		"weapon capacity" 10
		"required crew" 1
		"energy capacity" 1000
		"energy generation" 2
		thrust 12
		turn 400
	outfits
		Hyperdrive
		"Energy Blaster"
	engine 0 20 1
	gun 0 -10 "Energy Blaster"
	description "A test ship of Corsair Charts' in-game tests."

fleet "Charts Test Pirates"
	government "Pirate"
	names "pirate"
	personality
		staying
	variant
		"Charts Test Pirate"
'''
TEST_NODES = {}


def parse_text(text):
    path = os.path.join(HERE, ".tmp-ships.txt")
    with open(path, "w") as f:
        f.write(text)
    try:
        return esdata.parse_file(path)
    finally:
        os.remove(path)


for n in parse_text(TEST_SHIPS):
    TEST_NODES[n.toks[1]] = n
for n in esdata.parse_file(os.path.join(MOD, "data", "charts ships.txt")):
    if n.toks[:1] == ["ship"] and len(n.toks) == 2:
        TEST_NODES[n.toks[1]] = n


def enc(t):
    return "".join("%%%02X" % ord(c) if c in '%"`' or ord(c) < 0x20 or ord(c) == 0x7F else c for c in t)


def save_ship(model, name, outfits=None, uuid=None, depth=2, system="Terra Incognita", planet="Ruin"):
    """A whole ship as a save holds it, from the model's definition."""
    n = TEST_NODES[model]
    t = "\t" * depth
    lines = [t + 'ship "%s"' % model, t + '\tname "%s"' % name]
    if uuid:
        lines.append(t + "\tuuid " + uuid)
    for k in n.kids:
        if k.toks[0] == "description":
            continue
        if k.toks[0] == "outfits" and outfits is not None:
            lines.append(t + "\toutfits")
            lines += [t + '\t\t"%s"' % o for o in outfits]
            continue
        lines += [t + "\t" + line for line in k.text().split("\n")]
    a = n.get("attributes")
    lines += [t + "\tcrew %d" % max(1, int(a.num("required crew", 1))), t + "\tfuel %g" % a.num("fuel capacity", 0),
              t + "\tshields %g" % a.num("shields", 0), t + "\thull %g" % a.num("hull", 0), t + '\tsystem "%s"' % system]
    if planet:
        lines.append(t + "\tplanet " + planet)
    return "\n".join(lines)


HDR = '''		pilot Chart Tester
		date 16 11 3013
		system "Terra Incognita"
		planet Ruin
		clearance'''
ACCT = '''		account
			credits 10000000
			score 400
			history
		visited "Terra Incognita"
		"visited planet" Ruin'''


def save(name, parts):
    return 'test-data "%s"\n\tcategory "savegame"\n\tcontents\n' % name + "\n".join([HDR] + parts + [ACCT])


def mod_data(state):
    return '\t\t"mod data"\n\t\t\tcorsair_charts state "%s"' % enc(json.dumps(state, separators=(",", ":")))


def wait(label, cond, ticks=3000):
    """Fly on (a frame a pass) until `cond` holds, at most `ticks` passes; the caller asserts after."""
    return f'''		label {label}
		input
			command none
		apply
			"charts test: {label}" ++
		branch {label}
			not {cond}
			"charts test: {label}" < {ticks}'''


exotics = [e[0] for e in gen.EXOTICS]
protos = [p[0] for p in gen.PROTOTYPES]
L = ["# Generated by make_tests.py: edit that, not this file.", "#",
     "# Corsair Charts in-game tests (run.sh). Load tests (data only, any engine): every",
     "# exotic installs and its attributes reach the ship; every prototype hull loads with",
     "# its built-in quirks. E2E tests (Argosy with the mod API 11 loader and the built mod):",
     "# a pirate the player's escort disables near the flagship transmits a chart; a finale",
     "# cache is placed, boarded and plundered, and the manifest opens the strongbox.", "",
     TEST_SHIPS]

# ---- Exotics ----
L.append(save("Charts Exotics Save", [save_ship("Charts Test Barge", "Exotic Barge", exotics + ["Hyperdrive"])]))
inst = "\n".join('\t\t\t"outfit (installed): %s" == 1' % x for x in exotics)
L.append(f'''test "Charts Exotics Load"
	status active
	description "Every Corsair Charts exotic installs on a ship that loads, and their attributes add up on the flagship (the Phantom Veil's cloak and cloaked firing, the ramscoops of the Tattletale Scoop and the Smugglers' Run Thruster, the Ghost Lattice's jamming, the scan interference of it and the False Bulkhead); it departs and lands."
	sequence
		inject "Charts Exotics Save"
		call "Load First Savegame"
		assert
{inst}
			"flagship attribute: cloak" == 20
			"flagship attribute: cloaked firing" == 4
			"flagship attribute: ramscoop" == 3000
			"flagship attribute: radar jamming" == 6000
			"flagship attribute: scan interference" == 4000
		call "Depart"
		call "Land"
		assert
			"flagship planet: Ruin" == 1
{inst}''')

# ---- Prototypes ----
order = ["Black Kestrel"] + [p for p in protos if p != "Black Kestrel"]
L.append(save("Charts Prototypes Save", [save_ship(p, p + " Prize") for p in order]))
models = "\n".join('\t\t\t"ship model (all): %s" == 1' % p for p in protos)
L.append(f'''test "Charts Prototypes Load"
	status active
	description "The five prototype hulls load as ships of their own models with their built-in quirks (the Black Kestrel, the flagship, cloaks with no device); the fleet departs and lands."
	sequence
		inject "Charts Prototypes Save"
		call "Load First Savegame"
		assert
{models}
			"flagship model: Black Kestrel" == 1
			"flagship attribute: cloak" == 8
			"flagship attribute: cloaking energy" == 7000
		call "Depart"
		call "Land"
		assert
{models}''')

# ---- E2E: the trigger ----
changes = '''		changes
			system "Terra Incognita"
				fleet "Charts Test Pirates" 60'''
trigger_state = {"version": 1, "dice": 1000, "finished": [0, 0, 0, 0], "abandoned": 0, "charts": 0, "found": [], "trail": {"active": False}}
L.append(save("Charts Trigger Save", ['\t\t"reputation with"\n\t\t\tPirate -1000',
                                      save_ship("Charts Test Barge", "Chart Barge"), save_ship("Charts Test Gunboat", "Chart Escort"),
                                      changes, mod_data(trigger_state)]))
L.append(f'''test "Charts Trigger E2E"
	status active
	description "With the Dado loader (mod API 11) and Corsair Charts: pirates jump into Terra Incognita (a system fleet the save adds); the player's escort, ordered to fight the nearest hostile ship, disables or destroys one near the flagship, and the pirate transmits a chart (the saved generator state makes the first roll a drop): a Scorched Star Chart appears in the hold."
	sequence
		inject "Charts Trigger Save"
		call "Load First Savegame"
		assert
			"outfit (cargo): Scorched Star Chart" == 0
		call "Depart"
{wait("settle", '"charts test: never"', 120)}
		label chart
		input
			command nearest
		input
			command fight
		apply
			"charts test: chart" ++
		branch chart
			not "outfit (cargo): Scorched Star Chart"
			"charts test: chart" < 3000
		assert
			"outfit (cargo): Scorched Star Chart" >= 1''')

# ---- E2E: the finale ----
finale_state = {"version": 1, "dice": 0, "finished": [0, 0, 0, 0], "abandoned": 0, "charts": 1, "found": [],
                "trail": {"active": True, "tier": 0, "seed": 5, "origin": "Terra Incognita", "index": 0, "ambush_at": -1,
                          "ambushed": False, "finale_fleet": "Charts Cache 1.1", "proto": "", "placed": 0,
                          "box_items": ["Bilge Siphon", "Corsair Bearer Bond"], "box_counts": [1, 2],
                          "steps": [{"kind": 7, "system": "Terra Incognita", "text": "The chart ends in Terra Incognita.", "hint": "Board it."}]}}
L.append(save("Charts Finale Save", [save_ship("Charts Test Barge", "Chart Barge"), mod_data(finale_state)]))
L.append(f'''test-data "Charts Finale Boarding"
	category mission
	contents
		mission "Charts Test: Boarding"
			invisible
			boarding
			destination Ruin

test "Charts Finale E2E"
	status active
	description "With the Dado loader (mod API 11) and Corsair Charts: an easy trail at its finale in Terra Incognita. Departing places the cache (a derelict); the player boards it and takes what it holds; the manifest opens the strongbox (a Bilge Siphon and 2 bearer bonds, besides the 4 bonds in the cache's hold), and the trail counts as finished."
	sequence
		inject "Charts Finale Boarding"
		inject "Charts Finale Save"
		call "Load First Savegame"
		assert
			"corsair charts: trails finished" == 0
		call "Depart"
{wait("settle", '"charts test: never"', 120)}
		input
			command board
{wait("boarded", '"Charts Test: Boarding: offered"')}
		assert
			"Charts Test: Boarding: offered" == 1
		label plunder
		input
			key t
		apply
			"charts test: plunder" ++
		branch plunder
			not "outfit (cargo): Corsair Manifest"
			"charts test: plunder" < 40
		input
			key t
		input
			key t
		input
			key t
		input
			key d
{wait("opened", '"corsair charts: trails finished"')}
		assert
			"corsair charts: trails finished" == 1
			"outfit (cargo): Bilge Siphon" == 1
			"outfit (cargo): Corsair Bearer Bond" >= 6
			"outfit (cargo): Corsair Manifest" == 0''')

os.makedirs(os.path.join(HERE, "plugin", "data"), exist_ok=True)
with open(os.path.join(HERE, "plugin", "data", "charts tests.txt"), "w") as f:
    f.write("\n\n".join(L) + "\n")
with open(os.path.join(HERE, "plugin", "plugin.txt"), "w") as f:
    f.write('name "Corsair Charts tests"\nabout "In-game tests for Corsair Charts (mods/corsair_charts/test/ingame)."\n')
print("wrote plugin/data/charts tests.txt")
