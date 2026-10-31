# Generates the ambusher variants ("shoal ships.txt") and fleets ("shoal fleets.txt").
import sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from es import *
import os
# Where the generated ships.txt / fleets.txt / pool.json go (merge them into data/ by hand).
OUT = os.environ.get("OUT", ".")
O, S, F = load()
HULLS = ["Hauler", "Bulk Freighter", "Osprey", "Falcon", "Leviathan", "Bactrian"]
WAR = ["Osprey", "Falcon", "Leviathan", "Bactrian"]
LINES = [("Tidecutter", "Tidecutter"), ("Riptide", "Riptide Turret"), ("Glassweave", "Glassweave Shield"),
	("Abyssal", "Abyssal Cell"), ("Undertow", "Undertow Thruster"), ("Coralgraft", "Coralgraft Mender"),
	("Eddy", "Eddy Steering"), ("Brine", "Brine Capacitor"), ("Coldwater", "Coldwater Sink"),
	("Glimmer", "Glimmer Point Defense"), ("Coral", "Coral Plating"), ("Siltwake", "Siltwake Afterburner"),
	("Driftnet", "Driftnet Ramscoop"), ("Lamprey", "Lamprey Launcher")]
N = len(LINES)  # 13 since v0.3.4 (the Driftnet Ramscoop), 14 since v0.3.5 (the Lamprey Launcher); the pools below keep the 12-line shares
# What a Lamprey Launcher is loaded with (and leaves as loot).
LAMPREY_AMMO = ("Glass Lamprey", 10)
LOOT = ("Warden Core", "Shoal Glass")

def restless(h):
	_, outs = ship_info(S, "Drowned %s (Restless)" % h)
	return dict(outs)

def first(d, pred):
	for k in d:
		if pred(k): return k
	return None

def dec(d, k, n=1):
	d[k] -= n
	if d[k] <= 0: del d[k]

def slack_of(d, h):
	attrs, _ = ship_info(S, "Drowned %s (Restless)" % h)
	r = {k: attrs.get(k, 0) for k in KEYS}
	for o, n in d.items():
		for k in KEYS: r[k] += O[o].get(k, 0) * n
	return r

def heat_ok(d, h):
	attrs, _ = ship_info(S, "Drowned %s (Restless)" % h)
	mass = attrs['mass'] + sum(O[o].get('mass', 0) * n for o, n in d.items())
	diss = attrs['heat dissipation']
	net = 0
	for o, n in d.items():
		a = O[o]
		net += (a.get('heat generation', 0) - a.get('cooling', 0) - a.get('active cooling', 0)) * n
		w = a.get('weapon')
		if isinstance(w, dict) and (a.get('gun ports') or a.get('turret mounts')):
			net += w.get('firing heat', 0) / (w.get('reload', 1) or 1) * n
	return net, 0.1 * diss * mass

