# Per-ship exotic distribution of the ambusher fleets, computed from the plugin's final data.
import sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from es import *
from collections import defaultdict
O, S, F = load()
LINES = ["Tidecutter", "Riptide Turret", "Glassweave Shield", "Abyssal Cell", "Undertow Thruster", "Coralgraft Mender",
	"Eddy Steering", "Brine Capacitor", "Coldwater Sink", "Glimmer Point Defense", "Coral Plating", "Siltwake Afterburner",
	"Driftnet Ramscoop", "Lamprey Launcher"]
WAR = ("Osprey", "Falcon", "Leviathan", "Bactrian")
def exotics(ship):
	_, outs = ship_info(S, ship); r = []
	for o, n in outs.items():
		for l in LINES:
			for mk in ("Mk I", "Mk II", "Mk III"):
				if o == l + " " + mk: r += [(l, mk)] * n
	return r
def report(fleet):
	vs = []
	for c in F[fleet]['c']:
		if c['t'][0] == 'variant':
			w = int(c['t'][1]) if len(c['t']) > 1 else 1
			assert len(c['c']) == 1 and len(c['c'][0]['t']) == 1, "single-ship variants only"
			vs.append((w, c['c'][0]['t'][0]))
	tot = sum(w for w, _ in vs)
	print('== %s: %d variants, total weight %d' % (fleet, len(vs), tot))
	groups = {'all': lambda h: True, 'warship hulls': lambda h: h in WAR, 'freighter hulls': lambda h: h not in WAR}
	for g, pred in groups.items():
		sub = [(w, v) for w, v in vs if pred(S[v]['base'].replace('Drowned ', ''))]
		t = sum(w for w, _ in sub)
		if not t: continue
		k = defaultdict(int); mk = defaultdict(int); line = defaultdict(lambda: defaultdict(int)); glass = core = 0
		for w, v in sub:
			ex = exotics(v); k[len(ex)] += w
			for l, m in ex: mk[m] += w; line[l][m] += w
			_, outs = ship_info(S, v); glass += w * outs.get('Shoal Glass', 0); core += w * outs.get('Warden Core', 0)
		n = sum(mk.values())
		print('  %-16s ships: ' % g + '  '.join('%d: %5.1f%%' % (i, 100 * k[i] / t) for i in range(4)) +
			'   >=1: %5.1f%%   exotics/ship %.3f' % (100 * (t - k[0]) / t, n / t))
		print('  %-16s marks: Mk I %5.1f%%  Mk II %5.1f%%  Mk III %d;  glass/ship %.1f, cores/ship %.2f' % ('', 100 * mk['Mk I'] / n, 100 * mk['Mk II'] / n, mk['Mk III'], glass / t, core / t))
		if g == 'all':
			print('  per line (exotics per 100 ships: Mk I + Mk II):')
			for l in LINES:
				print('    %-22s %5.2f + %4.2f = %5.2f' % (l, 100 * line[l]['Mk I'] / t, 100 * line[l]['Mk II'] / t, 100 * (line[l]['Mk I'] + line[l]['Mk II']) / t))
	# capacity
	bad = [v for _, v in vs if any(x < 0 for x in slack(O, S, v)[0].values())]
	print('  over capacity:', len(bad))
for f in ("Shoal Ambushers", "Shoal Ambush Hunter"): report(f)
