# The Shoal

An endgame grind for Argosy, in DadoScript for the Dado mod loader. It runs on
mod API 9 games (`min_api` 9) and uses API 10 features only where `game.has()`
says the game has them.

**No spoilers here.** What the mod contains, and every number in it, is in
[DESIGN.md](DESIGN.md). Read that only if you don't mind knowing.

## Playing it

```sh
npm run deploy -- mods/shoal     # build and install into Argosy's plugins folder
```

Restart the game. The Shoal needs a seasoned captain: it finds you, in time,
once your combat record is long enough. Without the Dado loader only its data
loads, and nothing stirs.

The workshop takes its materials from your hold *and* from what you keep in
Breaker's Rest's storage. Storage only counts in an Argosy built with the
fork's optional patch `patches/mission-outfits-from-storage.patch` (release
builds apply the patches; for a local build run `patches/apply.sh apply`).
`engine/` keeps a copy of it. Without it, everything must be in your hold or on
your flagship.

## Developing

```sh
npm run check -- mods/shoal                 # build, then run its hooks against the fake game
node --test mods/shoal/test/*.test.mjs      # the mod's tests
```

`test/ingame/tests_shoal.txt` holds Endless Sky integration tests for the
data half (the workshop, the unlock and travel, the way into the Deep and
back, the Breakers' jobs). `test/ingame/e2e/run.sh` runs the real game with the
Dado loader (the Breakers' Yard, and a run through the Deep). Put it in
a plugin's `data/` alongside the game's `integration-tests` plugin and run a
test with `endless-sky --config <dir> --resources <game> --test "<name>"`
(headless on Linux under `xvfb-run`). They don't need the mod loader.

### Notes for other mods

- The entry system's true name is `~The Shoal` (its display name is
  "Breakers' Rest" since 0.5.0), and every system of the region past it starts
  with `~~Shoal `, so they all sort after every stock system and don't shift
  `system_at` indices. None has a human government or a hyperlane to the
  charted map (two wormholes join them), so Diplomacy and Corporations leave
  them alone.
- Conditions it keeps: `shoal: charted`, `shoal: welcomed`, `shoal: in run`,
  `shoal: heat`, `shoal: depth`, `shoal: deepest depth`, `shoal: deepest
  heat`, `shoal: runs`, `shoal: undertows`, `shoal: current`, `shoal:
  crafted`.
- `tools/deep/gen.py` generates the region (map, hazards, the deeper wardens,
  the jobs, `src/Deep.dados`); `tools/deep/balance.py` sets the wardens
  against reference ships.
- Mod data (`Game.data`, its own): `state`.
