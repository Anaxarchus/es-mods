#!/usr/bin/env python3
"""Helpers for tools/release.sh and tools/sync-sdk.sh (Python 3.8+, standard
library only). Not meant to be run by hand, but each command prints what it
does with --help-less usage on error:

  mod-hash <root> <mod> [--list]       the mod's source hash (see SOURCE HASH below)
  tree-hash <root> <path>...           the same hash over any files and folders
  plugin-field <plugin.txt> <key>      the first value of `name`, `about` or `version`
  slug <text>                          "Outfit Integration" -> outfit-integration
  semver <version>                     exit 1 unless a SemVer 2 version (1.2.3, 1.2.3-beta.1)
  bump <version|-> patch|minor|major   the next version (- : never released -> 0.1.0)
  latest <mod>                         the highest <mod>-v<semver> tag of those on stdin
  last <root> <mod>                    "version<TAB>tag<TAB>source_hash" from releases.json
  record <root> <mod> <version> <tag> <hash>   store a release in releases.json
  pack <out.zip> --root NAME --tree DIR [--version V] [--add NAME=FILE]... [--mtime EPOCH]
  sums <dir> <file>...                 SHA256SUMS lines (sha256sum's format)
  sync-meta <root> <sdk> [--check] <vendored path>...

SOURCE HASH. A mod's source hash covers everything that changes what its
release contains:
  * the mod's folder, mods/<mod>/, except test/ and tools/ (development only)
    and Markdown files at its top (README.md, DESIGN.md, HANDOFF.md): that is
    plugin.txt, src/, scripts/, data/, images/, sounds/, shaders/, and extra
    plugins such as diplomacy's debug/;
  * the vendored SDK files the build reads: imports/sdk/es/, js/es.js,
    js/package.json and tools/esmod.mjs;
  * package.json's devDependencies (the esbuild and TypeScript versions).
Not covered: the Dado compiler's version (dadoc), and tools/release.sh's own
packaging (INSTALL.txt wording). Inside a git repository the files are those
git would commit (`git ls-files -co --exclude-standard`: tracked and
untracked, .gitignore respected); elsewhere every file but .DS_Store,
node_modules/ and dist/. The hash is SHA-256 over sorted lines
"<mode> <path>\\0<sha256 of content>\\n" (mode 100644, 100755 or 120000 for a
symlink): contents and modes only, no times, no git objects.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile

SDK_INPUTS = ["imports/sdk/es", "js/es.js", "js/package.json", "tools/esmod.mjs"]
MOD_EXCLUDE_DIRS = {"test", "tools"}
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$")


def die(msg, code=1):
    sys.stderr.write("release.py: %s\n" % msg)
    sys.exit(code)


# ---- files and hashes ------------------------------------------------------

def in_git(root):
    try:
        out = subprocess.run(["git", "-C", root, "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    except OSError:
        return False
    return out.returncode == 0 and os.path.realpath(out.stdout.strip()) == os.path.realpath(root)


def list_files(root, paths):
    """Files (relative, '/'-separated) under each path, as git would commit them."""
    paths = [p for p in paths if os.path.lexists(os.path.join(root, p))]
    if not paths:
        return []
    if in_git(root):
        out = subprocess.run(["git", "-C", root, "ls-files", "-co", "--exclude-standard", "-z", "--"] + paths,
                             capture_output=True, check=True)
        files = [f.decode("utf-8") for f in out.stdout.split(b"\0") if f]
        # -c lists files deleted from the worktree but still in the index.
        files = [f for f in files if os.path.lexists(os.path.join(root, f))]
    else:
        files = []
        for p in paths:
            full = os.path.join(root, p)
            if os.path.isfile(full) or os.path.islink(full):
                files.append(p)
                continue
            for d, dirs, names in os.walk(full):
                dirs[:] = [x for x in dirs if x not in ("node_modules", "dist", ".git")]
                for n in names:
                    if n != ".DS_Store":
                        files.append(os.path.relpath(os.path.join(d, n), root).replace(os.sep, "/"))
    return sorted(set(files), key=lambda f: f.encode("utf-8"))


def entry(root, f):
    full = os.path.join(root, f)
    if os.path.islink(full):
        return "120000", hashlib.sha256(os.readlink(full).encode("utf-8")).hexdigest()
    mode = "100755" if os.stat(full).st_mode & 0o111 else "100644"
    h = hashlib.sha256()
    with open(full, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return mode, h.hexdigest()


def digest(root, files, extra=()):
    """extra: (path, bytes) pseudo-files, hashed like files with mode 100644."""
    lines = []
    for f in files:
        mode, h = entry(root, f)
        lines.append((f, "%s %s\0%s\n" % (mode, f, h)))
    for name, data in extra:
        lines.append((name, "100644 %s\0%s\n" % (name, hashlib.sha256(data).hexdigest())))
    lines.sort(key=lambda x: x[0].encode("utf-8"))
    return hashlib.sha256("".join(l for _, l in lines).encode("utf-8")).hexdigest(), [n for n, _ in lines]


def mod_files(root, mod):
    base = "mods/%s/" % mod
    out = []
    for f in list_files(root, ["mods/" + mod]):
        rest = f[len(base):]
        top = rest.split("/", 1)[0]
        if "/" in rest and top in MOD_EXCLUDE_DIRS:
            continue
        if "/" not in rest and rest.lower().endswith(".md"):
            continue
        out.append(f)
    return out


def dev_deps(root):
    with open(os.path.join(root, "package.json"), encoding="utf-8") as fh:
        pkg = json.load(fh)
    deps = pkg.get("devDependencies", {})
    return ("package.json#devDependencies", json.dumps(deps, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def cmd_mod_hash(args):
    if len(args) < 2:
        die("usage: mod-hash <root> <mod> [--list]", 2)
    root, mod = args[0], args[1]
    if not os.path.isfile(os.path.join(root, "mods", mod, "plugin.txt")):
        die("mods/%s has no plugin.txt" % mod)
    files = mod_files(root, mod) + list_files(root, SDK_INPUTS)
    h, names = digest(root, files, [dev_deps(root)])
    if "--list" in args[2:]:
        print("\n".join(names))
    print(h)


def cmd_tree_hash(args):
    if not args:
        die("usage: tree-hash <root> <path>...", 2)
    print(digest(args[0], list_files(args[0], args[1:]))[0])


# ---- plugin.txt ------------------------------------------------------------

def plugin_lines(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read().split("\n")


def first_value(line, key):
    m = re.match(r'^%s\s+(?:"([^"]*)"|`([^`]*)`|(\S+))\s*$' % re.escape(key), line)
    if not m:
        return None
    return next(g for g in m.groups() if g is not None)


def cmd_plugin_field(args):
    if len(args) != 2:
        die("usage: plugin-field <plugin.txt> <key>", 2)
    for line in plugin_lines(args[0]):
        v = first_value(line, args[1])
        if v is not None:
            print(v)
            return
    sys.exit(1)


def stamp(text, version):
    """plugin.txt with its top-level `version` line set to version (added after
    `name` if it has none). The game reads `version "<text>"` (PluginManager)."""
    lines = text.split("\n")
    line = 'version "%s"' % version
    for i, l in enumerate(lines):
        if re.match(r"^version(\s|$)", l):
            lines[i] = line
            return "\n".join(lines)
    for i, l in enumerate(lines):
        if re.match(r"^name\s", l):
            lines.insert(i + 1, line)
            return "\n".join(lines)
    die("plugin.txt has no name line")


def cmd_slug(args):
    s = re.sub(r"[^a-z0-9]+", "-", " ".join(args).lower()).strip("-")
    print(s or "plugin")


# ---- versions --------------------------------------------------------------

def parse(v):
    m = SEMVER.match(v)
    return m


def precedence(v):
    m = parse(v)
    core = tuple(int(m.group(i)) for i in (1, 2, 3))
    pre = m.group(4)
    if pre is None:
        return core + (1, ())
    ids = tuple((0, int(x), "") if x.isdigit() else (1, 0, x) for x in pre.split("."))
    return core + (0, ids)


def cmd_semver(args):
    sys.exit(0 if len(args) == 1 and parse(args[0]) else 1)


def cmd_bump(args):
    if len(args) != 2 or args[1] not in ("patch", "minor", "major"):
        die("usage: bump <version|-> patch|minor|major", 2)
    if args[0] in ("-", ""):
        print("0.1.0")
        return
    m = parse(args[0])
    if not m:
        die("the last version, %s, is not SemVer" % args[0])
    a, b, c = (int(m.group(i)) for i in (1, 2, 3))
    if m.group(4):
        # A prerelease bumps to its release: 1.2.0-beta.1 -> 1.2.0 for any part.
        print("%d.%d.%d" % (a, b, c))
    elif args[1] == "patch":
        print("%d.%d.%d" % (a, b, c + 1))
    elif args[1] == "minor":
        print("%d.%d.0" % (a, b + 1))
    else:
        print("%d.0.0" % (a + 1))


def cmd_latest(args):
    if len(args) != 1:
        die("usage: latest <mod>  (tags on stdin)", 2)
    prefix = args[0] + "-v"
    best = None
    for line in sys.stdin:
        t = line.strip()
        if t.startswith(prefix) and parse(t[len(prefix):]):
            if best is None or precedence(t[len(prefix):]) > precedence(best[len(prefix):]):
                best = t
    if best:
        print(best)


# ---- releases.json ---------------------------------------------------------

def releases_path(root):
    return os.path.join(root, "releases.json")


def load_releases(root):
    p = releases_path(root)
    if not os.path.exists(p):
        return {}
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def cmd_last(args):
    if len(args) != 2:
        die("usage: last <root> <mod>", 2)
    r = load_releases(args[0]).get(args[1])
    if r:
        print("%s\t%s\t%s" % (r.get("version", ""), r.get("tag", ""), r.get("source_hash", "")))


def cmd_record(args):
    if len(args) != 5:
        die("usage: record <root> <mod> <version> <tag> <hash>", 2)
    root, mod, version, tag, h = args
    data = load_releases(root)
    data[mod] = {"version": version, "tag": tag, "source_hash": h}
    tmp = releases_path(root) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(dict(sorted(data.items())), indent=2) + "\n")
    os.replace(tmp, releases_path(root))


# ---- packaging -------------------------------------------------------------

def cmd_pack(args):
    if not args:
        die("usage: pack <out.zip> --root NAME --tree DIR [--version V] [--add NAME=FILE]... [--mtime EPOCH]", 2)
    out, rest = args[0], args[1:]
    root = tree = version = None
    adds = []
    mtime = 315532800  # 1980-01-01, the earliest a zip can say
    while rest:
        k = rest.pop(0)
        if not rest:
            die("%s needs a value" % k, 2)
        v = rest.pop(0)
        if k == "--root":
            root = v
        elif k == "--tree":
            tree = v
        elif k == "--version":
            version = v
        elif k == "--add":
            name, _, f = v.partition("=")
            adds.append((name, f))
        elif k == "--mtime":
            mtime = max(int(v), 315532800)
        else:
            die("unknown option %s" % k, 2)
    if not root or not tree:
        die("pack needs --root and --tree", 2)
    entries = {}  # archive path -> bytes (None for a folder)
    for d, dirs, names in os.walk(tree):
        dirs[:] = [x for x in dirs if x != ".git"]
        rel = os.path.relpath(d, tree).replace(os.sep, "/")
        prefix = root + "/" + ("" if rel == "." else rel + "/")
        entries[prefix] = None
        for n in names:
            if n == ".DS_Store":
                continue
            with open(os.path.join(d, n), "rb") as fh:
                entries[prefix + n] = fh.read()
    for name, f in adds:
        with open(f, "rb") as fh:
            entries[root + "/" + name] = fh.read()
    pt = root + "/plugin.txt"
    if pt not in entries:
        die("%s has no plugin.txt" % tree)
    if version:
        entries[pt] = stamp(entries[pt].decode("utf-8"), version).encode("utf-8")
    import time
    stamp_t = time.gmtime(mtime)[:6]
    tmp = out + ".tmp"
    with zipfile.ZipFile(tmp, "w") as z:
        for name in sorted(entries, key=lambda s: s.encode("utf-8")):
            data = entries[name]
            info = zipfile.ZipInfo(name, date_time=stamp_t)
            info.create_system = 3  # Unix, so the modes below apply
            if data is None:
                info.external_attr = (0o40755 << 16) | 0x10
                z.writestr(info, b"")
            else:
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    os.replace(tmp, out)


def cmd_sums(args):
    if len(args) < 2:
        die("usage: sums <dir> <file>...", 2)
    for f in args[1:]:
        with open(os.path.join(args[0], f), "rb") as fh:
            print("%s  %s" % (hashlib.sha256(fh.read()).hexdigest(), f))


# ---- sync-sdk --------------------------------------------------------------

def git_commit(path):
    try:
        top = subprocess.run(["git", "-C", path, "rev-parse", "--show-toplevel"], capture_output=True, text=True)
        if top.returncode != 0 or os.path.realpath(top.stdout.strip()) != os.path.realpath(path):
            return "unknown (not a git checkout)"
        head = subprocess.run(["git", "-C", path, "rev-parse", "HEAD"], capture_output=True, text=True)
        if head.returncode != 0:
            return "none (the repository has no commits)"
        dirty = subprocess.run(["git", "-C", path, "status", "--porcelain"], capture_output=True, text=True).stdout.strip()
        return head.stdout.strip() + (" (with uncommitted changes)" if dirty else "")
    except OSError:
        return "unknown (no git)"


def read_json(p):
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def write_json(p, data):
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(data, indent=2) + "\n")


def cmd_sync_meta(args):
    check = "--check" in args
    args = [a for a in args if a != "--check"]
    if len(args) < 2:
        die("usage: sync-meta <root> <sdk> [--check] <vendored path>...", 2)
    root, sdk, vendored = args[0], args[1], args[2:]
    spkg, pkg = read_json(os.path.join(sdk, "package.json")), read_json(os.path.join(root, "package.json"))
    ssdk = read_json(os.path.join(sdk, "sdk.json"))
    meta_p = os.path.join(root, "sdk.json")
    meta = read_json(meta_p) if os.path.exists(meta_p) else {}
    vh = digest(root, [f for p in vendored for f in walk_plain(root, p)])[0] if vendored else meta.get("vendored_sha256")
    if check:
        bad = []
        for k in ("devDependencies", "engines"):
            if pkg.get(k) != spkg.get(k):
                bad.append("package.json %s differs from the SDK's" % k)
        if meta.get("sdk_version") != spkg.get("version") or meta.get("mod_api") != ssdk.get("mod_api"):
            bad.append("sdk.json records SDK %s (mod API %s); the SDK is %s (mod API %s)" % (
                meta.get("sdk_version"), meta.get("mod_api"), spkg.get("version"), ssdk.get("mod_api")))
        for b in bad:
            print("differs: " + b)
        sys.exit(1 if bad else 0)
    # package.json: the SDK's devDependencies and engines, this repository's name and scripts.
    for k in ("devDependencies", "engines"):
        if k in spkg:
            pkg[k] = spkg[k]
    write_json(os.path.join(root, "package.json"), pkg)
    lock_p = os.path.join(sdk, "package-lock.json")
    if os.path.exists(lock_p):
        lock = read_json(lock_p)
        lock["name"] = pkg.get("name")
        lock["version"] = pkg.get("version")
        top = lock.get("packages", {}).get("")
        if top is not None:
            top["name"], top["version"] = pkg.get("name"), pkg.get("version")
        write_json(os.path.join(root, "package-lock.json"), lock)
    import datetime
    new = {
        "sdk": "endless-sky-mod-sdk",
        "sdk_version": spkg.get("version"),
        "sdk_commit": git_commit(sdk),
        "mod_api": ssdk.get("mod_api"),
        "loader_commit": ssdk.get("loader_commit"),
        "loader_sources_sha256": ssdk.get("sources_sha256"),
        "vendored_paths": vendored,
        "vendored_sha256": vh,
        "vendored": meta.get("vendored") if meta.get("vendored_sha256") == vh and meta.get("sdk_commit") == git_commit(sdk) else datetime.date.today().isoformat(),
    }
    write_json(meta_p, new)


def walk_plain(root, p):
    full = os.path.join(root, p)
    if os.path.isfile(full):
        return [p]
    out = []
    for d, dirs, names in os.walk(full):
        for n in names:
            if n != ".DS_Store":
                out.append(os.path.relpath(os.path.join(d, n), root).replace(os.sep, "/"))
    return sorted(out)


COMMANDS = {
    "mod-hash": cmd_mod_hash, "tree-hash": cmd_tree_hash, "plugin-field": cmd_plugin_field,
    "slug": cmd_slug, "semver": cmd_semver, "bump": cmd_bump, "latest": cmd_latest,
    "last": cmd_last, "record": cmd_record, "pack": cmd_pack, "sums": cmd_sums, "sync-meta": cmd_sync_meta,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.stderr.write(__doc__)
        sys.exit(2)
    COMMANDS[sys.argv[1]](sys.argv[2:])
