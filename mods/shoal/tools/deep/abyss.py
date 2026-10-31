#!/usr/bin/env python3
# The Abyss's wrecks (DESIGN.md section 22): "Drowned <Hull> (Abyss, X III)",
# one per exotic line, each the line's "(Deep, X II)" wreck with its Mk II
# swapped for the Mk III (the only place a Mk III is ever found rather than
# made). Written into "data/shoal ships.txt" between the BEGIN/END markers
# below (replaced whole on every run), so tools/h2h finds them like every
# other drowned variant. Run tools/ambushers/cap.py afterwards: a Mk III may
# need more room than its Mk II.
#
#	python3 tools/deep/abyss.py
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SHIPS = os.path.normpath(os.path.join(HERE, "..", "..", "data", "shoal ships.txt"))
BEGIN = "# BEGIN abyss wrecks (tools/deep/abyss.py)"
END = "# END abyss wrecks"

text = open(SHIPS, encoding="utf8").read()
if BEGIN in text:
	a = text.index(BEGIN); b = text.index(END) + len(END)
	text = text[:a].rstrip("\n") + "\n" + text[b:].lstrip("\n")

blocks = re.findall(r'^(ship "(Drowned [A-Za-z ]+)" "\2 \(Deep, ([A-Za-z]+) II\)"\n(?:\t.*\n|\n)*?)(?=^\S|\Z)', text, re.M)
out = [BEGIN, "# The Abyss's wrecks: each line's (Deep, X II) wreck with the Mk III instead.", ""]
for block, hull, short in blocks:
	lines = block.rstrip("\n").split("\n")
	lines[0] = 'ship "%s" "%s (Abyss, %s III)"' % (hull, hull, short)
	swapped = 0
	for i, line in enumerate(lines):
		m = re.match(r'^(\t\t)"(.*) Mk II"(.*)$', line)
		if m:
			lines[i] = '%s"%s Mk III"%s' % (m.group(1), m.group(2), m.group(3))
			swapped += 1
	assert swapped == 1, (hull, short, swapped)
	out.append("\n".join(lines) + "\n")
out.append(END)
text = text.rstrip("\n") + "\n\n" + "\n".join(out) + "\n"
open(SHIPS, "w", encoding="utf8").write(text)
print("%d abyss wrecks" % len(blocks))
