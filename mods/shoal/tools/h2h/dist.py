# Per drowned pool: the exotic distribution and the Glass-Edge Cutlass
# distribution, computed from the plugin's data, plus an exact check that the
# cutlass roll is independent of everything else (DESIGN.md section 19).
#	ES_DATA=<es>/data python3 tools/h2h/dist.py [--before <old plugin data dir>]
# With --before, the exotic distribution of the same pools in that data (e.g.
# a checkout of the previous release) is printed under each pool to compare.
import os, sys, re
from fractions import Fraction
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "ambushers"))
import es
from h2h_common import *

def pools(data):
	es.PLUGIN_DATA = data
	O, S, F = es.load()
	out = []
	for f in FLEETS:
		if f in F:  # an older release's data lacks the newer pools
			out.append((f, variants(F[f]['c']), S))
	for n in es.parse([os.path.join(data, "shoal missions.txt")]):
		if n['t'][0] == 'mission' and n['t'][1] in MISSIONS:
			for c in n['c']:
				if c['t'][0] == 'npc':
					for g in c['c']:
						if g['t'][0] == 'fleet' and len(g['t']) == 1:
							vs = variants(g['c'])
							if all(strip(s).startswith("Drowned") for _, ss in vs for s in ss):
								out.append(("mission " + n['t'][1], vs, S))
	return out

def variants(children):
	vs = []
	for c in children:
		if c['t'][0] == 'variant':
			w = int(c['t'][1]) if len(c['t']) > 1 else 1
			ships = []
			for s in c['c']:
				ships += [s['t'][0]] * (int(s['t'][1]) if len(s['t']) > 1 else 1)
			vs.append((w, ships))
	return vs

def installed(S, ship):
	_, outs = es.ship_info(S, ship)
	return outs

def cargo(S, ship, item=OUTFIT):
	n = 0
	for c in S[ship]['node']['c']:
		if c['t'][0] == 'cargo':
			for g in c['c']:
				if g['t'][0] == 'outfits':
					for o in g['c']:
						if o['t'][0] == item: n += int(o['t'][1]) if len(o['t']) > 1 else 1
	return n

def cores(S, ship):
	"""Warden Cores aboard: installed (leads, restless hulls) plus in the hold."""
	return installed(S, ship).get(CORE, 0) + cargo(S, ship, CORE)

def exotics(S, ships):
	r = []
	for s in ships:
		for o, n in installed(S, s).items():
			m = re.match(r"(.*) Mk (I+)$", o)
			if m and m.group(1) in LINES: r += [(m.group(1), len(m.group(2)))] * n
	return tuple(sorted(r))

def exotic_report(vs, S, indent="  "):
	t = sum(w for w, _ in vs)
	k = defaultdict(int); mk = defaultdict(int); line = defaultdict(int)
	for w, ships in vs:
		ex = exotics(S, ships); k[len(ex)] += w
		for l, m in ex: mk[m] += w; line[l] += w
	n = sum(mk.values())
	top = max(k) if k else 0
	s = indent + "exotics per spawn: " + "  ".join("%d: %5.1f%%" % (i, 100 * k[i] / t) for i in range(max(top, 1) + 1))
	s += "   >=1: %5.1f%%" % (100 * (t - k[0]) / t)
	if n:
		s += ";  Mk I %5.1f%% Mk II %5.1f%%" % (100 * mk[1] / n, 100 * mk[2] / n)
		rates = sorted({round(100 * line[l] / t, 2) for l in LINES})
		s += ";  per line per 100 spawns: " + "/".join("%.2f" % r for r in rates) + (" (%d lines)" % sum(1 for l in LINES if line[l]))
	return s

def collapse(vs):
	base = defaultdict(int); order = []
	for w, ships in vs:
		key = tuple(strip(s) for s in ships)
		if key not in base: order.append(key)
		base[key] += w
	return [(base[k], list(k)) for k in order]

