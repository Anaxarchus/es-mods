#!/bin/sh
# The Racing League end to end: the real game, the Dado loader and The Racing
# League built with this SDK, on the integration test "Racing League E2E"
# (plugin/data/racing e2e tests.txt). Modelled on The Shoal's e2e run.sh.
#
#   mods/racing/test/ingame/run.sh [<game executable>] [<game repository>] [<loader library>]
#
# Defaults: $ES_GAME_EXE or /root/fork/argosy/build/endless-sky; $ES_GAME or
# /root/fork/argosy; $ES_LOADER or /root/fork/es-modloader/build/libesdado.so
# (use a 0.3.0 build for the released mod API 11). KEEP=1 keeps the scratch
# folder. Checks the test passed, the loader loaded the mod with no failure,
# and the save holds the mod's world. WITH_CORP=1 also installs Corporations
# (built from mods/corporations) and checks its companies became the sponsors.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
SDK=$(cd "$HERE/../../../.." && pwd)
die() { echo "racing-e2e: $*" >&2; exit 1; }
GAME_EXE=${1:-${ES_GAME_EXE:-/root/fork/argosy/build/endless-sky}}
GAME=${2:-${ES_GAME:-/root/fork/argosy}}
LIB=${3:-${ES_LOADER:-/root/fork/es-modloader/build/libesdado.so}}
[ -x "$GAME_EXE" ] || die "no game executable at $GAME_EXE"
[ -d "$GAME/tests/integration/config" ] || die "no integration-test config in $GAME"
[ -f "$LIB" ] || die "no loader library at $LIB"
GAME=$(cd "$GAME" && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/racing-e2e.XXXXXX")
[ -n "${KEEP:-}" ] || trap 'rm -rf "$WORK"' EXIT

(cd "$SDK" && npm run --silent build -- mods/racing) || die "the SDK could not build mods/racing"
BUILT="$SDK/dist/The Racing League"
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
if [ -n "${WITH_CORP:-}" ]; then
	(cd "$SDK" && npm run --silent build -- mods/corporations) || die "the SDK could not build mods/corporations"
	cp -R "$SDK/dist/Corporations" "$CONFIG/plugins/"
fi
cp -R "$HERE/plugin" "$CONFIG/plugins/The Racing League e2e test"
cp "$LIB" "$CONFIG/modloaders/"

run() {
	if [ "$(uname -s)" = Linux ] && [ -z "${DISPLAY:-}" ] && command -v xvfb-run >/dev/null 2>&1; then
		xvfb-run --auto-servernum --server-args="+extension GLX +render -noreset" "$@"
	else
		"$@"
	fi
}
TEST="Racing League E2E"
echo "racing-e2e: running \"$TEST\" with $(basename "$LIB") (scratch $WORK)"
status=0
run timeout 600 "$GAME_EXE" --resources "$RES" --config "$CONFIG" --test "$TEST" > "$WORK/test.log" 2>&1 || status=$?
grep -E "dado: |Test (passed|failed)|[Ff]ailed" "$WORK/test.log" || true
if [ $status -ne 0 ]; then
	[ -f "$CONFIG/errors.txt" ] && sed 's/^/racing-e2e:   /' "$CONFIG/errors.txt"
	die "FAILED: \"$TEST\" ($status; log $WORK/test.log)"
fi
grep -q 'loaded mod "racing"' "$WORK/test.log" || die "the loader did not load the mod"
if grep -E 'dado: .*racing.*(failed|refused|stopped)' "$WORK/test.log"; then die "the mod failed in a hook"; fi
SAVE=$(ls -t "$CONFIG/saves/"*.txt 2>/dev/null | head -1)
[ -n "$SAVE" ] && grep -q "racing" "$SAVE" || die "no save holds the mod's world"
if [ -n "${WITH_CORP:-}" ]; then
	grep -q 'loaded mod "corporations"' "$WORK/test.log" || die "the loader did not load Corporations"
	grep -q '|corp|' "$SAVE" || die "no Corporations company became a sponsor"
	echo "ok  : Corporations' companies are the sponsors ($(grep -o '|corp|' "$SAVE" | wc -l) of them)"
fi
echo "ok  : \"$TEST\" passed; the save holds the world ($(grep -c 'racing' "$SAVE") lines name it)"