def fit(h, exotics):
	"""exotics: list of outfit names. Returns the outfit dict (loot excluded)."""
	d = {k: v for k, v in restless(h).items() if k not in LOOT}
	log = []
	for x in exotics:
		if x.startswith("Tidecutter"):
			dec(d, "Warden Particle Cannon"); log.append("-PC")
		elif x.startswith("Riptide"):
			if slack_of(d, h)['turret mounts'] < 1 or slack_of(d, h)['weapon capacity'] < 36:
				k = first(d, lambda k: k == "Warden Shield Disruptor Turret") or first(d, lambda k: k == "Warden Husk-Slice Turret")
				dec(d, k); log.append("-" + k)
		elif x.startswith("Glimmer"):
			if "Warden Warder Anti-Missile" in d:
				dec(d, "Warden Warder Anti-Missile"); log.append("-Warder")
		elif x.startswith("Abyssal"):
			dec(d, "RT-I Radiothermal"); log.append("-RT-I")
		elif x.startswith("Undertow"):
			k = first(d, lambda k: "Thruster" in k); dec(d, k)
		elif x.startswith("Eddy"):
			k = first(d, lambda k: "Steering" in k); dec(d, k)
		elif x.startswith("Brine"):
			k = first(d, lambda k: "Battery" in k); dec(d, k); log.append("-battery")
		elif x.startswith("Coldwater"):
			dec(d, "Liquid Nitrogen Cooler"); log.append("-LN")
		elif x.startswith("Lamprey"):
			# A gun-port launcher: it takes a Piercer launcher's port (and its
			# 20 missiles), else a Particle Cannon's.
			if "Warden Piercer Missile Launcher" in d:
				dec(d, "Warden Piercer Missile Launcher"); dec(d, "Warden Piercer Missile", 20); log.append("-Piercer(L)")
			else:
				dec(d, "Warden Particle Cannon"); log.append("-PC(L)")
			d[LAMPREY_AMMO[0]] = d.get(LAMPREY_AMMO[0], 0) + LAMPREY_AMMO[1]
		# Driftnet Ramscoop: no stock counterpart aboard; it only needs room.
		d[x] = d.get(x, 0) + 1
	# Resolve over-capacity.
	for _ in range(10):
		r = slack_of(d, h)
		if r['engine capacity'] < 0:
			k = first(d, lambda k: k in ("X5700 Ion Thruster", "X4700 Ion Thruster", "X3700 Ion Thruster"))
			if k:
				dec(d, k); n = {"X5700 Ion Thruster": "X4700 Ion Thruster", "X4700 Ion Thruster": "X3700 Ion Thruster", "X3700 Ion Thruster": "X2700 Ion Thruster"}[k]
				d[n] = d.get(n, 0) + 1; log.append(k + "->" + n); continue
			k = first(d, lambda k: k in ("X4200 Ion Steering", "X3200 Ion Steering"))
			if k:
				dec(d, k); n = {"X4200 Ion Steering": "X3200 Ion Steering", "X3200 Ion Steering": "X2200 Ion Steering"}[k]
				d[n] = d.get(n, 0) + 1; log.append(k + "->" + n); continue
			raise Exception("engine %s %s" % (h, exotics))
		if r['weapon capacity'] < 0 or r['gun ports'] < 0 or r['turret mounts'] < 0:
			if "Warden Piercer Missile Launcher" in d:
				dec(d, "Warden Piercer Missile Launcher"); dec(d, "Warden Piercer Missile", 20); log.append("-Piercer"); continue
			k = first(d, lambda k: k == "Warden Particle Cannon")
			dec(d, k); log.append("-PC2"); continue
		if r['outfit space'] < 0:
			k = first(d, lambda k: k in ("LP144a Battery Pack", "LP072a Battery Pack"))
			if k:
				dec(d, k); n = {"LP144a Battery Pack": "LP072a Battery Pack", "LP072a Battery Pack": "LP036a Battery Pack"}[k]
				d[n] = d.get(n, 0) + 1; log.append(k + "->" + n); continue
			if "Warden Piercer Missile Launcher" in d:
				dec(d, "Warden Piercer Missile Launcher"); dec(d, "Warden Piercer Missile", 20); log.append("-Piercer"); continue
			if "Warden Warder Anti-Missile" in d:
				dec(d, "Warden Warder Anti-Missile"); log.append("-Warder"); continue
			if d.get("Warden Particle Cannon", 0) > 0:
				dec(d, "Warden Particle Cannon"); log.append("-PC3"); continue
			raise Exception("space %s %s %s" % (h, exotics, r))
		break
	if not any(k == "Warden Particle Cannon" or k.startswith("Tidecutter") for k in d):
		raise Exception("no gun left %s %s" % (h, exotics))
	net, cap = heat_ok(d, h)
	if net >= cap: raise Exception("heat %s %s %.1f %.1f" % (h, exotics, net, cap))
	return d, log

def label(ex):
	# ex: list of (lineindex, mk)
	return ", ".join(LINES[i][0] + (" II" if mk == 2 else "") for i, mk in ex)

def outfit(i, mk): return LINES[i][1] + (" Mk II" if mk == 2 else " Mk I")

# Pool per hull: list of (exotics, standard weight, hunter weight). T = 480 x N
# per hull (N lines; 13 in v0.3.4, 14 since v0.3.5): "none" is x N and each
# line's weight x12, so the shares of none / one / two / three exotics stay the
# v0.3.2 ones (45 / 35 / 15 / 5% on a warship) and every line gets the same.
# Pair offsets must not be N / 2 (that pairs every two lines twice): with
# fourteen lines the Falcon and Bactrian moved from 7 to 3 and 6.
DOUBLE_OFF = {"Osprey": 5, "Falcon": 3, "Leviathan": 5, "Bactrian": 6}
TRIPLE_OFF = {"Osprey": (3, 7), "Falcon": (4, 9), "Leviathan": (5, 8), "Bactrian": (2, 7)}
def pool(h):
	P = [([], 216 * N, 96 * N)]
	if h not in WAR:
		hi = HULLS.index(h)
		for i in range(N):
			m2 = 4 if (i + hi) % 2 else 3
			P.append(([(i, 1)], (22 - m2) * 12, 0)); P.append(([(i, 2)], m2 * 12, 0))
		return P
	w = WAR.index(h)
	for i in range(N):
		P.append(([(i, 1)], 12 * 12, 14 * 12)); P.append(([(i, 2)], 2 * 12, 2 * 12))
	s = DOUBLE_OFF[h]
	for i in range(N):
		mk = 2 if i % 4 == w else 1
		P.append(([(i, mk), ((i + s) % N, 1)], 6 * 12, 12 * 12))
	a, b = TRIPLE_OFF[h]
	for i in range(N):
		mk = 2 if i % 2 == w % 2 else 1
		P.append(([(i, mk), ((i + a) % N, 1), ((i + b) % N, 1)], 2 * 12, 4 * 12))
	return P

def q(o, n):
	return '"%s"' % o + ("" if n == 1 else " %d" % n)

