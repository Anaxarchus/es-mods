# Checks every Shoal line's marks: each mark must be better than the one before
# at the line's job on every ship (DESIGN.md section 20).
#	ES_DATA=<es>/data python3 tools/marks/check.py
# * Thrust, turn, afterburner thrust: acceleration / turn rate = stat / ship
#   mass, for every hull such that the ship (with the outfit) weighs 50 to
#   3000 tons; the higher mark must be strictly better on each.
# * Cooling: passive + active x heat fraction (Ship.cpp), at every heat
#   fraction, with energy and without (passive only): never worse, better at
#   full heat.
# * Weapons (v0.3.5): every damage type per second (shield, hull, energy, ion,
#   heat, disruption, discharge, slowing, scrambling, ...) and anti-missile
#   never lower, their sum strictly higher; and never worse at reaching the
#   target: piercing, missile strength, projectile turn, tracking (each kind),
#   top speed (acceleration / drag, else velocity), range and magazine never
#   lower. Firing energy and heat may rise (the Mk III drawback).
# * Everything else: the headline stat strictly up (ramscoop: fuel per second
#   at wind 1), and an energy store never leaks more than the mark before.
# * Undertow Mk III and Eddy Mk III: the best thrust / turn per ton in the game
#   among outfits of their mass or less.
import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ambushers"))
from es import load
O, S, F = load()
LINES = ["Tidecutter", "Riptide Turret", "Glassweave Shield", "Abyssal Cell", "Undertow Thruster", "Coralgraft Mender",
	"Eddy Steering", "Brine Capacitor", "Coldwater Sink", "Glimmer Point Defense", "Coral Plating", "Siltwake Afterburner",
	"Driftnet Ramscoop", "Lamprey Launcher", "Warden Steward"]
MK = ["I", "II", "III"]
def g(a, k):
	v = a.get(k, 0); return v if isinstance(v, float) else 0.
DAMAGE = ["shield damage", "hull damage", "energy damage", "ion damage", "heat damage", "fuel damage",
	"disruption damage", "discharge damage", "slowing damage", "scrambling damage", "corrosion damage",
	"leak damage", "burn damage", "anti-missile"]
REACH = ["piercing", "missile strength", "turn", "tracking", "optical tracking", "infrared tracking",
	"radar tracking", "turret turn"]
def shots(w):
	# Shots per frame. Each shot adds "reload" to the hardpoint's reload counter,
	# which counts down one per frame (Hardpoint.cpp); a burst only fires early
	# against that debt, so the sustained rate is 1 / reload whatever the burst.
	return 1 / (w.get('reload', 1) or 1)
def per_second(a):
	w = a.get('weapon') or {}
	return {k: w.get(k, 0) * shots(w) * 60 for k in DAMAGE}
def reach(a):
	w = a.get('weapon') or {}
	out = {k: w.get(k, 0) for k in REACH}
	out["top speed"] = w['acceleration'] / w['drag'] if w.get('drag') and w.get('acceleration') else w.get('velocity', 0)
	out["range"] = w.get('range override') or w.get('velocity', 0) * w.get('lifetime', 0)
	out["magazine"] = sum(v for k, v in a.items() if k.endswith(" capacity") and k not in
		("energy capacity", "fuel capacity", "weapon capacity", "engine capacity") and isinstance(v, float))
	return out
def check_weapon(l, pair, a, b, notes):
	pa, pb = per_second(a), per_second(b)
	worse = [k for k in DAMAGE if pb[k] < pa[k]]
	if worse: fail("%s %s: lower %s" % (l, pair, ", ".join(worse)))
	if not sum(pb.values()) > sum(pa.values()): fail("%s %s: no more damage" % (l, pair))
	ra, rb = reach(a), reach(b)
	worse = [k for k in ra if rb[k] < ra[k]]
	if worse: fail("%s %s: worse %s" % (l, pair, ", ".join(worse)))
	up = ", ".join("%s %.4g -> %.4g" % (k.replace(" damage", ""), pa[k], pb[k]) for k in DAMAGE if pa[k] or pb[k])
	notes.append("%s: per second %s" % (pair, up))
