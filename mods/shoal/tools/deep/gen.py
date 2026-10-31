#!/usr/bin/env python3
# The Shoal 0.5.0, "The Deep" (DESIGN.md section 22): generates the region past
# the black hole at the centre of Breakers' Rest, and everything that depends
# on how deep a system lies. Every number below is a knob: change it, run this
# again (it rewrites its outputs whole), then the checks in README.md.
#
#	python3 tools/deep/gen.py [--image]
#
# Writes:
#	data/shoal deep.txt          the galaxy, the hub (The Sounding, Breakers'
#	                             Haven, The Upwell), the deep systems, their
#	                             hulks, hazards and lanes, the two wormholes
#	data/shoal deep wardens.txt  the deeper tiers' Warden weapon copies, hulls
#	                             and fleets (tier 1 is in shoal ships/fleets)
#	data/shoal deep jobs.txt     the Breakers' jobs, one per target system
#	src/Deep.dados               the same map and tier tables, for the code
#	images/ui/shoal deep.jpg     (with --image) the region's map background
#
# Depth is the number of jumps from the hub; a system's tier is its band of
# depth (TIERS). The map is drawn so that depth grows in one direction, a
# slope from the hub down to the Abyss; lanes join only neighbouring depths
# (or the same depth), so a system's depth is exactly the jumps from the hub.
import math, os, random, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.normpath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(MOD, "data")
SEED = 5005

# ---- Places ----
REST = "~The Shoal"            # Breakers' Rest (true name kept for old saves)
HUB = "~~Shoal The Sounding"   # every deep system sorts after "~The Shoal"
HUB_NAME = "The Sounding"
HAVEN = "Breakers' Haven"
MAW = "The Maw"                # Breakers' Rest -> the hub
UPWELL = "The Upwell"          # the hub -> Breakers' Rest
PREFIX = "~~Shoal "
CENTER = (-2600.0, -1450.0)    # the hub, far north-west of the charted map
SLOPE = math.radians(200.0)    # the direction depth grows in (map y points down)

# ---- Depths: how many systems at each depth (jumps from the hub) ----
COUNTS = {1: 4, 2: 6, 3: 6, 4: 6, 5: 6, 6: 5, 7: 4, 8: 2}
RING = 64.0       # map distance per jump of depth
MIN_SEP = 46.0    # no two systems closer than this
JUMP_RANGE = 40   # "jump range" of every deep system: jump drives reach no further than the lanes

# ---- Tiers: bands of depth ----
# index 0 is the hub; 1..4 the Shallows, the Drift, the Fathoms, the Abyss.
TIER_OF_DEPTH = {0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4}
TIER_NAMES = ["the Sounding", "the Shallows", "the Drift", "the Fathoms", "the Abyss"]
# Shown when a run first sinks into a tier.
TIER_TEXT = [
	"",
	"The water past the Sounding is shallow and cold, and full of wrecks.",
	"You sink into the Drift. The stars here are dimmer, and the wrecks are older.",
	"You sink into the Fathoms. Something down here is awake.",
	"You sink into the Abyss. Nothing the Breakers know of has come back from here twice.",
]
# Heat a second is multiplied by this in a system of the tier.
HEAT_MULT = [0.5, 1.0, 1.15, 1.3, 1.5]
# Wreck fleets placed the first time a run reaches a system (never again that run).
SEED_WRECKS = [
	["Shoal Wrecks"],
	["Shoal Wrecks", "Shoal Wrecks", "Shoal Glass Wrecks"],
	["Shoal Wrecks", "Shoal Glass Wrecks", "Shoal Rich Wrecks"],
	["Shoal Glass Wrecks", "Shoal Rich Wrecks", "Shoal Rich Wrecks"],
	["Shoal Rich Wrecks", "Shoal Rich Wrecks", "Shoal Abyss Wreck"],
]
# And a deep wreck (Deep Lattice, always an exotic) with this chance, in percent.
SEED_DEEP = [0, 0, 10, 35, 50]
# Restless wreck spawns placed with them.
SEED_RESTLESS = [1, 1, 2, 2, 3]
# Wardens that keep the system: placed on every arrival (each with its chance in percent).
RESIDENTS = [[], [], [("Shoal Warden Pickets 2", 50)], [("Shoal Warden Pickets 3", 100), ("Shoal Warden Hunters 3", 40)],
	[("Shoal Warden Hunters 4", 100), ("Shoal Warden Pickets 4", 60)]]
# The suffix of the tier's warden fleets (the hub sends tier 1, and only pickets).
FLEET_SUFFIX = ["", "", " 2", " 3", " 4"]

# Stars by tier (their "wind" feeds ramscoops) and the system's ramscoop
# multiplier: deeper is dimmer, and fuel matters.
STARS = [["star/m5"], ["star/k-dwarf", "star/m8", "star/m-dwarf"], ["star/m-dwarf", "star/l-dwarf"],
	["planet/browndwarf-l", "star/neutron"], ["star/neutron-small", "star/twilight-black-hole"]]
RAMSCOOP = [1.0, 0.8, 0.5, 0.6, 0.6]
HAZE = ["_menu/haze-black", "_menu/haze-twilight-thin", "_menu/haze-blackbody", "_menu/haze-coal", "_menu/haze-coal"]
# Glass geodes and plain rock, by tier: (geodes, small rock, medium metal).
ROCKS = [(6, 10, 6), (14, 16, 12), (12, 12, 12), (10, 10, 10), (8, 8, 8)]
# Hulks (inhabited, never landable) on the rim, where placed fleets gather.
HULKS = [2, 2, 2, 3, 3]

# ---- Hazards (system-wide, so they find you anywhere), by tier ----
# (name stem, from tier, period by tier (1 in N frames to start), definition by tier)
def squall(t):
	return {"duration": (300, 1100), "strength": (1, 2), "effect": ("ion hazard", 6 * t),
		"weapon": {"ion damage": 0.15 * t, "scrambling damage": 0.2 * t, "shield damage": 1.5 * t}}
def vents(t):
	return {"duration": (1, 200), "strength": (0.25, 1.75),
		"weapon": {"relative heat damage": 0.00005 * t}}
