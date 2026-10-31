# The Shoal: design (spoilers)

> This file is the build contract for the mod. It describes every system,
> enemy, item and number. If you want to discover The Shoal in play, don't
> read it.

An endgame grind for Endless Sky (Argosy, mod API 10, loader min API 9). A
hidden, lawless asteroid belt full of drowned wrecks and exotic material.
You go in, salvage, and leave before the belt's guardians bury you. The
longer you stay, and the more you carry, the worse it gets. What you carry
out is yours, and a salvagers' outpost turns it into exotic outfits.

Two halves:

* **Data (the plugin's `data/`):** the system, its outpost, its rocks and
  wrecks, the guardians, the materials, 18 exotic outfits, the unlock story
  and the workshop. The workshop and the salvage leads are ordinary
  repeatable job-board missions, so they need no code.
* **Code (`src/`, DadoScript):** the run: heat, waves, extra wrecks, the boss,
  weekly currents, the haul summary, records, map notes. State is saved with
  the pilot.

Everything below is a contract: data and code must use these exact names.

---

## 1. Place

| thing | name | notes |
|---|---|---|
| system | `The Shoal` | `pos -618 -635` (next to Arneb, a pirate dead end, about 110 px north-west of it). `government "Uninhabited"`. **No links in the base data**; the unlock event links it. Dense asteroid belt (many `asteroids` and `minables` lines, belt radius ~1600). Dim, cold star (reuse an existing star sprite). `habitable` etc. as a normal system. `music` ambient as other systems. Sets `fleet "Shoal Wrecks" <period>` and `fleet "Shoal Glass Wrecks" <period>` (derelict fleets, placed when the player arrives). No other system fleets: the guardians come from the mod. Pirates may wander in from Arneb: add `fleet "Small Northern Pirates"`-style existing pirate fleet with a long period (pick an existing pirate fleet name from the game data). |
| outpost | `Breaker's Rest` | a planet (station) in The Shoal. `government "Breakers"`. Spaceport, job board, outfitter that sells only the three materials? **No**: outfitter `"Breaker's Rest"` sells basic ammunition and repair-adjacent common human gear (an existing outfitter list, e.g. reuse an existing `outfitter` name like "Common Outfits"/"Ammo North"; pick ones that exist). No shipyard. `security 0`. `tribute 0`. Trade: a few commodities at frontier prices. Landscape and planet sprite reused from existing stations. Description and spaceport text: salvagers, gamblers, the drowned fleet. |
| government | `Breakers` | the outpost's people. Neutral to everyone, friendly to the player (`player reputation 10`), `"bribe" 0`, never hostile. Colour: rust orange. |
| government | `Shoal Warden` | the guardians. `player reputation -1000`; hostile to everyone except itself (`attitude toward` every human government and "Pirate" `-1`... simplest: give it `"player reputation" -1000` and `attitude toward` "Pirate", "Merchant", "Breakers", "Independent" `-1`). `"fine" 0`, cannot be bribed (`"bribe" 0`), no `hostile hail`/`friendly hail`, or a couple of silent ones. Colour: pale cyan. |
| government | `Shoal Drowned` | the wrecks' government, so derelicts don't count as anyone's. Neutral to all. |

**Unlock event** `shoal: charted`: `link "Arneb" "The Shoal"`. That's all
(the system and outpost already exist in data).

## 2. Materials (outfits, category `"Special"`)

They take no outfit space; they ride in cargo when plundered or mined. All
have `"installable" -1` so they can't be installed by the player (they
appear in plunder and in cargo, and outfitters buy them).

| outfit | mass | cost (sell price) | where |
|---|---|---|---|
| `Shoal Glass` | 1 | 4,000 | geodes in the belt, every wreck |
| `Warden Core` | 4 | 60,000 | the guardians (installed on them, plunderable when disabled) |
| `Deep Lattice` | 2 | 400,000 | deep wrecks (high heat), the boss, rare salvage leads |

Each needs a `thumbnail` (reuse existing outfit/mineral thumbnails), a
`description`, and `plural` where sensible.

## 3. The belt's rocks

`minable "shoal geode"`: existing asteroid sprite (pick one not used by the
standard minables if possible, else reuse), `hull` ~1400, `"random hull"`
300, `payload "Shoal Glass" 1 6` with `toughness` ~8000 (current Endless
Sky minable syntax: `payload <outfit> [<min>] <max>` with an indented
`"toughness"`; check `data/harvesting.txt`), explode effects reused. Used by
The Shoal's `minables` lines along with a couple of standard minables.

## 4. Ships

Sprites are **reused** from the stock game (images under `ship/...` that
exist in Endless Sky). Each new model has a unique true name, and
`"display name"` can differ. All attributes are full ship definitions
(copy an existing ship's block and adjust), with `engine`, `gun`, `turret`,
`explode`, `final explode`, `leak` lines as the borrowed sprite's original
ship had them (copy those coordinates from the original ship).

### Guardians (government `Shoal Warden`)

Theme: automated defenders of a drowned fleet, older than human space,
ugly and patient. Borrow sprites from an alien/automaton line that reads
as machine (e.g. Korath automata `kor ...` sprites, which exist in
`images/ship`). Equip them with **existing** weapons and systems (Korath or
Remnant gear is fine) plus their materials. Each carries a hyperdrive or jump
drive so `Fleet::Enter` can bring them in by jump.

| model | role | strength target (≈ cost) | carries |
|---|---|---|---|
| `Warden Picket` | fast skirmisher | ~2–4M | `"Warden Core" 1`, `"Shoal Glass" 4` |
| `Warden Lancer` | gunship | ~8–12M | `"Warden Core" 2`, `"Shoal Glass" 8` |
| `Warden Bastion` | heavy | ~25–35M | `"Warden Core" 4`, `"Shoal Glass" 12` |
| `The Undertow` | boss, unique | ~90–140M | `"Deep Lattice" 3`, `"Warden Core" 6`, `"Undertow Thruster Mk III" 1`? **No**: carry `"Deep Lattice" 3`, `"Warden Core" 6` only (Mk III gear is crafted, never dropped). Very tough, slow, big turrets. |

They should be a real endgame threat: a single Lancer roughly matches a
well-fitted human heavy warship; a Bastion beats one.

### Wrecks (government `Shoal Drowned`, personality `derelict`)

Wrecks are disabled on arrival, so the player boards and plunders them
(and can capture them, since a disabled ship with crew 0 can be taken).
Models: drowned versions of stock human hulls (reuse their sprites), named
e.g. `Drowned Bulk Freighter`, `Drowned Leviathan`, `Drowned Falcon`,
`Drowned Bactrian`, `Drowned Osprey`, `Drowned Hauler`. `"required crew"`
low, `"bunks"` normal, attributes a bit worse than the original (hull
damage: lower hull, slight drag penalty) but **they are real, flyable,
capturable hulls**, so a captured one is a prize. Each wreck variant carries
some of: `"Shoal Glass"` 6–30, and at most a few ordinary human outfits.

### Fleets

| fleet | government | personality | variants |
|---|---|---|---|
| `Shoal Wrecks` | `Shoal Drowned` | `derelict` | 1–2 drowned hulls, 6–15 glass each |
| `Shoal Glass Wrecks` | `Shoal Drowned` | `derelict` | one drowned hull with 20–30 glass |
| `Shoal Rich Wrecks` | `Shoal Drowned` | `derelict` | 2 drowned hulls, 25–40 glass each, sometimes a Mk I exotic (low weight) |
| `Shoal Deep Wreck` | `Shoal Drowned` | `derelict` | one big drowned hull (Leviathan/Bactrian) with `"Deep Lattice" 1`, 30 glass |
| `Shoal Warden Pickets` | `Shoal Warden` | `heroic staying` (no fleeing; never leaves the system) | 2–3 Pickets |
| `Shoal Warden Hunters` | `Shoal Warden` | `heroic staying` | 2 Lancers, or 1 Lancer + 2 Pickets |
| `Shoal Warden Phalanx` | `Shoal Warden` | `heroic staying` | 1 Bastion + 2 Lancers |
| `Shoal Undertow` | `Shoal Warden` | `heroic staying` | The Undertow + 2 Pickets |

Fleet `names` and `fighters` as usual (reuse existing name lists, e.g. a
Korath or "pirate" names line; wrecks can use a generic name list).

## 5. Exotic outfits (18)

Six lines, three marks each. **True names exactly as below.** Thumbnails,
sprites, effects and sounds are reused from existing outfits (pick ones
whose look fits: glassy/cyan/teal). Category per line. All have `cost`
(the outfitter sale value), `mass`, `"outfit space"` and the right
`"weapon capacity"`/`"engine capacity"`, and `description`. None are sold
anywhere: they only come from the workshop (and very rarely Mk I on rich
wrecks).

Power curve: **Mk I** ≈ the best human equivalent, about 10–20% more
efficient. **Mk II** ≈ Korath/Remnant tier. **Mk III** ≈ beyond anything
a human can buy, with a cost (heat, mass or energy) so it isn't a free win.
Compare against real outfits in the data (`data/human/outfits.txt`,
`engines.txt`, `power.txt`, weapons) and set numbers per unit of outfit
space. Mk I/II/III of a line differ in numbers, not in size, unless noted.

| line | names | category | what it is |
|---|---|---|---|
| gun | `Tidecutter Mk I/II/III` | Guns | energy beam-pulse gun, piercing a little at Mk III |
| turret | `Riptide Turret Mk I/II/III` | Turrets | fast-tracking anti-everything turret |
| shields | `Glassweave Shield Mk I/II/III` | Systems | shield generator with strong regen per space, low heat |
| power | `Abyssal Cell Mk I/II/III` | Power | reactor: high output per space; Mk III also adds a little `"energy capacity"` |
| engine | `Undertow Thruster Mk I/II/III` | Engines | thruster (thrust + energy + heat, no steering) with excellent thrust per space; Mk III heavy |
| repair | `Coralgraft Mender Mk I/II/III` | Systems | hull repair rate, needs energy |

Weapons must follow the game's weapon syntax (`weapon` block with
`sprite`/`sound`/`hit effect`/`velocity`/`lifetime`/`reload`/
`"shield damage"`/`"hull damage"` etc.); copy the structure of an existing
energy gun and turret and adjust numbers. Turrets need `"turret mounts" -1`
and a `hardpoint sprite`; guns `"gun ports" -1`.

## 6. The workshop (job-board missions at Breaker's Rest)

18 repeatable jobs, one per outfit, plus their accept rules. Each is

```
mission "Shoal: Workshop <outfit>"
	name "Workshop: <outfit>"
	job
	repeat
	source "Breaker's Rest"
	destination "Breaker's Rest"
	description "..."                # what it costs, in words
	to offer
		<gate>
	on accept
		outfit "<input>" -<n>        # one line per input
		payment -<credits>
		outfit "<outfit>" 1
		dialog "..."
		"shoal: crafted" ++
		fail
```

An `on accept` that takes outfits can only be accepted when the player has
them (installed on the flagship, or in the hold), and a negative payment
only when they can pay; `fail` then quietly ends the job. The description
must say "installed on your flagship or in your hold" for outfit inputs.

| mark | inputs | credits | gate (`to offer`) |
|---|---|---|---|
| Mk I | 30 `Shoal Glass` | 150,000 | always |
| Mk II | 1 Mk I of that line, 60 `Shoal Glass`, 6 `Warden Core` | 750,000 | `"outfit (all): <Mk I>" > 0` |
| Mk III | 1 Mk II of that line, 8 `Warden Core`, 2 `Deep Lattice` | 3,000,000 | `"outfit (all): <Mk II>" > 0` |

(A Mk II/III job is only on the board for a line you've started. Taking a
Mk I into Mk II consumes the Mk I.)

## 7. Salvage leads (job-board missions at Breaker's Rest)

Repeatable jobs that put a marked derelict (an `npc` with `personality
derelict`, `government "Shoal Drowned"`, `system "The Shoal"`) in the belt
for you to board. Objective `npc board`; `on complete` pays a small finder's
fee. Each has `to offer` with `random < N` so the board changes:

| job | offered | wreck |
|---|---|---|
| `Shoal: Lead Freighter` | random < 50 | one drowned freighter, 40 glass |
| `Shoal: Lead Warship` | random < 30 | one drowned warship, 25 glass + 1 `Warden Core` + a Mk I exotic (any line) |
| `Shoal: Lead Deep` | random < 20, and `"shoal: deepest heat" >= 70` | a drowned Leviathan with 2 `Deep Lattice`, guarded: a second `npc kill` with `fleet "Shoal Warden Phalanx"` (government `Shoal Warden`, personality `heroic staying`) |

Deadline ~6 days; none fail anything else.

## 8. The way in (unlock)

