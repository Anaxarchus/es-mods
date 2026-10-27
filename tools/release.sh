#!/bin/bash
# Builds release packages of the mods in mods/ and (with --publish) publishes
# each as a GitHub release of its own, tagged <mod>-v<version>, so mods
# version independently. Only mods whose source changed since their last
# release are released (see "Source hash" in README.md). Runs on macOS and Linux.
#
#   tools/release.sh <mod>|all <version> [options]       one version for every changed mod
#   tools/release.sh <mod>|all --bump patch|minor|major [options]
#                                                       each changed mod's own last version, bumped
#                                                       (0.1.0 for a mod never released)
#
#   --publish        run `gh release create` for each mod released, then record it
#                    in releases.json (commit that file afterwards)
#   --dry-run        never publish (the default without --publish): list what would
#                    be released, build and package only those, print the gh commands
#   --force          release even mods that have not changed
#   --allow-dirty    run even though the git worktree has changes (or no commits)
#   --repo OWNER/R   the GitHub repository ($ES_MODS_REPO, default Anaxarchus/es-mods)
#
# Writes dist/<mod>-<version>/: <plugin-slug>-<version>.zip (one folder, named
# after the plugin, to unzip into Argosy's plugins folder), a zip for each extra
# plugin in the mod (e.g. diplomacy's debug/), SHA256SUMS, SOURCE_HASH and
# RELEASE_NOTES.md. Needs Node (npm install done), python3, dadoc for
# DadoScript mods, and gh to publish. SOURCE_DATE_EPOCH sets the zips' times
# (default 1980-01-01, so the same source gives the same bytes).
set -eu

HERE=$(cd "$(dirname "$0")/.." && pwd)
PATH="$PATH:$HOME/.local/bin:$HOME/dado:$HOME/dado/bin:/opt/homebrew/bin:/usr/local/bin"
REPO=${ES_MODS_REPO:-Anaxarchus/es-mods}
PY="python3 $HERE/tools/release.py"

say() { printf '%s\n' "$*"; }
warn() { printf 'release: warning: %s\n' "$*" >&2; }
die() { printf 'release: %s\n' "$*" >&2; exit 1; }
usage() { sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'; }

PUBLISH=0 DRY=0 FORCE=0 ALLOW_DIRTY=0 TARGET= VERSION= BUMP=
while [ $# -gt 0 ]; do
	case $1 in
	--publish) PUBLISH=1 ;;
	--dry-run) DRY=1 ;;
	--force) FORCE=1 ;;
	--allow-dirty) ALLOW_DIRTY=1 ;;
	--bump) [ $# -ge 2 ] || die "--bump needs patch, minor or major"; BUMP=$2; shift ;;
	--repo) [ $# -ge 2 ] || die "--repo needs OWNER/REPO"; REPO=$2; shift ;;
	-h|--help) usage; exit 0 ;;
	-*) die "unknown option $1 (see --help)" ;;
	*)
		if [ -z "$TARGET" ]; then TARGET=$1
		elif [ -z "$VERSION" ]; then VERSION=$1
		else die "too many arguments: $1 (see --help)"
		fi ;;
	esac
	shift
done
[ -n "$TARGET" ] || { usage >&2; exit 2; }
[ "$DRY" = 1 ] && PUBLISH=0
if [ -n "$BUMP" ]; then
	[ -z "$VERSION" ] || die "give a version or --bump, not both"
	case $BUMP in patch|minor|major) ;; *) die "--bump takes patch, minor or major, not \"$BUMP\"" ;; esac