def radiation(t):
	return {"duration": (300, 900), "strength": (1, 1.5), "effect": ("nano spark", 2 * t),
		"weapon": {"relative shield damage": 0.0004 * (t - 2), "fuel damage": 0.02 * (t - 2), "energy damage": 1.0 * (t - 2)}}
HAZARDS = [
	("Shoal Squall", 1, {1: 14000, 2: 9000, 3: 7000, 4: 5000}, squall),
	("Shoal Vents", 2, {2: 300, 3: 160, 4: 100}, vents),
	("Shoal Radiation", 3, {3: 9000, 4: 6000}, radiation),
]

# ---- Wardens, by tier (tier 1 is the hand-made data in shoal ships.txt) ----
MODELS = ["Warden Picket", "Warden Lancer", "Warden Bastion", "The Undertow"]
# Over tier 1: shields, hull, shield generation and hull repair (durability),
# and every damage type of their weapons (damage); energy generation and
# cooling grow with damage so they can feed their guns.
DURABILITY = {2: 1.25, 3: 1.55, 4: 1.9}
DAMAGE = {2: 1.1, 3: 1.22, 4: 1.35}
# What they carry by tier (plunderable): Warden Cores, Shoal Glass, Deep Lattice.
LOOT = {
	"Warden Picket": {1: (1, 8, 0), 2: (1, 10, 0), 3: (2, 12, 0), 4: (2, 15, 0)},
	"Warden Lancer": {1: (2, 14, 0), 2: (2, 16, 0), 3: (3, 20, 0), 4: (4, 24, 0)},
	"Warden Bastion": {1: (4, 24, 0), 2: (5, 28, 0), 3: (6, 32, 0), 4: (8, 40, 1)},
	"The Undertow": {1: (6, 30, 3), 2: (7, 34, 3), 3: (8, 40, 4), 4: (10, 50, 5)},
}
WEAPONS = ["Warden Husk-Slice", "Warden Particle Cannon", "Warden Husk-Slice Turret", "Warden Shield Disruptor Turret",
	"Warden Thermal Repeater Turret", "Warden Korath Detainer", "Warden Piercer Missile Launcher", "Warden Piercer Missile"]
# Fleets by tier: (weight, [(model, count)]); "{m}" is the tier's model of that hull.
FLEETS = {
	"Shoal Warden Pickets": {
		1: [(2, [("Warden Picket", 1)]), (1, [("Warden Picket", 2)])],
		2: [(1, [("Warden Picket", 2)])],
		3: [(1, [("Warden Picket", 2)]), (1, [("Warden Picket", 3)])],
		4: [(1, [("Warden Picket", 3)])]},
	"Shoal Warden Hunters": {
		1: [(2, [("Warden Lancer", 1)]), (1, [("Warden Picket", 2)])],
		2: [(1, [("Warden Lancer", 1), ("Warden Picket", 1)])],
		3: [(1, [("Warden Lancer", 2)]), (1, [("Warden Lancer", 1), ("Warden Picket", 2)])],
		4: [(1, [("Warden Lancer", 2), ("Warden Picket", 1)])]},
	"Shoal Warden Phalanx": {
		1: [(1, [("Warden Bastion", 1)])],
		2: [(1, [("Warden Bastion", 1), ("Warden Lancer", 1)])],
		3: [(1, [("Warden Bastion", 1), ("Warden Lancer", 2)])],
		4: [(1, [("Warden Bastion", 1), ("Warden Lancer", 2), ("Warden Picket", 1)])]},
	"Shoal Undertow": {
		1: [(1, [("The Undertow", 1), ("Warden Picket", 1)])],
		2: [(1, [("The Undertow", 1), ("Warden Picket", 2)])],
		3: [(1, [("The Undertow", 1), ("Warden Lancer", 1), ("Warden Picket", 2)])],
		4: [(1, [("The Undertow", 1), ("Warden Lancer", 2)])]},
}

# ---- Names (display names; the true name is PREFIX + name), by tier ----
NAMES = {
	1: ["Kelpwater", "Brinefall", "Lantern Shoal", "Pale Reach", "Saltmere", "Driftglass", "Gullwake", "Low Tide",
		"Cold Shelf", "Shallow Mercy"],
	2: ["Siltmarrow", "Wreckmouth", "Greywater", "The Tangle", "Ebbstone", "Rustcurrent", "Hollow Swell", "Tidegrave",
		"Murkwell", "Barnacle Reach", "Fogbank", "Undercurrent"],
	3: ["Blackwater", "Hadal Gate", "Gloom Shelf", "The Sunken Choir", "Ironsilt", "Coldheart", "Lightless Reach",
		"Pressure Ridge", "Bonefield", "Drowned Lantern", "Midnight Water"],
	4: ["The Trench", "Hadal Floor", "Nadir", "The Last Fathom", "Stillwater", "The Sepulchre"],
}
HULK_KINDS = [
	("planet/station-cylinder-a0-broken", "Drowned Spine", "The broken spine of a hull longer than most stations. Glass has grown over its seams like frost, and its running lights still come on, sometimes, when nothing is near."),
	("planet/station-accelerator-broken", "Hollow Ring", "A ring of fused hulls, welded together by something that was not a welder. Things move inside it."),
	("planet/debris0", "Wreck Reef", "A slowly turning reef of wreckage, too dense to fly through. Something keeps the lights on in its heart."),
	("planet/debris1", "Bone Shoal", "A drift of hull plates and frozen air, piled up against nothing. The wardens rise from places like this."),
	("planet/station-solar-a0-broken", "Dead Lantern", "What was once a station's sail, torn and folded back on itself. It still turns to face a star that is no longer there."),
]

# ---- Jobs at Breaker's Rest, one per target system ----
# (mission stem, tiers, chance that one of them is on the board, cooldown condition, base pay)
JOBS = {
	"Lead Freighter": ((1, 2), 50, "shoal: lead freighter next", 60000),
	"Lead Warship": ((2, 3), 30, "shoal: lead warship next", 120000),
	"Lead Deep": ((3, 4), 20, "shoal: lead deep next", 400000),
	"Ambush At The Wrecks": ((1, 2), 40, "shoal: ambush next", 300000),
	"Silence The Hunter": ((2, 3), 25, "shoal: hunter next", 750000),
	"Tow Escort": ((1,), 30, "shoal: tow next", 450000),
}
COOLDOWN = {"Lead Freighter": 2, "Lead Warship": 5, "Lead Deep": 7, "Ambush At The Wrecks": 4, "Silence The Hunter": 6, "Tow Escort": 4}
# Pay grows by this share per jump of depth past the first.
PAY_PER_DEPTH = 0.35


