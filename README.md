# es-mods

Anaxarchus's mods for **Argosy**, the Endless Sky fork with the mod API, run by
the Dado mod loader:

| Mod | Folder | Plugin |
|---|---|---|
| Corporations: a stock exchange, companies bidding for contracts, shipyards with stock | [`mods/corporations`](mods/corporations) | `Corporations` |
| Diplomacy: wars between the Republic, the Free Worlds and the Syndicate, flotillas, a faction panel | [`mods/diplomacy`](mods/diplomacy) ([README](mods/diplomacy/README.md)) | `Diplomacy`, and the optional `Diplomacy Debug` |
| Outfit Integration: shipyards integrate an installed outfit into a ship's hull | [`mods/outfit_integration`](mods/outfit_integration) | `Outfit Integration` |

All three are written in DadoScript. The repository carries the parts of the
[mod SDK](https://github.com/Anaxarchus/endless-sky-mod-sdk) it needs to build,
test and edit them, so it works on its own.

```
mods/<name>/          a mod: plugin.txt, data/, src/ (DadoScript), test/, tools/
imports/sdk/es/       the SDK for DadoScript (`import "imports:sdk/es"`)      } vendored from
js/                   the `es` package (es.Mod, types) and FakeGame            } the SDK by
stub/                 the loader's globals, for plain JS mods and `check`       } tools/sync-sdk.sh
tools/esmod.mjs       build, check, deploy, package                            }
.vscode/              editor settings and tasks                                }
sdk.json              which SDK was vendored (version, mod API, hash)
dado.json             makes this folder a Dado project (for dadoc and the language server)
tools/release.sh      release packages and GitHub releases
releases.json         the last release of each mod (written by release.sh)
```

## Setup

You need [Node.js](https://nodejs.org) 18 or newer and the
[Dado toolchain](https://dadolang.com) (`dadoc` on your `PATH`; `dadoc --version`),
since the mods are DadoScript. Then:

```sh
npm install
```

That installs esbuild and TypeScript and links `js/` as the `es` package.

**Editor.** Open this folder in VS Code and accept the recommended Dado
extension (or run `dado editors`). `dado.json` makes the folder a Dado
project, so the language server resolves `import "imports:sdk/es"` to
`imports/sdk/es/` and shows the documentation of `es.Game` and `es.Mod`.
`dado check mods/<name>/src` checks a mod the same way from the command line.

## Develop, test, deploy

```sh
npm run check -- mods/<name>     # build, then run the hooks against the fake game for 600 steps
npm test                         # every mod's tests (mods/*/test)
npm run typecheck                # the JS/TS sources and the SDK's declarations
npm run build -- mods/<name>     # dist/<Plugin>/
npm run deploy -- mods/<name> --to "<Argosy plugins folder>"
```

Without `--to`, `deploy` installs into Argosy's own plugins folder:

| | |
|---|---|
| macOS | `~/Library/Application Support/argosy/plugins` |
| Linux | `~/.local/share/argosy/plugins` |
| Windows | `%APPDATA%\argosy\plugins` |

With no mod named, each command works on every mod in `mods/`. A new mod:
`npm run new -- "<name>"` (DadoScript; `--js`, `--ts` or `--plain` for
others). Diplomacy's debug plugin deploys with
`node mods/diplomacy/tools/deploy-debug.mjs`, and its in-game tests run with
`mods/diplomacy/test/ingame/run.sh` (see its README). Restart the game after
deploying: mods load when it starts. `npm run install-loader` copies a loader
built in `../es-modloader` into Argosy's `modloaders` folder, for a loader
newer than the one Argosy bundles.

## Syncing the SDK

The SDK files here are copies. After the SDK changes (for example a new mod
API), refresh them from a checkout next to this one:

```sh
tools/sync-sdk.sh                 # from ../endless-sky-mod-sdk (or: tools/sync-sdk.sh <path>, or ES_MOD_SDK)
npm install && npm test
tools/sync-sdk.sh --check         # exit 1 if the copies differ from the SDK's
```

`sync-sdk.sh` copies exactly the paths in its `VENDORED` list
(`imports/sdk/es`, `js`, `stub`, `tools/esmod.mjs` and three `.vscode`
files; folders are replaced whole), takes the SDK's `devDependencies` and
`engines` into `package.json` (the name and scripts stay this repository's),
writes `package-lock.json` from the SDK's, and records in `sdk.json` the SDK
version and commit, its mod API, the loader commit it was synced from and a
hash of the vendored files. `tsconfig.json`, `dado.json` and the tools here
are this repository's own. Commit the result.

## Releasing

```sh
tools/release.sh all --bump patch             # what would be released; builds those packages
tools/release.sh all --bump patch --publish   # release every mod that changed
tools/release.sh diplomacy 0.2.0 --publish    # one mod, an explicit version
git add releases.json && git commit -m "Release ..." && git push
```

`tools/release.sh <mod>|all <version>|--bump patch|minor|major [--publish]
[--dry-run] [--force] [--allow-dirty] [--repo OWNER/REPO]`

* **One release per mod**, tagged `<mod>-v<version>` (e.g.
  `diplomacy-v0.2.0`), in `Anaxarchus/es-mods` (or `--repo`, or
  `$ES_MODS_REPO`). Mods version independently. A version with a `-`
  (`0.2.0-beta.1`) is a prerelease.
* **Only changed mods are released.** Each mod has a *source hash* (below).
  A mod whose hash equals its last release's is skipped
  (`corporations: unchanged since corporations-v0.2.0, skipping`); `--force`
  releases it anyway.
* **Versions.** `all <version>` gives that version to every changed mod.
  `--bump patch|minor|major` gives each changed mod its own last version,
  bumped (`0.1.0` for a mod never released; a prerelease bumps to its
  release, `0.2.0-beta.1` to `0.2.0`). A tag that already exists, here or on
  GitHub, is refused.
* **Without `--publish`** (or with `--dry-run`) nothing is published: the
  script lists which mods would be released, with their old and new versions
  and hashes, builds and packages those, and prints the `gh` commands.
* It refuses a worktree with uncommitted changes (or no commits) unless
  `--allow-dirty`. With a commit it releases that commit (`--target`), so
  **push first**.
* For each mod released it runs `npm run check` and the mod's tests, builds
  it, and writes `dist/<mod>-<version>/`:

  ```
  dist/diplomacy-0.2.0/
    diplomacy-0.2.0.zip          Diplomacy/{plugin.txt, INSTALL.txt, data/, scripts/diplomacy.js}
    diplomacy-debug-0.2.0.zip    Diplomacy Debug/{plugin.txt, INSTALL.txt, data/}  (optional)
    SHA256SUMS
    SOURCE_HASH
    RELEASE_NOTES.md
  ```

  Each zip holds one folder named after the plugin, to unzip into Argosy's
  plugins folder (the loader skips zipped plugins). The packaged `plugin.txt`
  gets `version "<version>"` (the game's plugin list shows it); the source is
  not changed. A folder of the mod with its own `plugin.txt` (Diplomacy's
  `debug/`) ships as an extra, optional zip. Zips have sorted entries and fixed
  times (1980-01-01, or `SOURCE_DATE_EPOCH`), so the same source gives the
  same bytes. The notes give the plugin's description, the install steps, the
  mod API it was built for (`MOD_API` of the vendored SDK), the checksums and
  `source-hash: <sha256>`.
* With `--publish` it runs `gh release create` (assets: the zips,
  `SHA256SUMS`, `SOURCE_HASH`), then records the release in `releases.json`.
  **Commit `releases.json`** afterwards.

**Source hash.** SHA-256 over the sorted list of `<mode> <path>` and each
file's SHA-256: contents and modes only, never times, so whitespace counts and
a touched file does not. It covers:

* the mod's folder, except `test/`, `tools/` and the Markdown files at its top
  (they do not ship);
* the vendored SDK files the build reads: `imports/sdk/es/`, `js/es.js`,
  `js/package.json`, `tools/esmod.mjs` (so an SDK sync releases every mod);
* `package.json`'s `devDependencies` (the esbuild version).

Inside git the files are the ones git would commit (`git ls-files -co
--exclude-standard`, untracked included, `.gitignore` respected), so
uncommitted work counts under `--allow-dirty`. Not covered: the `dadoc`
version and the release script's own wording; use `--force` after a compiler
upgrade you want to ship. `python3 tools/release.py mod-hash . <mod> --list`
shows the files.

**The last release** of a mod comes from `releases.json`
(`{"<mod>": {"version", "tag", "source_hash"}}`), or, when it has no entry and
`gh` is logged in, from the newest `<mod>-v*` release on GitHub and its
`SOURCE_HASH` asset.
