#!/usr/bin/env python3
# The Shoal 0.5.0 (DESIGN.md section 22): how the wardens of each depth tier
# fare against reference ships fitted with Shoal gear. Reads the game's data
# and the plugin's (ES_DATA, PLUGIN_DATA as for ../ambushers), so run it after
# gen.py. Prints, for every reference ship and every warden fleet of every
# tier, a one-on-one (or one-against-the-fleet) fight simulated in steps of
# 0.1 s: shields, then hull (piercing lets that share of the hull damage
# through while shields are up), shield and hull regeneration, and energy:
# each side fires only as fast as its generation and batteries allow (the
# reference ship also pays its shields' and menders' energy). Heat, range,
# turning, missiles' travel and the Lamprey's status effects are ignored, so
# the numbers are a guide for tuning, not a prediction.
#
#	ES_DATA=<es>/data python3 tools/deep/balance.py [--fleets]
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ambushers"))
from es import load, ship_info

OUTFITS, SHIPS, FLEETS = load()

# Reference ships: a stock hull and what it carries (checked against its capacity).
REFS = {
	# A Bactrian with the Shoal Mk II gear that fits: two Lamprey launchers to
	# strip shields and drain energy, armour-cutting guns and turrets, a
	# point-defense turret, the Undertow/Eddy/Siltwake engines, two Abyssal
	# cells, two Glassweave shields, two coolers and a capacitor.
	"Bactrian, Shoal Mk II": ("Bactrian", {
		"Lamprey Launcher Mk II": 2, "Glass Lamprey": 48, "Tidecutter Mk II": 2, "Riptide Turret Mk II": 5, "Glimmer Point Defense Mk II": 1,
		"Undertow Thruster Mk II": 2, "Eddy Steering Mk II": 1, "Siltwake Afterburner Mk II": 1, "Hyperdrive": 1,
		"Abyssal Cell Mk II": 2, "Glassweave Shield Mk II": 2, "Coldwater Sink Mk II": 2, "Brine Capacitor Mk II": 1}),
	# The same with Mk I gear.
	"Bactrian, Shoal Mk I": ("Bactrian", {
		"Lamprey Launcher Mk I": 2, "Glass Lamprey": 40, "Tidecutter Mk I": 2, "Riptide Turret Mk I": 5, "Glimmer Point Defense Mk I": 1,
		"Undertow Thruster Mk I": 2, "Eddy Steering Mk I": 1, "Siltwake Afterburner Mk I": 1, "Hyperdrive": 1,
		"Abyssal Cell Mk I": 2, "Glassweave Shield Mk I": 2, "Coldwater Sink Mk I": 2, "Brine Capacitor Mk I": 1}),
	# The Mk II Bactrian without Lampreys: four Tidecutters, shields left to the regeneration race.
	"Bactrian, Mk II, no Lamprey": ("Bactrian", {
		"Tidecutter Mk II": 4, "Riptide Turret Mk II": 5, "Glimmer Point Defense Mk II": 1,
		"Undertow Thruster Mk II": 2, "Eddy Steering Mk II": 1, "Siltwake Afterburner Mk II": 1, "Hyperdrive": 1,
		"Abyssal Cell Mk II": 2, "Glassweave Shield Mk II": 2, "Coldwater Sink Mk II": 2, "Brine Capacitor Mk II": 1}),
	# A Leviathan (the common solo warship) with Mk II gear.
	"Leviathan, Shoal Mk II": ("Leviathan", {
		"Lamprey Launcher Mk II": 1, "Glass Lamprey": 24, "Tidecutter Mk II": 3, "Riptide Turret Mk II": 3, "Glimmer Point Defense Mk II": 1,
		"Undertow Thruster Mk II": 1, "Eddy Steering Mk II": 1, "Siltwake Afterburner Mk II": 1, "Hyperdrive": 1,
		"Abyssal Cell Mk II": 2, "Glassweave Shield Mk II": 2, "Coldwater Sink Mk II": 2, "Brine Capacitor Mk II": 1}),
	# The Bactrian with Mk III gear (the yard's top): the deep tiers are for it.
	"Bactrian, Shoal Mk III": ("Bactrian", {
		"Lamprey Launcher Mk III": 2, "Glass Lamprey": 60, "Tidecutter Mk III": 2, "Riptide Turret Mk III": 5, "Glimmer Point Defense Mk III": 1,
		"Undertow Thruster Mk III": 2, "Eddy Steering Mk III": 1, "Siltwake Afterburner Mk III": 1, "Hyperdrive": 1,
		"Abyssal Cell Mk III": 2, "Glassweave Shield Mk III": 2, "Coldwater Sink Mk III": 1, "Brine Capacitor Mk III": 1}),
}
CAP = ["outfit space", "weapon capacity", "engine capacity", "gun ports", "turret mounts"]