def tier(depth):
	return TIER_OF_DEPTH.get(depth, 4)


class System:
	def __init__(self, depth, angle, pos):
		self.depth, self.angle, self.pos = depth, angle, pos
		self.links = set()
		self.name = ""

	def true(self):
		return HUB if self.depth == 0 else PREFIX + self.name

	def tier(self):
		return tier(self.depth)


def dist(a, b):
	return math.hypot(a[0] - b[0], a[1] - b[1])


def crosses(p1, p2, q1, q2):
	def orient(a, b, c):
		return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
	if p1 in (q1, q2) or p2 in (q1, q2):
		return False
	d1, d2 = orient(q1, q2, p1), orient(q1, q2, p2)
	d3, d4 = orient(p1, p2, q1), orient(p1, p2, q2)
	return (d1 * d2 < 0) and (d3 * d4 < 0)


def build_map(rng):
	hub = System(0, SLOPE, CENTER)
	hub.name = HUB_NAME
	systems = [hub]
	for d in sorted(COUNTS):
		n = COUNTS[d]
		# The band of angles this depth spreads over narrows with depth: a slope.
		half = math.radians(150 - 13 * d)
		for k in range(n):
			for attempt in range(400):
				base = SLOPE - half + (2 * half) * (k + 0.5) / n
				jitter = math.radians(rng.uniform(-9, 9) * (1 + attempt / 80))
				r = RING * d + rng.uniform(-10, 10) * (1 + attempt / 100)
				a = base + jitter
				pos = (CENTER[0] + r * math.cos(a), CENTER[1] + r * math.sin(a))
				if all(dist(pos, s.pos) >= MIN_SEP for s in systems):
					break
			else:
				raise SystemExit("could not place a system at depth %d" % d)
			systems.append(System(d, a, pos))
	lanes = []

	def link(a, b):
		a.links.add(b); b.links.add(a); lanes.append((a.pos, b.pos))

	def free(a, b):
		return not any(crosses(a.pos, b.pos, p, q) for p, q in lanes)

	by_depth = {}
	for s in systems:
		by_depth.setdefault(s.depth, []).append(s)
	# Every system links to the nearest system one jump shallower.
	for d in sorted(by_depth):
		if d == 0:
			continue
		for s in by_depth[d]:
			up = sorted(by_depth[d - 1], key=lambda u: dist(s.pos, u.pos))
			link(s, up[0])
	# Some link to a second one, and some to a neighbour at the same depth (loops).
	for d in sorted(by_depth):
		if d == 0:
			continue
		for s in by_depth[d]:
			up = sorted(by_depth[d - 1], key=lambda u: dist(s.pos, u.pos))
			if len(up) > 1 and dist(s.pos, up[1].pos) < 1.7 * RING and rng.random() < 0.4 and free(s, up[1]):
				link(s, up[1])
			side = sorted((o for o in by_depth[d] if o is not s and o not in s.links), key=lambda o: dist(s.pos, o.pos))
			if side and dist(s.pos, side[0].pos) < 1.6 * RING and rng.random() < 0.45 and free(s, side[0]):
				link(s, side[0])
	# Names: each tier's list in order of angle.
	for t in range(1, 5):
		members = sorted((s for s in systems if s.tier() == t), key=lambda s: (s.angle, s.depth))
		names = NAMES[t]
		if len(members) > len(names):
			raise SystemExit("tier %d has %d systems but %d names" % (t, len(members), len(names)))
		for s, name in zip(members, names):
			s.name = name
	# Check: depth is the jumps from the hub.
	seen = {hub: 0}; queue = [hub]
	while queue:
		s = queue.pop(0)
		for o in s.links:
			if o not in seen:
				seen[o] = seen[s] + 1; queue.append(o)
	for s in systems:
		assert seen.get(s) == s.depth, (s.name, seen.get(s), s.depth)
	return systems


def q(s):
	return '"%s"' % s


def num(x):
	if isinstance(x, int) or float(x).is_integer():
		return str(int(x))
	return ("%.6f" % x).rstrip("0").rstrip(".")


HEADER = """# Copyright (c) 2026 by Anaxarchus
#
# Endless Sky is free software: you can redistribute it and/or modify it under the
# terms of the GNU General Public License as published by the Free Software
# Foundation, either version 3 of the License, or (at your option) any later version.
#
# Endless Sky is distributed in the hope that it will be useful, but WITHOUT ANY
# WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
# PARTICULAR PURPOSE. See the GNU General Public License for more details.

# GENERATED by tools/deep/gen.py (DESIGN.md section 22): do not edit by hand.
"""


