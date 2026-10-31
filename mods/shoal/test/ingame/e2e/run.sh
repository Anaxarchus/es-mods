#!/bin/sh
# The Shoal v0.3 end to end: the real game, the Dado loader, and The Shoal
# built with this SDK, on the integration test "Shoal Yard E2E"
# (plugin/data/shoal e2e tests.txt). Modelled on es-modloader's
# tests/ingame/api11/run.sh.
#
#   mods/shoal/test/ingame/e2e/run.sh [<game executable>] [<game repository>] [<loader library>]
#
# Defaults: $ES_GAME_EXE or /root/fork/argosy/build/endless-sky; $ES_GAME or
# /root/fork/argosy (the resources and tests/integration/config); $ES_LOADER
# or /root/fork/es-modloader/build/libesdado.so. DadoScript needs dadoc on
# PATH. KEEP=1 keeps the scratch folder.
#
# 1. Builds mods/shoal with the SDK (dist/The Shoal).
# 2. Makes a scratch config: the game's integration-test config, The Shoal,
#    this folder's test plugin, and the loader in modloaders/.
# 3. Runs the game on "Shoal Yard E2E" (headless, under xvfb-run on Linux).
# 4. Checks the save that test wrote: the yard's variants (of a stock shield
#    generator, and of this plugin's gun, mod API 12) are in its runtime
#    definitions, before the ships, the gun's with its damage and firing
#    costs scaled from the game's weapon stats, and installed on the
#    flagship; and a game without the loader parses it with no errors.
# 5. (0.5.0) Runs "Shoal Deep E2E" in a fresh config: down through the Maw
#    (a run starts), Breakers' Haven (it goes on), one jump deeper (depth),
#    and back up through the Upwell (it ends and is counted).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
SDK=$(cd "$HERE/../../../../.." && pwd)
die() { echo "shoal-e2e: $*" >&2; exit 1; }
GAME_EXE=${1:-${ES_GAME_EXE:-/root/fork/argosy/build/endless-sky}}
GAME=${2:-${ES_GAME:-/root/fork/argosy}}
LIB=${3:-${ES_LOADER:-/root/fork/es-modloader/build/libesdado.so}}
[ -x "$GAME_EXE" ] || die "no game executable at $GAME_EXE"
[ -d "$GAME/tests/integration/config" ] || die "no integration-test config in $GAME (pass the game's repository)"
[ -f "$LIB" ] || die "no loader library at $LIB"
GAME=$(cd "$GAME" && pwd)

WORK=$(mktemp -d "${TMPDIR:-/tmp}/shoal-e2e.XXXXXX")
[ -n "${KEEP:-}" ] || trap 'rm -rf "$WORK"' EXIT

# 1. The mod.
(cd "$SDK" && npm run --silent build -- mods/shoal) || die "the SDK could not build mods/shoal"
BUILT="$SDK/dist/The Shoal"
[ -f "$BUILT/scripts/shoal.js" ] || die "the build wrote no $BUILT/scripts/shoal.js"