`mission "Shoal: Whispers"`: a `landing` mission offered on any human
planet with a spaceport (`source` filter: `attributes "spaceport"`, not in
The Shoal) when `"combat rating" >= 8103` (rank 9, "respected enemy") and
not `"shoal: charted"`. Conversation: a half-drunk salvager / a dying
captain / an old map seller (pick one) tells of a belt beyond Arneb where a
drowned fleet lies, and of what guards it. Choices: listen and buy the
coordinates (accept), or not (decline; it comes back another day: `to
offer` + `random < 40` so it isn't every landing). On accept:
`event "shoal: charted"`, `mark "The Shoal"`, `"shoal: charted" = 1`, log
entry. The mission's destination is `Breaker's Rest`; `on complete` (on
landing there) a short welcome conversation explaining the Breakers, the
workshop and the leads, without spelling out the danger mechanics. The
first landing also sets `"shoal: welcomed" = 1`.

## 9. The run (code, `src/`)

Mod class `Shoal extends es.Mod`, `name()` `"the shoal"`. `min_api()` 9.
Plugin name `The Shoal` (folder `mods/shoal`, built `dist/The Shoal/`).

### State (saved with the pilot, `game.set_data("state", json)`)

Per run: `active`, `heat` (0..100+, float), `fired` (which wave thresholds
have fired this run), `undertow` (spawned this run), `jammed` (the
outpost's once-per-run heat cut used), `deep` (deep wreck spawned this run),
`entry` (materials in cargo on entry: glass, cores, lattice), `seconds` (time
in the belt), `after` (seconds since heat passed 100, for endless waves).

Records: `runs`, `deepest` (best heat), `undertows` (bosses beaten),
`hauls` (total glass/cores/lattice extracted).

Mirror these conditions for missions: `"shoal: runs"`, `"shoal: deepest
heat"` (int), `"shoal: undertows"`, `"shoal: current"` (1..4), `"shoal: heat"`
(int, live), `"shoal: in run"` (0/1).

Write state in `on_save` (and when a run ends); read it in
`on_pilot_loaded` (reset everything for the new pilot first). On a game
without `on_pilot_loaded` (API 9), read it lazily on the first hook.

### Starting, pausing, ending a run

`on_enter(game, system)` runs on arrival, on landing and once on load:

* entering `The Shoal` with no active run → **start**: heat 0, record
  entry materials (`game.condition("outfit (cargo): <name>")`), message the
  current (see below).
* entering `The Shoal` with an active run (landing at, or taking off from,
  Breaker's Rest; loading a save there) → continue.
* landed on `Breaker's Rest` (`game.planet() == "Breaker's Rest"`) with an
  active run and `jammed` false → heat × 0.75, `jammed` true, message.
* entering any other system with an active run → **end**: haul = cargo
  materials now − at entry (floored at 0), add to records, `runs` + 1,
  message a summary ("You slip out of the Shoal with 42 glass, 3 cores."),
  clear the run.

### Heat (in `on_step`, only while `game.here() == "The Shoal"` and in flight)

Per second (`step % 60 == 0`):

```
greed = glass + 8 × cores + 40 × lattice      (in cargo now, via conditions)
rate  = current.mult × (1/6 + min(0.5, greed × 0.0015))
heat += rate
```

Plus `+2` heat per guardian the player disables or destroys:
`game.player_kills("shoal.")` each second.

### Waves (each fires once per run when heat first reaches it)

Spawn with `game.spawn(fleet, "", tag, arrive)`: government `""` keeps the
fleet's own. Guardians `arrive = true` (they jump in). Wrecks
`arrive = false` (placed, so derelicts are disabled). Tags start with
`"shoal."` (e.g. `"shoal.wave.3"`, `"shoal.undertow"`).

| heat | spawn | message (one line, ominous, short) |
|---|---|---|
| 10 | (none) | first warning |
| 12 | Pickets | |
| 25 | Hunters | |
| 38 | Pickets ×2 | |
| 50 | Phalanx, and `Shoal Rich Wrecks` (placed) | the stirring uncovers wrecks |
| 62 | Hunters + Pickets | |
| 72 | Phalanx, and `Shoal Deep Wreck` (placed, once per run) | something deep surfaces |
| 84 | Hunters ×2 | |
| 92 | Phalanx + Hunters | last warning |
| 100 (`current` may lower it) | `Shoal Undertow`, once per run | the Undertow wakes |
| above 100 | every 40 s: Phalanx, then Hunters, alternating | |

Kills of the boss: `game.player_kills("shoal.undertow")` must be read
**before** the general `"shoal."` read (it erases what it counts), or use
one `"shoal."` read plus tracking by tag strength: when
`game.tag_strength("shoal.undertow")` drops to 0 after it was spawned, the
Undertow is down → `undertows` + 1, message.

### Currents (weekly)

`week = day / 7`; `current = hash(week) % 4` (any stable integer hash).
Condition `"shoal: current"` = current + 1, set on every `on_day` and run
start.

| # | name | effect |
|---|---|---|
| 0 | Slack Water | heat ×0.8 |
| 1 | Spring Tide | heat ×1.0; an extra `Shoal Rich Wrecks` at heat 25 |
| 2 | Riptide | heat ×1.2; every guardian wave also brings one extra `Shoal Warden Pickets` |
| 3 | Dead Calm | heat ×1.0; the Undertow wakes at 85 |

### Map

In `on_enter` (and after a run), `map_detail("The Shoal", "The Shoal", text,
r, g, b)` once the player has `"shoal: charted"`: this week's current, runs,
deepest heat, Undertows sunk. Use the pale cyan. Call `map_clear()` first
(the mod owns only its own overlays).

### Messages

Short, atmospheric, never numbers except in the run summary. Heat itself is
never shown as a number, only felt through the warnings (and in the summary
as a word: "calm", "stirring", "roused", "furious", "abyssal").

### Robustness

* Every API 10 call (`has`, `timing_section`) only when `game.has` exists
  and says so (see how `mods/diplomacy` checks `has` first).
* Never spawn while landed (`game.planet() != ""`), and never in any other
  system.
* If the player loads a save mid-run in another system, the run ends
  quietly (no haul).
* A hook that throws is switched off by the loader: keep hooks simple,
  guard indexes, and test.

## 10. Tests (`test/*.test.mjs`, `node --test`, against `es/fake-game`)

Build like `mods/outfit_integration/test` does (skip without `dadoc`). At
least: run start/continue/end; heat grows faster with cargo; each wave fires
once at its threshold; the Undertow fires once and its kill is counted;
landing at the outpost cuts heat once; currents are stable per week and
change across weeks; state survives `on_save` → new mod → `on_pilot_loaded`;
nothing spawns while landed or outside The Shoal; the run summary counts
only what was gained.

---

## 11. Revisions after review (these override the sections above)

* **System true name `~The Shoal`**, `display name "The Shoal"`. Diplomacy
  stores systems by index into the sorted list of system true names
  (`system_at`), so a new system must sort after every stock one or it shifts
  every saved index. Code, events and missions use the true name; prose says
  "The Shoal".
* **No wreck fleets on the system.** Land/take-off cycling re-placed them for
  free. The code spawns `Shoal Wrecks` ×2 and `Shoal Glass Wrecks` ×1
  (placed, so disabled) once at the start of each run.
* **Heat carries over between runs:** start heat = max(0, last run's heat −
  8 × days since it ended). Thresholds at or below it count as fired; the
  highest such guardian wave is waiting on arrival.
* **Waves survive landing.** Guardians alive when the player lands at
  Breaker's Rest jump back in after takeoff (Undertow included). The outpost
  is a breather, not an eraser. The once-per-run heat cut stays.
* **Storage counts:** materials = `outfit (cargo)` + `outfit (storage)`.
* **Salvage leads** only during a run (`"shoal: in run" == 1`), with
  cooldowns on `"days since epoch"` (freighter 2, warship 5, deep 7 days);
  the deep lead needs live `"shoal: heat" >= 50`.
* **Wardens carry unplunderable copies** of their valuable gear
  (`"unplunderable" 1`); their materials stay plunderable.
* **Drowned hulls** need 0.8 × the stock hull's crew.
* **Breaker's Rest has no bank** (`port` services), so Corporations doesn't
  treat it as a market world.
* **Unlock** at `"combat rating" >= 1097` (rank 7, "seasoned fighter").
* Same-pilot reload guard (revision marker, as Diplomacy does); kill counts
  are drained at run start and end; no heat numbers shown anywhere; the
  summary names only what was gained.
* **Rim hulks** (`The Keel`, `The Ossuary`, `Saltgrave`, `The Drowned Spire`,
  4300–6100 from the star; Breaker's Rest is at 1180). `Fleet::Place`
  centres a placed fleet on a random *inhabited* planet, so with only the
  station inhabited every wreck appeared beside it. The hulks are
  "inhabited" (a reputation nobody has, `to land never`, government
  `Shoal Warden`), so about 4 in 5 wrecks now lie on the rim, and guardians
  that arrive can launch from the hulks. Getting home is a run.

## 12. More lines (v0.2)

Six more exotic lines, built and priced exactly like section 5 (Mk I
240,000 / Mk II 1,450,000 / Mk III 5,400,000) with the section 6 recipes
(Mk I: 30 glass + 150,000; Mk II: Mk I + 60 glass + 6 cores + 750,000;
Mk III: Mk II + 8 cores + 2 lattice + 3,000,000). Reference outfits and
ratios are in the comment above each line in `shoal outfits.txt`.

| line | names | category | size | what it is |
|---|---|---|---|---|
| steering | `Eddy Steering Mk I/II/III` | Engines | 40 | turn per space 66 / 75 / 95 (A865 58.6, Korath Stellar 67.5); Mk III twice the mass, hot |
| battery | `Brine Capacitor Mk I/II/III` | Power | 20 | energy capacity 13,200 / 23,000 / 36,000; Mk III leaks energy and heat |
| cooling | `Coldwater Sink Mk I/II/III` | Systems | 20 | 40 cooling / 30 + 40 active / 20 + 110 active; Mk III power-hungry and heavy |
| point defense | `Glimmer Point Defense Mk I/II/III` | Turrets | 28 | anti-missile 9 / 22 / 45, range 240 / 320 / 400; Mk III energy and heat |
| armor | `Coral Plating Mk I/II/III` | Systems | 30 | hull 400 / 960 / 1,650, a little hull repair, piercing (Mk II+) and hull (Mk III) protection; Mk III very heavy |
| afterburner | `Siltwake Afterburner Mk I/II/III` | Engines | 20 | afterburner thrust 103 / 180 / 400; Mk III drinks fuel, very hot |

**Crew line** `Warden Steward Mk I/II/III` (Systems, 4 / 8 / 16 space):
`"required crew"` −3 / −8 / −20, a little energy and heat. The engine never
lets required crew go below 1 (Outfit::CanAdd), so Mk III fits only ships
that need 21+ crew. Fewer crew also means fewer defenders against boarders.
Sale 300,000 / 1,000,000 / 3,500,000.

| mark | Steward recipe | credits | gate |
|---|---|---|---|
| Mk I | 3 `Warden Core`, 20 `Shoal Glass` | 100,000 | always |
| Mk II | Mk I, 6 `Warden Core` | 500,000 | owns a Mk I |
| Mk III | Mk II, 10 `Warden Core`, 1 `Deep Lattice` | 2,000,000 | owns a Mk II |

Workshop jobs: `Shoal: Workshop <outfit>` for all 21, same pattern as
section 6. No recipe turns a profit (inputs at sale value + credits vs the
outfit's sale value): exotics 270k > 240k, 1.59M > 1.45M, 5.73M > 5.4M;
Steward 360k > 300k, 1.16M > 1.0M, 4.0M > 3.5M.

`Shoal Rich Wrecks` gains one weight-2 variant per new exotic line carrying
its Mk I (`Drowned Falcon (Rich, Eddy)`, `Drowned Leviathan (Rich, Brine)`,
`Drowned Hauler (Rich, Coldwater)`, `Drowned Bactrian (Rich, Glimmer)`,
`Drowned Bulk Freighter (Rich, Coral)`, `Drowned Osprey (Rich, Siltwake)`);
the Steward never drops. A rich-wreck spawn now carries an exotic 24 times
in 72 (was 12 in 60).

## 13. Storage counts for the workshop (needs an engine patch)

Stock Endless Sky lets a mission take outfits only from the flagship
(installed or in its hold) and the pooled cargo. The workshop's inputs are
too heavy to carry at once, so the fork needs
`engine/storage-for-mission-outfits.patch`: when landed, a mission action's
outfit check also counts the outfits in storage on that planet, and taking
outfits draws from the hold first, then that storage, then the flagship. It
applies to every mission, which only ever widens what can be paid. Tested
in-engine (`Shoal Workshop Uses Storage`, `Shoal Workshop Storage Still Needs
Enough`); without the patch the first fails.

## 14. Refined materials (v0.3)

The workshop no longer takes raw materials. Shoal Glass and Warden Cores are
refined first; the raw materials themselves (and Deep Lattice) are unchanged
and drop exactly as before.

| outfit | mass | cost (sale) | made from | thumbnail |
|---|---|---|---|---|
| `Refined Shoal Glass` | 1 | 40,000 | 10 `Shoal Glass` | `outfit/harvested yottrite` |
| `Refined Warden Core` | 1 | 180,000 | 3 `Warden Core` | `outfit/hai pebble core` |

Both are category `"Special"`, `"installable" -1`, with `plural` and a
description, like the other materials (in `shoal outfits.txt`, after Deep
Lattice). The ratios keep sale value unchanged (10 × 4,000; 3 × 60,000), so
refining is neither a profit nor a loss; it only saves cargo space.

### Recipes (replace sections 6 and 12; whole units, refined only)

| mark | exotic lines (all 12) | Warden Steward |
|---|---|---|
| Mk I | 3 Refined Shoal Glass + 150,000 | 2 Refined Shoal Glass + 1 Refined Warden Core + 100,000 |
| Mk II | Mk I + 6 Refined Shoal Glass + 2 Refined Warden Core + 750,000 | Mk I + 2 Refined Warden Core + 500,000 |
| Mk III | Mk II + 3 Refined Warden Core + 2 Deep Lattice + 3,000,000 | Mk II + 3 Refined Warden Core + 1 Deep Lattice + 2,000,000 |

Gates and the accept-and-fail pattern are unchanged. In raw terms the exotic
recipes cost the same glass and cores as before except Mk III (9 cores, was
8); the Steward Mk III takes 9 cores (was 10).

Profit check (inputs at sale value + credits vs the outfit's sale value; no
cost had to change):

* exotics: Mk I 270k > 240k; Mk II 240k + 240k + 360k + 750k = 1.59M > 1.45M;
  Mk III 1.45M + 540k + 800k + 3.0M = 5.79M > 5.4M.
* Steward: Mk I 80k + 180k + 100k = 360k > 300k; Mk II 300k + 360k + 500k =
  1.16M > 1.0M; Mk III 1.0M + 540k + 400k + 2.0M = 3.94M > 3.5M.

### The refinery

The refinery proper is a button on Breaker's Rest added by the mod's code: it
refines everything refinable in the hold and in storage there at once (whole
batches; leftovers stay raw). It needs the mod API 11 call `outfit_take`.

**Fallback jobs** (`shoal refinery.txt`) exist only for games without that
call. The code sets the condition `"shoal: refinery jobs"` to 1 only when the
game lacks `outfit_take`; otherwise (and without the loader at all) it stays 0
and the jobs are never offered. Each is a repeatable job at Breaker's Rest
(`source`/`destination` "Breaker's Rest"), `to offer` `"shoal: refinery jobs"
== 1`, and on accept takes the raw input, gives the refined output, shows a
short dialog and fails. No fee, no `"shoal: crafted"`.

| mission | job name | takes | gives |
|---|---|---|---|
| `Shoal: Refine 10 Shoal Glass` | `Refinery: 10 Shoal Glass` | 10 Shoal Glass | 1 Refined Shoal Glass |
| `Shoal: Refine 50 Shoal Glass` | `Refinery: 50 Shoal Glass` | 50 | 5 |
| `Shoal: Refine 100 Shoal Glass` | `Refinery: 100 Shoal Glass` | 100 | 10 |
| `Shoal: Refine 3 Warden Cores` | `Refinery: 3 Warden Cores` | 3 Warden Cores | 1 Refined Warden Core |
| `Shoal: Refine 15 Warden Cores` | `Refinery: 15 Warden Cores` | 15 | 5 |

The welcome conversation and its log now say the cutters work refined stock
only, and the ratios. In-engine tests: `Shoal Refinery Job Refines Glass`,
`Shoal Refinery Jobs Need The Condition`; the workshop tests use refined
materials (`Shoal Workshop Needs 3 Refined Glass` replaces `... Needs 30
Glass`).

## 15. v0.3 (data): drops, restless wrecks, guardians

Contract: `/root/fork/SPEC-shoal-v03.md`. The code half (the Breakers' Yard
at Breaker's Rest, Haven and Farpoint; the refinery button; waking restless
wrecks) is described there.

**Workshop.** The 36 exotic-line jobs are gone; only the three Warden Steward
jobs (section 14 recipes) and the fallback refinery jobs remain. The twelve
exotic lines come only from wrecks and leads (Mk I, rarely Mk II); Mk III only
by upgrading at the yard. The welcome conversation and log name the yard and
its three planets.

**Drop rates** (one exotic per variant at most; all twelve lines equally):

| fleet / source | Mk I | Mk II | how |
|---|---|---|---|
| `Shoal Wrecks` | 8.2% | 0 | old weights x3; 12 `(Worn, X)` one-hull variants (10 glass) at weight 7: 84 in 1026 |
| `Shoal Glass Wrecks` | 7.7% | 0 | old weights x4; the 12 `(Rich, X)` hulls (30 glass) at weight 1: 12 in 156 |
| `Shoal Rich Wrecks` | 40% | 5% | of 240: plain pairs 132, `(Rich, X)` pairs 8 per line (96), `(Rich, X II)` pairs 1 per line (12) |
| `Shoal Deep Wreck` | 75% | 25% | always one exotic: `(Deep, X)` 3 per line, `(Deep, X II)` 1 per line (plus 1 lattice, 30 glass) |
| `Shoal: Lead Warship` | 80% | 20% | `(Lead, X)` 4 per line, `(Lead, X II)` 1 per line (plus 1 core, 25 glass) |

Each line keeps one hull (the v0.2 rich mapping: Tidecutter/Eddy on a
Falcon, Riptide/Undertow/Siltwake on an Osprey, Glassweave/Brine on a
Leviathan, Abyssal/Glimmer on a Bactrian, Coralgraft/Coral on a Bulk
Freighter, Coldwater on a Hauler); deep wrecks use a Leviathan or Bactrian.
Abyssal replaces an RT-I, Undertow the thruster, Eddy the steering; Siltwake
on a Leviathan swaps the X4700 for an X3700 to make engine room. Every
variant fits its hull's outfit, weapon and engine capacity.

**Restless wrecks.** Fleet `Shoal Restless Wrecks` (`Shoal Drowned`,
`derelict mute`), variants `Drowned <Hull> (Restless)` for all six hulls,
`uncapturable` (so capturing cannot hand over the Warden copies), each with a
Liquid Nitrogen Cooler so it does not cook when it wakes:

| hull | weapons (Warden copies) | power | loot |
|---|---|---|---|
| Hauler | 2 Particle Cannon, 1 Shield Disruptor Turret | 1 RT-I | 15 glass |
| Osprey | 2 Particle Cannon, 2 Piercer launcher (40 missiles), Warder | 1 RT-I | 18 glass |
| Bulk Freighter | 2 Particle Cannon, 2 Shield Disruptor, Warder | 1 RT-I | 30 glass |
| Falcon | 2 Particle Cannon, 2 Piercer (40), Disruptor, Husk-Slice Turret, Warder | 3 RT-I, 2 coolers | 22 glass, 1 core |
| Leviathan | 4 Particle Cannon, 2 Disruptor, Warder | 3 RT-I, 2 coolers | 25 glass, 1 core |
| Bactrian | 2 Particle Cannon, 2 Piercer (40), 2 Husk-Slice Turret, Disruptor, Warder | 3 RT-I, 2 coolers | 28 glass, 1 core |

Energy-light weapons (Particle Cannon, Piercer) were preferred: drowned
reactors are weak. Max heat generation stays under dissipation on every hull.
Fleet: weights 6/6/4/4/4/2 single hulls plus three pairs (3, 2, 1); a core is
aboard in 13 spawns in 32.

**Guardians.** Reference: a Bactrian with the Shoal Mk IIIs that fit
(4 Tidecutter, 3 Riptide, 1 Glimmer, 2 Undertow, Eddy, Siltwake, 3 Abyssal,
3 Coldwater, Glassweave, Coral Plating): 2,322 shield / 2,738 hull damage per
second headline (about 75% sustained: weapons and coolers draw ~4,500
energy/s against 3,456), 17,500 shields + 10,250 hull, 234 shield/s regen,
+10% hull protection. Yard-upgraded stock gear (x1.35) is weaker than this,
so it is the bar. Old guardians against it: the ship beat a Lancer 13 s to
30 s, and only lost to a Bastion 42 s to 16 s; too easy. Changes:

* Warden weapon copies run at the yard's Mk III factors: all damage types
  x1.35 (Warder anti-missile 10 -> 14), firing energy and heat x1.12. The
  restless wrecks share these copies.
* Hulls (shields / hull / shield gen / hull repair per frame / cost); energy
  generation and cooling x1.12:

| model | old | new | dps (shield / hull), old -> new |
|---|---|---|---|
| Picket | 6,400 / 3,800 / 1.2 / .15 / 1.6M | 8,000 / 4,800 / 1.5 / .2 / 2.0M | 428 / 805 -> 578 / 1,087 |
| Lancer | 20,000 / 10,000 / 3.2 / .4 / 3M | 30,000 / 14,000 / 4 / .5 / 4.5M | 1,006 / 1,532 -> 1,358 / 2,068 |
| Bastion | 62,000 / 26,000 / 7 / 1 / 17M | 80,000 / 32,000 / 8 / 1.2 / 24M | 1,875 / 2,041 -> 2,531 / 2,755 |
| Undertow | 160,000 / 125,000 / 14 / 3 / 80M | 200,000 / 150,000 / 16 / 3.5 / 100M | 2,707 / 4,042 -> 3,654 / 5,457 |

Result against the reference ship (headline numbers, one-on-one): a Lancer
dies in ~20 s and kills it in ~21 s (an even fight; at sustained fire the
Lancer wins); a Bastion dies in ~55 s and kills it in ~12 s; the Undertow
takes ~206 s alone while killing it in ~7 s, and five such ships still need
~30 s, so it needs a fleet. Loot (cores, glass, lattice) is unchanged.

**Tests.** The workshop tests now use Steward recipes: `Shoal Workshop Builds
Only Stewards` (with plenty of refined stock and lattice, walking the whole
board builds one Steward Mk I and no exotic), `Shoal Workshop Steward Needs A
Refined Core`, and the storage tests (`Uses Storage`, `Storage Still Needs
Enough`) with Steward inputs split between hold and storage.

## 16. The yard on mod API 12: any installed outfit

The Breakers' Yard no longer depends on a list of names. On a game with mod
API 12 (`game.has("call:ship_outfit_kinds")`, `call:ship_outfit_at`,
`call:outfit_weapon_attribute` and `call:fleet_ship_planet`, guarded like
the API 11 calls; `Yard.can_list`):

* **Which ships.** The player's ships whose `fleet_ship_planet` is this
  planet: those landed with the player and those parked here. Ships parked
  or left elsewhere are not listed.
* **Which outfits.** Each ship's installed outfits (`ship_outfit_kinds`,
  `ship_outfit_at`), less the integrated ones (`ship_outfit_count` −
  `ship_integrated_count`): stock, any plugin's, or any mod's runtime
  definitions. Each is classified by its attributes (`outfit_attribute`,
  `outfit_category`, `outfit_is_weapon`) and, for a weapon, its weapon stats
  (`outfit_weapon_attribute`); the marks are built from those values.
* **Weapons.** The yard reads `Tuning.weapon_keys`: every `<type> damage`
  (shield, hull, disabled, minable, fuel, heat, energy, ion, scrambling,
  disruption, slowing, discharge, corrosion, leak, burn, and the relative
  ones) and `anti-missile` scale by the mark's headline factor; `firing
  energy`, `firing heat` and `firing fuel` by its drawback factor; nothing
  else of the weapon changes. Disabled and minable damage, which the game
  answers as hull damage when the data leaves them out, are written
  explicitly (the same values). A weapon whose damage comes partly from
  submunitions (its `range` is longer than its own velocity × lifetime, with
  no `range override` and no `exclude submunition damage`) is refused: the
  game answers their damage with its own, and a mark would add it twice.
* **Runtime outfits of other mods** are upgradable when they qualify (the
  API 11 refusal "defined at run time by a mod" applies only to the
  fallback). The yard's own marks are recognised by name,
  `<base> (Breakers Mk N)` with a base the game knows, and every mark stays
  derived from that ORIGINAL base, so another mod's runtime outfit is the
  base of its marks. A name in that pattern with an unknown base or a mark
  past the table (a later release's Mk IV) is not offered. The Shoal's lines
  keep their authored marks.
* Everything else is v0.3: the mark table, prices, refusals (negative
  `required crew`, categories, expansions, maps, integrated), the refinery,
  and restless wrecks. A clicked row stays selected (also when the yard says
  what it lacks), so the arrow keys step on from it.

**Fallback (API 11, the current public release).** Without those calls the
yard works as before from `Catalog.dados` (generated by
`test/catalog.test.mjs` from the game's data): it looks for Catalog's stock
names and the Shoal's lines through the `outfit (installed/parked)`
conditions, takes weapon stats from Catalog, and refuses other mods'
runtime outfits. Catalog and its test stay only for that fallback.

**Tests.** Unit tests (FakeGame, API 12 by default): a plugin outfit not in
Catalog listed and upgraded; a weapon's damage of every type scaled from
`outfit_weapon_attribute`, its other stats unchanged, and submunition
weapons refused; another mod's runtime shield and gun upgraded with
themselves as the base, through Mk II; only ships on this planet listed;
and the API 11 fallback (FakeGame without the API 12 features). The
end-to-end test (`test/ingame/e2e/run.sh`, game and loader on API 12) also
upgrades a gun its own plugin defines (`E2E Sleetgun`) to Mk I through the
yard, saves, reloads, and checks it is still installed and that the saved
variant carries the scaled damage and firing costs.

## 17. Combat jobs: the ambushers (data)

Drowned hulls that woke armed and stayed awake, hunting the Breakers. Three
repeatable jobs at Breaker's Rest in `shoal ambushes.txt`. Unlike the salvage
leads they **do not need a run** (each brings its own enemies); all need
`"shoal: welcomed" == 1`, a random roll and a cooldown on `"days since epoch"`
set on accept. Pay is on completion.

| job (mission) | offered | cooldown | deadline | enemies (`Shoal Warden`, `heroic staying mute`, in `~The Shoal`) | objective | pay |
|---|---|---|---|---|---|---|
| `Ambush at the wrecks` (`Shoal: Ambush At The Wrecks`) | random < 40 | 4 days | 5 | 1 or 2 from `Shoal Ambushers` | `npc disable` on the ambushers; `npc save` on a Breakers barge (`staying timid mute marked`, in the Shoal); land at Breaker's Rest | 300,000 |
| `Silence the hunter: <npc>` (`Shoal: Silence The Hunter`) | random < 25 | 6 days | 6 | one named hull from `Shoal Ambush Hunter` (`marked`), plus `Shoal Warden Pickets` with no objective | `npc disable` on the hunter; land at Breaker's Rest | 750,000 |
| `Tow escort: <npc>` (`Shoal: Tow Escort`) | random < 30 | 4 days | 6 | 3 from `Shoal Ambushers`, no objective | `npc accompany save` on a Breakers tug (`escort timid`) from Breaker's Rest; land with it on Haven (Arneb) | 450,000 |

* **Disable, not kill.** `npc disable` succeeds when the ship is disabled or
  destroyed (a kill shot sets both events), so the player may board and plunder
  first. The ambushers are uncapturable, like the restless wrecks.
* **One or two ambushers.** A job runs `on offer` as it is accepted, before
  its NPCs' spawn conditions are checked: it sets `"shoal: ambush pair" =
  random / 50` (0 or 1), the second ambusher NPC has `to spawn "shoal: ambush
  pair" == 1`, and `on accept` resets it to 0 so no later check spawns it.
* **The Breakers' ships** are drowned hulls they refitted:
  `Drowned Bulk Freighter (Breakers Barge)` and `Drowned Hauler (Breakers Tug)`,
  with stock turrets and shield generator and `add attributes` of +36,000 /
  +30,000 shields, +18,000 / +15,000 hull and 4 / 3.5 shield generation, so
  they hold for a while against two or three armed hulls while the player
  closes in. Names from the phrase `shoal breakers ships`; the hunter's from
  `shoal hunter`.
* **Difficulty.** The ambushers fire the rebalanced Warden copies (section 15).
  Headline damage per second (shield / hull) of the restless loadouts they
  start from: Hauler 834 / 543, Osprey 1,442 / 1,890, Bulk Freighter 1,142 /
  584, Falcon 2,065 / 2,766, Leviathan 1,669 / 1,086, Bactrian 2,380 / 3,601;
  their hulls are the drowned ones (2,100–14,900 shields). Against the section
  15 reference ship (17,500 shields + 10,250 hull, 2,322 / 2,738 dps) one
  ambusher is light work; the jobs are hard because of what must survive (the
  barge, the tug) and, for the hunter, the Warden Pickets (8,000 / 4,800, 578 /
  1,087 dps each) that ride with it.

### Ambusher variants

`Drowned <Hull> (Ambusher)` (no exotic), `(Ambusher, X)` (a Mk I of line X),
`(Ambusher, X II)` (a Mk II), and lists for two or three, e.g. `Drowned Falcon
(Ambusher, Riptide II, Coldwater, Coral)`. 246 variants, each the restless
loadout of its hull (`uncapturable`, same Warden copies, same loot: 15–30
glass, a Warden Core on the Falcon, Leviathan and Bactrian) with the exotics
fitted in:

* **Warship hulls: Osprey, Falcon, Leviathan, Bactrian** (the armed hulls; up
  to three exotics). **Freighter hulls: Hauler, Bulk Freighter** (at most one).
* An exotic replaces its stock counterpart: Tidecutter a Particle Cannon,
  Abyssal an RT-I, Undertow the thruster, Eddy the steering, Brine the battery,
  Coldwater a nitrogen cooler, Glimmer the Warder, Riptide a Shield Disruptor
  (or Husk-Slice) turret when no mount is free. If the hull is still over
  capacity: a smaller thruster (X5700 → X4700 → X3700 → X2700) or steering
  (X4200 → X3200 → X2200) for engine space; a smaller battery, then fewer
  Piercer launchers (and 20 missiles each), then the Warder, then a Particle
  Cannon for outfit and weapon space. Every variant keeps a battery (or Brine)
  and at least one gun, fits its hull's outfit, weapon and engine capacity,
  gun ports and turret mounts, and its heat (generation, cooling and every
  weapon firing) stays under its dissipation at maximum heat.
* **Pool per hull (weights out of 480).** Freighter: none 216, one exotic 264
  (22 per line: 19 Mk I + 3 Mk II or 18 + 4, alternating by line and hull).
  Warship: none 216; one exotic 168 (per line 12 Mk I + 2 Mk II); two 72 (12
  pairs `i, i+s` at 6 each, 3 of them with a Mk II); three 24 (12 triples at 2
  each, 6 of them with a Mk II). Offsets differ per hull so lines meet different
  partners.
* **Fleets.** `Shoal Ambushers`: hull shares Hauler 2, Bulk Freighter 2,
  Osprey 3, Falcon 3, Leviathan 3, Bactrian 3, times the pool weights.
  `Shoal Ambush Hunter` (better odds): Leviathan and Bactrian, none 96, one 192
  (per line 14 + 2), two 144 (12 each), three 48 (4 each). Both single-ship
  variants, so an NPC `fleet "Shoal Ambushers" 3` rolls each ship on its own.

**Computed from the final data** (a script reads the fleets and every
variant's installed outfits; "per line" is exotics per 100 ships):

```
== Shoal Ambushers: 246 variants, total weight 7680
  all              ships: 0:  45.0%  1:  40.0%  2:  11.2%  3:   3.8%   >=1:  55.0%   exotics/ship 0.738
                   marks: Mk I  85.6%  Mk II  14.4%  Mk III 0;  glass/ship 23.1, cores/ship 0.56
  per line: every line 5.26 Mk I + 0.89 Mk II = 6.15
  warship hulls    ships: 0:  45.0%  1:  35.0%  2:  15.0%  3:   5.0%   >=1:  55.0%   exotics/ship 0.800
                   marks: Mk I  85.9%  Mk II  14.1%
  freighter hulls  ships: 0:  45.0%  1:  55.0%  2:   0.0%  3:   0.0%   >=1:  55.0%   exotics/ship 0.550
                   marks: Mk I  84.1%  Mk II  15.9%
  over capacity: 0
== Shoal Ambush Hunter: 98 variants, total weight 960
  all              ships: 0:  20.0%  1:  40.0%  2:  30.0%  3:  10.0%   >=1:  80.0%   exotics/ship 1.300
                   marks: Mk I  86.5%  Mk II  13.5%;  glass/ship 26.5, cores/ship 1.00
  per line: every line 10.83 (Mk II 0.83 on six lines, 2.08 on the other six)
  over capacity: 0
```

For comparison, `Shoal Rich Wrecks` (section 15) carries an exotic on 45% of
spawns (one at most); an ambusher carries one or more on 55% of ships, and a
hunter on 80%.

**Tests** (in-engine, `test/ingame/tests_shoal.txt`): `Shoal Ambush Jobs
Offered` (without a run, relanding at Breaker's Rest until all three jobs have
been offered and accepted; each sets its cooldown and the pair roll is cleared)
and `Shoal Ambush At The Wrecks` (accept it, take off into the Shoal and fly:
the job stays active, not failed, not done).

## 18. v0.3.3

* **The opening wrecks come back after a takeoff.** Landing clears the system
  (the engine re-creates it), so a mid-run landing at Breaker's Rest marks the
  opening wrecks (2 Shoal Wrecks, 1 Shoal Glass Wrecks) and one more restless
  wreck (API 11) as due on the next first second in flight. The heat-50 rich
  wrecks and the heat-72 deep wreck stay once per run (the deep one carries
  Deep Lattice). Heat keeps rising across landings and most wrecks lie on the
  rim, so takeoff farming costs time and heat.
* **Drowned ships can't be captured.** Every drowned hull and variant is
  `uncapturable` (a ship key, set per variant: the engine doesn't copy it from
  the base). The engine's "self destruct" attribute was not usable: it rolls
  the same chance on boarding as on capturing, so a certain self-destruct
  would also destroy the loot.
* Tests: the in-engine test saves hold the distress jobs on cooldown (except
  the ambush tests' own save), so no test accepts one by accident.


## 19. v0.3.4: the Glass-Edge Cutlass, the Driftnet Ramscoop, Abyssal Mk III

### Glass-Edge Cutlass (hand to hand)

`Glass-Edge Cutlass` (plural `Glass-Edge Cutlasses`), category `"Hand to
Hand"`, series `H2H`, thumbnail `outfit/sword`: `"capture attack"` 2.4,
`"capture defense"` 2.2, no mass or outfit space, `"unplunderable"` 1, `"can
jettison"` 1, sale 120,000. On par with the best unlicensed hand-to-hand
outfit, the Pug Peacekeeping Staff (2.3 / 2.3, 123,456, same rules); the
total (4.6) is the same, leaning to attack. Never sold or crafted. The yard
never upgrades it: `Yard.refusal` / `kind_of` classify an outfit by
`Tuning.kind_test` (shield generation, energy generation, energy capacity,
cooling, thrust, turn, afterburner thrust, hull repair rate, hull) or as a
weapon, and a capture-attack outfit has none of them ("no kind the yard
upgrades"); it is not in `Tuning.lines` or Catalog either.

**Where it rides.** Stock hand-to-hand gear is `"unplunderable"`, and
`BoardingPanel` never offers an unplunderable *installed* outfit, but always
offers outfits in the victim's cargo. A ship definition's `cargo` node is
honoured for NPCs: `Ship::Load` reads it into the `CargoHold`, fleets and
mission NPCs spawn copies of the model (`make_shared<Ship>(*model)`), and
`FleetCargo::SetCargo` only adds to it (`cargo 0` in every drowned fleet). So
the cutlasses ride in the hold (massless: they always fit) and are plundered
from there.

**The roll.** Every drowned WARSHIP (Osprey, Falcon, Leviathan, Bactrian) in
every drowned pool (`Shoal Wrecks`, `Shoal Glass Wrecks`, `Shoal Rich Wrecks`,
`Shoal Deep Wreck`, `Shoal Restless Wrecks`, `Shoal Ambushers`, `Shoal Ambush
Hunter`, and the npc fleets of `Shoal: Lead Warship` and `Shoal: Lead Deep`;
`Shoal: Lead Freighter` has no warship) rolls on its own: none at weight 32,
or 1, 3, 5, 7, 9, 11, 13 or 15 cutlasses at weight 1 each. That is a 20%
chance per warship, and when it carries some, eight counts spread evenly over
1..15 (mean 8, the same as a uniform 1..15; exact uniformity would need 15
copies of every variant). Freighter hulls never carry them.

**Independence.** `tools/h2h/h2h.py` expands each fleet variant into every
combination of its warships' rolls: weight = original weight x 40^(K - k) x
the rolls' weights (k warships in the variant, K the most in the pool; then
divided by the gcd). Every original variant keeps its share, so within each
pool the joint distribution is exactly the product of the old distribution
and the rolls, and the exotic rates are untouched. The cutlass variants
`<ship> [Cutlass n]` (2,480 of them, for 310 warship variants) are generated
into `data/shoal cutlass ships.txt`: the original variant (same outfits,
`uncapturable`) plus a `cargo` node; a bare hull used as it is ("Drowned
Osprey") gives a variant without `outfits`, which inherits the hull's. The
script is idempotent (it collapses the `[Cutlass n]` entries first); run it
after any change to the pools. `tools/ambushers/cap.py` checks every drowned
variant, including cargo space; 2,878 checked, 0 over capacity.

### Driftnet Ramscoop (the thirteenth exotic line)

`Driftnet Ramscoop Mk I` / `Mk II` / `Mk III`, category `Systems`, series
`Ramscoops`, 15 outfit space, thumbnail `outfit/wanderer ramscoop`, sale
240,000 / 1,450,000 / 5,400,000 like every line. No workshop recipe; the yard
upgrades it along its authored marks (the code's line list gains it).

The engine collects `wind x .03 x scale x sqrt(ramscoop)` fuel per frame per
star (`System::GetSolarGeneration`; scale 2 at the star, .2 far out) plus a
flat `"fuel generation"` per frame. Fuel/s below is at wind 1, scale 1.

| outfit | mass | space | ramscoop | fuel gen | fuel/s | per ton | costs |
|---|---|---|---|---|---|---|---|
| Ramscoop | 10 | 10 | 1 | | 1.80 | 0.18 | |
| Emergency Ramscoop (Remnant) | 4 | 4 | 1.25 | | 2.01 | 0.50 | |
| Fuel Processor (Korath) | 14 | 14 | 2 | | 2.55 | 0.18 | +200 fuel capacity |
| Wanderer Ramscoop | 7 | 7 | 4 | | 3.60 | 0.51 | |
| Successor Fuel Sail | 4 | 14 | 4 | | 3.60 | 0.90 | 6 solar heat |
| Catalytic Ramscoop | 16 | 16 | 7 | | 4.76 | 0.30 | |
| Magnetic Scoop (Avgi) | 9 | 9 | 6 | .03 | 6.21 | 0.69 | 1.2 energy, 2.4 solar heat |
| Plasmadyne Scoop (Avgi) | 60 | 120 | 90 | .6 | 53.1 | 0.89 | 9 energy, 9 solar heat, 3 drag, gun port + spinal mount |
| **Driftnet Mk I** | 14 | 15 | 10 | | 5.69 | 0.41 | |
| **Driftnet Mk II** | 15 | 15 | 24 | .06 | 12.4 | 0.83 | .5 energy, .5 heat |
| **Driftnet Mk III** | 17 | 15 | 100 | .62 | 55.2 | 3.25 | 6 energy, 4.5 heat |

Mk I beats every stock scoop except the two Avgi ones; Mk II doubles the
Magnetic Scoop; Mk III beats the Plasmadyne Scoop in ramscoop (100 vs 90) and
in fuel per second at any distance and wind, in an eighth of its space.

**Drops.** It joins the twelve lines everywhere they are spread evenly, on
the Coldwater Sink's hulls: `Drowned Hauler (Worn, Driftnet)`, `(Rich,
Driftnet)`, `(Rich, Driftnet II)`, `(Lead, Driftnet)`, `(Lead, Driftnet II)`
and `Drowned Leviathan (Deep, Driftnet)` / `(Deep, Driftnet II)`; in the
ambusher and hunter pools as line 13 (it only needs free room). Weights
before the cutlass roll, so each pool's overall rates stay as they were:

* `Shoal Wrecks`: old weights x13, each `(Worn, X)` 84 (8.2% of spawns).
* `Shoal Glass Wrecks`: old weights x13, each `(Rich, X)` 12 (7.7%).
* `Shoal Rich Wrecks`: plain pairs x13, Mk I pairs 96 and Mk II pairs 12 per
  line (40% / 5%).
* `Shoal Deep Wreck`, `Shoal: Lead Warship`: one more line, at 3 + 1 and 4 + 1 (75% / 25%, 80% / 20%).
* Ambushers and hunter (`tools/ambushers/gen.py`, 13 lines): "none" x13 and
  every per-line weight x12, so the none / one / two / three shares are the
  section 17 ones. The pairs and triples now cycle through 13 lines, so the
  Mk II share moved a little on the hunter (13.5% -> 13.0%); the ambushers
  are unchanged (14.4%).

### Abyssal Cell Mk III rework

The v0.3 Mk III (95 t, 19.2 energy, 48 heat: 0.20 energy per ton, 2.5 heat
per energy) paid for its "heat shielding" in mass and still ran hotter per
unit of energy than the Mk II (1.8) and a Fusion Reactor (2.2). Now: **64 t,
72 outfit space, 21 energy, 16.8 heat, +3000 energy capacity**: 0.328 energy
per ton (every power outfit in the game data at any mass is below: Mk II
0.288, Korath Triple Plasma Core 0.258, Lantern Fission Core 0.250, Heliarch
Large Reactor Module 0.247, Quarg Antimatter Core 0.240) and 0.80 heat per
energy (the coolest reactor of 12+ energy: Quarg Antimatter Core 0.83,
Singularity Core 0.96, Dark Reactor 1.16, Blue Sun 1.25, Mk II 1.80, Fusion
2.20). Output is 40% over the Mk II. The drawback is room: 72 outfit space
instead of 60 (the yard needs 12 free space to fit it). The full table is in
the comment above the line in `shoal outfits.txt`.

Other Mk IIIs checked for a drawback that defeats the outfit: `Undertow
Thruster Mk III` (115 t, twice the Mk I) and `Eddy Steering Mk III` (76 t)
give a ship of under ~150 t *less* acceleration / turn rate than their Mk II
(thrust or turn per total mass), and only +11% / +13% on a 300 t ship for
30% / 27% more thrust / turn. The rest are fine: the weapons, shield,
mender and point defense pay in energy and heat, which does not undo what
they do; Coldwater's extra mass adds heat capacity; Coral Plating is armor;
the Siltwake Mk III still out-accelerates the Mk II on any hull. Fixed in
section 20.

### Computed from the final data

`tools/h2h/dist.py --before <v0.3.3 data>` (per pool: exotics per spawn,
with the v0.3.3 numbers under them; cutlasses per warship and per spawn; an
exact check that every entry's probability is the original variant's times
its warships' rolls):

```
== Shoal Wrecks: 308 entries (36 before the cutlass roll), total weight 1422720
  exotics per spawn: 0:  91.8%  1:   8.2%   >=1:   8.2%;  Mk I 100.0% Mk II   0.0%;  per line per 100 spawns: 0.63 (13 lines)
  before:  exotics per spawn: 0:  91.8%  1:   8.2%   >=1:   8.2%;  Mk I 100.0% Mk II   0.0%;  per line per 100 spawns: 0.00/0.68 (12 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 0.62, any cutlass  12.2%, cutlasses 0.98
  independent of the exotics (exact): yes
== Shoal Glass Wrecks: 123 entries (19 before the cutlass roll), total weight 20280
  exotics per spawn: 0:  92.3%  1:   7.7%   >=1:   7.7%;  Mk I 100.0% Mk II   0.0%;  per line per 100 spawns: 0.59 (13 lines)
  before:  exotics per spawn: 0:  92.3%  1:   7.7%   >=1:   7.7%;  Mk I 100.0% Mk II   0.0%;  per line per 100 spawns: 0.00/0.64 (12 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 0.59, any cutlass  11.8%, cutlasses 0.95
  independent of the exotics (exact): yes
== Shoal Rich Wrecks: 1152 entries (32 before the cutlass roll), total weight 1248000
  exotics per spawn: 0:  55.0%  1:  45.0%   >=1:  45.0%;  Mk I  88.9% Mk II  11.1%;  per line per 100 spawns: 3.46 (13 lines)
  before:  exotics per spawn: 0:  55.0%  1:  45.0%   >=1:  45.0%;  Mk I  88.9% Mk II  11.1%;  per line per 100 spawns: 0.00/3.75 (12 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 1.36, any cutlass  25.7%, cutlasses 2.17
  independent of the exotics (exact): yes
== Shoal Deep Wreck: 234 entries (26 before the cutlass roll), total weight 2080
  exotics per spawn: 0:   0.0%  1: 100.0%   >=1: 100.0%;  Mk I  75.0% Mk II  25.0%;  per line per 100 spawns: 7.69 (13 lines)
  before:  exotics per spawn: 0:   0.0%  1: 100.0%   >=1: 100.0%;  Mk I  75.0% Mk II  25.0%;  per line per 100 spawns: 0.00/8.33 (12 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 1.00, any cutlass  20.0%, cutlasses 1.60
  independent of the exotics (exact): yes
== Shoal Restless Wrecks: 137 entries (9 before the cutlass roll), total weight 51200
  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  before:  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 0.72, any cutlass  14.2%, cutlasses 1.15
  independent of the exotics (exact): yes
== Shoal Ambushers: 1962 entries (266 before the cutlass roll), total weight 166400
  exotics per spawn: 0:  45.0%  1:  40.0%  2:  11.2%  3:   3.8%   >=1:  55.0%;  Mk I  85.6% Mk II  14.4%;  per line per 100 spawns: 5.67 (13 lines)
  before:  exotics per spawn: 0:  45.0%  1:  40.0%  2:  11.2%  3:   3.8%   >=1:  55.0%;  Mk I  85.6% Mk II  14.4%;  per line per 100 spawns: 0.00/6.15 (12 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 0.75, any cutlass  15.0%, cutlasses 1.20
  independent of the exotics (exact): yes
== Shoal Ambush Hunter: 954 entries (106 before the cutlass roll), total weight 20800
  exotics per spawn: 0:  20.0%  1:  40.0%  2:  30.0%  3:  10.0%   >=1:  80.0%;  Mk I  87.0% Mk II  13.0%;  per line per 100 spawns: 10.00 (13 lines)
  before:  exotics per spawn: 0:  20.0%  1:  40.0%  2:  30.0%  3:  10.0%   >=1:  80.0%;  Mk I  86.5% Mk II  13.5%;  per line per 100 spawns: 0.00/10.83 (12 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 1.00, any cutlass  20.0%, cutlasses 1.60
  independent of the exotics (exact): yes
== mission Shoal: Lead Freighter: 2 entries (2 before the cutlass roll), total weight 3
  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  before:  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  cutlasses: no drowned warship in this pool
  independent of the exotics (exact): yes
== mission Shoal: Lead Warship: 186 entries (26 before the cutlass roll), total weight 2600
  exotics per spawn: 0:   0.0%  1: 100.0%   >=1: 100.0%;  Mk I  80.0% Mk II  20.0%;  per line per 100 spawns: 7.69 (13 lines)
  before:  exotics per spawn: 0:   0.0%  1: 100.0%   >=1: 100.0%;  Mk I  80.0% Mk II  20.0%;  per line per 100 spawns: 0.00/8.33 (12 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 0.77, any cutlass  15.4%, cutlasses 1.23
  independent of the exotics (exact): yes
== mission Shoal: Lead Deep: 9 entries (1 before the cutlass roll), total weight 40
  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  before:  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 1.00, any cutlass  20.0%, cutlasses 1.60
  independent of the exotics (exact): yes
pools not independent: 0
```

`tools/ambushers/dist.py` (thirteen lines):

```
== Shoal Ambushers: 1962 variants, total weight 166400
  all              ships: 0:  45.0%  1:  40.0%  2:  11.2%  3:   3.8%   >=1:  55.0%   exotics/ship 0.738
                   marks: Mk I  85.6%  Mk II  14.4%  Mk III 0;  glass/ship 23.1, cores/ship 0.56
  per line (exotics per 100 ships: Mk I + Mk II):
    Tidecutter              4.86 + 0.82 =  5.67
    Riptide Turret          4.86 + 0.82 =  5.67
    Glassweave Shield       4.86 + 0.82 =  5.67
    Abyssal Cell            4.86 + 0.82 =  5.67
    Undertow Thruster       4.86 + 0.82 =  5.67
    Coralgraft Mender       4.86 + 0.82 =  5.67
    Eddy Steering           4.86 + 0.82 =  5.67
    Brine Capacitor         4.86 + 0.82 =  5.67
    Coldwater Sink          4.86 + 0.82 =  5.67
    Glimmer Point Defense   4.86 + 0.82 =  5.67
    Coral Plating           4.86 + 0.82 =  5.67
    Siltwake Afterburner    4.86 + 0.82 =  5.67
    Driftnet Ramscoop       4.86 + 0.82 =  5.67
  warship hulls    ships: 0:  45.0%  1:  35.0%  2:  15.0%  3:   5.0%   >=1:  55.0%   exotics/ship 0.800
                   marks: Mk I  85.9%  Mk II  14.1%  Mk III 0;  glass/ship 23.2, cores/ship 0.75
  freighter hulls  ships: 0:  45.0%  1:  55.0%  2:   0.0%  3:   0.0%   >=1:  55.0%   exotics/ship 0.550
                   marks: Mk I  84.1%  Mk II  15.9%  Mk III 0;  glass/ship 22.5, cores/ship 0.00
  over capacity: 0
== Shoal Ambush Hunter: 954 variants, total weight 20800
  all              ships: 0:  20.0%  1:  40.0%  2:  30.0%  3:  10.0%   >=1:  80.0%   exotics/ship 1.300
                   marks: Mk I  87.0%  Mk II  13.0%  Mk III 0;  glass/ship 26.5, cores/ship 1.00
  per line (exotics per 100 ships: Mk I + Mk II):
    Tidecutter              9.23 + 0.77 = 10.00
    Riptide Turret          9.23 + 0.77 = 10.00
    Glassweave Shield       8.08 + 1.92 = 10.00
    Abyssal Cell            8.08 + 1.92 = 10.00
    Undertow Thruster       9.23 + 0.77 = 10.00
    Coralgraft Mender       9.23 + 0.77 = 10.00
    Eddy Steering           8.08 + 1.92 = 10.00
    Brine Capacitor         8.08 + 1.92 = 10.00
    Coldwater Sink          9.23 + 0.77 = 10.00
    Glimmer Point Defense   9.23 + 0.77 = 10.00
    Coral Plating           8.08 + 1.92 = 10.00
    Siltwake Afterburner    8.08 + 1.92 = 10.00
    Driftnet Ramscoop       9.23 + 0.77 = 10.00
  warship hulls    ships: 0:  20.0%  1:  40.0%  2:  30.0%  3:  10.0%   >=1:  80.0%   exotics/ship 1.300
                   marks: Mk I  87.0%  Mk II  13.0%  Mk III 0;  glass/ship 26.5, cores/ship 1.00
  over capacity: 0
```

**Tests** (in-engine): `Shoal Glass-Edge Cutlass And Reworked Mk IIIs`: a
save with two cutlasses installed and three in the hold, plus an Abyssal Cell
Mk III and a Driftnet Ramscoop Mk III; asserts the outfit counts, `"flagship
attribute: capture attack"` 4.8 and defense 4.4, energy generation 21, heat
21.3 (16.8 + 4.5), ramscoop 100 and fuel generation .62.


## 20. v0.3.4: Mk IIIs that are better on every ship

The Abyssal Cell Mk III (section 19) paid its drawback in exactly what it was
for. Two more lines did the same with mass on a mobility outfit, and two
with their own resource; all are reworked so that each mark beats the one
before at its job on every ship. `tools/marks/check.py` checks every line.

| outfit | v0.3 | v0.3.4 |
|---|---|---|
| Undertow Thruster Mk III | 115 t, thrust 156, 11.5 energy, 34 heat (1.36 thrust/t) | **54 t**, thrust 156, 9.85 energy, 31.2 heat (**2.89 thrust/t**) |
| Eddy Steering Mk III | 76 t, turn 3800, 5.6 energy, 19 heat (50 turn/t) | **36 t**, turn 3800, 4.3 energy, 17.1 heat (**105.6 turn/t**) |
| Brine Capacitor Mk III | 36,000, leaks .8 energy/frame, 1.5 heat, 34 t | 36,000, **no leak**, 1.5 heat, 34 t |
| Coldwater Sink Mk II | 30 passive + 40 active, 1.8 energy | **40** passive + 30 active, 1.35 energy |
| Coldwater Sink Mk III | 20 passive + 110 active, 7.5 energy | **40** passive + 90 active, 6.1 energy |

* **Undertow / Eddy Mk III.** Same mass as the Mk II, so more thrust / turn
  is strictly better on any ship (v0.3: worse than the Mk II on a ship under
  ~150 t, +11% / +13% on 300 t). Energy per thrust / turn equal to the Mk II
  (0.063 / 0.00113); the drawback is heat: 0.20 per thrust (Korath Stellar
  0.19) and 0.0045 per turn (Korath Stellar 0.00444), against the Mk II's
  0.1375 and 0.0028. Both are now the best per ton in the game at any mass
  (every outfit with thrust / turn, human and alien: next are the Mk IIs,
  then the Korath Stellar Class 1.90 thrust/t and 67.5 turn/t, Quarg Large
  Graviton Thruster 1.85, Subarashii Rift Steering 65.0). Tables in the
  comments of `shoal outfits.txt`.
* **Brine Capacitor Mk III.** An energy store that leaked energy: after
  ~270 s of a fight that drained it, a ship with the Mk II had more energy
  than one with the Mk III. The leak is gone; heat and mass remain.
* **Coldwater Sink Mk II / III.** Active cooling works in proportion to the
  ship's heat and stops without energy (`Ship.cpp`), so v0.3's lower passive
  part made the Mk II cool less than the Mk I below 25% heat or out of
  energy, and the Mk III less than both. Passive is now 40 on every mark;
  totals at full heat are unchanged (70, 130), and the energy per active
  point too (0.045, 0.068).
* Checked and left alone: the weapons, Glassweave, Coralgraft, Glimmer, Coral
  Plating, Siltwake, Driftnet, Abyssal and the Steward each improve their
  headline on every mark; their Mk III drawbacks are energy, heat or mass
  that do not undo the headline (Siltwake Mk III out-accelerates the Mk II on
  any hull despite 40 t; Coral Plating is armor). Glassweave and Coralgraft
  Mk III cost more energy per point than the Mk II (1.2 vs 0.89 per shield,
  1.49 vs 0.98 per hull point): on a ship starved of energy they would give
  less, which is the energy cost the Mk III ladder allows, so left as is.
  The section 15 guardian reference ship used the v0.3 masses (Undertow and
  Eddy Mk III are now 101 t lighter in total); the guardians were not
  rebalanced.

`tools/marks/check.py`:

```
Tidecutter             Mk I -> Mk II: damage x1.20, anti-missile x0.00; Mk II -> Mk III: damage x1.31, anti-missile x0.00
Riptide Turret         Mk I -> Mk II: damage x1.31, anti-missile x0.00; Mk II -> Mk III: damage x1.32, anti-missile x0.00
Glassweave Shield      Mk I -> Mk II: shield generation 2.15 -> 2.7; Mk II -> Mk III: shield generation 2.7 -> 3.9
Abyssal Cell           Mk I -> Mk II: energy generation 12.6 -> 15; Mk II -> Mk III: energy generation 15 -> 21
Undertow Thruster      Mk I -> Mk II: thrust per ton of ship at least x1.106; Mk II -> Mk III: thrust per ton of ship at least x1.300
Coralgraft Mender      Mk I -> Mk II: hull repair rate 0.78 -> 1.12; Mk II -> Mk III: hull repair rate 1.12 -> 1.75
Eddy Steering          Mk I -> Mk II: turn per ton of ship at least x1.137; Mk II -> Mk III: turn per ton of ship at least x1.267
Brine Capacitor        Mk I -> Mk II: energy capacity 13200 -> 23000; Mk II -> Mk III: energy capacity 23000 -> 36000
Coldwater Sink         Mk I -> Mk II: cooling never lower (min gain 0.0 at any heat; passive 40 -> 40); Mk II -> Mk III: cooling never lower (min gain 0.0 at any heat; passive 40 -> 40)
Glimmer Point Defense  Mk I -> Mk II: damage x0.00, anti-missile x2.44; Mk II -> Mk III: damage x0.00, anti-missile x3.07
Coral Plating          Mk I -> Mk II: hull 400 -> 960; Mk II -> Mk III: hull 960 -> 1650
Siltwake Afterburner   Mk I -> Mk II: afterburner thrust per ton of ship at least x1.749; Mk II -> Mk III: afterburner thrust per ton of ship at least x1.543
Driftnet Ramscoop      Mk I -> Mk II: fuel/s 5.69 -> 12.42; Mk II -> Mk III: fuel/s 12.42 -> 55.20
Warden Steward         Mk I -> Mk II: crew -3 -> -8; Mk II -> Mk III: crew -8 -> -20
Undertow Thruster Mk III: 2.89 thrust per ton; best other at 54 t or less: Undertow Thruster Mk II 2.22; best other at any mass: Undertow Thruster Mk II 2.22
Eddy Steering Mk III: 105.56 turn per ton; best other at 36 t or less: Eddy Steering Mk II 83.33; best other at any mass: Eddy Steering Mk II 83.33
failures: 0
```

The in-engine test `Shoal Glass-Edge Cutlass And Reworked Mk IIIs` now also
installs the Undertow, Eddy, Brine and Coldwater Mk IIIs and asserts thrust
156, turn 3800, their energy and heat, energy consumption 6 (the ramscoop's
only: no leak), cooling 40 + 90 active and cooling energy 6.1.


## 21. v0.3.5: the Lamprey Launcher (line 14), armour-cutting guns

### Lamprey Launcher

`Lamprey Launcher Mk I` / `Mk II` / `Mk III`, category `Secondary Weapons`,
20 outfit and weapon space, one gun port, thumbnail `outfit/emp torpedo bay`,
projectile `projectile/shardactive`; sale 240,000 / 1,450,000 / 5,400,000 like
every line. Mk I and Mk II drop; Mk III only at the yard (the code's line list
gains it). Ammunition: `Glass Lamprey` (plural `Glass Lampreys`), category
`Ammunition`, 1 ton, sale 4,000 (one Shoal Glass), `"glass lamprey capacity"
-1`; the launchers hold 20 / 24 / 30. One Shoal Glass makes one Lamprey; the
crafting is the code's (a Breaker's Rest button like the refinery), the data
only defines the ammunition.

**Why not Shoal Glass itself.** The outfitter's automatic refill
(`OutfitterPanel::CheckRefill` / `Refill`: storage first, then cargo, then
buying) asks `Ship::Attributes().CanAdd(ammo, n)`, and `Outfit::CanAdd`
floors every attribute without a minimum override at 0, `"installable"`
included. A ship has `"installable"` 0, so an outfit with `"installable" -1`
can never be added: in-engine, a launcher whose ammo was Shoal Glass (with
`"glass lamprey capacity" -1` on the glass) loaded 0 of 30 glass in the hold.
The only legal construction that loads it is a positive `"installable"` on the
launcher (it loaded 20), but manual installs use the same `CanAdd`
(`OutfitterPanel::ShipCanAdd`), so it would let a captain install glass,
Warden Cores, Deep Lattice, refined stock and every stock `"installable" -1`
item by hand, and `OutfitInfoDisplay` would label the launcher "This is not an
installable item." It would also put every wreck and guardian that carries
installed glass over its magazine (`cap.py` on that variant: 2,876 of 2,878
drowned variants). So the line fires its own ammunition (the approved
fallback). Shoal Glass is unchanged: `"installable" -1`, full-value sale, no
capacity attribute.

**Loading and firing (verified).** Glass Lampreys are ordinary ammunition:
`GetRefillableAmmunition` lists them (the weapon's `ammo`, usage 1), `CanAdd`
allows up to the free `"glass lamprey capacity"`, `Refill` takes them from
storage, then the hold, and buys none (no outfitter sells them, and
`player.Stock` is 0 unless sold back). Firing consumes one per shot
(`Ship::CanFire` checks the count, `Ship::ExpendAmmo` removes it). The
in-engine test below loads 20 from 25 in the hold.

**Damage.** Very little shield and hull damage; huge energy and ion damage;
moderate heat; disruption and a little discharge to strip shields, slowing to
pin, scrambling to jam. Semantics (Weapon.cpp, DamageProfile.cpp,
Entity::DoStatusEffects, Ship.cpp): energy, heat, ion, slowing and scrambling
are halved while the target's shields are up; disruption and discharge work
only while it has shields; every status level decays 1% per frame (about 100
points of effect per point of damage, over ~5 s). Ion drains that much energy
per frame; disruption divides the share of a hit the shields take by (1 +
level / 100); slowing divides acceleration and turning by (1 + 0.05 x level);
scrambling jams each shot with chance 1 - 2^(-level / 70).

Per shot / per second (space = outfit space):

| weapon | space | reload | energy | ion | heat | disruption | discharge | slowing | scrambling | shield / hull | missile str. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ka'het Nullifier (gun) | 97 | 350 | 3200 / 549 | 220 / 38 | | | | | 10 / 1.7 | 120 / 40 | |
| EMP Torpedo Bay (Remnant) | 18 | 330 | | 48 / 8.7 | | | | | 48 / 8.7 | 700 / 100 | 80 |
| Ka'het EMP Deployer | 26 | 180 | | 48 / 16 | | | | | 48 / 16 | 700 / 100 | 80 |
| Korath Detainer | 76 | 35 | | | | | | 40 / 69 | | 320 / 240 | |
| Shield Disruptor Turret | 35 | 1 | | | | .24 / 14 | | | | 3.8 / .5 | |
| Plasma Turret | 60 | 9 | | | 425 / 2833 | | | | | 63 / 25 | |
| Nuclear Missile (ceiling) | 10 | 400 | | | | | | | | 9000 / 7000 | 200 |
| **Lamprey Mk I** | 20 | 80 | 1800 / 1350 | 24 / 18 | 1000 / 750 | 50 / 38 | 4 / 3 | 16 / 12 | 12 / 9 | 30 / 15 | 20 |
| **Lamprey Mk II** | 20 | 65 | 2600 / 2400 | 36 / 33 | 1500 / 1385 | 75 / 69 | 6 / 5.5 | 24 / 22 | 18 / 17 | 40 / 20 | 24 |
| **Lamprey Mk III** | 20 | 50 | 3800 / 4560 | 54 / 65 | 2200 / 2640 | 110 / 132 | 9 / 11 | 36 / 43 | 26 / 31 | 50 / 25 | 28 |

Energy drained through shields per Lamprey (half the energy damage plus ~100 x
half the ion): 2,100 / 3,100 / 4,600; per second from one launcher 1,575 /
2,860 / 5,520. A Bactrian generates 1,092 energy/s (19,200 stored), a Heliarch
Judicator 1,422 (7,560), a Korath Kar Ik Vot 349 3,330 (15,000): one Mk III
ionizes even the Kar Ik Vot in about 7 s. Standing levels from one launcher:
disruption 62 / 115 / 220 (38% / 54% / 69% of other weapons' damage goes past
the shields), slowing through shields 10 / 18 / 36 (x0.67 / 0.52 / 0.36),
scrambling 7.5 / 14 / 26 (7% / 13% / 23% jam). It kills nothing on its own:
the nuke's 16,000 damage in one hit stays the ceiling. Firing costs 60 / 80 /
140 energy and 30 / 40 / 90 heat per shot; Mk III weighs 18 t (Mk I/II 12 t).

**Flight: magnetic, not homing.** Launched at 6, then acceleration 2.0 / 2.4 /
2.9 against drag .10 / .11 / .12: 95% of top speed (20 / 21.8 / 24.2 px per
frame; a Sidewinder flies at 12) within ~22 frames, and the heavy drag makes
its course follow its nose within a few frames instead of drifting through
wide arcs. Turn 14 / 17 / 20 degrees per frame (Sidewinder 4, Shard 8): a
reversal in 13 / 11 / 9 frames, a heading radius of ~80 / 74 / 69 px at speed;
`throttle control` cuts the pull while it swings round, then it snaps back on.
Generic `"tracking"` .94 / .97 / 1 (jam-proof; at .94 a lock is lost on ~2.5%
of the twice-a-second checks and usually regained); no `leading`, so it
chases the target itself, as if pulled. Lifetime 140 / 145 / 150 frames
(straight-line reach 2,670 / 3,040 / 3,490); `range override` 2,300 / 2,600 /
3,000 (the yard's submunition test allows an override). Missile strength 20 /
24 / 28: a Heavy Anti-Missile Turret (8) stops about one in six per shot, the
Warden Warder (14) one in three, Glimmer Mk III (45) four in five.

### Tidecutter and Riptide: armour cutters

The gun and turret lines now leave shields to the Lamprey and cut hull: shield
damage about half, hull damage up, and a little piercing on every mark (while
shields are up they take 1 - piercing of a hit and that share of the hull
damage lands at once; the Lamprey's disruption raises the share). Section 5's
"piercing a little at Mk III" now applies to every mark.

| outfit | shield / hull per s, before | after | piercing | hull per space | reference |
|---|---|---|---|---|---|
| Tidecutter Mk I | 158 / 216 | 80 / 230 | .05 | 11.5 | Electron Beam 144 / 198 (9.4) |
| Tidecutter Mk II | 200 / 250 | 100 / 400 | .10 | 20.0 | Korath Husk-Slice 365 / 967 (21.0) |
| Tidecutter Mk III | 270 / 320 (.15) | 130 / 520 | .20 | 26.0 | beyond the Husk-Slice and Moonbeam (25.7) |
| Riptide Mk I | 219 / 303 | 108 / 324 | .05 | 9.0 | Electron Turret 288 / 396 (7.3) |
| Riptide Mk II | 306 / 378 | 144 / 558 | .10 | 15.5 | Husk-Slice Turret 365 / 967 (16.4) |
| Riptide Mk III | 414 / 486 | 180 / 756 | .20 | 21.0 | |

Firing energy, heat, mass, range and turn are unchanged. The section 15
guardian reference ship and the section 17 ambusher figures used the old
numbers (the guardians fire Warden copies and were not rebalanced).

### Drops

The Lamprey is line 14 everywhere the lines are spread evenly. Hand-built
pools via `tools/lines/addline.py` (new): `Drowned Bulk Freighter (Worn,
Lamprey)`, `(Rich, Lamprey)`, `(Rich, Lamprey II)`, `(Lead, Lamprey)`, `(Lead,
Lamprey II)` and `Drowned Bactrian (Deep, Lamprey)` / `(Deep, Lamprey II)`,
each the Coral Plating variant of that hull and kind with the plating swapped
for the launcher and 10 Glass Lampreys loaded (the deep wrecks are now seven
Leviathan lines and seven Bactrian). Every pool entry that carries a Driftnet
ship is copied with the Lamprey one; then exotic entries x13 and plain ones
x14, which keeps each pool's exotic share and gives every line 1/14 of it. The
script is idempotent and writes the pools collapsed; `tools/h2h/h2h.py` then
adds the cutlass roll (unchanged: 20% per warship, independent). Ambushers and
hunter: `tools/ambushers/gen.py` (14 lines, "none" x N; `--merge` writes the
data in place); the launcher takes a Piercer launcher's gun port (and its 20
missiles), else a Particle Cannon's, with 10 Lampreys loaded; every variant
keeps a Particle Cannon or Tidecutter (now asserted). The Falcon and Bactrian
pair offsets moved from 7 (= N / 2, which would pair each two lines twice) to
3 and 6. Ambushers that run dry keep fighting (`heroic staying`: the AI's
out-of-ammo retreat is skipped for staying ships). `tools/ambushers/cap.py`
now also checks every ammunition capacity: 3,049 checked, 0 over.

Wrecks and Warden ships keep their Shoal Glass installed: with its own
ammunition the line needs no capacity on the glass, so nothing about them
changes (parse clean, plunder offers installed glass at full value as before).

### Warden Cores on derelicts

Until now only the warship leads, restless hulls, ambushers and guardians
carried Warden Cores. The derelict wreck fleets now roll cores per drowned
ship, independently of the exotics and of the cutlass roll, carried in the
hold (Warden Core keeps `"installable" -1` and needs no capacity; the hold
avoids new installed variants and boarding always offers cargo).
`tools/h2h/h2h.py` (`CORE_ROLLS` in `h2h_common.py`) expands each ship into
every (cores, cutlasses) state, weight = original x (L / D) x the states'
weights (D the product of the variant's ships' roll totals, L the lcm of all
D), so every original variant keeps its share exactly; `dist.py` checks the
joint distribution exactly. Rolled copies are `<ship> [Core c]`, `[Cutlass
n]` or `[Core c, Cutlass n]` in `shoal cutlass ships.txt`.

| pool | roll per ship | ships carrying | cores per ship | per spawn | any core per spawn |
|---|---|---|---|---|---|
| `Shoal Wrecks` | 0 x4, 1 x1 | 20% | 0.20 | 0.22 | 21.2% |
| `Shoal Glass Wrecks` | 0 x17, 1 x3 | 15% | 0.15 | 0.15 | 15.0% |
| `Shoal Rich Wrecks` | 0 x10, 1 x8, 2 x2 | 50% (40% one, 10% two) | 0.60 | 1.20 | 75.0% |
| `Shoal Deep Wreck` | 2 x1, 3 x1 | 100% | 2.50 | 2.50 | 100% |
| `Shoal Restless Wrecks` | none (already 34.2% installed) | 34.2% | 0.34 | 0.41 | 40.6% |

Independent rather than correlated with the plain variants, to keep it exact:
`Shoal Rich Wrecks` grows to 10,530 entries (34 base pairs x up to 27 states
per warship), `shoal fleets.txt` from 376 KB to 1.5 MB and `shoal cutlass
ships.txt` from 1.07 to 1.44 MB (3,562 rolled variants); a full engine parse
takes the same ~5 s. The cores also count toward the run's greed (8 heat
weight each) once they are in the player's hold.

`tools/h2h/dist.py --before <v0.3.4 data>`:

```
== Shoal Wrecks: 836 entries (37 before the cutlass and core rolls), total weight 2736000
  exotics per spawn: 0:  91.8%  1:   8.2%   >=1:   8.2%;  Mk I 100.0% Mk II   0.0%;  per line per 100 spawns: 0.58 (14 lines)
  before:  exotics per spawn: 0:  91.8%  1:   8.2%   >=1:   8.2%;  Mk I 100.0% Mk II   0.0%;  per line per 100 spawns: 0.00/0.63 (13 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 0.61, any cutlass  12.2%, cutlasses 0.98
  cores: per ship  20.0% carry some;  count (share of ships): 1:20.0%;  per ship 0.20;  per spawn 0.22, any core  21.2%;  roll [(0, 4), (1, 1)]
  independent of the exotics (exact): yes
== Shoal Glass Wrecks: 248 entries (20 before the cutlass and core rolls), total weight 436800
  exotics per spawn: 0:  92.3%  1:   7.7%   >=1:   7.7%;  Mk I 100.0% Mk II   0.0%;  per line per 100 spawns: 0.55 (14 lines)
  before:  exotics per spawn: 0:  92.3%  1:   7.7%   >=1:   7.7%;  Mk I 100.0% Mk II   0.0%;  per line per 100 spawns: 0.00/0.59 (13 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 0.59, any cutlass  11.8%, cutlasses 0.94
  cores: per ship  15.0% carry some;  count (share of ships): 1:15.0%;  per ship 0.15;  per spawn 0.15, any core  15.0%;  roll [(0, 17), (1, 3)]
  independent of the exotics (exact): yes
== Shoal Rich Wrecks: 10530 entries (34 before the cutlass and core rolls), total weight 134400000
  exotics per spawn: 0:  55.0%  1:  45.0%   >=1:  45.0%;  Mk I  88.9% Mk II  11.1%;  per line per 100 spawns: 3.21 (14 lines)
  before:  exotics per spawn: 0:  55.0%  1:  45.0%   >=1:  45.0%;  Mk I  88.9% Mk II  11.1%;  per line per 100 spawns: 0.00/3.46 (13 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 1.34, any cutlass  25.5%, cutlasses 2.15
  cores: per ship  50.0% carry some;  count (share of ships): 1:40.0% 2:10.0%;  per ship 0.60;  per spawn 1.20, any core  75.0%;  roll [(0, 10), (1, 8), (2, 2)]
  independent of the exotics (exact): yes
== Shoal Deep Wreck: 504 entries (28 before the cutlass and core rolls), total weight 4480
  exotics per spawn: 0:   0.0%  1: 100.0%   >=1: 100.0%;  Mk I  75.0% Mk II  25.0%;  per line per 100 spawns: 7.14 (14 lines)
  before:  exotics per spawn: 0:   0.0%  1: 100.0%   >=1: 100.0%;  Mk I  75.0% Mk II  25.0%;  per line per 100 spawns: 0.00/7.69 (13 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 1.00, any cutlass  20.0%, cutlasses 1.60
  cores: per ship 100.0% carry some;  count (share of ships): 2:50.0% 3:50.0%;  per ship 2.50;  per spawn 2.50, any core 100.0%;  roll [(2, 1), (3, 1)]
  independent of the exotics (exact): yes
== Shoal Restless Wrecks: 137 entries (9 before the cutlass and core rolls), total weight 51200
  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  before:  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 0.72, any cutlass  14.2%, cutlasses 1.15
  cores: per ship  34.2% carry some;  count (share of ships): 1:34.2%;  per ship 0.34;  per spawn 0.41, any core  40.6%
  independent of the exotics (exact): yes
== Shoal Ambushers: 2110 entries (286 before the cutlass and core rolls), total weight 179200
  exotics per spawn: 0:  45.0%  1:  40.0%  2:  11.2%  3:   3.8%   >=1:  55.0%;  Mk I  85.6% Mk II  14.4%;  per line per 100 spawns: 5.27 (14 lines)
  before:  exotics per spawn: 0:  45.0%  1:  40.0%  2:  11.2%  3:   3.8%   >=1:  55.0%;  Mk I  85.6% Mk II  14.4%;  per line per 100 spawns: 0.00/5.67 (13 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 0.75, any cutlass  15.0%, cutlasses 1.20
  cores: per ship  56.2% carry some;  count (share of ships): 1:56.2%;  per ship 0.56;  per spawn 0.56, any core  56.2%
  independent of the exotics (exact): yes
== Shoal Ambush Hunter: 1026 entries (114 before the cutlass and core rolls), total weight 22400
  exotics per spawn: 0:  20.0%  1:  40.0%  2:  30.0%  3:  10.0%   >=1:  80.0%;  Mk I  87.4% Mk II  12.6%;  per line per 100 spawns: 9.29 (14 lines)
  before:  exotics per spawn: 0:  20.0%  1:  40.0%  2:  30.0%  3:  10.0%   >=1:  80.0%;  Mk I  87.0% Mk II  13.0%;  per line per 100 spawns: 0.00/10.00 (13 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 1.00, any cutlass  20.0%, cutlasses 1.60
  cores: per ship 100.0% carry some;  count (share of ships): 1:100.0%;  per ship 1.00;  per spawn 1.00, any core 100.0%
  independent of the exotics (exact): yes
== mission Shoal: Lead Freighter: 2 entries (2 before the cutlass and core rolls), total weight 3
  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  before:  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  cutlasses: no drowned warship in this pool
  cores: per ship   0.0% carry some;  count (share of ships): -;  per ship 0.00;  per spawn 0.00, any core   0.0%
  independent of the exotics (exact): yes
== mission Shoal: Lead Warship: 188 entries (28 before the cutlass and core rolls), total weight 2800
  exotics per spawn: 0:   0.0%  1: 100.0%   >=1: 100.0%;  Mk I  80.0% Mk II  20.0%;  per line per 100 spawns: 7.14 (14 lines)
  before:  exotics per spawn: 0:   0.0%  1: 100.0%   >=1: 100.0%;  Mk I  80.0% Mk II  20.0%;  per line per 100 spawns: 0.00/7.69 (13 lines)
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 0.71, any cutlass  14.3%, cutlasses 1.14
  cores: per ship 100.0% carry some;  count (share of ships): 1:100.0%;  per ship 1.00;  per spawn 1.00, any core 100.0%
  independent of the exotics (exact): yes
== mission Shoal: Lead Deep: 9 entries (1 before the cutlass and core rolls), total weight 40
  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  before:  exotics per spawn: 0: 100.0%  1:   0.0%   >=1:   0.0%
  cutlasses: per warship  20.0% carry some;  count (share of warships): 1:2.5% 3:2.5% 5:2.5% 7:2.5% 9:2.5% 11:2.5% 13:2.5% 15:2.5%;  mean when carried 8.0
             per spawn: warships 1.00, any cutlass  20.0%, cutlasses 1.60
  cores: per ship   0.0% carry some;  count (share of ships): -;  per ship 0.00;  per spawn 0.00, any core   0.0%
  independent of the exotics (exact): yes
pools not independent: 0
```

`tools/ambushers/dist.py`:

```
== Shoal Ambushers: 2110 variants, total weight 179200
  all              ships: 0:  45.0%  1:  40.0%  2:  11.2%  3:   3.8%   >=1:  55.0%   exotics/ship 0.738
                   marks: Mk I  85.6%  Mk II  14.4%  Mk III 0;  glass/ship 23.1, cores/ship 0.56
  per line (exotics per 100 ships: Mk I + Mk II):
    Tidecutter              4.51 + 0.76 =  5.27
    Riptide Turret          4.51 + 0.76 =  5.27
    Glassweave Shield       4.51 + 0.76 =  5.27
    Abyssal Cell            4.51 + 0.76 =  5.27
    Undertow Thruster       4.51 + 0.76 =  5.27
    Coralgraft Mender       4.51 + 0.76 =  5.27
    Eddy Steering           4.51 + 0.76 =  5.27
    Brine Capacitor         4.51 + 0.76 =  5.27
    Coldwater Sink          4.51 + 0.76 =  5.27
    Glimmer Point Defense   4.51 + 0.76 =  5.27
    Coral Plating           4.51 + 0.76 =  5.27
    Siltwake Afterburner    4.51 + 0.76 =  5.27
    Driftnet Ramscoop       4.51 + 0.76 =  5.27
    Lamprey Launcher        4.51 + 0.76 =  5.27
  warship hulls    ships: 0:  45.0%  1:  35.0%  2:  15.0%  3:   5.0%   >=1:  55.0%   exotics/ship 0.800
                   marks: Mk I  85.9%  Mk II  14.1%  Mk III 0;  glass/ship 23.2, cores/ship 0.75
  freighter hulls  ships: 0:  45.0%  1:  55.0%  2:   0.0%  3:   0.0%   >=1:  55.0%   exotics/ship 0.550
                   marks: Mk I  84.1%  Mk II  15.9%  Mk III 0;  glass/ship 22.5, cores/ship 0.00
  over capacity: 0
== Shoal Ambush Hunter: 1026 variants, total weight 22400
  all              ships: 0:  20.0%  1:  40.0%  2:  30.0%  3:  10.0%   >=1:  80.0%   exotics/ship 1.300
                   marks: Mk I  87.4%  Mk II  12.6%  Mk III 0;  glass/ship 26.5, cores/ship 1.00
  per line (exotics per 100 ships: Mk I + Mk II):
    Tidecutter              8.57 + 0.71 =  9.29
    Riptide Turret          8.57 + 0.71 =  9.29
    Glassweave Shield       7.50 + 1.79 =  9.29
    Abyssal Cell            7.50 + 1.79 =  9.29
    Undertow Thruster       8.57 + 0.71 =  9.29
    Coralgraft Mender       8.57 + 0.71 =  9.29
    Eddy Steering           7.50 + 1.79 =  9.29
    Brine Capacitor         7.50 + 1.79 =  9.29
    Coldwater Sink          8.57 + 0.71 =  9.29
    Glimmer Point Defense   8.57 + 0.71 =  9.29
    Coral Plating           7.50 + 1.79 =  9.29
    Siltwake Afterburner    7.50 + 1.79 =  9.29
    Driftnet Ramscoop       8.57 + 0.71 =  9.29
    Lamprey Launcher        8.57 + 0.71 =  9.29
  warship hulls    ships: 0:  20.0%  1:  40.0%  2:  30.0%  3:  10.0%   >=1:  80.0%   exotics/ship 1.300
                   marks: Mk I  87.4%  Mk II  12.6%  Mk III 0;  glass/ship 26.5, cores/ship 1.00
  over capacity: 0
```

The ambushers keep every share; the hunter's Mk II share moved 13.0% ->
12.6% (the pairs and triples now cycle through 14 lines). Warships per spawn
moved a little where the new line sits on a freighter hull (`Shoal Wrecks`
0.62 -> 0.61, `Shoal Rich Wrecks` 1.36 -> 1.34, `Shoal: Lead Warship` 0.77 ->
0.71); each warship's cutlass roll is unchanged.

### Refinery, workshop and yard

Loaded Lampreys are installed outfits: `outfit (cargo)` and `outfit
(storage)` count only the pooled hold, the ships' holds and the planet's
storage (`PlayerInfo.cpp`), so neither counts them (the test asserts 20
installed, 5 in the hold). Shoal Glass is never installed on a player's ship
(it cannot be), so the refinery's and the run's material counts are unchanged.
Workshop recipes (`outfit "<x>" -<n>` in `on accept`) take from the hold,
then storage (the engine patch), then the flagship's installed outfits: a
recipe that named Glass Lampreys would empty a magazine only when the hold and
storage lacked them; no recipe names them or raw glass today. The code's
crafting (glass -> Lampreys) should take glass from hold + storage and put the
Lampreys in the hold; the next outfitter visit loads them. A Lamprey sold to an
outfitter is ordinary installable ammunition and sells at its depreciated
value, unlike glass.

### Marks

`tools/marks/check.py` now checks weapons per damage type: every type per
second (shield, hull, energy, ion, heat, disruption, discharge, slowing,
scrambling, ...) and anti-missile never lower with the sum higher, and
piercing, missile strength, turn, tracking, top speed, range and magazine
never lower (firing energy and heat may rise). Shots per second are 60 /
reload (`Hardpoint.cpp` adds `reload` per shot, so bursts don't change the
sustained rate; the old check's burst formula only compared ratios).

```
Tidecutter             Mk I -> Mk II: per second shield 80 -> 100, hull 230 -> 400; Mk II -> Mk III: per second shield 100 -> 130, hull 400 -> 520
Riptide Turret         Mk I -> Mk II: per second shield 108 -> 144, hull 324 -> 558; Mk II -> Mk III: per second shield 144 -> 180, hull 558 -> 756
Glassweave Shield      Mk I -> Mk II: shield generation 2.15 -> 2.7; Mk II -> Mk III: shield generation 2.7 -> 3.9
Abyssal Cell           Mk I -> Mk II: energy generation 12.6 -> 15; Mk II -> Mk III: energy generation 15 -> 21
Undertow Thruster      Mk I -> Mk II: thrust per ton of ship at least x1.106; Mk II -> Mk III: thrust per ton of ship at least x1.300
Coralgraft Mender      Mk I -> Mk II: hull repair rate 0.78 -> 1.12; Mk II -> Mk III: hull repair rate 1.12 -> 1.75
Eddy Steering          Mk I -> Mk II: turn per ton of ship at least x1.137; Mk II -> Mk III: turn per ton of ship at least x1.267
Brine Capacitor        Mk I -> Mk II: energy capacity 13200 -> 23000; Mk II -> Mk III: energy capacity 23000 -> 36000
Coldwater Sink         Mk I -> Mk II: cooling never lower (min gain 0.0 at any heat; passive 40 -> 40); Mk II -> Mk III: cooling never lower (min gain 0.0 at any heat; passive 40 -> 40)
Glimmer Point Defense  Mk I -> Mk II: per second anti-missile 90 -> 220; Mk II -> Mk III: per second anti-missile 220 -> 675
Coral Plating          Mk I -> Mk II: hull 400 -> 960; Mk II -> Mk III: hull 960 -> 1650
Siltwake Afterburner   Mk I -> Mk II: afterburner thrust per ton of ship at least x1.749; Mk II -> Mk III: afterburner thrust per ton of ship at least x1.543
Driftnet Ramscoop      Mk I -> Mk II: fuel/s 5.69 -> 12.42; Mk II -> Mk III: fuel/s 12.42 -> 55.20
Lamprey Launcher       Mk I -> Mk II: per second shield 22.5 -> 36.92, hull 11.25 -> 18.46, energy 1350 -> 2400, ion 18 -> 33.23, heat 750 -> 1385, disruption 37.5 -> 69.23, discharge 3 -> 5.538, slowing 12 -> 22.15, scrambling 9 -> 16.62; Mk II -> Mk III: per second shield 36.92 -> 60, hull 18.46 -> 30, energy 2400 -> 4560, ion 33.23 -> 64.8, heat 1385 -> 2640, disruption 69.23 -> 132, discharge 5.538 -> 10.8, slowing 22.15 -> 43.2, scrambling 16.62 -> 31.2
Warden Steward         Mk I -> Mk II: crew -3 -> -8; Mk II -> Mk III: crew -8 -> -20
Undertow Thruster Mk III: 2.89 thrust per ton; best other at 54 t or less: Undertow Thruster Mk II 2.22; best other at any mass: Undertow Thruster Mk II 2.22
Eddy Steering Mk III: 105.56 turn per ton; best other at 36 t or less: Eddy Steering Mk II 83.33; best other at any mass: Eddy Steering Mk II 83.33
failures: 0
```

### Tests

`Shoal Lamprey Launcher Reloads From Cargo` (in `run_all.sh`): a ship with a
Lamprey Launcher Mk I, 25 Glass Lampreys and 30 Shoal Glass in its hold opens
the outfitter at Breaker's Rest with ammunition refill set to always (`"Ammo
refill" 3` in the test config's `preferences.txt`): 20 Lampreys loaded, 5 left
in the hold, `glass lamprey capacity` 0, the glass still all in the hold.


## 22. v0.5.0: The Deep

The owner's brief: `/root/fork/SPEC-shoal-v05.md`. This section overrides the
earlier ones where they disagree (the run of section 9, the waves' fleets,
the leads of sections 7 and 11, the combat jobs of section 17, the guardians'
numbers of section 15).

### Places

* **Breakers' Rest** is the old belt: true name `~The Shoal` (kept, so old
  saves, events and Diplomacy's sorted indices are untouched), display name
  now "Breakers' Rest". Its star is gone: at the centre is a small black hole
  (`star/small-black-hole`) and on it **The Maw** (`planet/wormhole`), a
  one-way wormhole to the hub. Every orbit keeps the period it had round the
  old dwarf (explicit `period`s), the hulks stay, the geodes are cut from 44
  to 18. It is the entry point and is **outside the run**.
* **The Deep** ("the Shoal proper" in prose): 40 systems generated by
  `tools/deep/gen.py` (seeded, idempotent), centred at (-2600, -1450), far
  north-west of the charted map, with its own map background
  (`images/ui/shoal deep.jpg`, galaxy "The Shoal", generated with `--image`).
  True names `~~Shoal <name>` (they sort after `~The Shoal` and every stock
  system), government `Uninhabited`, `"jump range" 40` (jump drives reach no
  further than the lanes), no lane to any system outside. Depth = jumps from
  the hub; lanes join only equal or neighbouring depths, so the generator
  checks that every system's breadth-first depth is its assigned one. The map
  slopes: depth grows towards the west, and the lanes are drawn without
  crossings where they are optional.
* **The hub**, `~~Shoal The Sounding` ("The Sounding"): the Maw's far end,
  **Breakers' Haven** (a planet, government Breakers, `port` that recharges
  fuel only: no services, outfitter, shipyard, trade or repair; not
  "inhabited", so no fleet gathers on it) and **The Upwell**, the one-way
  wormhole back to Breakers' Rest. The only landable planet in the Deep.
* **Hulks**: two or three per deep system (unique planets `~~Shoal <system>
  Hulk n`, display names "Drowned Spine", "Hollow Ring", "Wreck Reef", "Bone
  Shoal", "Dead Lantern"), "inhabited" by an impossible reputation, `to land
  never`, so placed fleets gather round them, 3,600-5,500 from the star
  (section 11's trick).
* Deep systems start uncharted (unvisited); a job marks its target system.

| depth | tier | systems | star (wind) | ramscoop multiplier | hazards (1 in N frames) |
|---|---|---|---|---|---|
| 0 | the Sounding (hub) | 1 | m5 (1.05) | 1.0 | none |
| 1-2 | 1, the Shallows | 4 + 6 | k-dwarf, m8, m-dwarf (1.0-1.2) | 0.8 | Squall 1 (14000) |
| 3-4 | 2, the Drift | 6 + 6 | m-dwarf, l-dwarf (1.2-1.3) | 0.5 | Squall 2 (9000), Vents 2 (300) |
| 5-6 | 3, the Fathoms | 6 + 5 | brown dwarf, neutron (0.4-0.5) | 0.6 | Squall 3 (7000), Vents 3 (160), Radiation 3 (9000) |
| 7-8 | 4, the Abyss | 4 + 2 | small neutron, twilight black hole (0.2-0.3) | 0.6 | Squall 4 (5000), Vents 4 (100), Radiation 4 (6000) |

Effective wind (star x multiplier): about 1.0, 0.9, 0.6, 0.27, 0.15: deeper
is dimmer, and a ramscoop (the Driftnet line) is worth more the deeper you go.

Hazards (system-wide; none deals hull damage, so derelicts keep their loot):

| hazard | duration (frames) | strength | per frame at strength 1 |
|---|---|---|---|
| `Shoal Squall t` (ion storm) | 300-1100 | 1-2 | ion .15t, scrambling .2t, shield 1.5t; "ion hazard" effects |
| `Shoal Vents t` (heat), t >= 2 | 1-200 | .25-1.75 | relative heat .00005t (Ember Waste's base heat is .000233) |
| `Shoal Radiation t`, t >= 3 | 300-900 | 1-1.5 | relative shield .0004(t-2), fuel .02(t-2), energy 1(t-2) |

### The run (code)

* **Start**: arriving in any deep system with no run (in play: through the
  Maw into the hub). Heat carries over from the last run as before (less 8 a
  day). `"shoal: in run"` 1.
* **Continue**: every deep system; landing at Breakers' Haven keeps the run
  and its heat (nothing pauses: heat only builds in flight, as always).
* **End**: arriving anywhere outside the Deep (in play: through the Upwell
  into Breakers' Rest): the haul (cargo now minus cargo on entry; storage no
  longer counts, nothing in the Deep has any) is counted, summarised ("You come
  back up out of the Shoal with ...") and recorded. Death: the save loaded is
  outside the Deep (or before the run) and the run ends quietly. A save loaded
  in the Deep resumes the run.
* **Old saves**: a v2 state with a run going (a run in the old belt) is
  dropped on reading; its heat becomes the heat the Shoal remembers (from the
  day of loading); records, hauls and Yard progress are kept.
* **Heat** a second = current x tier multiplier (hub .5, 1.0, 1.15, 1.3, 1.5)
  x (1/6 + greed), greed as before (cargo only). Kills of wave, endless,
  Undertow and **resident** wardens and of woken restless wrecks add 2.
* **Waves**: the same thresholds; each wave's fleets are *kinds* resolved by
  the tier of the system the player is in: tier 1 (and 2..4) fleets `Shoal
  Warden Pickets`/`Hunters`/`Phalanx`/`Shoal Undertow` (+ " 2"/" 3"/" 4").
  The hub sends one tier-1 picket fleet for any wave, never the Undertow and
  no endless waves; a run past the Undertow's heat meets it in the first
  system out of the hub. Riptide's extra pickets are the tier's.
* **Guards follow**: guardian spawns still afloat jump in after the player in
  every deep system they enter ("They follow you down."), and come back
  after a loaded save ("They were waiting for you."). Landing at Breakers'
  Haven sheds them ("... the wardens lose your trail"): the Haven is the
  hiding place. Once beaten the Undertow's escort follows in its place.
* **Each deep system**, on the player's first second in flight there:
  - once a run: its wrecks (placed, tag `shoal.wreck.seed.<n>.`) and restless
    wrecks; never again that run, so landing at the Haven or flying back and
    forth refills nothing;
  - on every arrival: its resident wardens (placed, so already on watch, tag
    `shoal.resident.<n>.`; their kills count as guardians').
  - heat 25 and 50 add one more restless spawn in the system the player is in.

| tier | wrecks (once a run) | deep wreck | restless | residents (every arrival) |
|---|---|---|---|---|
| hub | Shoal Wrecks | - | 1 | - |
| 1 | Shoal Wrecks x2, Shoal Glass Wrecks | - | 1 | - |
| 2 | Shoal Wrecks, Glass, Rich | 10% | 2 | Pickets 2 (50%) |
| 3 | Glass, Rich x2 | 35% | 2 | Pickets 3, Hunters 3 (40%) |
| 4 | Rich x2, **Shoal Abyss Wreck** | 50% | 3 | Hunters 4, Pickets 4 (60%) |

* **Map**: the detail panel (current, "The Shoal is <word>", "You are in
  <tier>", runs, deepest heat and deepest reach as words, Undertows) is on
  Breakers' Rest, and on the hub while a run is on or once it is visited.
* Conditions: `"shoal: depth"` (jumps from the hub, in a run), `"shoal:
  deepest depth"` (record) join the others; `"shoal: in run"` now means "in
  the Deep".

### Breakers' Rest outside a run

* Its own pools: `Shoal Rest Wrecks` (the "Shoal Wrecks" variants with the
  Mk I ones x3: 21.1% of spawns carry a Mk I, none a Mk II; Warden Cores on 4%
  of ships) and `Shoal Rest Restless` (the coreless restless hulls: Hauler,
  Osprey, Bulk Freighter). Reaching Mk II from here alone is impractical: no
  Mk II drops and almost no cores (a yard Mk II needs refined cores).
* A stock: up to 3 derelict spawns and 4 restless spawns, placed on the first
  second in flight after arriving, and refilled only for days the player was
  **away** (0.4 derelicts and 1 restless a day; a run in the Deep counts as
  away). Landing at Breaker's Rest and taking off again places nothing.
* Wardens rarely visit: on 12% of arrivals from elsewhere, one tier-1 picket
  fleet comes 60-150 s after arriving (`shoal.visit.<n>.`). No heat, no run.
* Restless wrecks wake there as in the Deep (no heat).

### The wardens' nerf

Measured by `tools/deep/balance.py` (a 0.1 s simulation: shields, piercing,
regeneration, energy with batteries, the Lamprey's disruption and energy
drain, anti-missile against missiles, magazines; no heat, range or turning).
The v0.4 wardens beat a Mk II Bactrian with any loadout (Lancer in 22 s,
Bastion in 11 s): a solo captain with Mk II gear could not kill one.

Tier 1 (the hub and the Shallows) is the hand-made data:

| model | v0.4 shields / hull / shield gen / repair | v0.5 | cut | loot (cores, glass) |
|---|---|---|---|---|
| Picket | 8,000 / 4,800 / 1.5 / .2 | 4,400 / 2,600 / .9 / .12 | -45% hp, -40% regen | 1, 8 (was 4) |
| Lancer | 30,000 / 14,000 / 4 / .5 | 16,500 / 7,700 / 2.4 / .3 | -45%, -40% | 2, 14 (was 8) |
| Bastion | 80,000 / 32,000 / 8 / 1.2 | 40,000 / 16,000 / 4 / .6 | -50%, -50%; a Husk-Slice turret becomes a second Warder | 4, 24 (was 12) |
| Undertow | 200,000 / 150,000 / 16 / 3.5 | 68,000 / 51,000 / 5.4 / 1.2 | -66%, -66%; one Detainer and two Husk-Slice turrets removed, energy capacity 40,000 -> 16,000 | 6 + 3 lattice, 30 glass (new) |

Every Warden weapon copy: all damage types x0.7 (-30%; about the stock
outfit's damage again); firing costs and anti-missile unchanged. Restless
wrecks and ambushers fire the same copies, so they are 30% softer too. Fleets
are smaller near the hub: tier-1 Pickets 1-2 (were 2-3), Hunters one Lancer or
two Pickets (were two Lancers or Lancer + 2 Pickets), Phalanx one Bastion
(was Bastion + 2 Lancers), Undertow + 1 Picket (was + 2).

Deeper tiers (`shoal deep wardens.txt`): hulls `Warden Picket 2` ... `The
Undertow 4` (variants, `uncapturable`, `add attributes`), weapon copies
`Warden <weapon> 2/3/4` (shown under the base names), and fleets:

| tier | durability (shields, hull, regen) | damage (energy, cooling) | Pickets | Hunters | Phalanx | Undertow |
|---|---|---|---|---|---|---|
| 1 | x1 | x1 | 1-2 | Lancer, or 2 Pickets | Bastion | + Picket |
| 2 | x1.25 | x1.1 | 2 | Lancer + Picket | Bastion + Lancer | + 2 Pickets |
| 3 | x1.55 | x1.22 | 2-3 | 2 Lancers, or Lancer + 2 Pickets | Bastion + 2 Lancers | + Lancer + 2 Pickets |
| 4 | x1.9 | x1.35 | 3 | 2 Lancers + Picket | Bastion + 2 Lancers + Picket | + 2 Lancers |

Loot grows with depth: Picket 1/1/2/2 cores, Lancer 2/2/3/4, Bastion 4/5/6/8
(+1 lattice at tier 4), Undertow 6/7/8/10 cores and 3/3/4/5 lattice; glass up
to 15/24/40/50.

Reference ships (all fit their hull): Bactrian with Mk II gear (2 Lamprey, 2
Tidecutter, 5 Riptide, Glimmer, 2 Undertow, Eddy, Siltwake, 2 Abyssal, 2
Glassweave, 2 Coldwater, Brine; 994 / 3,627 shield / hull dps, 11,446 energy
drain, disruption 231); the same with Mk I and with Mk III; the Mk II one
with 4 Tidecutters instead of the Lampreys; a Leviathan with Mk II gear.
One on one (who wins, seconds, share of the reference ship left):

```
                  Bactrian Mk II        Bactrian Mk I         Mk II, no Lamprey     Leviathan Mk II       Bactrian Mk III
Warden Picket     win  1s 100%          win  2s  99%          win  5s  99%          win  2s  99%          win  1s 100%
Warden Lancer     win  3s  92%          win  6s  80%          win 18s  50%          win  5s  83%          win  2s  96%
Warden Lancer 4   win  6s  76%          win 12s  44%          LOSS 19s              win  9s  49%          win  4s  87%
Warden Bastion    win  6s  72%          win 14s  35%          LOSS 21s              win 10s  41%          win  4s  85%
Warden Bastion 2  win  8s  61%          win 17s   9%          LOSS 18s              LOSS 10s              win  5s  78%
Warden Bastion 4  win 12s  24%          LOSS 13s              LOSS 13s              LOSS  7s              win  7s  56%
The Undertow      LOSS 12s              LOSS 11s              LOSS 12s              LOSS  7s              win 13s  52%
The Undertow 2+   LOSS                  LOSS                  LOSS                  LOSS                  LOSS
```

So: every tier-1 warden but the Undertow dies to a Lamprey-armed Mk I or Mk II
ship alone; a Bactrian with Mk II and no Lampreys beats Pickets and the
Lancer but loses the shield race to a Bastion (armour-cutters need the
Lamprey, section 21); the Drift wants Mk II, the Fathoms' phalanxes and the
Abyss want Mk III or company, and the deeper Undertows a fleet. The model
ignores range and the Lamprey's travel, so real fights run longer.

### Loot by depth

* `Shoal Abyss Wreck` (tier 4): one Leviathan or Bactrian, always an exotic:
  Mk I 25% (`(Deep, X)`), Mk II 60% (`(Deep, X II)`), **Mk III 15%**
  (`(Abyss, X III)`, the `(Deep, X II)` wreck with the Mk III: the only Mk
  IIIs that are found rather than made; `tools/deep/abyss.py`), one lattice,
  30 glass, 2-4 cores in the hold. All 14 lines alike.
* The wave wrecks (heat 50 rich, heat 72 deep) and Spring Tide's extra rich
  wrecks are placed in the system the player is in.
* `tools/h2h` rolls cutlasses and cores into the new pools too (`Shoal Rest
  Wrecks` 4% cores a ship, `Shoal Abyss Wreck` 2-4, the restless pool none);
  `tools/ambushers/cap.py`: 4,631 drowned variants, 0 over capacity.

### The Breakers' jobs, in the Deep

Each job kind is now one mission per target system (`shoal deep jobs.txt`,
`Shoal: <kind>: <system name>`), offered at Breaker's Rest to a welcomed
captain (no run is needed: you are not in one at the station), with the
kind's cooldown checked on offer **and on accept** (two of a kind can be on
the board; only one can run). NPCs and the target system are the same for
every NPC of a job; the system is marked on accepting; pay grows 35% a jump of
depth past the first. Lead wrecks are fleets now (`Shoal Lead Freighter /
Warship / Deep Wreck`, moved out of the missions, rolled by `tools/h2h`).

| kind | tiers | board | deadline | pay, shallowest -> deepest target |
|---|---|---|---|---|
| Lead Freighter | 1-2 | 49% | 6-8 | 60,000 -> 123,000 |
| Lead Warship | 2-3 | 37% | 7-9 | 204,000 -> 330,000 |
| Lead Deep (+ that tier's Phalanx; needs `"shoal: deepest depth"` >= its depth) | 3-4 | 16% | 8-10 | 960,000 -> 1,380,000 |
| Ambush at the wrecks | 1-2 | 36% | 5-7 | 300,000 -> 615,000 |
| Silence the hunter (+ that tier's Pickets) | 2-3 | 21% | 7-9 | 1,275,000 -> 2,062,000 |
| Tow escort (the tug is stranded there; bring it up through the Upwell and land with it at Breaker's Rest) | 1 | 34% | 6-7 | 450,000 -> 608,000 |

("board": the chance one job of the kind is on the board at a landing.)

The old missions (`Shoal: Lead Freighter`, ..., `Shoal: Tow Escort`) are
gone; one already accepted in a save keeps running (saves hold their
missions whole), in Breakers' Rest as before.

**Telling the player.** The welcome conversation and log describe the Maw,
the Sounding and the Haven; captains welcomed before 0.5.0 get the landing
mission `Shoal: Down The Maw` (invisible, once: `"shoal: maw told"`) on their
next landing at Breaker's Rest.

### Diplomacy and Corporations

Deep systems sort after every stock system and `~The Shoal`, have government
`Uninhabited` and no lane out of the region (wormholes are not lanes), and
Breakers' Haven has no bank: neither mod adopts them (Corporations walks lanes
from human systems; Diplomacy keeps only its regions' systems).

### Tests

* Unit (`test/shoal.test.mjs`, FakeGame): the Maw starts a run, the Haven
  keeps it, Breakers' Rest ends it; heat by tier; waves by tier (hub: pickets
  only, no Undertow); seeding once a run and residents every arrival; guards
  follow and are shed at the Haven; save/load (incl. a v2 state dropped);
  Breakers' Rest's stock, refill while away, no land/takeoff farming, picket
  visits; restless wrecks per system. `test/deep.test.mjs` (no toolchain):
  the code's table is the map, depths are jumps, the only ways in and out
  are the two wormholes, the Haven is the only landing and sells nothing,
  hazards and dimness grow with depth, every fleet exists, every job targets
  a deep system of its band and pays more deeper.
* In-engine (`test/ingame/tests_shoal.txt`): `Shoal Maw To The Deep And Back`,
  `Shoal Deep Jobs Offered`, `Shoal Deep Jobs Need The Welcome`, `Shoal Deep
  Job Stays Active Through The Maw`, `Shoal Down The Maw Told Once` (the old
  lead and ambush tests are replaced by these). Every test save welcomed
  before holds all six job cooldowns and `"shoal: maw told"`.
* End to end (`test/ingame/e2e/run.sh`, real game + loader): `Shoal Deep E2E`:
  through the Maw `"shoal: in run"` 1, at the Haven still 1, one jump down
  `"shoal: depth"` 1, up the Upwell 0 with `"shoal: runs"` 1.

### Retuning

Every number of the Deep is a table at the top of `tools/deep/gen.py`
(counts per depth, tiers, heat multipliers, seeds, residents, stars, hazards,
warden multipliers, loot, fleets, jobs). Run it (`--image` to redraw the
background), then `tools/h2h/h2h.py` if a pool changed, then
`tools/deep/balance.py --fleets`, `tools/ambushers/cap.py`, the validator and
the tests. Tier-1 wardens are hand-edited in `shoal ships.txt` /
`shoal outfits.txt`; gen.py derives the deeper tiers from them and checks the
tier-1 fleets in `shoal fleets.txt` against its table.
