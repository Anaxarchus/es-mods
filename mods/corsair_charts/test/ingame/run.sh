#!/bin/sh
# Corsair Charts in the real game (plugin/data/charts tests.txt).
#
#   mods/corsair_charts/test/ingame/run.sh [<game executable>] [<game repository>] [<loader library>]
#
# Defaults: $ES_GAME_EXE or /root/fork/argosy/build/endless-sky; $ES_GAME or
# /root/fork/argosy (its resources and tests/integration/config); $ES_LOADER,
# else a mod API 11 loader (es-modloader's api11 branch, v0.3.0) built into
# $ES_LOADER11_BUILD. $ES_STOCK_EXE (default /root/tc/es/build/endless-sky)
# with $ES_STOCK (default /root/tc/es) also runs the load tests on a stock
# game, data only. ONLY="<test>" runs one test. DadoScript needs dadoc on PATH. KEEP=1 keeps the scratch.
#
# 1. Builds mods/corsair_charts (dist/Corsair Charts).
# 2. Load tests, data only (no loader): "Charts Exotics Load" and "Charts
#    Prototypes Load", on the stock game (when there is one) and on Argosy.
# 3. E2E tests with the loader: "Charts Trigger E2E" and "Charts Finale E2E".
# 4. The pilot the finale test saved parses with no errors without the loader.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
SDK=$(cd "$HERE/../../../.." && pwd)
die() { echo "charts-ingame: $*" >&2; exit 1; }
GAME_EXE=${1:-${ES_GAME_EXE:-/root/fork/argosy/build/endless-sky}}
GAME=${2:-${ES_GAME:-/root/fork/argosy}}
LIB=${3:-${ES_LOADER:-}}
STOCK_EXE=${ES_STOCK_EXE:-/root/tc/es/build/endless-sky}
STOCK=${ES_STOCK:-/root/tc/es}
[ -x "$GAME_EXE" ] || die "no game executable at $GAME_EXE"
[ -d "$GAME/tests/integration/config" ] || die "no integration-test config in $GAME"
GAME=$(cd "$GAME" && pwd)

WORK=$(mktemp -d "${TMPDIR:-/tmp}/charts-ingame.XXXXXX")
[ -n "${KEEP:-}" ] || trap 'rm -rf "$WORK"' EXIT

# The mod API 11 loader (v0.3.0): built from es-modloader's api11 branch unless given.
if [ -z "$LIB" ]; then
	B=${ES_LOADER11_BUILD:-$WORK/loader11}
	if [ ! -f "$B/build/libesdado.so" ]; then
		echo "charts-ingame: building the mod API 11 loader (es-modloader api11) in $B"
		mkdir -p "$B"
		git -C "${ES_MODLOADER:-/root/fork/es-modloader}" archive api11 | tar -x -C "$B"
		(cd "$B" && cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DLOADER_VERSION=0.3.0 \
			${DADO_EXECUTABLE:+-DDADO_EXECUTABLE=$DADO_EXECUTABLE} >/dev/null && cmake --build build >/dev/null) \
			|| die "could not build the API 11 loader"
	fi
	LIB=$B/build/libesdado.so
fi
[ -f "$LIB" ] || die "no loader library at $LIB"
strings "$LIB" | grep -q "Dado loader" || die "$LIB is not the Dado loader"

# 1. The mod.
(cd "$SDK" && node tools/esmod.mjs build mods/corsair_charts >/dev/null) || die "could not build mods/corsair_charts"
BUILT="$SDK/dist/Corsair Charts"

run() {
	if [ "$(uname -s)" = Linux ] && [ -z "${DISPLAY:-}" ] && command -v xvfb-run >/dev/null 2>&1; then
		xvfb-run --auto-servernum --server-args="+extension GLX +render -noreset" "$@"
	else
		"$@"
	fi
}
# resources <game repository> <dir>: the game's resources, without its plugins and loaders.
resources() {
	mkdir -p "$2"
	for entry in "$1"/*; do
		case $(basename "$entry") in
		plugins|modloaders|build) continue ;;
		esac
		ln -s "$entry" "$2/$(basename "$entry")"
	done
}
# config <dir> <with loader: 0|1>: the integration-test config, the mod, the test plugin.
config() {
	mkdir -p "$1"
	cp -R "$GAME/tests/integration/config/." "$1/"
	mkdir -p "$1/plugins" "$1/modloaders"
	cp -R "$BUILT" "$1/plugins/"
	cp -R "$HERE/plugin" "$1/plugins/Corsair Charts tests"
	[ "$2" = 1 ] && cp "$LIB" "$1/modloaders/"
	return 0
}
fails=0
# one <name> <exe> <resources> <config> <test>
one() {
	if [ -n "${ONLY:-}" ] && [ "$ONLY" != "$5" ]; then return 0; fi
	status=0
	run timeout 600 "$2" --resources "$3" --config "$4" --test "$5" > "$4/test.log" 2>&1 || status=$?
	if [ $status -eq 0 ]; then
		echo "ok  : $1: \"$5\""
	else
		echo "FAIL: $1: \"$5\" ($status; log $4/test.log)"
		grep -E "dado: |[Ff]ailed|condition|Error" "$4/test.log" | head -20 | sed 's/^/      /'
		[ -f "$4/errors.txt" ] && head -30 "$4/errors.txt" | sed 's/^/      /'
		fails=$((fails + 1))
	fi
}

RES="$WORK/resources"
resources "$GAME" "$RES"

# 2. Load tests, data only.
if [ -x "$STOCK_EXE" ] && [ -d "$STOCK/data" ]; then
	SRES="$WORK/stock-resources"
	resources "$STOCK" "$SRES"
	for t in "Charts Exotics Load" "Charts Prototypes Load"; do
		C="$WORK/stock-$(echo "$t" | tr ' ' '-')"
		config "$C" 0
		one "stock game, no loader" "$STOCK_EXE" "$SRES" "$C" "$t"
	done
fi
for t in "Charts Exotics Load" "Charts Prototypes Load"; do
	C="$WORK/argosy-$(echo "$t" | tr ' ' '-')"
	config "$C" 0
	one "Argosy, no loader" "$GAME_EXE" "$RES" "$C" "$t"
done

# 3. E2E with the API 11 loader.
for t in "Charts Trigger E2E" "Charts Finale E2E"; do
	C="$WORK/e2e-$(echo "$t" | tr ' ' '-')"
	config "$C" 1
	one "Argosy + $(strings "$LIB" | grep -m1 -o 'Dado loader [0-9.]*')" "$GAME_EXE" "$RES" "$C" "$t"
	grep -q "corsair_charts" "$C/test.log" 2>/dev/null || grep -rqs "corsair" "$C/errors.txt" || true
done

# 4. The finale's save parses without the loader.
C="$WORK/e2e-Charts-Finale-E2E"
if [ -f "$C/recent.txt" ]; then
	rm -f "$C/modloaders/$(basename "$LIB")"
	if "$GAME_EXE" --resources "$RES" --config "$C" --parse-save > "$C/parse.log" 2>&1 && grep -q "Parse completed with no error(s)." "$C/parse.log"; then
		echo "ok  : the finale's saved pilot parses with no errors without the loader"
	else
		echo "FAIL: the finale's saved pilot does not parse cleanly without the loader"
		tail -20 "$C/parse.log" | sed 's/^/      /'
		fails=$((fails + 1))
	fi
fi

[ $fails -eq 0 ] || die "$fails FAILED"
echo "charts-ingame: PASSED"
