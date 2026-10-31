# Corsair Charts: design (spoilers)

> This is the build contract for the mod, and it names every step, item and
> number. Don't read it if you want to find them in play.

Pirate treasure trails in the style of RuneScape's clue scrolls. Now and then a
pirate the player destroys or disables transmits a chart. The player follows
it through 3 to 8 steps to a derelict cache. The cache's hold has bonds and
rare goods, its strongbox has an exotic outfit (or stock rarities), and
sometimes the cache is itself a stolen prototype hull the player can capture.

* **Floor: mod API 11** (Dado loader v0.3.0). `min_api()` and `api_version()`
  are 11. The mod uses `outfit_give` and `outfit_take` (charts, fragments, the
  manifest, the strongbox) and `ship_x`, `ship_y` and `ship_distance` (the
  scanner, and crediting disabled pirates), and checks each with
  `game.has("call:…")`. If any of them is missing, the mod does nothing. It uses
  nothing from API 12, and the vendored SDK's API-12 calls are never made (a
  unit test greps the build for them). The tests run FakeGame with an API-11
  feature list, and the in-engine E2E tests run with a loader built from
  es-modloader's `api11` branch as v0.3.0.
* **Data**: `tools/gen.py` generates `data/charts outfits.txt`,
  `data/charts ships.txt`, `data/charts fleets.txt` and `src/Tables.dados`
  from one set of lists. `data/charts world.txt` is written by hand
  (governments and name phrases). Only stock sprites and thumbnails are used.
  Exotics and prototypes start as copies of stock definitions.
* **Code** (`src/`, DadoScript): `Charts` (hooks, state, panels, map), `Gen`
  (trail generation), `Galaxy` (map queries, BFS), `Cipher`, `Step`, `Trail`,
  `Rng` (Park-Miller), `Json`, `Tables` (generated).

## 1. Trigger

* **Who counts:** ships of the stock pirate governments `Pirate`,
  `Pirate (Rival)` and `Marauder`. The mod's own couriers, guards and rivals
  are `Charts Corsair` and `Charts Rival`, so killing them never drops a chart.
* **Destroyed:** each step, `losses()` is checked with `loss_by_player` and
  `loss_government`, and the hull comes from `loss_model`.
* **Disabled:** twice a second the mod scans the system. A pirate it has seen
  afloat this visit (keyed by name|model) that is now disabled, within 4000 of
  the flagship, is credited once. Its model is remembered, so if the ship is
  later destroyed the loss does not roll again. *Lead decision:* the API has no
  "who disabled it", so distance from the flagship stands in for it.
* **Tier by hull** (`model_cost`, or `model_category` when the cost is
  unknown): under 1M easy, under 3M medium, under 9M hard, 9M and up "biggest".
* **Chance** per credited pirate: easy 5%, medium 7%, hard 9%, biggest 12%.
  Of the biggest pirates' drops, 25% are elite (3% overall) and the rest hard.
  The roll uses the mod's own saved Rng state, so reloading a save gives the
  same roll.
* **On a drop:** the chart is given to cargo (`outfit_give`) with a flight
  message: "…transmitted a burst of mysterious coordinates…".
* **Charts** (cargo items, `Special`, `installable -1`, full sale value):
  `Scorched Star Chart` (easy, 4k), `Coded Star Chart` (medium, 12k),
  `Bloodied Star Chart` (hard, 30k), `Black Star Chart` (elite, 80k).
  *Lead decision:* charts stack as items, and **one trail is active at a
  time**. Spare charts wait in the hold, or can be sold.

## 2. Starting, the panel, the map

* **Landing** with no active trail and a chart in cargo or local storage (the
  best tier is offered) opens a panel from `on_enter`: *Investigate* / *Not
  now*. Investigate uses up the chart (`outfit_take … "any"`) and builds the
  trail.
