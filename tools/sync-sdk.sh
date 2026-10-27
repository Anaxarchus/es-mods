#!/bin/bash
# Refreshes the SDK files this repository vendors from a checkout of
# endless-sky-mod-sdk, and records what was vendored in sdk.json.
#
#   tools/sync-sdk.sh [<path to endless-sky-mod-sdk>]     (default: ../endless-sky-mod-sdk, or $ES_MOD_SDK)
#   tools/sync-sdk.sh --check [<path>]                    exit 1 if the vendored files differ from the SDK's
#
# The vendored set (and nothing else) is listed in VENDORED below: copied as it
# is, folders replaced whole. This repository's own files (package.json's name
# and scripts, tsconfig.json, dado.json, README.md, the tools here) are not
# touched, except that package.json takes the SDK's devDependencies and engines,
# and package-lock.json is the SDK's with this package's name. Run `npm install`
# and `npm test` afterwards, and commit the result.
set -eu

HERE=$(cd "$(dirname "$0")/.." && pwd)
VENDORED="imports/sdk/es js stub tools/esmod.mjs .vscode/extensions.json .vscode/settings.json .vscode/tasks.json"

say() { printf '%s\n' "$*"; }
die() { printf 'sync-sdk: %s\n' "$*" >&2; exit 1; }

CHECK=0 SDK=
while [ $# -gt 0 ]; do
	case $1 in
	--check) CHECK=1 ;;
	-h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
	-*) die "unknown option $1" ;;
	*) [ -z "$SDK" ] || die "one SDK path only"; SDK=$1 ;;
	esac
	shift
done
SDK=${SDK:-${ES_MOD_SDK:-$HERE/../endless-sky-mod-sdk}}
[ -d "$SDK" ] || die "no SDK at $SDK (pass its path, or set ES_MOD_SDK)"
SDK=$(cd "$SDK" && pwd)
for f in package.json sdk.json tools/esmod.mjs js/es.js imports/sdk/es/game.dado; do
	[ -f "$SDK/$f" ] || die "$SDK is not endless-sky-mod-sdk: it has no $f"
done
command -v python3 >/dev/null 2>&1 || die "python3 is needed"

# The files of one vendored path in a tree: a file, or every file under a folder
# (sorted, no .DS_Store).
files_of() {   # files_of <root> <path>
	if [ -f "$1/$2" ]; then printf '%s\n' "$2"
	elif [ -d "$1/$2" ]; then (cd "$1" && find "$2" -type f ! -name .DS_Store | LC_ALL=C sort)
	fi
}

if [ "$CHECK" = 1 ]; then
	differ=0
	for p in $VENDORED; do
		for f in $( (files_of "$SDK" "$p"; files_of "$HERE" "$p") | LC_ALL=C sort -u); do
			if ! cmp -s "$SDK/$f" "$HERE/$f"; then say "differs: $f"; differ=1; fi
		done
	done
	python3 "$HERE/tools/release.py" sync-meta "$HERE" "$SDK" --check $VENDORED || differ=1
	[ "$differ" = 0 ] && say "sync-sdk: the vendored files match $SDK" || exit 1
	exit 0
fi

for p in $VENDORED; do
	[ -e "$SDK/$p" ] || die "the SDK has no $p (update VENDORED in $0)"
	if [ -d "$SDK/$p" ]; then rm -rf "${HERE:?}/$p"; fi
	for f in $(files_of "$SDK" "$p"); do
		mkdir -p "$HERE/$(dirname "$f")"
		# cp without -p: some shared folders refuse to copy modes and times.
		cp "$SDK/$f" "$HERE/$f"
	done
done
python3 "$HERE/tools/release.py" sync-meta "$HERE" "$SDK" $VENDORED
say "sync-sdk: vendored from $SDK (see sdk.json). Next: npm install && npm test, then commit."
