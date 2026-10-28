"""Replays the Free Worlds campaign path (path.py) on a nominal timeline: which events and
conditions it applies, on which day. Shared by emit.py and check.py."""
import datetime
import os

from esdata import parse, walk
import path as P

OPS = ('=', '+=', '-=', '++', '--', '<?=', '>?=', '*=', '/=')
# The dated campaign events (campaign events.txt) that the triggers wait for.
DATED = {
	'initial deployment 2': datetime.date(3014, 8, 14),
	'initial deployment 3': datetime.date(3014, 8, 29),
}


class Campaign:
	def __init__(self, data):
		self.data = data
		self.files = {}
		self.epoch = datetime.date(P.FIRST_DAY[2], P.FIRST_DAY[1], P.FIRST_DAY[0])
		self.simulate()

	def missions(self, rel):
		if rel not in self.files:
			root = parse(os.path.join(self.data, rel))
			self.files[rel] = {m.tokens[1]: m for m in root.children if m.tokens[0] == 'mission' and len(m.tokens) > 1}
		return self.files[rel]

	def actions(self, rel, name):
		"""(phase, kind, value, line) for each action of a mission. phase: offer (on offer, on accept and
		their conversations), mid (on enter, on waypoint) or complete. Branches in SKIP are left out."""
		out = []

		def rec(node, phase):
			for c in node.children:
				t = c.tokens
				k = t[0]
				if k == 'on':
					what = t[1] if len(t) > 1 else ''
					if what in ('offer', 'accept'):
						rec(c, 'offer')
					elif what in ('enter', 'waypoint'):
						rec(c, 'mid')
					elif what == 'complete':
						rec(c, 'complete')
					continue
				if phase is None or k in ('npc', 'to', 'description', 'name', 'source', 'destination', 'substitutions'):
					continue
				if (rel, c.line) in P.SKIP:
					continue
				if k == 'event' and len(t) > 1:
					out.append((phase, 'event', (t[1], int(t[2]) if len(t) > 2 else 1), c.line))
				elif k in ('set', 'clear') and len(t) > 1:
					out.append((phase, 'cond', (t[1], k), c.line))
				elif len(t) >= 2 and t[1] in OPS:
					out.append((phase, 'cond', (t[0], t[1], t[2] if len(t) > 2 else None), c.line))
				elif k == 'log':
					out.append((phase, 'log', t[1:] + [g.tokens[0] for g in c.children], c.line))
					continue
				elif k in ('payment', 'outfit', 'fail', 'give'):
					out.append((phase, k, t[1:], c.line))
				rec(c, phase)

		rec(self.missions(rel)[name], None)
		return out

	def status(self, rel, name):
		"""How the mission ends on this path: done, declined or failed."""
		for n, st, why in P.EXTRA:
			if n == name:
				return st
		m = self.missions(rel)[name]
		offer = [c for c in m.children if c.tokens[:2] == ['on', 'offer']]
		if offer:
			nodes = list(walk(offer[0]))
			if any(n.tokens == ['fail'] for n in nodes):
				return 'failed'
			conv = [n for n in nodes if n.tokens[0] == 'conversation']
			if conv:
				toks = {n.tokens[0] for n in walk(conv[0])}
				if 'decline' in toks and 'accept' not in toks:
					return 'declined'
		return 'done'

	def simulate(self):
		day = 0
		seq = 0
		self.timeline = []  # (day, seq, kind, value, source)
		self.offered = []   # (file, mission, day)
		eventday = {}

		def add(at, kind, value, src):
			nonlocal seq
			seq += 1
			self.timeline.append((at, seq, kind, value, src))
			if kind == 'event':
				eventday.setdefault(value, at)

		def trigger(rel, name, base):
			for ph, k, v, ln in self.actions(rel, name):
				if k == 'event':
					add(base + v[1], 'event', v[0], f'{rel}:{ln} ({name})')

		for entry in P.PATH:
			rel, name, dur = entry[:3]
			gate = entry[3] if len(entry) > 3 else None
			if gate:
				if gate not in eventday:
					raise SystemExit(f'{name} waits for "{gate}", which nothing before it schedules')
				day = max(day, eventday[gate])
			for ph, k, v, ln in self.actions(rel, name):
				at = {'offer': day, 'mid': day + dur // 2, 'complete': day + dur}[ph]
				src = f'{rel}:{ln} ({name}, on {ph})'
				if k == 'event':
					add(at + v[1], 'event', v[0], src)
				elif k in ('cond', 'log', 'fail'):
					add(at, k, v, src)
			self.offered.append((rel, name, day))
			for trel, tname, when in P.TRIGGERS:
				if when == 'after ' + name:
					trigger(trel, tname, day + dur)
			day += dur
		self.end = day
		for trel, tname, when in P.TRIGGERS:
			if when.startswith('event '):
				g = when[len('event '):]
				# The trigger fires on the first landing after its event: a day later.
				base = (DATED[g] - self.epoch).days + 1 if g in DATED else eventday[g]
				trigger(trel, tname, base)
		self.timeline.sort(key=lambda x: (x[0], x[1]))

	def date(self, day):
		return self.epoch + datetime.timedelta(days=day)