def write_world(systems, rng):
	L = [HEADER, """# The Deep: the region past the black hole at the centre of Breakers' Rest,
# far off the charted map and joined to it by nothing but the two wormholes.
# Depth is jumps from the hub, The Sounding; deeper systems have dimmer stars,
# weaker ramscoop yields and worse weather. Nothing here can be landed on but
# Breakers' Haven, in the hub. The hulks on each system's rim are "inhabited"
# (a reputation nobody has, never landable), so fleets placed in a system
# gather around them, not around the star.
"""]
	(gx, gy), _, _ = image_frame(systems)
	L.append('galaxy "The Shoal"\n\tpos %s %s\n\tsprite "ui/shoal deep"\n' % (num(round(gx)), num(round(gy))))
	L.append('color "wormholes: Shoal" .62 .9 .95\n')
	# Hazards.
	for stem, first, periods, make in HAZARDS:
		for t in range(first, 5):
			h = make(t)
			L.append('hazard "%s %d"' % (stem, t))
			L.append('\t"system-wide"')
			L.append('\t"duration" %s %s' % (num(h["duration"][0]), num(h["duration"][1])))
			L.append('\t"strength" %s %s' % (num(h["strength"][0]), num(h["strength"][1])))
			if "effect" in h:
				L.append('\t"environmental effect" %s %s' % (q(h["effect"][0]), num(h["effect"][1])))
			L.append("\tweapon")
			for k, v in h["weapon"].items():
				L.append('\t\t%s %s' % (q(k), num(v)))
			L.append("")
	# The wormholes.
	L.append('planet %s' % q(MAW))
	L.append('\tattributes "shoal"')
	L.append("\tdescription `A black hole no wider than a station, at the heart of Breakers' Rest. Light bends around it in a slow, pale spiral. The Breakers say it goes down into the Shoal proper, and that what comes up out of it is never quite what went in.`")
	L.append('\twormhole %s\n' % q(MAW))
	L.append('wormhole %s\n\tmappable\n\tlink %s %s\n\tcolor "wormholes: Shoal"\n' % (q(MAW), q(REST), q(HUB)))
	L.append('planet %s' % q(UPWELL))
	L.append('\tattributes "shoal"')
	L.append("\tdescription `A slow upwelling of light at the edge of the Sounding: the way back up to Breakers' Rest, and the only one.`")
	L.append('\twormhole %s\n' % q(UPWELL))
	L.append('wormhole %s\n\tmappable\n\tlink %s %s\n\tcolor "wormholes: Shoal"\n' % (q(UPWELL), q(HUB), q(REST)))
	# Breakers' Haven.
	L.append('planet %s' % q(HAVEN))
	L.append('\tattributes "station" "salvage" "shoal"')
	L.append('\tlandscape land/asteroid0')
	L.append('\tgovernment "Breakers"')
	L.append("\tdescription `A hollowed rock tied off to the Sounding's dim star, with a fuel bladder, a pressurized shed and a lamp in the window. The Breakers keep it stocked and leave it unlocked. Nobody lives here; people only wait here, until whatever is out in the water stops looking for them.`")
	L.append('\tport')
	L.append('\t\trecharges fuel')
	L.append("\t\tdescription `The shed holds a fuel line, a bench, a rack of rebreathers and a ledger. Most of the names in the ledger have a second line under them, in a different hand: the day they made it back up.`")
	L.append('\tbribe 0\n\tsecurity 0\n')
	# Systems.
	hulk_planets = []
	for s in systems:
		t = s.tier()
		L.append('system %s' % q(s.true()))
		L.append('\t"display name" %s' % q(s.name))
		L.append('\tpos %s %s' % (num(round(s.pos[0], 1)), num(round(s.pos[1], 1))))
		L.append('\tgovernment "Uninhabited"')
		attrs = ["shoal", "shoal depth %d" % s.depth, "shoal tier %d" % t] + (["shoal hub"] if s.depth == 0 else [])
		L.append('\tattributes ' + " ".join(q(a) for a in attrs))
		L.append('\thaze %s' % HAZE[t])
		L.append('\tbelt %d' % rng.randint(1300, 1800))
		L.append('\t"jump range" %d' % JUMP_RANGE)
		L.append('\tramscoop\n\t\tmultiplier %s' % num(RAMSCOOP[t]))
		for o in sorted(s.links, key=lambda o: o.true()):
			L.append('\tlink %s' % q(o.true()))
		geodes, small, metal = ROCKS[t]
		L.append('\tasteroids "small rock" %d %s' % (small, num(round(rng.uniform(1.6, 2.4), 2))))
		L.append('\tasteroids "medium metal" %d %s' % (metal, num(round(rng.uniform(1.8, 2.6), 2))))
		L.append('\tminables "shoal geode" %d %s' % (geodes, num(round(rng.uniform(2.0, 2.6), 2))))
		for stem, first, periods, make in HAZARDS:
			if t >= first and t in periods:
				L.append('\thazard "%s %d" %d' % (stem, t, periods[t]))
		star = rng.choice(STARS[t])
		L.append('\tobject\n\t\tsprite %s\n\t\tperiod 1' % star)
		# A cold planet or two for the eye.
		for k in range(rng.randint(1, 2)):
			L.append('\tobject\n\t\tsprite planet/%s\n\t\tdistance %d\n\t\tperiod %d' % (
				rng.choice(["ice2", "ice6", "rock17-b", "rock8-b", "dust2", "ice4"]), rng.randint(500, 2400), rng.randint(400, 2400)))
		if s.depth == 0:
			L.append('\tobject %s\n\t\tsprite planet/station-asteroid-a2\n\t\t\tscale 0.5\n\t\tdistance 900\n\t\tperiod 3600\n\t\toffset 40' % q(HAVEN))
			L.append('\tobject %s\n\t\tsprite planet/wormhole-blue\n\t\tdistance 1700\n\t\tperiod 9000\n\t\toffset 200' % q(UPWELL))
		for k in range(HULKS[t]):
			kind = HULK_KINDS[rng.randrange(len(HULK_KINDS))]
			pname = "%s%s Hulk %d" % (PREFIX, s.name, k + 1)
			hulk_planets.append((pname, kind))
			L.append('\tobject %s\n\t\tsprite %s\n\t\t\tscale %s\n\t\tdistance %d\n\t\tperiod %d\n\t\toffset %d' % (
				q(pname), kind[0], num(round(rng.uniform(0.7, 1.0), 2)), 3600 + 900 * k + rng.randint(0, 500),
				rng.randint(18000, 36000), rng.randint(0, 359)))
		L.append("")
	for pname, (sprite, display, desc) in hulk_planets:
		L.append('planet %s\n\t"display name" %s\n\tattributes "salvage" "shoal hulk"\n\tgovernment "Shoal Warden"\n\t"required reputation" 1000000000\n\tbribe 0\n\tsecurity 0\n\tto land\n\t\tnever\n\tdescription `%s`\n' % (
			q(pname), q(display), desc))
	open(os.path.join(DATA, "shoal deep.txt"), "w", encoding="utf8").write("\n".join(L))


# ---- Wardens ----

def blocks(path, kind):
	"""Raw text of each top-level `kind` block, by name."""
	out = {}; cur = None
	for raw in open(path, encoding="utf8"):
		line = raw.rstrip("\n")
		if line and not line[0].isspace():
			cur = None
			m = re.match(r'%s "([^"]*)"(?: "([^"]*)")?$' % kind, line)
			if m and not m.group(2):
				cur = m.group(1); out[cur] = [line]
		elif cur is not None:
			out[cur].append(line)
	for k in out:
		while out[k] and not out[k][-1].strip():
			out[k].pop()
	return out