class Side:
	"""One ship's fighting numbers, per second."""
	def __init__(self, name, attrs, outs):
		self.name = name
		a = dict(attrs)
		for o, n in outs.items():
			for k, v in OUTFITS[o].items():
				if isinstance(v, float) and k not in ("cost", "mass"):
					a[k] = a.get(k, 0) + v * n
		self.shields = a.get("shields", 0); self.hull = a.get("hull", 0)
		self.shield_regen = a.get("shield generation", 0) * 60
		self.hull_regen = a.get("hull repair rate", 0) * 60
		self.upkeep = (a.get("shield energy", 0) + a.get("hull energy", 0) + a.get("cooling energy", 0)
			+ a.get("energy consumption", 0)) * 60
		self.gen = a.get("energy generation", 0) * 60
		self.battery = a.get("energy capacity", 0)
		self.hull_prot = a.get("hull protection", 0); self.pierce_prot = a.get("piercing protection", 0)
		# Weapons: (shots a second, weapon, shots in the magazine or None).
		self.weapons = []
		self.am = 0
		for o, n in outs.items():
			w = OUTFITS[o].get("weapon")
			if not isinstance(w, dict) or not (OUTFITS[o].get("gun ports") or OUTFITS[o].get("turret mounts")):
				continue
			if w.get("anti-missile"):
				self.am = max(getattr(self, "am", 0), w["anti-missile"])
				continue
			rate = 60 / (w.get("reload", 1) or 1) * n
			ammo = w.get("ammo")
			self.weapons.append((rate, w, outs.get(ammo, 0) if isinstance(ammo, str) else None))
		self.attrs, self.outs = a, outs
		self.rates(lambda _: True)

	def rates(self, firing):
		"""Per second, from the weapons `firing` allows."""
		self.shield_dps = self.hull_dps = self.pierce_hull = self.fire_energy = 0.0
		self.drain = self.disrupt = 0.0
		# Missiles' share, by missile strength: [strength, shield, hull].
		self.missiles = []
		for rate, w, _ in self.weapons:
			if not firing(w):
				continue
			if w.get("missile strength"):
				self.missiles.append((w["missile strength"], w.get("shield damage", 0) * rate, w.get("hull damage", 0) * rate))
			self.shield_dps += w.get("shield damage", 0) * rate
			self.hull_dps += w.get("hull damage", 0) * rate
			self.pierce_hull += w.get("hull damage", 0) * rate * w.get("piercing", 0)
			self.fire_energy += w.get("firing energy", 0) * rate
			self.drain += (w.get("energy damage", 0) + 100 * w.get("ion damage", 0)) * rate
			# The standing level: about 100 a point of damage a frame.
			self.disrupt += w.get("disruption damage", 0) * rate / 60 * 100

	def fresh(self):
		return {"s": self.shields, "h": self.hull, "e": self.battery,
			"ammo": [m for _, _, m in self.weapons], "out": False}

	def reload(self, st, dt):
		"""Spend magazines; once one runs dry its weapon stops."""
		dry = False
		for k, (rate, w, m) in enumerate(self.weapons):
			if st["ammo"][k] is not None:
				st["ammo"][k] -= rate * dt
				dry |= st["ammo"][k] <= 0
		if dry and not st["out"]:
			st["out"] = True
		if dry:
			left = {id(w) for k, (_, w, _) in enumerate(self.weapons) if st["ammo"][k] is None or st["ammo"][k] > 0}
			self.rates(lambda w: id(w) in left)


def capacity_problems(hull, outs):
	attrs, _ = ship_info(SHIPS, hull)
	left = {k: attrs.get(k, 0) for k in CAP}
	for o, n in outs.items():
		for k in CAP:
			left[k] += OUTFITS[o].get(k, 0) * n
	return {k: v for k, v in left.items() if v < 0}


def ref_side(label):
	hull, outs = REFS[label]
	bad = capacity_problems(hull, outs)
	if bad:
		raise SystemExit("%s does not fit: %s" % (label, bad))
	attrs, _ = ship_info(SHIPS, hull)
	return Side(label, attrs, outs)


def warden_side(model):
	attrs, outs = ship_info(SHIPS, model)
	# A variant's "add attributes".
	for c in SHIPS[model]["node"]["c"]:
		if c["t"][:2] == ["add", "attributes"]:
			for g in c["c"]:
				if len(g["t"]) >= 2:
					try: attrs[g["t"][0]] = attrs.get(g["t"][0], 0) + float(g["t"][1])
					except ValueError: pass
	return Side(model, attrs, outs)


def fire(a, st, dt):
	"""The share of its weapons side `a` can fire this step, paying upkeep first."""
	need = (a.fire_energy + a.upkeep) * dt
	have = st["e"] + a.gen * dt
	frac = 1.0 if need <= 0 else min(1.0, max(0.0, have / need))
	st["e"] = min(a.battery, max(0.0, have - need * frac))
	return frac


def stopped(am, m):
	"""The share of missiles of strength m an anti-missile of strength am stops."""
	if am <= 0:
		return 0.0
	return 1 - m / (2 * am) if am >= m else am / (2 * m)


