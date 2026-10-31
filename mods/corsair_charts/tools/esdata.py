"""Read Endless Sky data files (stock or plugin) into simple nodes.
Used by gen.py (to copy stock hulls for the prototypes) and niche.py (to compare
the exotics with stock outfits). Usage as a library."""
import glob, os

ES = os.environ.get("ES_DATA", "/root/fork/argosy/data")


def tokenize(line):
    toks, i, n = [], 0, len(line)
    while i < n:
        c = line[i]
        if c in " \t":
            i += 1
        elif c == "#":
            break
        elif c in "\"`":
            j = line.find(c, i + 1)
            if j < 0:
                j = n
            toks.append(line[i + 1:j])
            i = j + 1
        else:
            j = i
            while j < n and line[j] not in " \t":
                j += 1
            toks.append(line[i:j])
            i = j
    return toks


class Node:
    def __init__(self, toks, raw):
        self.toks, self.kids, self.raw = toks, [], raw

    def get(self, key, default=None):
        for k in self.kids:
            if k.toks and k.toks[0] == key:
                return k
        return default

    def num(self, key, default=0.0):
        k = self.get(key)
        if k is None or len(k.toks) < 2:
            return default
        try:
            return float(k.toks[1])
        except ValueError:
            return default

    def text(self, depth=0):
        out = ["\t" * depth + self.raw]
        for k in self.kids:
            out.append(k.text(depth + 1))
        return "\n".join(out)


def parse_file(path):
    roots, stack = [], []
    for raw in open(path, encoding="utf-8"):
        line = raw.rstrip("\n").rstrip("\r")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        body = line.lstrip("\t ")
        indent = len(line) - len(body)
        node = Node(tokenize(body), body)
        while stack and stack[-1][0] >= indent:
            stack.pop()
        if stack:
            stack[-1][1].kids.append(node)
        else:
            roots.append(node)
        stack.append((indent, node))
    return roots


def load(root=ES):
    out = []
    for f in sorted(glob.glob(os.path.join(root, "**", "*.txt"), recursive=True)):
        if "_deprecated" in f:
            continue
        out += parse_file(f)
    return out


def index(nodes, kind):
    d = {}
    for n in nodes:
        if n.toks and n.toks[0] == kind and len(n.toks) == 2:
            d.setdefault(n.toks[1], n)
    return d