DAMAGE_KEY = re.compile(r'^(\t\t)"([a-z ]*damage)" ([0-9.]+)$')


def weapon_copy(lines, t):
	out = []
	skip = None  # the indentation of a dropped node, while its children are skipped
	for line in lines:
		depth = len(line) - len(line.lstrip("\t"))
		if skip is not None:
			if line.strip() and depth > skip:
				continue
			skip = None
		if line.strip().startswith("description"):
			skip = depth
			continue
		m = re.match(r'^outfit "(.*)"$', line)
		if m:
			out.append('outfit "%s %d"' % (m.group(1), t))
			out.append('\t"display name" "%s"' % m.group(1))
			continue
		m = DAMAGE_KEY.match(line)
		if m and not m.group(2).startswith("relative"):
			out.append('%s"%s" %s' % (m.group(1), m.group(2), num(round(float(m.group(3)) * DAMAGE[t], 3))))
			continue
		m = re.match(r'^(\t\tammo) "(Warden Piercer Missile)"$', line)
		if m:
			out.append('%s "%s %d"' % (m.group(1), m.group(2), t))
			continue
		out.append(line)
	return out


def ship_attrs(lines):
	a = {}; inside = False
	for line in lines:
		if line == "\tattributes":
			inside = True; continue
		if inside:
			if not line.startswith("\t\t"):
				inside = False; continue
			if line.startswith("\t\t\t"):
				continue
			m = re.match(r'^\t\t"?([a-z ]+)"? ([0-9.]+)$', line)
			if m:
				a[m.group(1)] = float(m.group(2))
	return a


def ship_outfits(lines):
	out = []; inside = False
	for line in lines:
		if line == "\toutfits":
			inside = True; continue
		if inside:
			if line.strip() == "":
				continue
			if not line.startswith("\t\t"):
				break
			m = re.match(r'^\t\t"([^"]*)"(?: (\d+))?$', line) or re.match(r'^\t\t(\S+)(?: (\d+))?$', line)
			out.append((m.group(1), int(m.group(2) or 1)))
	return out


def hardpoints(lines):
	return [l for l in lines if re.match(r'^\t(gun|turret) ', l)]


def tiered(name, t):
	return "%s %d" % (name, t) if name in WEAPONS else name


def write_wardens():
	ships = blocks(os.path.join(DATA, "shoal ships.txt"), "ship")
	outfits = blocks(os.path.join(DATA, "shoal outfits.txt"), "outfit")
	L = [HEADER, """# The wardens of the deeper tiers (DESIGN.md section 22). Tier 1, the
# Shallows and the hub, is the hand-made data: the Warden hulls in "shoal
# ships.txt", their weapon copies in "shoal outfits.txt" and the fleets in
# "shoal fleets.txt". Tier N (2..4) has its own weapon copies (every damage
# type x DAMAGE[N], shown under the same names), hulls with "add
# attributes" (shields, hull, shield generation and hull repair x
# DURABILITY[N]; energy generation and cooling x DAMAGE[N]) and its own loot,
# and its own fleets, larger the deeper they are.
"""]
	for t in sorted(DAMAGE):
		L.append("# ---- Tier %d: weapons x%s, durability x%s ----\n" % (t, num(DAMAGE[t]), num(DURABILITY[t])))
		for w in WEAPONS:
			L.append("\n".join(weapon_copy(outfits[w], t)) + "\n")
		for m in MODELS:
			lines = ships[m]
			a = ship_attrs(lines)
			add = {}
			for k in ("shields", "hull", "shield generation", "hull repair rate"):
				add[k] = a[k] * (DURABILITY[t] - 1)
			for k in ("energy generation", "cooling"):
				add[k] = a[k] * (DAMAGE[t] - 1)
			add["cost"] = a["cost"] * (DURABILITY[t] * DAMAGE[t] - 1)
			L.append('ship %s %s' % (q(m), q("%s %d" % (m, t))))
			L.append("\tuncapturable")
			L.append("\tadd attributes")
			for k, v in add.items():
				L.append("\t\t%s %s" % (q(k), num(round(v, 3))))
			L.append("\toutfits")
			cores, glass, lattice = LOOT[m][t]
			for o, n in ship_outfits(lines):
				if o in ("Warden Core", "Shoal Glass", "Deep Lattice"):
					continue
				L.append("\t\t%s%s" % (q(tiered(o, t)), "" if n == 1 else " %d" % n))
			if lattice:
				L.append('\t\t"Deep Lattice" %d' % lattice)
			L.append('\t\t"Warden Core"%s' % ("" if cores == 1 else " %d" % cores))
			L.append('\t\t"Shoal Glass" %d' % glass)
			for h in hardpoints(lines):
				m2 = re.match(r'^(\t(?:gun|turret) [-0-9. ]+?)(?: "([^"]*)")?$', h)
				L.append(m2.group(1) + (' "%s"' % tiered(m2.group(2), t) if m2.group(2) else ""))
			L.append("")
		for f, by in FLEETS.items():
			L.append('fleet "%s %d"' % (f, t))
			L.append('\tgovernment "Shoal Warden"\n\tnames "kor mereti"\n\tpersonality heroic staying mute')
			for w, ships_ in by[t]:
				L.append("\tvariant %d" % w)
				for m, n in ships_:
					L.append("\t\t%s%s" % (q("%s %d" % (m, t)), "" if n == 1 else " %d" % n))
			L.append("")
	open(os.path.join(DATA, "shoal deep wardens.txt"), "w", encoding="utf8").write("\n".join(L))