def report(name, vs, S, before):
	t = sum(w for w, _ in vs)
	print("== %s: %d entries (%d before the cutlass and core rolls), total weight %d" % (name, len(vs), len(collapse(vs)), t))
	print(exotic_report(vs, S))
	if before is not None:
		print(exotic_report(before[0], before[1], "  before:  "))
	# Independence: every entry = P(original variant) x product of its ships'
	# rolls (the pool's core roll, the cutlass roll on warships).
	pool = name
	col = {tuple(k): Fraction(w, t) for w, k in collapse(vs)}
	got = defaultdict(Fraction)
	for w, ships in vs: got[tuple(ships)] += Fraction(w, t)
	ok = True; total = Fraction(0); n_expected = 0
	from itertools import product
	for key, p0 in col.items():
		states = [ship_states(s, pool) for s in key]
		for combo in product(*states):
			ships = list(key); p = p0
			for i, ((k, c), sw) in enumerate(combo):
				p *= Fraction(sw, sum(w for _, w in states[i]))
				ships[i] = variant_name(key[i], c, k)
			total += p; n_expected += 1
			if got.get(tuple(ships), Fraction(0)) != p: ok = False
	ok = ok and total == 1 and all(tuple(s) in got for _, s in vs) and len(got) == n_expected
	# Cutlasses: per warship, and per spawn.
	wship = Fraction(0); hist = defaultdict(Fraction); spawn_any = Fraction(0); per_spawn = Fraction(0)
	for w, ships in vs:
		p = Fraction(w, t); any_c = False
		for s in ships:
			c = cargo(S, s)
			per_spawn += p * c
			if is_war(s):
				wship += p; hist[c] += p
				any_c = any_c or c > 0
		if any_c: spawn_any += p
	if wship:
		print("  cutlasses: per warship %5.1f%% carry some;  count (share of warships): " % (100 * (1 - hist[0] / wship)) +
			" ".join("%d:%.1f%%" % (c, 100 * hist[c] / wship) for c in sorted(hist) if c) +
			";  mean when carried %.1f" % (sum(c * hist[c] for c in hist) / (wship - hist[0])))
		print("             per spawn: warships %.2f, any cutlass %5.1f%%, cutlasses %.2f" % (float(wship), 100 * spawn_any, float(per_spawn)))
	else:
		print("  cutlasses: no drowned warship in this pool")
	# Warden Cores: per drowned ship, and per spawn (installed and in the hold).
	ship_p = Fraction(0); khist = defaultdict(Fraction); kspawn = Fraction(0); kany = Fraction(0)
	for w, ships in vs:
		p = Fraction(w, t); a = 0
		for s in ships:
			k = cores(S, s); ship_p += p; khist[k] += p; kspawn += p * k; a += k
		if a: kany += p
	print("  cores: per ship %5.1f%% carry some;  count (share of ships): " % (100 * (1 - khist[0] / ship_p)) +
		(" ".join("%d:%.1f%%" % (k, 100 * khist[k] / ship_p) for k in sorted(khist) if k) or "-") +
		";  per ship %.2f;  per spawn %.2f, any core %5.1f%%" % (float(kspawn / ship_p), float(kspawn), 100 * kany) +
		(";  roll %s" % CORE_ROLLS[name] if name in CORE_ROLLS else ""))
	print("  independent of the exotics (exact): %s" % ("yes" if ok else "NO"))
	return ok

before = None
if "--before" in sys.argv:
	d = sys.argv[sys.argv.index("--before") + 1]
	before = {n: (vs, S) for n, vs, S in pools(d)}
P = pools(es.PLUGIN_DATA if "PLUGIN_DATA" in os.environ else os.path.join(HERE, "..", "..", "data"))
init_blocks(os.path.join(HERE, "..", "..", "data", "shoal ships.txt"))
bad = 0
for name, vs, S in P:
	if not report(name, vs, S, before.get(name) if before else None): bad += 1
print("pools not independent:", bad)
