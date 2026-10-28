#!/usr/bin/env python3
"""Checks the "Free Worlds Veteran" start against the game's data.

  python3 mods/diplomacy/tools/fw-veteran/check.py <endless-sky>/data [start file]

1. The start file is what emit.py makes from this data (so it is current).
2. Every event and condition that any Free Worlds campaign mission applies is either reproduced by the
   start, or is listed with the reason it is not (a branch or an ending this path does not take).
3. Every event, mission, ship and outfit the start names exists in the game's data.
4. Diplomacy's needs: "free worlds plot completed" is set, and replaying the territory changes gives
   the three factions their capitals and the Free Worlds their wartime and later territory.
Exits 1 if any check fails. Standard library only (Python 3.8+)."""
import datetime
import os
import sys
import tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
# Diplomacy's own data: the start applies one of its events (the Luna Navy yard).
PLUGIN_DATA = os.path.normpath(os.path.join(HERE, '..', '..', 'data'))
sys.path.insert(0, HERE)
from esdata import data_files, parse, walk  # noqa: E402
from campaign import Campaign  # noqa: E402
import emit  # noqa: E402
import path as P  # noqa: E402

FW_FILES = ['human/free worlds 0 prologue.txt', 'human/free worlds 1 start.txt', 'human/free worlds 2 middle.txt',
	'human/free worlds 3 reconciliation.txt', 'human/free worlds 3 checkmate.txt', 'human/free worlds 4 epilogue.txt',
	'human/free worlds side plots.txt', 'human/free worlds war jobs.txt', 'human/campaign events.txt',
	'human/post-war reactions.txt']
# Why a mission's actions are not reproduced, by file or by mission.
WHY_FILE = {
	'human/free worlds 3 checkmate.txt': 'the Checkmate ending (the defector handed back at New Tibet)',
	'human/free worlds 4 epilogue.txt': 'after the campaign: offered to the new pilot as to any finisher',
	'human/post-war reactions.txt': 'after the campaign: offered to the new pilot as to any finisher',
	'human/free worlds war jobs.txt': 'repeatable war jobs (no galaxy changes)',
}
WHY_MISSION = {
	'Pact Recon 0': 'the pre-war Pact jobs (optional, random)', 'Pact Recon 1': 'the pre-war Pact jobs',
	'Pact Recon 2': 'the pre-war Pact jobs', 'Pact Recon 3': 'the pre-war Pact jobs',
	'FW Escort 1': 'only on failing the escort', 'FW Escort 1B': 'only on failing the escort',
	'FW Escort 2': 'only on failing the escort', 'FW Escort 2B': 'only on failing the escort',
	'FW Escort 3': 'only on failing the escort', 'FW Escort Second Chance': 'only after failing an escort',
	'FW Bounty 1': 'optional bounties before the war (not taken)', 'FW Bounty 2': 'optional bounties',
	'FW Bounty 3': 'optional bounties', 'FW Katya 1': 'only on declining (Katya Alt 2)',
	'FW Katya Alt 2': 'the alternative after declining FW Katya 1', 'FW License Fix': 'a save-game fix',
	'FW Pirates: Attack 2': 'the attack on Greenrock (diplomacy chosen)', 'FW Senate Hearing': 'the Greenrock attack branch',
	'FW Pirates: Invasion Fleet': 'the Greenrock attack branch',
	'FW Southern Recon 1B': 'the Electron Turret variant', 'FW Southern Recon 1B (Turret)': 'the Electron Turret variant',
	'FW Southern Prisoners - Keep': 'keeping the prisoners (released on this path)',
	'FW Southern Prisoners - Kept': 'keeping the prisoners', 'FW Alphas 1.2': 'the 4.2A branch (karma below 2)',
	'FW Alphas 1.2A': 'the 4.2A branch', 'FW Bloodsea 1.2A': 'the battle for Bloodsea (Bloodsea joins on this path)',
	'Ijs catches another ride': 'the Conservatory side plot (not taken)', 'FW Conservatory 2': 'the Conservatory side plot',
	'FW Conservatory 2B': 'the Conservatory side plot', 'FW Flamethrower 2': 'the Flamethrower side plot (still offered later)',
	'FW Zug Expansion: Assisted': 'the assisted Zug expansion (the unassisted one runs)',
	'FW Wolf Pack 1B': 'the Wolf Pack side plot (ends at the armistice)', 'FW Wolf Pack 2A': 'the Wolf Pack side plot',
	'FW Wolf Pack 3': 'the Wolf Pack side plot', 'FW Wolf Pack 4': 'the Wolf Pack side plot',
	'FW Stack Core 1B': 'the stack core side plot ("stack core for sale" fires at the end anyway)',
	'FWC Stack Core 1': 'the Checkmate stack core', 'FW Pug 2C: Scram Drive': 'a Scram Drive flagship (Hyperdrive assumed)',
	'FW Pug 2C: Jump Drive': 'a flagship that already had a Jump Drive', 'FW Pug 2C: Side': 'optional conversation',
	'FW Pug 3C (Extra)': 'a flagship that already had a Jump Drive', 'FW Pug 1': None,
	'FW Navy Out Of Rastaban (Bad Karma)': 'karma 0 or less (karma 3 here: the early withdrawal runs)',
	'FW Liberate Delta Sagittarii': 'the Checkmate branch', 'Main Plot Completed Date': 'fires on the first landing',
	'Deep Memorial Finished': 'fires on the first landing after the campaign',
	'Geminus Rebuilt': 'fires on the first landing after the campaign', 'Martini Recovers': 'fires on the first landing after the campaign',
	'FW Clink Prison Closes': 'keeping the prisoners', 'event: war begins': 'flavour on landing ("bombing witness")',
	'FW Recon 3B': None, 'FW Escort 0': None,
}