def check_tier1_fleets():
	"""Tier 1's fleets live in shoal fleets.txt: check they are FLEETS[...][1]."""
	text = open(os.path.join(DATA, "shoal fleets.txt"), encoding="utf8").read()
	for f, by in FLEETS.items():
		m = re.search(r'^fleet "%s"\n((?:\t.*\n|\n)*?)(?=^\S|\Z)' % re.escape(f), text, re.M)
		assert m, f
		got = []
		for v in re.finditer(r'^\tvariant (\d+)\n((?:\t\t.*\n)+)', m.group(1), re.M):
			ships_ = []
			for line in v.group(2).splitlines():
				mm = re.match(r'^\t\t"([^"]*)"(?: (\d+))?$', line)
				ships_.append((mm.group(1), int(mm.group(2) or 1)))
			got.append((int(v.group(1)), ships_))
		if got != by[1]:
			raise SystemExit('fleet "%s" in shoal fleets.txt is %r; FLEETS says %r' % (f, got, by[1]))


# ---- Jobs ----

def pay(base, depth):
	return int(round(base * (1 + PAY_PER_DEPTH * (depth - 1)) / 1000.0)) * 1000


def chance(total, n):
	"""The per-job "random <" that puts at least one of n jobs on the board total% of the time."""
	return max(1, int(round(100 * (1 - (1 - total / 100.0) ** (1.0 / n)))))


def job_text(kind, s):
	d = s.name
	t = s.tier()
	band = TIER_NAMES[t]
	fs = FLEET_SUFFIX[t]
	if kind == "Lead Freighter":
		return dict(name="Salvage lead: <npc>",
			desc="A Breaker sold you the drift of the <npc>, a drowned freighter still heavy with glass, in %s, %d jumps past the Sounding in %s. Board it by <date> and come back to <destination> for a finder's fee of <payment>. Whatever you carry off it is yours." % (d, s.depth, band),
			npcs=["\tnpc board\n\t\tgovernment \"Shoal Drowned\"\n\t\tpersonality derelict mute marked\n\t\tsystem %s\n\t\tfleet \"Shoal Lead Freighter Wreck\"\n\t\tdialog `The airlock of the <npc> is frozen half open. Inside, the holds are dark and quiet, and the glass is right where the lead said it would be, grown through the cargo racks like frost. Time to go back up to <planet> and collect the fee.`" % q(s.true())],
			visit="You have not boarded the <npc> yet. It is still drifting in %s." % d,
			done="dialog `The Breaker who sold you the lead takes the fee from the bar's cashbox, counts it twice, and hands you the rest: <payment>. \"Good haul?\" she asks, and does not wait for an answer.`")
	if kind == "Lead Warship":
		return dict(name="Salvage lead: <npc>",
			desc="A salvager spotted the <npc>, a drowned warship with something still installed in it that the Breakers have not seen in years, in %s, %d jumps down in %s. Board it by <date> and come back to <destination> for a finder's fee of <payment>. Whatever you carry off it is yours." % (d, s.depth, band),
			npcs=["\tnpc board\n\t\tgovernment \"Shoal Drowned\"\n\t\tpersonality derelict mute marked\n\t\tsystem %s\n\t\tfleet \"Shoal Lead Warship Wreck\"\n\t\tdialog `The <npc> took a long time to die. Its bulkheads are scorched and its crew quarters empty, but deep in the hull something of Breaker make is still bolted in place and still faintly warm. Time to go back up to <planet> and collect the fee.`" % q(s.true())],
			visit="You have not boarded the <npc> yet. It is still drifting in %s." % d,
			done="dialog `The salvager who sold you the lead whistles when you tell her what was aboard the <npc>. \"Thought so,\" she says, and pays you your <payment>.`")
	if kind == "Lead Deep":
		return dict(name="Deep lead: <npc>",
			desc="Something old has surfaced in %s, %d jumps down in %s: the <npc>, a drowned Leviathan with deep lattice in its holds. The wardens are sitting on it. Destroy them, board the wreck by <date>, and come back to <destination> for a finder's fee of <payment>. Whatever you carry off it is yours." % (d, s.depth, band),
			npcs=["\tnpc board\n\t\tgovernment \"Shoal Drowned\"\n\t\tpersonality derelict mute marked\n\t\tsystem %s\n\t\tfleet \"Shoal Lead Deep Wreck\"\n\t\tdialog `The <npc> is cold all the way through. In its forward hold, packed in rotten foam, lie two lattices of something that is not quite glass and not quite metal, humming very faintly against your glove. Time to go back up to <planet> and collect the fee.`" % q(s.true()),
				"\tnpc kill\n\t\tgovernment \"Shoal Warden\"\n\t\tpersonality heroic staying\n\t\tsystem %s\n\t\tfleet \"Shoal Warden Phalanx%s\"" % (q(s.true()), fs)],
			visit="The deep lead is not finished: the <npc> is still waiting to be boarded in %s, or its guardians are still out there." % d,
			done="dialog `Hesper herself comes down to the docking ring to pay you. She looks at the lattice for a long moment before she looks at you. \"That one has been down there since before this station was drilled,\" she says, and hands over <payment>.`",
			offer=['\t\t"shoal: deepest depth" >= %d' % s.depth])
	if kind == "Ambush At The Wrecks":
		return dict(name="Ambush at the wrecks",
			desc="A Breakers salvage crew cut into the wrong wreck in %s, %d jumps past the Sounding, and the drowned hulls around it woke armed. Their barge, the <npc>, is pinned down there. Disable or destroy the ambushers, keep the <npc> in one piece, and return to <destination> by <date> for <payment>. Whatever you strip from the drowned is yours." % (d, s.depth),
			npcs=["\tnpc disable\n\t\tgovernment \"Shoal Warden\"\n\t\tpersonality heroic staying mute\n\t\tsystem %s\n\t\tfleet \"Shoal Ambushers\"" % q(s.true()),
				"\tnpc disable\n\t\tto spawn\n\t\t\t\"shoal: ambush pair\" == 1\n\t\tgovernment \"Shoal Warden\"\n\t\tpersonality heroic staying mute\n\t\tsystem %s\n\t\tfleet \"Shoal Ambushers\"" % q(s.true()),
				"\tnpc save\n\t\tgovernment \"Breakers\"\n\t\tpersonality staying timid mute marked\n\t\tsystem %s\n\t\tfleet\n\t\t\tnames \"shoal breakers ships\"\n\t\t\tvariant\n\t\t\t\t\"Drowned Bulk Freighter (Breakers Barge)\"" % q(s.true())],
			visit="The <npc> is still pinned down in %s, and the drowned that woke around it are still awake." % d,
			done="dialog `The crew of the <npc> come down the docking ring still in their suits, quiet the way people are after a near thing. Their foreman pays you <payment> from the salvage fund and does not let go of your hand for a moment. \"They were dead,\" she says. \"Every one of those hulls. We'd been cutting beside them for weeks.\"`",
			pair=True)
	if kind == "Silence The Hunter":
		return dict(name="Silence the hunter: <npc>",
			desc="A drowned warship that the Breakers call the <npc> has been hunting their crews in %s, %d jumps down in %s. It woke and did not lie down again, and it does not hunt alone. Disable or destroy the <npc> by <date> and return to <destination> for <payment>. Whatever you find aboard is yours." % (d, s.depth, band),
			npcs=["\tnpc\n\t\tgovernment \"Shoal Warden\"\n\t\tpersonality heroic staying mute\n\t\tsystem %s\n\t\tfleet \"Shoal Warden Pickets%s\"" % (q(s.true()), fs),
				"\tnpc disable\n\t\tgovernment \"Shoal Warden\"\n\t\tpersonality heroic staying mute marked\n\t\tsystem %s\n\t\tfleet \"Shoal Ambush Hunter\"\n\t\tdialog `The <npc> shudders and goes dark, its guns still tracking for a moment after its reactors die. Whatever woke it has let go. Time to go back up to <planet> and tell the Breakers.`" % q(s.true())],
			visit="The <npc> is still out there in %s, hunting." % d,
			done="dialog `Hesper hears you out at the bar without a word, then puts <payment> on the counter between you. \"We lost good people to that hull,\" she says. \"Some of them knew its name before it drowned.\" She does not say what the name was.`")
	if kind == "Tow Escort":
		return dict(name="Tow escort: <npc>",
			desc="The Breakers' tug <npc> is stranded in %s, %d jumps past the Sounding, with a hold full of salvage, and the drowned are waking around it. Find it, bring it back up through the Sounding, and land with it on <destination> by <date> for <payment>." % (d, s.depth),
			npcs=["\tnpc\n\t\tgovernment \"Shoal Warden\"\n\t\tpersonality heroic staying mute\n\t\tsystem %s\n\t\tfleet \"Shoal Ambushers\" 3" % q(s.true()),
				"\tnpc accompany save\n\t\tgovernment \"Breakers\"\n\t\tpersonality escort timid\n\t\tsystem %s\n\t\tfleet\n\t\t\tnames \"shoal breakers ships\"\n\t\t\tvariant\n\t\t\t\t\"Drowned Hauler (Breakers Tug)\"" % q(s.true())],
			visit="You have landed on <planet>, but the <npc> is not with you. Bring it back up from %s before you land." % d,
			done="dialog `The <npc> settles onto the pad beside you, scorched and still hot. Its pilot climbs down, kisses the deck of <planet> without a trace of irony, and has <payment> transferred to your account before she has finished standing up.`")
	raise KeyError(kind)