else
	[ -n "$VERSION" ] || die "give a version (e.g. 0.2.0) or --bump patch|minor|major"
	VERSION=${VERSION#v}
	$PY semver "$VERSION" || die "\"$VERSION\" is not a version like 1.2.3 or 1.2.3-beta.1"
fi
case $REPO in */*) ;; *) die "--repo wants OWNER/REPO, not \"$REPO\"" ;; esac

# ---- tools -------------------------------------------------------------------
command -v python3 >/dev/null 2>&1 || die "python3 is needed (for hashing and packaging)"
command -v node >/dev/null 2>&1 || die "Node.js is needed (https://nodejs.org)"
[ -d "$HERE/node_modules/esbuild" ] || die "run \`npm install\` in $HERE first"
if [ "$PUBLISH" = 1 ]; then
	command -v gh >/dev/null 2>&1 || die "--publish needs the GitHub CLI, gh (brew install gh)"
	gh auth status >/dev/null 2>&1 || die "gh is not logged in: run gh auth login"
fi
# gh answers for the last release when releases.json has none, and for tags
# already on GitHub. It is optional unless publishing.
GH=0
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then GH=1; fi
API=$(sed -n 's/^export const MOD_API = \([0-9][0-9]*\);.*/\1/p' "$HERE/js/es.js")
[ -n "$API" ] || die "no MOD_API in js/es.js (run tools/sync-sdk.sh)"

# ---- the mods ------------------------------------------------------------------
MODS=
if [ "$TARGET" = all ]; then
	for d in "$HERE"/mods/*/; do
		[ -f "$d/plugin.txt" ] && MODS="$MODS $(basename "$d")"
	done
	[ -n "$MODS" ] || die "there are no mods in mods/"
else
	m=${TARGET%/}; m=${m#mods/}
	[ -f "$HERE/mods/$m/plugin.txt" ] || die "no mod \"$m\": mods/$m/plugin.txt does not exist (mods: $(cd "$HERE/mods" && ls | tr '\n' ' '))"
	MODS=" $m"
fi

# ---- the worktree ------------------------------------------------------------
COMMIT= DIRTY=
if git -C "$HERE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
	if git -C "$HERE" rev-parse -q --verify HEAD >/dev/null 2>&1; then
		COMMIT=$(git -C "$HERE" rev-parse HEAD)
	else
		warn "the repository has no commits yet; the release is not tied to one"
	fi
	DIRTY=$(git -C "$HERE" status --porcelain)
	if [ -n "$DIRTY" ] || [ -z "$COMMIT" ]; then
		if [ "$ALLOW_DIRTY" = 1 ]; then
			[ -z "$DIRTY" ] || warn "the worktree has uncommitted changes ($(printf '%s\n' "$DIRTY" | wc -l | tr -d ' ') files); releasing them anyway"
		else
			if [ -n "$DIRTY" ]; then printf '%s\n' "$DIRTY" | sed -n '1,20p' >&2; fi
			die "the worktree is not a clean commit; commit first, or pass --allow-dirty"
		fi
	fi
else
	warn "$HERE is not a git repository; skipping the worktree check"
	[ "$ALLOW_DIRTY" = 1 ] || die "pass --allow-dirty to release from outside git"
fi

# ---- what changed --------------------------------------------------------------
tag_exists() {   # tag_exists <tag>: on this clone or (with gh) on GitHub
	git -C "$HERE" rev-parse -q --verify "refs/tags/$1" >/dev/null 2>&1 && return 0
	[ "$GH" = 1 ] && gh release view "$1" --repo "$REPO" >/dev/null 2>&1 && return 0
	return 1
}

# The last release of a mod: releases.json, else the newest <mod>-v* release on
# GitHub (with its SOURCE_HASH asset). Sets LAST_VERSION, LAST_TAG, LAST_HASH.
last_release() {
	LAST_VERSION= LAST_TAG= LAST_HASH=
	line=$($PY last "$HERE" "$1")
	if [ -n "$line" ]; then
		LAST_VERSION=$(printf '%s' "$line" | cut -f1)
		LAST_TAG=$(printf '%s' "$line" | cut -f2)
		LAST_HASH=$(printf '%s' "$line" | cut -f3)
		return
	fi
	[ "$GH" = 1 ] || return 0
	LAST_TAG=$(gh release list --repo "$REPO" --limit 1000 --json tagName --jq '.[].tagName' 2>/dev/null | $PY latest "$1" || true)
	[ -n "$LAST_TAG" ] || return 0
	LAST_VERSION=${LAST_TAG#"$1"-v}
	LAST_HASH=$(gh release download "$LAST_TAG" --repo "$REPO" --pattern SOURCE_HASH --output - 2>/dev/null | head -n 1 | tr -d ' \r\n' || true)
	[ -n "$LAST_HASH" ] || warn "$LAST_TAG has no SOURCE_HASH asset; treating $1 as changed"
}

say "release: mod API $API, repository $REPO$( [ "$PUBLISH" = 1 ] && printf ', publishing' || printf ', dry run (no --publish)')"
SELECTED= PLAN= ERRORS=
for m in $MODS; do
	hash=$($PY mod-hash "$HERE" "$m")
	last_release "$m"
	if [ -n "$LAST_HASH" ] && [ "$hash" = "$LAST_HASH" ] && [ "$FORCE" = 0 ]; then
		say "$m: unchanged since $LAST_TAG, skipping"
		continue
	fi
	if [ -n "$BUMP" ]; then v=$($PY bump "${LAST_VERSION:--}" "$BUMP")
	else v=$VERSION
	fi
	tag="$m-v$v"
	why=changed
	[ -n "$LAST_TAG" ] || why="never released"
	[ -n "$LAST_HASH" ] && [ "$hash" = "$LAST_HASH" ] && why="unchanged, --force"
	if [ "$v" = "$LAST_VERSION" ] || tag_exists "$tag"; then
		ERRORS="$ERRORS
  $m: the tag $tag already exists; choose another version"
	fi
	say "$m: $why: ${LAST_TAG:-(none)} -> $tag"
	say "    source ${LAST_HASH:-(none)}"
	say "        -> $hash"
	SELECTED="$SELECTED $m"
	PLAN="$PLAN $m=$v=$hash"
done
[ -z "$ERRORS" ] || die "refusing to release:$ERRORS"
if [ -z "$SELECTED" ]; then
	say "release: nothing to release (pass --force to release unchanged mods)"
	exit 0
fi

# ---- build, test and package -----------------------------------------------------
if [ -n "${SOURCE_DATE_EPOCH:-}" ]; then MTIME=$SOURCE_DATE_EPOCH; else MTIME=315532800; fi
WORK=$(mktemp -d "${TMPDIR:-/tmp}/es-mods-release.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

install_txt() {   # install_txt <plugin> <version> <mod> <optional: main plugin>
	{
		say "$1 $2"
		say
		if [ -n "${4:-}" ]; then
			say "Optional. This plugin goes with \"$4\" (released with it) and needs it installed."
			say
		fi
		say "A mod for Argosy, the Endless Sky fork with the mod API, built for mod API $API."
		say "It needs Argosy with its bundled Dado mod loader (or a Dado loader for mod"
		say "API $API or newer in Argosy's modloaders folder). Without the loader only the"
		say "plugin's data loads, and its script does nothing."
		say
		say "To install, unzip this archive into Argosy's plugins folder, so that the"
		say "folder \"$1\" sits directly inside it:"
		say
		say "  macOS    ~/Library/Application Support/argosy/plugins"
		say "  Linux    ~/.local/share/argosy/plugins   (or \$XDG_DATA_HOME/argosy/plugins)"
		say "  Windows  %APPDATA%\\argosy\\plugins"
		say
		say "Unzip it: the loader does not run scripts from a zipped plugin. To update,"
		say "delete the old \"$1\" folder first, then restart the game."
		if [ -z "${4:-}" ]; then
			say "The game's log then says: dado: loaded mod \"$3\"."
		fi
	} > "$WORK/INSTALL.txt"
}

notes_about() {   # the first `about` line of a plugin.txt
	$PY plugin-field "$1" about 2>/dev/null || true
}

for p in $PLAN; do
	m=${p%%=*}; rest=${p#*=}; v=${rest%%=*}; hash=${rest#*=}
	MODDIR="$HERE/mods/$m"
	NAME=$($PY plugin-field "$MODDIR/plugin.txt" name) || die "mods/$m/plugin.txt has no name line"
	ID=$(printf '%s' "$m" | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9][^a-z0-9]*/_/g; s/^_//; s/_$//')
	say
	say "== $m $v ($NAME)"
	(cd "$HERE" && node tools/esmod.mjs check "mods/$m") || die "$m failed its check against the fake game"
	set -- "$MODDIR"/test/*.test.mjs
	if [ -f "$1" ]; then
		say "-- $m: tests"
		(cd "$HERE" && node --test "$@") > "$WORK/test.log" 2>&1 || {
			tail -n 40 "$WORK/test.log" >&2
			die "$m failed its tests"
		}
		grep -E '^# (pass|fail)' "$WORK/test.log" | tr '\n' ' ' | sed 's/^/  /'; say
	fi
	# The tests build the mod too; build it last, from this tree, for the package.
	(cd "$HERE" && node tools/esmod.mjs build "mods/$m") || die "$m did not build"
	BUILT="$HERE/dist/$NAME"
	[ -f "$BUILT/scripts/$ID.js" ] || die "the build has no scripts/$ID.js"

	OUT="$HERE/dist/$m-$v"
	rm -rf "$OUT"
	mkdir -p "$OUT"
	ASSETS=
	SLUG=$($PY slug "$NAME")
	install_txt "$NAME" "$v" "$ID"
	$PY pack "$OUT/$SLUG-$v.zip" --root "$NAME" --tree "$BUILT" --version "$v" --add "INSTALL.txt=$WORK/INSTALL.txt" --mtime "$MTIME"
	ASSETS="$SLUG-$v.zip"
	EXTRAS=
	# Extra plugins: folders of the mod with a plugin.txt of their own (not test/ or tools/), shipped as they are.
	for x in "$MODDIR"/*/; do
		xb=$(basename "$x")
		case $xb in test|tools|src|scripts|data|images|sounds|shaders) continue ;; esac
		[ -f "$x/plugin.txt" ] || continue
		[ ! -d "$x/src" ] && [ ! -d "$x/scripts" ] || die "mods/$m/$xb has code; extra plugins are data only"
		XNAME=$($PY plugin-field "$x/plugin.txt" name) || die "mods/$m/$xb/plugin.txt has no name line"
		XSLUG=$($PY slug "$XNAME")
		install_txt "$XNAME" "$v" "$ID" "$NAME"
		$PY pack "$OUT/$XSLUG-$v.zip" --root "$XNAME" --tree "$x" --version "$v" --add "INSTALL.txt=$WORK/INSTALL.txt" --mtime "$MTIME"
		ASSETS="$ASSETS $XSLUG-$v.zip"
		EXTRAS="$EXTRAS $xb"
	done
	# shellcheck disable=SC2086
	$PY sums "$OUT" $ASSETS > "$OUT/SHA256SUMS"
	printf '%s\n' "$hash" > "$OUT/SOURCE_HASH"
	ASSETS="$ASSETS SHA256SUMS SOURCE_HASH"

	tag="$m-v$v"
	NOTES="$OUT/RELEASE_NOTES.md"
	{
		say "**$NAME $v**: $(notes_about "$MODDIR/plugin.txt")"
		say
		say "Requires **Argosy** with its bundled Dado mod loader, mod API **$API** (this release was built with the SDK for mod API $API)."
		say
		say "## Install"
		say
		say "1. Download \`$SLUG-$v.zip\`."
		say "2. Unzip it into Argosy's \`plugins\` folder, so that the folder \`$NAME\` sits directly inside it. Unzip it: the loader does not run scripts from a zipped plugin."
		say "   * macOS: \`~/Library/Application Support/argosy/plugins\`"
		say "   * Linux: \`~/.local/share/argosy/plugins\`"
		say "   * Windows: \`%APPDATA%\\argosy\\plugins\`"
		say "3. To update, delete the old \`$NAME\` folder first. Restart the game; its log says \`dado: loaded mod \"$ID\"\`."
		for xb in $EXTRAS; do
			n=$($PY plugin-field "$MODDIR/$xb/plugin.txt" name)
			say
			say "**Optional:** \`$($PY slug "$n")-$v.zip\` is the \"$n\" plugin, which needs $NAME. $(notes_about "$MODDIR/$xb/plugin.txt") Install it the same way, next to \`$NAME\`, only if you want it."
		done
		say
		say "| | |"
		say "|---|---|"
		say "| Version | $v |"
		say "| Mod API | $API |"
		if [ -n "$COMMIT" ]; then say "| Commit | $COMMIT$( [ -n "$DIRTY" ] && printf ' (with uncommitted changes)') |"; fi
		say
		say "SHA-256:"
		say
		say '```'
		cat "$OUT/SHA256SUMS"
		say '```'
		say
		say "source-hash: $hash"
	} > "$NOTES"
	say "-- dist/$m-$v"
	for a in $ASSETS; do say "  $a ($(wc -c < "$OUT/$a" | tr -d ' ') bytes)"; done
	say "  RELEASE_NOTES.md"

	set -- release create "$tag"
	for a in $ASSETS; do set -- "$@" "dist/$m-$v/$a"; done
	set -- "$@" --repo "$REPO" --title "$NAME $v" --notes-file "dist/$m-$v/RELEASE_NOTES.md"
	case $v in *-*) set -- "$@" --prerelease ;; esac
	if git -C "$HERE" rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
		set -- "$@" --verify-tag
	elif [ -n "$COMMIT" ]; then
		set -- "$@" --target "$COMMIT"   # the commit must be on GitHub already: git push
	fi
	if [ "$PUBLISH" = 1 ]; then
		say "-- publishing $tag to $REPO"
		(cd "$HERE" && gh "$@") || die "gh release create $tag failed"
		$PY record "$HERE" "$m" "$v" "$tag" "$hash"
		say "published https://github.com/$REPO/releases/tag/$tag (recorded in releases.json)"
	else
		line="gh"
		for w in "$@"; do
			case $w in
			*[!A-Za-z0-9_./:=+-]*) line="$line '$(printf '%s' "$w" | sed "s/'/'\\\\''/g")'" ;;
			*) line="$line $w" ;;
			esac
		done
		say "-- not published; to publish, rerun with --publish, or run from $HERE:"
		say "  $line"
		say "  then: python3 tools/release.py record . $m $v $tag $hash"
	fi
done
if [ "$PUBLISH" = 1 ]; then
	say
	say "release: done. Commit releases.json: git add releases.json && git commit -m 'Release:$SELECTED'"
fi