* **Planet button "Corsair Charts"** appears while a trail is active, a chart
  is held, or anything has ever been found. Its panel shows the tier, the step
  number out of the total, the step's text and its hint. It has these buttons,
  depending on context:
  * *Answer the informant* or *Work the lock* (when landed at that step's world)
  * *Seek another lead*
  * *Abandon the trail*
  * *Collection log*
  * *Close*

  With no trail it shows the record and offers *Follow the …* for a held chart.
* **Map** (cleared and redrawn on every change): ciphers and riddles get a
  ring and a label ("chart: within N jumps") on the search centre, plus a
  `map_detail` with the text. The other steps get a marker and a detail on the
  target system.
* **Conditions** for missions: `corsair charts: trail` (0, or tier+1) and
  `corsair charts: trails finished`.

## 3. Generation

`Gen.make(game, tier, seed, from, found)` builds the trail from one Rng, so
the same seed, start, map and collection log always give the same trail. The
seed comes from the mod's dice.

| tier | steps (finale included) | jumps between steps | kinds drawn (weights: cipher, riddle, scan, question, lock, courier) |
|---|---|---|---|
| easy | 3–4 | 1–3 | 3, 3, 3, 3, 0, 0 |
| medium | 4–5 | 1–4 | 3, 3, 2, 2, 2, 2 |
| hard | 5–7 | 2–5 | 3, 3, 2, 2, 3, 3 |
| elite | 6–8 | 2–6 | 3, 3, 2, 3, 3, 3 |

* **Each step** is chained from the previous step's system. Candidates are
  usable systems at the tier's distance, sorted by name, avoiding systems the
  trail already uses while others exist. If none qualify the range widens to
  1..hi+3.
* **Usable systems:** the government is Republic, Free Worlds, Syndicate,
  Pirate, Independent, Militia, Neutral or Merchant; or the system is
  Uninhabited and next to an inhabited one of those (this keeps trails out of
  alien space). Names starting with `~` are excluded.
* **Landable worlds** are those where `planet_service` allows trading, the
  bank or the job board.
* **No kind twice in a row.** If a kind has nothing to work with, another kind
  is tried, and the last resort is a scan step in the previous system, which
  always works.
* **The last step is always the finale.**
* **Ambush:** elite trails always have one, hard trails half the time, at a
  random step from 1 to n−2. When the player arrives at that step's system, a
  rival fleet jumps in (`arrive = true`), once per trail.

## 4. Steps (no "deed"/emote steps, by the owner's wish)

1. **Cipher.** The target is a world (land on it) or a system (arrive there),
   within N jumps of the previous mark. Only A–Z change:
   * easy: shift by k (k is told)
   * medium: each word's letters are shuffled (never left unchanged)
   * hard: shuffle, then shift by k (k is told)
   * elite: shuffle, then shift by the hyperlane count of a named system
     within 2 jumps (`link_count`; the key must be 1..25)
2. **Riddle.** The target system is described by facts from game data:
   government, hyperlane count, a neighbour, inhabited or not, landable world
   count, shipyard or not, then the initial and the letter count. Facts are
   added in random order until no other usable system within the radius fits
   (always at least two). If the system can't be made unique, the step falls
   back to another kind. The facts are stored with the step, and a test
   re-checks uniqueness against the map independently.
3. **Scan (hot/cold).** A spot at radius 600..(2000/2600/3200/4000 by tier)
   from the system centre. In flight, each second, the flagship's distance
   gives one of six words: silent >5000, cold, cool, warm, hot, burning <350.
   The scanner speaks whenever the reading changes (adding "Warmer." or
   "Colder.") and every 15 s otherwise. Within 250 the canister gives 1/2/4/8
   bearer bonds straight into cargo and the trail moves on. *Lead decision:*
   there is no positioned spawn in API 11, so nothing is placed.
4. **Question.** An informant on a world asks either "shortest jumps from A
   to B" (BFS, 2..3/4/6/8 jumps by tier; easy is sometimes this) or "how many
   hyperlanes leave A". The answer goes through `ask_number` (1..99). After
   three wrong answers the informant asks a new question (no soft-lock, no
   penalty).
5. **Lock.** A strongroom on a world, with 3/3/4/5 dials (digits 0–9) and the
   target combination printed. Turning dial i adds `effect[i][*]` to every
   dial mod 10:
   * easy: independent dials
   * medium: also +1 to the next dial
   * hard: +1..3 to the next
   * elite: +1..4 to each of the next two

   The start is made by turning dials *backwards* 8–20 times from the target,
   so the lock is always solvable and never starts open. The panel has a
   button per dial, *Start over* and *Step back*. A test solves every
   generated lock by BFS.
6. **Courier (disable and board).** On arrival in the target system (in
   flight), `Charts Courier <tier>` is placed (government `Charts Corsair`,
   `staying coward target`, uncapturable, a `Chart Fragment` in its hold;
   escorts from medium up). When the fragment shows up in the player's cargo
   (`outfit_take`, checked twice a second in flight and on landing), the trail
   moves on. If the courier is lost or the player leaves, a new one is placed
   on the next arrival. If no courier can be spawned, the trail moves on
   anyway.
7. **Finale.** On arrival, the cache fleet rolled for this trail is placed
   (`arrive = false`; personality `derelict mute`, so it is disabled where
   `Fleet::Place` puts it, next to an inhabited object). From hard up,
   `Charts Guard <tier>` is placed beside it. Taking the `Corsair Manifest`
   from its hold opens the strongbox: `outfit_give` to cargo, finds go to the
   log, the record counts it, and the trail ends. A cache is placed at most 4
   times (landings and takeoffs re-create the system). After that the trail
   ends as lost ("scattered debris"), which stops farming a cache whose
   manifest is never taken. If the cache cannot be spawned, the strongbox is
   given directly.

**Never soft-locked:**
* On every arrival and landing, a step whose system can no longer be reached
  from here (BFS, 60 jumps) is regenerated from here.
* So is a question or lock world the player can no longer use, or a step that
  fails to decode.
* *Seek another lead* (after a confirm) regenerates the current step from
  here at any time; the finale stays a finale.
* *Abandon* (after a confirm) ends the trail and clears leftover fragments and
  manifests.
* Fragments carried with no active trail are removed on landing.

## 5. State

`game.set_data("state", json)` is written on every change. It holds:
* version
* dice (Rng state)
* `finished[4]`, `abandoned`, `charts` (count dropped)
* `found` (the collection log)
* the trail: tier, seed, origin, steps (kind, system, planet, text, hint,
  region, radius, answer, tries, x, y, lock start/dials/target/effect, riddle
  facts), index, ambush step and done flag, finale fleet, prototype, strongbox
  items and counts, placements, start day, reroutes

Each hook reads the state again when the saved text differs from the last
written one, which covers a new pilot or an older save of the same pilot.
Damaged JSON reads as no trail, and a trail whose index or steps don't hold
together is dropped. Visit-only lists (pirates seen afloat, credits, the
scanner's last word) are not saved.

## 6. Rewards

**Credits via items:** `Corsair Bearer Bond` (Special, `installable -1`, so
it sells at the full 25,000 at any outfitter, mass 0).

**Cache hold, by tier:**

| tier | bonds | commodities |
|---|---|---|
| easy | 4 | 12 Luxury Goods, 8 Electronics |
| medium | 10 | 20 Luxury Goods, 15 Heavy Metals, 10 Medical |
| hard | 20 | 40 Luxury Goods, 30 Heavy Metals, 20 Electronics |
| elite | 48 | 60 Luxury Goods, 40 Heavy Metals, 40 Electronics, 30 Medical |

Commodities are scaled down to fit each hull's cargo space. The hull's own
stock loadout can also be plundered.

**Total payout per trail** (bonds only, before goods, scanner bonds, the
strongbox and any hull): about 100k / 250k / 500k / 1.2M by tier.

**Cache hull** (`Tables.finale_*`), rolled when the trail is generated:

| tier | ordinary cache hulls (uncapturable) | prototype hulls (capturable) |
|---|---|---|
| easy | Freighter, Clipper, Hauler, 1/3 each | none |
| medium | Argosy, Bounder, Hauler, 1/3 each | none |
| hard | Behemoth 3, Bulk Freighter 3, Marauder Firebird 2 | Sirocco 1, Nightjar 1 (20% prototype) |
| elite | Marauder Leviathan 2, Marauder Falcon 2, Behemoth 1 | Black Kestrel 2, Hellion 2, Matriarch 2, Sirocco 1, Nightjar 1 (8 of 13, about 62%) |

**Strongbox** (rolls and weights):

| tier | rolls | entries (weight) |
|---|---|---|
| easy | 1 | easy exotic 55, 2 bonds 45 |
| medium | 1 | medium exotic 70, easy exotic 20, 4 bonds 10 |
| hard | 2 | hard exotic 60, medium exotic 25, NDR-114 Android ×2 15 |
| elite | 2 | elite exotic 45, hard exotic 25, Cloaking Device 15, NDR-114 Android ×3 15 |

* An exotic not yet in the log (and not already in this box) is preferred.
* A Cloaking Device the player already owns is swapped for 20 bonds when the
  box opens.
* Stock names were verified in the data: `Cloaking Device` (human/outfits.txt)
  and `NDR-114 Android` (remnant outfits). Both are `unplunderable`, so they
  can only come from the strongbox (code), never from a hold.

**Collection log:** the 14 exotics and 5 prototype hulls. An item counts once
the player has it anywhere (`outfit (all): X`, `ship model (all): X`, checked
on every arrival and landing, and immediately when the strongbox gives it).
The panel shows unknown items as "???" with their tier.

## 7. Exotics (14: easy 3, medium 4, hard 4, elite 3)

All are sold nowhere and are copies of the named stock outfit, keeping its
sprite, sound and thumbnail.

**Every reward is useful (owner's rule).** `tools/niche.py` prints each
exotic and hull next to its closest stock equivalents from the real stock
data, per second and per outfit space. Its output backs the niche lines below
(numbers per second).

**Verified engine behaviour** (`source/ship/ResourceLevels.cpp`
`FiringCost`/`Damage`, `Ship.cpp` `DoGeneration`, `Weapon.cpp`):
* Negative `firing shields`, `firing hull` or `firing fuel` add to the
  firer's level on each shot. The level is clamped to its maximum at the next
  generation step, and `CanFire` never blocks on a negative cost.
* Firing costs are not subject to `shield delay`, and they need no
  shield/hull energy.
* `relative hull damage` adds that fraction of the target's *max* hull per
  hit (`DamageProfile.cpp`).
* `cloaked firing` > 0 lets a cloaked ship fire, and each shot removes that
  much cloak (`Ship.cpp` around line 2805). Stock cloaks can't fire at all.

| exotic | tier | base | key stats | niche (vs stock) |
|---|---|---|---|---|
| Bilge Siphon | easy | Energy Blaster | 12 space; 54/36 dps; **+30 shields/s while firing** | A small gun port turned into shield regen: Energy Blaster damage plus 30 shields/s for 7 more space (S-270: 36/s for 12 space, using 36 energy/s, and stopped by shield delay). |
| Tattletale Scoop | easy | Ramscoop | 6 space; ramscoop 2.5; cargo scan 12, outfit scan 6 | Best human ramscoop per space (Ramscoop 1/10, Emergency 1.25/4) **and** both scanners in one 6-ton slot. |
| False Bulkhead | easy | Cargo Expansion | 15 space → 18 cargo, scan interference 1.5 | More cargo per space than the Cargo Expansion (15 for 20) with a smuggler's interference built in. |
| Leech Turret | medium | Pulse Turret | 30 space; 220/160 dps; **+35 shields/s while firing** | Pulse Turret at 80% of the damage, 4 space smaller, with a D67-class shield regen (49/s for 45 space) on top while it fires. |
| Tollkeeper Ion Repeater | medium | Ion Cannon | 18 space; 135/60 dps, ion; range 800; **+2.25 fuel/s while firing** | The only fuel source that works anywhere: refuels in combat (a jump's 100 fuel in 45 s of fire). Ion Cannon range at 38% of its space. |
| Ghost Lattice | medium | Decoy Plating | 10 space; interference 2.5, radar jamming 6, optical jamming 0.6, cooling 6 | Decoy Plating's role, better, plus optical jamming (no human outfit has it) and cooling. |
| Smugglers' Run Thruster | medium | X3700 | 40 engine space: thrust 38, afterburner 45, ramscoop 0.5 | An X3700 plus a Volcano afterburner (56 space) in 40, plus a scoop. |
| Blackwake Broadside | hard | Particle Cannon | 34 space; 191/232 dps, range 750; **+16 hull/s while firing** | Particle Cannon damage plus nanite-class hull repair (Small Nanite Fabricator: 43/s for 23 space and 65 energy/s) that costs no hull energy. |
| Mutineer's Heart | hard | Breeder Reactor | 70 space; 840 energy/s; 48 shields/s at half energy | Beats the Breeder per space (768 for 80) and carries a D67's worth of shield regen. |
| Graverobber's Coil | hard | Small Recovery Module | 24 space; 42 shields/s and 42 hull/s for 42 energy/s total | Same space and total healing as the Small Recovery Module (84/s for 84 energy/s), at half the energy. |
| Deadeye Lance | hard | Electron Beam | 36 space; 180/216 dps; **range 900** | Twice the range of any human beam (Electron Beam 450). A sniper's gun. |
| Widow's Kiss | elite | Plasma Cannon | 30 space; 120/80 dps **+2.4% of the target's max hull per second** | Damage that grows with the target: +480 hull/s per gun against a 20,000-hull capital ship. Frightening. |
| Black Flag Reaver | elite | Plasma Turret | 60 space; 450/400 dps; **+60 shields/s and +20 hull/s while firing** | Plasma Turret damage without the heat, plus the sustain of a large generator **per turret**. Six of them heal 360 shields/s in a fight. |
| Phantom Veil | elite | Cloaking Device | 25 space; cloak 0.02 (twice as fast); **fires while cloaked** (each shot −0.004 cloak); half regen while cloaked | The only cloak a player can get that can fire. Kill from nowhere. Not unique, so it stacks with the stock device for an even faster cloak. |

## 8. Prototype hulls (5: hard 2, elite 3; capturable, sold nowhere)

* Plain data ships, not runtime definitions: whole ship definitions copied
  from the stock hull by `gen.py`, with stock sprite, hardpoints and loadout
  and changed attributes.
* Their caches are variants `"<name> (Charts Cache)"` that add only a `cargo`
  node. Variants don't inherit `uncapturable`, and these neither inherit it
  nor set it, so they are **capturable**.
* Every other ship of the mod (ordinary caches, couriers) is a variant that
  sets `uncapturable` explicitly. A test checks both rules.
* `"ship model (all)"` sees a captured cache as its prototype, because a
  variant's true model name is its base.
* Built-in quirks are hull attributes, so they take no outfit space.
* Required crew is lower (automation). This is also what makes capturing the
  derelict feasible: its crew is fully hired, as every NPC's is.

| hull | tier | base (facility it was lost from) | changes | niche (vs the stock base) |
|---|---|---|---|---|
| Sirocco | hard | Argosy (Southbound Shipyards' R&D bench) | cargo 120→165, hull 2600→2400, crew 4→3; built-in ramscoop 2, scan interference 2.5, cargo scan 20 | A smuggler's Argosy: bigger hold, its own scoop and anti-scan skin with no outfit space used. |
| Nightjar | hard | Raven (Lionheart's experimental yard) | shields 4700→4500, crew 6→4; built-in afterburner 60, radar jamming 4 | A light warship with a free afterburner and jammer. A Raven owner gets both without losing a slot. |
| Black Kestrel | elite | Kestrel (a black-site Kestrel line) | shields 19400→17500, crew 64→40; **built-in cloak 0.008**, cloaking energy 7, no regen while cloaked | The only heavy warship that cloaks with no device. With a Phantom Veil it is a ghost battleship. Frightening. |
| Hellion | elite | Vanguard (the Syndicate's weapons-integration yard) | weapon capacity 220→280, outfit space 560→640, built-in energy 6/frame and shields 1.5/frame, heat dissipation 0.4→0.35, crew 23→18 | A Vanguard with a free reactor and shield emitter, and room for 60 more tons of guns. |
| Matriarch | elite | Bactrian (Lionheart's deep-space carrier program) | **built-in jump drive** (fuel 200, speed 0.25), hull repair 1.2, shields 2/frame; cargo 530→400, crew 70→50 | A Bactrian that jumps anywhere and repairs itself, without the 20-ton drive or a repair module. |

## 9. Ships, fleets and governments

Couriers (by tier: Sparrow, Quicksilver (Proton), Headhunter (Strike),
Firebird (Plasma) loadouts; the stock variant's outfits are copied onto its
model), escorts, guards (hard: Firebird (Plasma) + 2 Splinter (Laser); elite:
Marauder Falcon, Leviathan and 2 Mantas) and rivals (hard: Marauder Firebird +
Raven; elite: Marauder Leviathan + 2 Firebirds) are all stock hulls.

| government | role |
|---|---|
| `Charts Corsair` | couriers and guards: hostile to the player (−1000), not bribable |
| `Charts Rival` | the "Treasure Hunter" ambushers |
| `Charts Derelict` | the caches: hostile to the player (−1000) so that boarding plunders them; boarding a non-enemy disabled ship *assists* (repairs) it instead (`Engine.cpp`, found by the E2E test) |

Phrases: `charts courier`, `charts wreck`, and `charts corsair` (the stock
pirate names).

## 10. Tests

* `test/charts.test.mjs` (29 tests, `node --test`, FakeGame with its own
  24-system galaxy plus one alien system, API-11 features, and outfit
  conditions computed from cargo, storage and fleet). It covers:
  * Rng determinism and weights
  * cipher round trips
  * trail determinism, and its shape and reach by tier
  * each step type: ciphers decode, riddles are unique (re-checked
    independently), question answers match the map, every lock is solvable by
    BFS, scan radii
  * reward rolls and the log preference
  * drop rates by tier, no drops from non-pirates, the disable credit and its
    de-duplication
  * the offer panel
  * whole trails of every tier, solved step by step
  * scanner, informant, lock panel, courier respawn, finale placements, the
    rival
  * abandon, rerouting unreachable steps, *Seek another lead*
  * save and reload, the collection log
  * API 11 only
  * data consistency (names, capturability, nothing sold)
* `test/ingame/run.sh` (the plugin is generated by `make_tests.py`):
  * load tests on the stock game and on Argosy without the loader: every
    exotic installs and its attributes reach the ship; all five prototypes
    load with their quirks; each fleet departs and lands
  * E2E on Argosy with the API-11 v0.3.0 loader:
    * an escort disables a pirate and a chart drops
    * the finale cache is placed, boarded and plundered, and the strongbox
      opens
  * the finale's save parses without the loader

## 11. Not done / risks

* Disable credit uses distance from the flagship (4000). Another ship
  disabling a pirate nearby would also credit the player.
* The cache's crew defends it, so capturing an elite prototype takes a big
  crew.
* Trails use true system names (the API has no system display name). Stock
  names match.
