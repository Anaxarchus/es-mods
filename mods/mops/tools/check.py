#!/usr/bin/env python3
"""Checks MOPS's data against the game's data.

  python3 mods/mops/tools/check.py <endless-sky or argosy>/data

1. Every file in mods/mops/data parses the way the game reads it (tab
   indentation, balanced quotes and backticks).
2. Every system, planet, government, fleet, ship, phrase, event and planet attribute the
   missions, jobs and news name exists in the game's data (or MOPS's own).
3. Each mission's conditions on its own progress (": active", ": done") name a
   mission that exists.
Exits 1 if any check fails. Standard library only (Python 3.8+)."""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MOD_DATA = os.path.normpath(os.path.join(HERE, '..', 'data'))


def tokenize(line, where):
	tokens = []
	i = 0
	n = len(line)
	while i < n:
		c = line[i]
		if c in ' \t':
			i += 1
		elif c == '#':
			break
		elif c in '"`':
			j = line.find(c, i + 1)
			if j < 0:
				raise ValueError(f'{where}: unbalanced {c}')
			tokens.append(line[i + 1:j])
			i = j + 1
		else:
			j = i
			while j < n and line[j] not in ' \t':
				j += 1
			tokens.append(line[i:j])
			i = j
	return tokens


def parse(path):
	"""A list of (depth, tokens, line number) as the game's DataFile reads it."""
	nodes = []
	with open(path, encoding='utf-8') as f:
		for num, raw in enumerate(f, 1):
			line = raw.rstrip('\n').rstrip('\r')
			if not line.strip() or line.lstrip().startswith('#'):
				continue
			indent = len(line) - len(line.lstrip('\t'))
			if line[indent:indent + 1] == ' ':
				raise ValueError(f'{path}:{num}: indented with spaces')
			tokens = tokenize(line, f'{path}:{num}')
			if tokens:
				nodes.append((indent, tokens, num))
	return nodes


def data_files(root):
	for d, _, files in os.walk(root):
		for f in sorted(files):
			if f.endswith('.txt'):
				yield os.path.join(d, f)


def catalogue(roots):
	cat = {k: set() for k in ('system', 'government', 'fleet', 'ship', 'phrase', 'mission', 'event', 'planet', 'planet attribute')}
	for root in roots:
		for path in data_files(root):
			try:
				nodes = parse(path)
			except ValueError:
				continue
			in_planet = False
			for depth, tok, _ in nodes:
				if depth == 0:
					in_planet = tok[0] == 'planet'
					if tok[0] == 'ship' and len(tok) >= 2:
						cat['ship'].add(tok[-1])
					elif tok[0] in cat and len(tok) >= 2:
						cat[tok[0]].add(tok[1])
				elif depth == 1 and in_planet and tok[0] == 'attributes':
					cat['planet attribute'].update(tok[1:])
	# Attributes the game gives planets by what they have (Planet.cpp AUTO_ATTRIBUTES).
	cat['planet attribute'].update(['spaceport', 'port', 'shipyard', 'outfitter', 'service: trading', 'service: jobs', 'service: bank'])
	return cat


def main():
	if len(sys.argv) != 2 or not os.path.isdir(sys.argv[1]):
		print(__doc__)
		return 2
	game = sys.argv[1]
	cat = catalogue([game, MOD_DATA])
	problems = []

	def need(kind, name, where):
		if name not in cat[kind]:
			problems.append(f'{where}: no {kind} "{name}"')

	count = 0
	for path in data_files(MOD_DATA):
		rel = os.path.relpath(path, MOD_DATA)
		try:
			nodes = parse(path)
		except ValueError as e:
			problems.append(str(e))
			continue
		stack = []
		for depth, tok, num in nodes:
			where = f'{rel}:{num}'
			del stack[depth:]
			stack.append(tok[0])
			parent = stack[-2] if len(stack) >= 2 else ''
			key = tok[0]
			args = tok[1:]
			if key == 'government':
				for a in args:
					need('government', a, where)
			elif key == 'system' and depth > 0 and args:
				for a in args:
					need('system', a, where)
			elif key in ('destination', 'source') and args and depth == 1:
				need('planet', args[0], where)
			elif key == 'near' and args:
				need('system', args[0], where)
			elif key == 'fleet' and args:
				need('fleet', args[0], where)
			elif depth >= 3 and parent == 'variant':
				need('ship', key, where)
			elif key == 'ship' and depth >= 2 and args:
				need('ship', args[0], where)
			elif key == 'phrase' and depth > 0 and args:
				need('phrase', args[0], where)
			elif key == 'attributes' and parent in ('source', 'destination') and depth >= 2:
				for a in args:
					need('planet attribute', a, where)
			elif key in ('has', 'not') and args and depth >= 2:
				m = re.match(r'^(.*): (active|done|offered|declined)$', args[0])
				if m:
					need('mission', m.group(1), where)
				m = re.match(r'^event: (.*)$', args[0])
				if m:
					need('event', m.group(1), where)
				m = re.match(r'^visited system: (.*)$', args[0])
				if m:
					need('system', m.group(1), where)
			elif re.match(r'^reputation: ', key):
				need('government', key[len('reputation: '):], where)
			elif re.match(r'^(.*): (active|done)$', key) and depth >= 2:
				need('mission', re.match(r'^(.*): (active|done)$', key).group(1), where)
			if depth == 0 and key == 'mission':
				count += 1
	for p in problems:
		print(p)
	print(f'{count} missions checked against {game}: {"OK" if not problems else str(len(problems)) + " problem(s)"}')
	return 1 if problems else 0


if __name__ == '__main__':
	sys.exit(main())