def write_jobs(systems):
	L = [HEADER, """# The Breakers' jobs (DESIGN.md sections 7, 11, 17 and 22): one mission per
# target system, offered at Breaker's Rest to a captain the Breakers have
# welcomed, each kind on its own cooldown (counted in "days since epoch" from
# when one was last accepted, so only one of a kind runs at a time). The
# per-job chance is set so that one of each kind is on the board about as
# often as the single job was before 0.5.0. Pay grows with depth. The salvage
# leads' wrecks come from named fleets in "shoal fleets.txt" (the cutlass and
# core rolls of tools/h2h apply to them there).
"""]
	for kind, (tiers, total, cooldown, base) in JOBS.items():
		targets = [s for s in systems if s.depth > 0 and s.tier() in tiers]
		p = chance(total, len(targets))
		L.append("# %s: %d systems (tiers %s), random < %d each (one on the board %d%% of landings)\n" % (
			kind, len(targets), ", ".join(map(str, tiers)), p, round(100 * (1 - (1 - p / 100.0) ** len(targets)))))
		for s in sorted(targets, key=lambda s: (s.depth, s.name)):
			j = job_text(kind, s)
			L.append('mission "Shoal: %s: %s"' % (kind, s.name))
			L.append('\tname %s' % q(j["name"]))
			L.append('\tdescription %s' % q(j["desc"]))
			L.append("\tjob\n\trepeat")
			L.append("\tdeadline %d" % (5 + s.depth // 2 + (1 if kind in ("Lead Deep", "Silence The Hunter", "Tow Escort", "Lead Freighter", "Lead Warship") else 0)))
			L.append("\tto offer")
			L.append("\t\trandom < %d" % p)
			L.append('\t\t"shoal: welcomed" == 1')
			L.append('\t\t"days since epoch" >= %s' % q(cooldown))
			for line in j.get("offer", []):
				L.append(line)
			# Checked again on accepting: two jobs of a kind can be on the board
			# together, and only one may run at a time.
			L.append("\tto accept")
			L.append('\t\t"days since epoch" >= %s' % q(cooldown))
			L.append('\tsource "Breaker\'s Rest"\n\tdestination "Breaker\'s Rest"')
			if j.get("pair"):
				L.append('\ton offer\n\t\t"shoal: ambush pair" = random / 50')
			for n in j["npcs"]:
				L.append(n)
			L.append("\ton accept")
			L.append('\t\t%s = "days since epoch" + %d' % (q(cooldown), COOLDOWN[kind]))
			if j.get("pair"):
				L.append('\t\t"shoal: ambush pair" = 0')
			L.append("\t\tmark %s" % q(s.true()))
			L.append("\ton visit\n\t\tdialog `%s`" % j["visit"])
			L.append("\ton complete\n\t\tpayment %d\n\t\t%s" % (pay(base, s.depth), j["done"]))
			L.append("")
	open(os.path.join(DATA, "shoal deep jobs.txt"), "w", encoding="utf8").write("\n".join(L))


# ---- The code's tables ----

def dado_str(s):
	return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def write_dado(systems):
	order = sorted(systems, key=lambda s: s.true())
	L = ["class Deep", "",
		"// GENERATED by tools/deep/gen.py (DESIGN.md section 22); do not edit by hand.",
		"//",
		"// The Deep: every system past the black hole at the centre of Breakers' Rest,",
		"// with its depth (jumps from the hub) and display name, and what each tier",
		"// (band of depth) puts in a system. Tier 0 is the hub, 1..4 the Shallows, the",
		"// Drift, the Fathoms and the Abyss.", "",
		"string hub = %s" % dado_str(HUB),
		"string hub_name = %s" % dado_str(HUB_NAME),
		"string haven = %s" % dado_str(HAVEN),
		"[]string systems = [%s]" % ", ".join(dado_str(s.true()) for s in order),
		"[]string names = [%s]" % ", ".join(dado_str(s.name) for s in order),
		"[]int depths = [%s]" % ", ".join(str(s.depth) for s in order),
		"[]int tier_of_depth = [%s]" % ", ".join(str(TIER_OF_DEPTH[d]) for d in range(max(TIER_OF_DEPTH) + 1)),
		"[]string tier_names = [%s]" % ", ".join(dado_str(n) for n in TIER_NAMES),
		"[]string tier_text = [%s]" % ", ".join(dado_str(n) for n in TIER_TEXT),
		"[]float heat_mult = [%s]" % ", ".join(num(float(x)) if not float(x).is_integer() else "%.1f" % x for x in HEAT_MULT),
		"[][]string seed_wrecks = [%s]" % ", ".join("[" + ", ".join(dado_str(f) for f in fs) + "]" for fs in SEED_WRECKS),
		"[]int seed_deep = [%s]" % ", ".join(str(x) for x in SEED_DEEP),
		"[]int seed_restless = [%s]" % ", ".join(str(x) for x in SEED_RESTLESS),
		"[][]string residents = [%s]" % ", ".join("[" + ", ".join(dado_str(f) for f, _ in rs) + "]" for rs in RESIDENTS),
		"[][]int resident_chance = [%s]" % ", ".join("[" + ", ".join(str(c) for _, c in rs) + "]" for rs in RESIDENTS),
		"[]string fleet_suffix = [%s]" % ", ".join(dado_str(x) for x in FLEET_SUFFIX),
		"",
		"// The index of a deep system (the hub included), or -1.",
		"int find(string system):",
		"    for k in 0..<systems.len():",
		"        if systems[k] == system:",
		"            return k",
		"    return -1",
		"",
		"bool is_deep(string system):",
		"    return find(system) >= 0",
		"",
		"// Jumps from the hub (0 at the hub, and outside the Deep).",
		"int depth(string system):",
		"    int k = find(system)",
		"    return depths[k] if k >= 0 else 0",
		"",
		"int tier(string system):",
		"    int d = depth(system)",
		"    if d < 0:",
		"        return 0",
		"    return tier_of_depth[d] if d < tier_of_depth.len() else tier_of_depth[tier_of_depth.len() - 1]",
		"",
		"string name(string system):",
		"    int k = find(system)",
		"    return names[k] if k >= 0 else system",
		"",
		"// A tier's fleet of a kind (\"Shoal Warden Pickets\", ...).",
		"string fleet(string kind, int tier):",
		"    int t = tier if tier >= 0 && tier < fleet_suffix.len() else 0",
		"    return kind + fleet_suffix[t]",
		""]
	open(os.path.join(MOD, "src", "Deep.dados"), "w", encoding="utf8").write("\n".join(L))


def image_frame(systems):
	"""The galaxy's centre and the image's size: the systems' bounding box, plus a margin."""
	xs = [s.pos[0] for s in systems]; ys = [s.pos[1] for s in systems]
	margin = 170
	w = int(max(xs) - min(xs) + 2 * margin); h = int(max(ys) - min(ys) + 2 * margin)
	return ((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2), w, h


def write_image(systems):
	"""The map background: a soft cloud of water around the systems, pale cyan
	in the shallows, deep blue in the Fathoms, violet-black in the Abyss."""
	import numpy as np
	from PIL import Image, ImageFilter
	(cx, cy), w, h = image_frame(systems)
	rng = np.random.default_rng(SEED)
	y, x = np.mgrid[0:h, 0:w].astype(np.float32)
	X = x - w / 2 + cx; Y = y - h / 2 + cy
	field = np.zeros((h, w), np.float32); deep = np.zeros((h, w), np.float32)
	for s in systems:
		g = np.exp(-((X - s.pos[0]) ** 2 + (Y - s.pos[1]) ** 2) / (2 * 75.0 ** 2))
		field += g; deep += g * s.depth
	depth = deep / np.maximum(field, 1e-6) / max(COUNTS)
	noise = np.zeros((h, w), np.float32)
	for octave, amp in ((6, 1.0), (12, 0.55), (24, 0.3), (48, 0.18), (96, 0.1)):
		g = rng.random((octave + 1, octave + 1)).astype(np.float32)
		img = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
		noise += amp * (np.asarray(img, np.float32) / 255.0)
	noise /= noise.max()
	body = np.clip(field / 1.6, 0, 1) ** 0.8 * (0.55 + 0.45 * noise)
	rgb = np.stack([
		body * (38 + 30 * depth),
		body * (120 - 95 * depth),
		body * (140 - 40 * depth),
	], axis=-1)
	stars = ((rng.random((h, w)) > 0.9994) * np.clip(field, 0, 1) * 150)[..., None]
	out = np.clip(rgb + stars, 0, 255).astype(np.uint8)
	im = Image.fromarray(out).filter(ImageFilter.GaussianBlur(1.0))
	path = os.path.join(MOD, "images", "ui")
	os.makedirs(path, exist_ok=True)
	im.save(os.path.join(path, "shoal deep.jpg"), quality=80)


def main():
	rng = random.Random(SEED)
	systems = build_map(rng)
	check_tier1_fleets()
	write_world(systems, random.Random(SEED + 1))
	write_wardens()
	write_jobs(systems)
	write_dado(systems)
	if "--image" in sys.argv:
		write_image(systems)
	counts = {}
	for s in systems:
		counts[s.tier()] = counts.get(s.tier(), 0) + 1
	print("%d systems: %s; %d lanes" % (len(systems), ", ".join("%s %d" % (TIER_NAMES[t], counts[t]) for t in sorted(counts)),
		sum(len(s.links) for s in systems) // 2))


if __name__ == "__main__":
	main()