def hit(a, frac, b, st, dt):
	sd, hd = a.shield_dps, a.hull_dps
	for m, ms, mh in a.missiles:
		sd -= ms * stopped(b.am, m); hd -= mh * stopped(b.am, m)
	sd, hd = sd * frac * dt, hd * frac * dt
	hp = 1 / (1 + b.hull_prot)
	if st["s"] > 0:
		pierce = (a.pierce_hull / a.hull_dps) if a.hull_dps else 0.0
		shield_share = (1 - pierce / (1 + b.pierce_prot)) / (1 + a.disrupt * frac / 100)
		st["s"] -= sd * shield_share
		st["h"] -= hd * (1 - shield_share) * hp
		st["e"] = max(0.0, st["e"] - a.drain * frac * dt / 2)
		if st["s"] < 0:
			# What breaks the shields carries on into the hull.
			over = min(1.0, -st["s"] / (sd * shield_share)) if sd else 0
			st["h"] -= hd * shield_share * over * hp
			st["s"] = 0
	else:
		st["h"] -= hd * hp
		st["e"] = max(0.0, st["e"] - a.drain * frac * dt)


def regen(b, st, dt):
	if st["h"] > 0:
		st["s"] = min(b.shields, st["s"] + b.shield_regen * dt)
		st["h"] = min(b.hull, st["h"] + b.hull_regen * dt)


def fight(ref, enemies, limit=600.0, dt=0.1):
	"""Ref against the enemies, one at a time; every enemy fires at ref.
	Answers (ref won, seconds, ref's hull+shields left as a share)."""
	ref.rates(lambda _: True)
	r = ref.fresh(); es = [e.fresh() for e in enemies]
	t = 0.0
	while t < limit:
		alive = [i for i, s in enumerate(es) if s["h"] > 0]
		if not alive:
			return True, t, (r["s"] + r["h"]) / (ref.shields + ref.hull)
		if r["h"] <= 0:
			return False, t, 0.0
		target = alive[0]
		ref.reload(r, dt)
		f = fire(ref, r, dt)
		hit(ref, f, enemies[target], es[target], dt)
		for i in alive:
			fe = fire(enemies[i], es[i], dt)
			hit(enemies[i], fe, ref, r, dt)
		regen(ref, r, dt)
		for i in alive:
			regen(enemies[i], es[i], dt)
		t += dt
	return False, t, (r["s"] + r["h"]) / (ref.shields + ref.hull)


def fleet_ships(name):
	"""The fleet's variants: (weight, [models])."""
	out = []
	for c in FLEETS[name]["c"]:
		if c["t"][0] == "variant":
			w = int(c["t"][1]) if len(c["t"]) > 1 else 1
			ships = []
			for s in c["c"]:
				ships += [s["t"][0]] * (int(s["t"][1]) if len(s["t"]) > 1 else 1)
			out.append((w, ships))
	return out


def describe(s):
	s.rates(lambda _: True)
	return "%6.0f sh %6.0f hull, regen %4.0f/s, dps %5.0f / %5.0f, drain %5.0f, disruption %4.0f (energy %5.0f of %5.0f/s)" % (
		s.shields, s.hull, s.shield_regen, s.shield_dps, s.hull_dps, s.drain, s.disrupt, s.gen, s.fire_energy + s.upkeep)


def main():
	refs = [ref_side(k) for k in REFS]
	for r in refs:
		print("%-24s %s" % (r.name, describe(r)))
	print()
	models = ["Warden Picket", "Warden Lancer", "Warden Bastion", "The Undertow"]
	tiers = ["", " 2", " 3", " 4"]
	for m in models:
		for t in tiers:
			name = m + t
			if name in SHIPS:
				print("%-24s %s" % (name, describe(warden_side(name))))
	print("\none on one: who wins, in how many seconds, with how much of the reference ship left")
	print("%-18s" % "" + "".join("%-26s" % r.name for r in refs))
	for m in models:
		for t in tiers:
			name = m + t
			if name not in SHIPS:
				continue
			w = warden_side(name)
			row = "%-18s" % name
			for r in refs:
				won, secs, left = fight(r, [w])
				row += "%-26s" % (("win %4.0fs, %3.0f%% left" % (secs, 100 * left)) if won else ("LOSS %4.0fs" % secs))
			print(row)
	if "--fleets" in sys.argv:
		print("\nagainst each variant of each warden fleet (the reference ship fights them one at a time)")
		for f in sorted(FLEETS):
			if not f.startswith("Shoal Warden") and not f.startswith("Shoal Undertow"):
				continue
			for w, ships in fleet_ships(f):
				row = "%-28s %-40s" % (f, "+".join(ships)[:40])
				for r in refs:
					won, secs, left = fight(r, [warden_side(s) for s in ships])
					row += "%-22s" % (("win %4.0fs %3.0f%%" % (secs, 100 * left)) if won else ("LOSS %4.0fs" % secs))
				print(row)


if __name__ == "__main__":
	main()
