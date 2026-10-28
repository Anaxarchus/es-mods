#!/bin/sh
# Run the Diplomacy mod's in-game tests against a game build and the Dado mod loader.
#   mods/diplomacy/test/ingame/run.sh <game-binary> <game-root> [test name...]
# <game-root> is an Endless Sky checkout (its tests/integration and data). Needs
# Node and dadoc (the mod is built with the SDK's `npm run deploy`), a built
# loader in ../es-modloader (installed with `npm run install-loader`; set
# ES_MODLOADER to use another checkout, or ES_MODLOADER_LIB to name a built
# library, such as es-modloader/build-release/linux-aarch64/libesdado.so), and
# Xvfb (xvfb-run) on Linux. Each test runs in a fresh config: a copy of the
# game's integration-test config (for its helper tests), the loader in its
# modloaders folder, the Diplomacy plugin built from this mod, this folder's
# test plugin, and the Diplomacy Probe (diplomacy_probe/), a small mod that
# reports what conditions cannot show (Luna's shipyard).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
PROJECT=$(cd "$HERE/../.." && pwd)
SDK=$(cd "$PROJECT/../.." && pwd)
GAME=${1:?usage: run.sh <game-binary> <game-root> [test...]}
ROOT=${2:?usage: run.sh <game-binary> <game-root> [test...]}
# The game loads every plugin in <game-root>/plugins as well as the tests' own,
# and of two plugins with the same name it keeps the one in <game-root>/plugins.
# A Diplomacy there would be tested instead of the one built from this mod.
if [ -d "$ROOT/plugins/Diplomacy" ]; then
	echo "run.sh: $ROOT/plugins/Diplomacy is installed. The game loads that copy and skips the one" >&2
	echo "        these tests build from this mod, so the tests would run an old build." >&2
	echo "        Move or delete it while the tests run (and keep only one copy of Diplomacy)." >&2
	exit 2
fi
# A deployed Diplomacy Debug there would put every test in debug mode.
if [ -d "$ROOT/plugins/Diplomacy Debug" ]; then
	echo "run.sh: $ROOT/plugins/Diplomacy Debug is installed, which turns on debug mode for every test." >&2
	echo "        Move it out of that folder while the tests run." >&2
	exit 2
fi
shift 2
if [ $# -eq 0 ]; then
	set -- "Diplomacy - War Begins" "Diplomacy - Flotilla In Person" "Diplomacy - Join And Leave" "Diplomacy - Licenses And Jobs" "Diplomacy - Veteran Offer" "Diplomacy - Veteran Start" "Diplomacy - Border Crisis" "Diplomacy - Pirate Raid In Person" "Diplomacy - Debug Mode"
fi
TEMPLATE=$(mktemp -d)
trap 'rm -rf "$TEMPLATE"' EXIT
cp -R "$ROOT/tests/integration/config/." "$TEMPLATE/"
if [ -n "${ES_MODLOADER_LIB:-}" ]; then
	node "$SDK/tools/esmod.mjs" install-loader --to "$TEMPLATE/modloaders" --lib "$ES_MODLOADER_LIB" >/dev/null
else
	node "$SDK/tools/esmod.mjs" install-loader --to "$TEMPLATE/modloaders" >/dev/null
fi
node "$SDK/tools/esmod.mjs" deploy "$PROJECT" --to "$TEMPLATE/plugins" >/dev/null
node "$SDK/tools/esmod.mjs" deploy "$HERE/diplomacy_probe" --to "$TEMPLATE/plugins" >/dev/null
cp -R "$HERE/plugin" "$TEMPLATE/plugins/Diplomacy Tests"
failed=0
for name in "$@"; do
	CONFIG=$(mktemp -d)
	cp -R "$TEMPLATE/." "$CONFIG/"
	# Debug mode only for the tests that are about it.
	case $name in
	*Debug*) cp -R "$PROJECT/debug" "$CONFIG/plugins/Diplomacy Debug" ;;
	esac
	if (cd "$ROOT/tests/integration" && timeout 300 xvfb-run --auto-servernum --server-args="+extension GLX +render -noreset" \
			"$GAME" --resources "$ROOT" --test "$name" --config "$CONFIG" > "$CONFIG/out.txt" 2>&1); then
		echo "ok   $name"
		rm -rf "$CONFIG"
	else
		echo "FAIL $name (config kept in $CONFIG)"
		grep -E "Test failed|asserted|Condition|dado|diplomacy" "$CONFIG/out.txt" | sed 's/^/     /' | head -40
		failed=$((failed + 1))
	fi
done
[ "$failed" -eq 0 ] && echo "PASSED" || { echo "FAILED: $failed"; exit 1; }