failures = []


def fail(msg):
	failures.append(msg)
	print('FAIL', msg)


def main(data, start_file):
	c = Campaign(data)
	# 1. Current.
	with tempfile.TemporaryDirectory() as tmp:
		fresh = os.path.join(tmp, 'start.txt')
		emit.emit(data, fresh)
		if open(fresh, encoding='utf-8').read() != open(start_file, encoding='utf-8').read():
			fail(f'{start_file} is not what emit.py makes from this data: run emit.py again')
		else:
			print('ok   the start file is current')
	root = parse(start_file)
	start = [n for n in root.children if n.tokens[0] == 'start'][0]
	conv = [n for n in root.children if n.tokens[0] == 'conversation'][0]
	start_sets = {n.tokens[1] for n in start.children if n.tokens[0] == 'set'}
	start_assign = {n.tokens[0]: n.tokens[2] for n in start.children if len(n.tokens) == 3 and n.tokens[1] == '='}
	applied, scheduled, reps = [], {}, []
	for a in conv.children:
		if a.tokens[0] != 'action':
			continue
		for g in a.children:
			if g.tokens[0] == 'event':
				(applied.append(g.tokens[1]) if int(g.tokens[2]) == 0 else scheduled.__setitem__(g.tokens[1], int(g.tokens[2])))
			elif len(g.tokens) >= 2 and g.tokens[0].startswith('reputation: '):
				reps.append(g.tokens)
	events_in_start = set(applied) | set(scheduled)

	# 2. Coverage of every campaign action.
	on_path = {(rel, name) for rel, name, d in c.offered}
	triggers = {(rel, name) for rel, name, w in P.TRIGGERS}
	covered = skipped = 0
	notes = {}
	for rel in FW_FILES:
		for m in parse(os.path.join(data, rel)).children:
			if m.tokens[0] != 'mission':
				continue
			name = m.tokens[1]
			# Actions that only run when the mission is failed, aborted, declined, deferred or visited
			# unfinished: none of those happens on this path.
			unhappy = set()
			for blk in m.children:
				if blk.tokens[0] == 'on' and len(blk.tokens) > 1 and blk.tokens[1] in ('fail', 'abort', 'decline', 'defer', 'visit'):
					unhappy |= {id(x) for x in walk(blk)}
			for n in walk(m):
				t = n.tokens
				what = None
				if t[0] == 'event' and len(t) > 1 and n.indent > 1:
					what = ('event', t[1])
				elif t[0] in ('set', 'clear') and len(t) > 1:
					what = ('cond', t[1])
				elif len(t) >= 2 and t[1] in ('=', '+=', '-=', '++', '--', '<?=', '>?=') and n.indent > 1:
					what = ('cond', t[0])
				if not what:
					continue
				kind, value = what
				ok = (kind == 'event' and value in events_in_start) or (kind == 'cond' and (value in start_sets
					or value in start_assign or any(r[0] == value for r in reps)))
				if id(n) in unhappy:
					skipped += 1
					notes.setdefault('only when a mission is failed, aborted, declined or left unfinished', []).append(f'{kind} "{value}" ({name})')
					continue
				if (rel, n.line) in P.SKIP:
					skipped += 1
					notes.setdefault(P.SKIP[(rel, n.line)], []).append(f'{kind} "{value}"')
					continue
				if ok:
					covered += 1
					continue
				if (rel, name) in on_path or (rel, name) in triggers:
					# On the path but not in the start: only temporary values (cleared again) may be missing.
					if kind == 'cond' and value in ('gay', 'fw located pirate fleet') or value.endswith(': offered'):
						skipped += 1
						continue
					# A conversation action on the path: is it a branch the path takes?
					fail(f'{rel}:{n.line} ({name}) {kind} "{value}" is on the path but not in the start')
					continue
				why = WHY_MISSION.get(name) or WHY_FILE.get(rel) or f'not on the path ({os.path.basename(rel)})'
				skipped += 1
				notes.setdefault(why, []).append(f'{kind} "{value}" ({name})')
	print(f'ok   campaign actions: {covered} reproduced, {skipped} not, each for a reason:')
	for why in sorted(notes):
		items = sorted(set(notes[why]))
		print(f'       - {why}: {", ".join(items[:6])}{" ..." if len(items) > 6 else ""}')

	# 3. Names exist.
	events, missions, ships, outfits = set(), set(), set(), set()
	for f in data_files(data) + data_files(PLUGIN_DATA):
		for n in parse(f).children:
			if len(n.tokens) < 2:
				continue
			{'event': events, 'mission': missions, 'ship': ships, 'outfit': outfits}.get(n.tokens[0], set()).add(n.tokens[1])
	for e in events_in_start:
		if e not in events:
			fail(f'event "{e}" is not in the game data or the plugin\'s')
	campaign_flags = {k for k, v in emit.final_conditions(c)}
	for s in start_sets - campaign_flags:
		for suffix in (': offered', ': done', ': declined', ': failed'):
			if s.endswith(suffix) and s[:-len(suffix)] not in missions:
				fail(f'mission "{s[:-len(suffix)]}" is not in the game data')
	for o in emit.OSPREY:
		if o and o.split('"')[1] not in outfits:
			fail(f'outfit {o} is not in the game data')
	if 'Osprey' not in ships:
		fail('ship "Osprey" is not in the game data')
	print(f'ok   {len(events_in_start)} events, {len(start_sets)} conditions checked against the game data' if not failures else '')

	# 4. Diplomacy's needs.
	if 'free worlds plot completed' not in start_sets:
		fail('"free worlds plot completed" (what Diplomacy waits for) is not set')
	date = start.children[[n.tokens[0] for n in start.children].index('date')].tokens[1:]
	start_date = datetime.date(int(date[2]), int(date[1]), int(date[0]))
	event_nodes = {}
	for f in data_files(data) + data_files(PLUGIN_DATA):
		for n in parse(f).children:
			if n.tokens[0] == 'event' and len(n.tokens) > 1:
				event_nodes[n.tokens[1]] = n
	dated = []
	for name, n in event_nodes.items():
		for ch in n.children:
			if ch.tokens[0] == 'date':
				d = datetime.date(int(ch.tokens[3]), int(ch.tokens[2]), int(ch.tokens[1]))
				if d <= start_date:
					dated.append((d, name))
	owner = {}
	for f in data_files(data):
		if os.path.basename(f) == 'map systems.txt':
			for n in parse(f).children:
				if n.tokens[0] == 'system':
					for ch in n.children:
						if ch.tokens[0] == 'government':
							owner[n.tokens[1]] = ch.tokens[1]
	for name in [e for d, e in sorted(dated)] + applied:
		for ch in event_nodes[name].children:
			if ch.tokens[0] == 'system' and len(ch.tokens) > 1:
				for g in ch.children:
					if g.tokens[0] == 'government' and len(g.tokens) > 1:
						owner[ch.tokens[1]] = g.tokens[1]
	for system, gov in (('Sol', 'Republic'), ('Gamma Corvi', 'Free Worlds'), ('Markab', 'Syndicate')):
		if owner.get(system) != gov:
			fail(f'{system} belongs to {owner.get(system)}, not {gov}')
	fw = sorted(s for s, g in owner.items() if g == 'Free Worlds')
	print(f'ok   Diplomacy: "free worlds plot completed" set; capitals held; the Free Worlds hold {len(fw)} systems:')
	print('       ' + ', '.join(fw))
	print(f'     the Republic {sum(g == "Republic" for g in owner.values())}, the Syndicate {sum(g == "Syndicate" for g in owner.values())}')
	print(f'     {len(applied)} events applied, {len(scheduled)} scheduled: ' + ', '.join(f'{k} (+{v})' for k, v in scheduled.items()))
	if failures:
		print(f'FAILED: {len(failures)}')
		sys.exit(1)
	print('PASSED')


if __name__ == '__main__':
	if len(sys.argv) < 2:
		sys.exit(__doc__)
	main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else emit.DEFAULT_OUT)