ORDER = ["RT-I Radiothermal", "Abyssal Cell", "Liquid Nitrogen Cooler", "Coldwater Sink", "LP036a Battery Pack", "LP072a Battery Pack", "LP144a Battery Pack",
	"Brine Capacitor", "Glassweave Shield", "Driftnet Ramscoop", "Coralgraft Mender", "Coral Plating",
	"X2700 Ion Thruster", "X3700 Ion Thruster", "X4700 Ion Thruster", "X5700 Ion Thruster", "Undertow Thruster", "X2200 Ion Steering", "X3200 Ion Steering", "X4200 Ion Steering", "Eddy Steering", "Siltwake Afterburner",
	"Hyperdrive", "Warden Particle Cannon", "Tidecutter", "Warden Piercer Missile Launcher", "Warden Piercer Missile",
	"Lamprey Launcher", "Glass Lamprey",
	"Warden Shield Disruptor Turret", "Warden Husk-Slice Turret", "Riptide Turret", "Warden Warder Anti-Missile", "Glimmer Point Defense"]
def key(o):
	for i, p in enumerate(ORDER):
		if o.startswith(p): return i
	raise Exception(o)

ships = []; fleet = {}; logs = {}
for h in HULLS:
	loot = {k: v for k, v in restless(h).items() if k in LOOT}
	for ex, ws, wh in pool(h):
		name = "Drowned %s (Ambusher%s)" % (h, (", " + label(ex)) if ex else "")
		d, log = fit(h, [outfit(i, mk) for i, mk in ex])
		logs[name] = log
		lines = ['ship "Drowned %s" "%s"' % (h, name), "\tuncapturable", "\toutfits"]
		lines += ["\t\t" + q(o, n) for o, n in sorted(d.items(), key=lambda t: key(t[0]))]
		lines.append("\t\t")
		lines += ["\t\t" + q(o, loot[o]) for o in LOOT if o in loot]
		ships.append("\n".join(lines) + "\n")
		fleet[name] = (h, ws, wh)
json.dump({"fleet": fleet, "logs": logs}, open(OUT + '/pool.json', "w"), indent=1)
open(OUT + '/ships.txt', "w").write("\n".join(ships))
print(len(ships), "variants")
from collections import Counter
print(Counter(tuple(v) for v in logs.values()).most_common(30))

# Fleets.
SHARE = {"Hauler": 2, "Bulk Freighter": 2, "Osprey": 3, "Falcon": 3, "Leviathan": 3, "Bactrian": 3}
HUNTER = {"Leviathan": 1, "Bactrian": 1}
def fleet_text(name, comment, share, idx):
	L = [comment, 'fleet "%s"' % name, '\tgovernment "Shoal Warden"', '\tnames "%s"' % ("shoal hunter" if idx == 2 else "civilian"),
		'\t"cargo settings"', '\t\tcargo 0', '\tpersonality heroic staying mute']
	for v, (h, ws, wh) in fleet.items():
		if h not in share: continue
		w = (ws, wh)[idx - 1] * share[h]
		if w <= 0: continue
		L.append('\tvariant %d' % w); L.append('\t\t"%s"' % v)
	return "\n".join(L) + "\n"
open(OUT + '/fleets.txt', "w").write(
	fleet_text("Shoal Ambushers", "# Ambushers (DESIGN.md section 17): one drowned hull per pick, armed like the restless\n# wrecks. Weights are hull share x the hull's %d-unit pool (480 x %d lines)." % (480 * N, N), SHARE, 1) + "\n" +
	fleet_text("Shoal Ambush Hunter", "# The hunter of \"Silence the hunter\": a Leviathan or a Bactrian from the same\n# variants, weighted toward more exotics.", HUNTER, 2))

# --merge: write the variants and the two fleets into the plugin's data in place
# (the ambusher variants replace those in "shoal ships.txt", from the first
# "(Ambusher)" ship to the Breakers' own ships; the two fleets replace the end of
# "shoal fleets.txt"). Then run ../h2h/h2h.py to add the cutlass roll again.
if "--merge" in sys.argv[1:]:
	sp = os.path.join(PLUGIN_DATA, "shoal ships.txt")
	text = open(sp, encoding="utf8").read()
	a = text.index('ship "Drowned Hauler" "Drowned Hauler (Ambusher)"')
	b = text.index("# The Breakers' own ships for the combat jobs")
	text = text[:a] + open(OUT + '/ships.txt').read().rstrip("\n") + "\n\n" + text[b:]
	open(sp, "w", encoding="utf8").write(text)
	fp = os.path.join(PLUGIN_DATA, "shoal fleets.txt")
	text = open(fp, encoding="utf8").read()
	a = text.index("# Ambushers (DESIGN.md section 17): one drowned hull per pick")
	text = text[:a] + open(OUT + '/fleets.txt').read()
	open(fp, "w", encoding="utf8").write(text)
	print("merged into", sp, "and", fp)