HEAD = {"Glassweave Shield": "shield generation", "Abyssal Cell": "energy generation", "Coralgraft Mender": "hull repair rate",
	"Brine Capacitor": "energy capacity", "Coral Plating": "hull"}
MOVE = {"Undertow Thruster": "thrust", "Eddy Steering": "turn", "Siltwake Afterburner": "afterburner thrust"}
bad = 0
def fail(msg):
	global bad; bad += 1; print("  FAIL", msg)
for l in LINES:
	marks = [O[l + " Mk " + m] for m in MK]
	notes = []
	for i in (0, 1):
		a, b = marks[i], marks[i + 1]; pair = "Mk %s -> Mk %s" % (MK[i], MK[i + 1])
		if l in MOVE:
			k = MOVE[l]; ma, mb = g(a, 'mass'), g(b, 'mass'); worst = None
			for hull in range(1, 3001):
				for total_a, total_b in ((hull + ma, hull + mb),):
					if not (50 <= total_a <= 3000 and 50 <= total_b <= 3000): continue
					gain = (g(b, k) / total_b) / (g(a, k) / total_a)
					worst = gain if worst is None else min(worst, gain)
			if worst is None or worst <= 1: fail("%s %s: worst ratio %.3f" % (l, pair, worst or 0))
			notes.append("%s: %s per ton of ship at least x%.3f" % (pair, k, worst))
		elif l == "Coldwater Sink":
			worst = min((g(b, 'cooling') + g(b, 'active cooling') * f) - (g(a, 'cooling') + g(a, 'active cooling') * f) for f in [x / 100 for x in range(101)])
			if worst < 0 or g(b, 'cooling') < g(a, 'cooling'): fail("%s %s: cooling drops by %.1f" % (l, pair, -worst))
			notes.append("%s: cooling never lower (min gain %.1f at any heat; passive %g -> %g)" % (pair, worst, g(a, 'cooling'), g(b, 'cooling')))
		elif l in HEAD:
			k = HEAD[l]
			if not g(b, k) > g(a, k): fail("%s %s: %s %g -> %g" % (l, pair, k, g(a, k), g(b, k)))
			if l == "Brine Capacitor" and g(b, 'energy consumption') > g(a, 'energy consumption'): fail("%s %s: leaks energy" % (l, pair))
			notes.append("%s: %s %g -> %g" % (pair, k, g(a, k), g(b, k)))
		elif l == "Driftnet Ramscoop":
			fa = 60 * (.03 * math.sqrt(g(a, 'ramscoop')) + g(a, 'fuel generation')); fb = 60 * (.03 * math.sqrt(g(b, 'ramscoop')) + g(b, 'fuel generation'))
			if not fb > fa: fail("%s %s" % (l, pair))
			notes.append("%s: fuel/s %.2f -> %.2f" % (pair, fa, fb))
		elif l == "Warden Steward":
			if not g(b, 'required crew') < g(a, 'required crew'): fail(l)
			notes.append("%s: crew %g -> %g" % (pair, g(a, 'required crew'), g(b, 'required crew')))
		else:
			check_weapon(l, pair, a, b, notes)
	print("%-22s %s" % (l, "; ".join(notes)))
for name, k in (("Undertow Thruster Mk III", "thrust"), ("Eddy Steering Mk III", "turn")):
	a = O[name]; r = g(a, k) / g(a, 'mass')
	rivals = sorted(((g(o, k) / g(o, 'mass'), n) for n, o in O.items() if n != name and g(o, k) > 0 and 0 < g(o, 'mass') <= g(a, 'mass')), reverse=True)
	best = rivals[0] if rivals else (0, "-")
	allbest = max((g(o, k) / g(o, 'mass'), n) for n, o in O.items() if n != name and g(o, k) > 0 and g(o, 'mass') > 0)
	if r <= best[0]: fail("%s not the best per ton" % name)
	print("%s: %.2f %s per ton; best other at %g t or less: %s %.2f; best other at any mass: %s %.2f" % (name, r, k, g(a, 'mass'), best[1], best[0], allbest[1], allbest[0]))
print("failures:", bad)
