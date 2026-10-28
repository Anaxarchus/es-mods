"""A small reader for Endless Sky data files (tab-indented token trees), enough
for the Free Worlds Veteran start's generator and checker. Standard library only."""
import glob
import os


class Node:
    def __init__(self, tokens, line, path, indent):
        self.tokens = tokens
        self.line = line
        self.path = path
        self.indent = indent
        self.children = []

    def __repr__(self):
        return ' '.join(self.tokens)


def tokenize(line):
    tokens = []
    i, n = 0, len(line)
    while i < n:
        c = line[i]
        if c in ' \t':
            i += 1
        elif c == '#':
            break
        elif c in '"`':
            j = line.find(c, i + 1)
            if j < 0:
                j = n
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
    """The root node of a data file; its children are the top-level nodes."""
    root = Node([], 0, path, -1)
    stack = [root]
    with open(path, encoding='utf-8') as f:
        for number, raw in enumerate(f, 1):
            raw = raw.rstrip('\n')
            if not raw.strip() or raw.lstrip().startswith('#'):
                continue
            indent = len(raw) - len(raw.lstrip('\t'))
            tokens = tokenize(raw)
            if not tokens:
                continue
            node = Node(tokens, number, path, indent)
            while stack[-1].indent >= indent:
                stack.pop()
            stack[-1].children.append(node)
            stack.append(node)
    return root


def walk(node):
    yield node
    for child in node.children:
        yield from walk(child)


def data_files(data):
    return sorted(glob.glob(os.path.join(data, '**', '*.txt'), recursive=True))


def quote(text):
    return '`' + text + '`' if '"' in text else '"' + text + '"'