# 2. The resources (the game's, without its plugins and mod loaders) and the config.
RES="$WORK/resources"
mkdir -p "$RES"
for entry in "$GAME"/*; do
	case $(basename "$entry") in
	plugins|modloaders|build) continue ;;
	esac
	ln -s "$entry" "$RES/$(basename "$entry")"
done
CONFIG="$WORK/config"
mkdir -p "$CONFIG"
cp -R "$GAME/tests/integration/config/." "$CONFIG/"
mkdir -p "$CONFIG/plugins" "$CONFIG/modloaders"
cp -R "$BUILT" "$CONFIG/plugins/"
cp -R "$HERE/plugin" "$CONFIG/plugins/The Shoal e2e test"
cp "$LIB" "$CONFIG/modloaders/"

# 3. The test.
run() {
	if [ "$(uname -s)" = Linux ] && [ -z "${DISPLAY:-}" ] && command -v xvfb-run >/dev/null 2>&1; then
		xvfb-run --auto-servernum --server-args="+extension GLX +render -noreset" "$@"
	else
		"$@"
	fi
}
TEST="Shoal Yard E2E"
echo "shoal-e2e: running \"$TEST\" with $(basename "$LIB") (scratch $WORK)"
status=0
run timeout 600 "$GAME_EXE" --resources "$RES" --config "$CONFIG" --test "$TEST" > "$WORK/test.log" 2>&1 || status=$?
grep -E "dado: |Test (passed|failed)|[Ff]ailed|condition" "$WORK/test.log" || true
if [ $status -ne 0 ]; then
	[ -f "$CONFIG/errors.txt" ] && sed 's/^/shoal-e2e:   /' "$CONFIG/errors.txt"
	die "FAILED: \"$TEST\" ($status; log $WORK/test.log)"
fi
echo "ok  : \"$TEST\" passed"

# 4. The save it wrote.
SAVE=$(sed -n 1p "$CONFIG/recent.txt")
VARIANT='"D14-RN Shield Generator (Breakers Mk I)"'
defs=$(grep -n '^"runtime definitions"' "$SAVE" | head -1 | cut -d: -f1)
ship=$(grep -n '^ship ' "$SAVE" | head -1 | cut -d: -f1)
[ -n "$defs" ] && [ -n "$ship" ] && [ "$defs" -lt "$ship" ] || die "FAILED: no runtime definitions before the ships in $SAVE"
grep -qxF -e "	\"outfit variant\" shoal $VARIANT \"D14-RN Shield Generator\"" -e "	\"outfit variant\" \"shoal\" $VARIANT \"D14-RN Shield Generator\"" "$SAVE" \
	|| die "FAILED: the save's runtime definitions do not hold the yard's variant ($SAVE)"
awk -v s="$ship" 'NR > s' "$SAVE" | grep -q "^		$VARIANT" || die "FAILED: the saved flagship does not carry the variant ($SAVE)"
echo "ok  : the save defines $VARIANT (runtime definitions at line $defs, ships from line $ship) and the flagship carries it"
# The plugin's gun (mod API 12): its Mk I, of it as the base, with the
# weapon's damage x1.10 and firing costs x1.04, and nothing else of the weapon.
GUN='"E2E Sleetgun (Breakers Mk I)"'
grep -qxF -e "	\"outfit variant\" shoal $GUN \"E2E Sleetgun\"" -e "	\"outfit variant\" \"shoal\" $GUN \"E2E Sleetgun\"" "$SAVE" \
	|| die "FAILED: the save's runtime definitions do not hold the plugin gun's variant ($SAVE)"
block=$(awk -v s="$ship" 'NR < s' "$SAVE" | awk -v g="$GUN" 'index($0, "\"outfit variant\"") { on = index($0, g) > 0; next } on')
for line in '"display name" "E2E Sleetgun Mk I"' 'cost 44000' 'weapon' '"shield damage" 33' '"hull damage" 22' '"ion damage" 4.4' \
		'"disabled damage" 22' '"minable damage" 22' '"firing energy" 10.4' '"firing heat" 20.8'; do
	printf '%s\n' "$block" | sed 's/^[[:space:]]*//' | grep -qxF "$line" || die "FAILED: the gun's saved variant lacks: $line ($SAVE)"
done
for key in reload velocity lifetime inaccuracy; do
	printf '%s\n' "$block" | grep -q "\"\{0,1\}$key\"\{0,1\} " && die "FAILED: the gun's variant changes \"$key\" ($SAVE)"
done
awk -v s="$ship" 'NR > s' "$SAVE" | grep -q "^		$GUN" || die "FAILED: the saved flagship does not carry the gun's variant ($SAVE)"
echo "ok  : the save defines $GUN of the plugin's gun with scaled damage and firing costs, and the flagship carries it"
rm -f "$CONFIG/modloaders/$(basename "$LIB")"
if ! "$GAME_EXE" --resources "$RES" --config "$CONFIG" --parse-save > "$WORK/parse.log" 2>&1 \
		|| ! grep -q "Parse completed with no error(s)." "$WORK/parse.log"; then
	cat "$WORK/parse.log"
	die "FAILED: the saved pilot does not parse cleanly without the loader"
fi
echo "ok  : the saved pilot parses with no errors without the loader"

# 5. The Deep.
CONFIG2="$WORK/config-deep"
mkdir -p "$CONFIG2"
cp -R "$GAME/tests/integration/config/." "$CONFIG2/"
mkdir -p "$CONFIG2/plugins" "$CONFIG2/modloaders"
cp -R "$BUILT" "$CONFIG2/plugins/"
cp -R "$HERE/plugin" "$CONFIG2/plugins/The Shoal e2e test"
cp "$LIB" "$CONFIG2/modloaders/"
TEST="Shoal Deep E2E"
echo "shoal-e2e: running \"$TEST\""
status=0
run timeout 900 "$GAME_EXE" --resources "$RES" --config "$CONFIG2" --test "$TEST" > "$WORK/test-deep.log" 2>&1 || status=$?
grep -E "dado: |Test (passed|failed)|[Ff]ailed" "$WORK/test-deep.log" || true
if [ $status -ne 0 ]; then
	[ -f "$CONFIG2/errors.txt" ] && sed 's/^/shoal-e2e:   /' "$CONFIG2/errors.txt" | head -80
	die "FAILED: \"$TEST\" ($status; log $WORK/test-deep.log)"
fi
echo "ok  : \"$TEST\" passed: the Maw starts a run, Breakers' Haven keeps it, depth follows the jumps, the Upwell ends it"
echo "shoal-e2e: PASSED"
