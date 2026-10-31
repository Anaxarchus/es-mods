# Shared by h2h.py and dist.py: the cutlass roll and the drowned pools.
import re
from es import tok

OUTFIT = "Glass-Edge Cutlass"
COUNTS = [1, 3, 5, 7, 9, 11, 13, 15]
NONE = 32  # 8 counts at weight 1 against 32: a 20% chance per warship
STATES = [(0, NONE)] + [(c, 1) for c in COUNTS]
TOTAL = sum(w for _, w in STATES)
WAR = ("Osprey", "Falcon", "Leviathan", "Bactrian")
# A rolled copy of a ship variant: "<ship> [Cutlass n]", "<ship> [Core c]" or
# "<ship> [Core c, Cutlass n]" (the items ride in its cargo).
SUFFIX = re.compile(r" \[(?:Core (\d+))?(?:, )?(?:Cutlass (\d+))?\]$")
# The Warden Core roll (v0.3.5, DESIGN.md section 21): per drowned ship in these
# derelict pools, independent of everything else, (cores, weight). The restless
# wrecks already carry a core on 34% of ships and roll nothing.
CORE = "Warden Core"
CORE_ROLLS = {
	"Shoal Wrecks": [(0, 4), (1, 1)],                  # 20% one core
	"Shoal Glass Wrecks": [(0, 17), (1, 3)],           # 15% one core
	"Shoal Rich Wrecks": [(0, 10), (1, 8), (2, 2)],    # 50%: 40% one, 10% two
	"Shoal Deep Wreck": [(2, 1), (3, 1)],              # always two or three
	# 0.5.0 (DESIGN.md section 22)
	"Shoal Rest Wrecks": [(0, 24), (1, 1)],            # Breakers' Rest: 4% one core
	"Shoal Abyss Wreck": [(2, 1), (3, 1), (4, 1)],     # the Abyss: two to four
}
# The drowned pools: named fleets, and the npc fleets of these missions.
FLEETS = ["Shoal Wrecks", "Shoal Glass Wrecks", "Shoal Rich Wrecks", "Shoal Deep Wreck",
	"Shoal Restless Wrecks", "Shoal Ambushers", "Shoal Ambush Hunter",
	# 0.5.0: Breakers' Rest's own pools, the Abyss's wreck, and the salvage
	# leads' wrecks (inline in the lead missions before 0.5.0).
	"Shoal Rest Wrecks", "Shoal Rest Restless", "Shoal Abyss Wreck",
	"Shoal Lead Freighter Wreck", "Shoal Lead Warship Wreck", "Shoal Lead Deep Wreck"]
MISSIONS = []
LINES = ["Tidecutter", "Riptide Turret", "Glassweave Shield", "Abyssal Cell", "Undertow Thruster", "Coralgraft Mender",
	"Eddy Steering", "Brine Capacitor", "Coldwater Sink", "Glimmer Point Defense", "Coral Plating", "Siltwake Afterburner",
	"Driftnet Ramscoop", "Lamprey Launcher"]

def variant_name(ship, c, cores=0):
	parts = (["Core %d" % cores] if cores else []) + (["Cutlass %d" % c] if c else [])
	return "%s [%s]" % (ship, ", ".join(parts)) if parts else ship
def strip(ship): return SUFFIX.sub("", ship)
def rolled(ship):
	"""(cores, cutlasses) carried by a rolled copy's cargo (0, 0 for the original)."""
	m = SUFFIX.search(ship)
	return (int(m.group(1) or 0), int(m.group(2) or 0)) if m else (0, 0)

BLOCKS = {}
def ship_blocks(path):
	"""Raw text of each top-level ship block, by ship (variant) name."""
	out = {}; cur = None
	for raw in open(path, encoding="utf8"):
		line = raw.rstrip("\n")
		if line and not line[0].isspace():
			cur = None
			if line.startswith("ship "):
				t = tok(line); cur = t[-1]; out[cur] = (t, [])
		elif cur is not None:
			out[cur][1].append(line)
	for k, (t, body) in out.items():
		while body and not body[-1].strip(): body.pop()
	return out

def init_blocks(path):
	BLOCKS.clear(); BLOCKS.update(ship_blocks(path))

def hull(ship):
	t, _ = BLOCKS[strip(ship)]
	return t[1].replace("Drowned ", "")

def is_war(ship): return strip(ship).startswith("Drowned") and hull(ship) in WAR

def parse_variants(lines, start, end, ind):
	"""Variants (weight, [ships]) of a fleet block's lines[start:end] whose
	variant lines are at indentation `ind`; returns (first, last+1, variants)."""
	first = None; vs = []
	i = start
	while i < end:
		line = lines[i]
		s = line.strip()
		d = len(line) - len(line.lstrip("\t"))
		if s and d == ind and s.split()[0] == "variant":
			if first is None: first = i
			t = tok(line); w = int(t[1]) if len(t) > 1 else 1
			ships = []; i += 1
			while i < end and (not lines[i].strip() or len(lines[i]) - len(lines[i].lstrip("\t")) > ind):
				if lines[i].strip():
					t = tok(lines[i]); n = int(t[1]) if len(t) > 1 else 1
					ships += [t[0]] * n
				i += 1
			vs.append((w, ships)); last = i
			continue
		if first is not None and s:
			raise Exception("non-variant line after the variants: %r" % line)
		i += 1
	# Leave trailing blank lines outside the region.
	while last > first and not lines[last - 1].strip(): last -= 1
	return first, last, vs

def render(vs, ind):
	L = []
	for w, ships in vs:
		L.append("\t" * ind + "variant %d" % w)
		for s in ships: L.append("\t" * (ind + 1) + '"%s"' % s)
	return L

def ship_states(ship, pool):
	"""Every (cores, cutlasses) state of one drowned ship in the pool, with its
	weight: the pool's core roll times the warship cutlass roll."""
	cores = CORE_ROLLS.get(pool, [(0, 1)]) if strip(ship).startswith("Drowned") else [(0, 1)]
	cuts = STATES if is_war(ship) else [(0, 1)]
	return [((k, c), kw * cw) for k, kw in cores for c, cw in cuts]
