# Diplomacy

A diplomacy layer for Endless Sky, written in DadoScript for the Dado mod
loader (es-modloader, installed in the game's `modloaders` folder). Once the
Free Worlds campaign is over, human space is carved into **three major
factions** (the Republic, the Free Worlds, the Syndicate), **thirteen minor
regions** they compete for, and three pirate holdings. Wars over the minors run
side by side and end in peace terms that move borders; regions rise against
their rulers, either seceding as rebel factions or going over to a neighbour;
pirates raid; named commanders lead the fleets; and the War Room tells the
story. See [DESIGN.md](DESIGN.md) for the plan and the milestones.

It is built against the SDK's mod API and needs **mod API 9** (tables, full
screens and charts, job-board jobs, per-pilot storage, map rings and labels).
`api_version()` and `min_api()` both say **9**, whatever SDK it is built with:
loader 0.1.0 checks only `api_version()` and refuses a newer one, and a loader
of mod API 10 checks `min_api()`. The API 10 calls (the notification bus,
`on_pilot_loaded`) are made only when the game has them (`Game.has`, itself
looked up first, since an API 9 game has no `has`).

It lives in the `es-mods` repository, in `mods/diplomacy`, and builds, checks,
tests and deploys with the SDK's commands, which that repository carries (run
them from its root):

```sh
npm run check -- mods/diplomacy      # build, then run its hooks against the fake game
npm test                             # every test, including this mod's (test/*.test.mjs)
npm run deploy -- mods/diplomacy     # build and install into the game's plugins folder
npm run package -- mods/diplomacy    # build dist/Diplomacy.zip to share
```

## Quick start

To try Diplomacy without playing the whole Free Worlds campaign, start a new
pilot (New Pilot on the main menu, or in Load / Save) and choose **Free Worlds
Veteran (Diplomacy)** from the list of starts. It begins on Earth on 24 Feb 3016,
the day the campaign ends, as if you had just finished it:

* **The galaxy** of a finished campaign: every event the campaign applies, in
  order (the war, the southern and northern expansions, Bloodsea, Albatross,
  Tarazed joining, the armistice, the Pug invasion and its defeat, Algenib,
  and the shipyards and outfitters they open). The ones still pending at the
  end (the last Pug link restorations, the Navy leaving Algenib, Greenrock's
  recovery, the stack core) are scheduled at their remaining offsets. The Free
  Worlds hold 57 systems.
* **The conditions** the campaign leaves set: `free worlds plot completed`,
  `main plot completed`, `free worlds reconciliation`, `chosen sides`, karma 3,
  every campaign mission done, the Free Worlds salary of 8,900 a day, and the
  Pilot's and Militia licenses. Reputations are the campaign's (Republic 1,
  Syndicate 1; the Pug make peace on the first landing, as for any finisher).
* **A ship and money**: an Osprey with the Jump Drive the campaign fits, the
  Syndicate extremists' Cloaking Device in the hold (it does not fit), and
  5,000,000 credits (Parliament's commendation, paid the day the campaign
  ends). No debt.

What it skips: the campaign's missions themselves (none is offered again) and
its side plots (the Wolf Pack, the Conservatory, the stack core hunt). The
post-campaign content still comes: the epilogue missions, the war reactions,
the Deep memorial, Geminus and Martini rebuilt. The path it reproduces is the
Reconciliation ending (the defector rescued at New Tibet) on the honorable
branches: the Susquehanna's word accepted at Hope, diplomacy at Thule instead
of the attack on Greenrock, the Navy prisoners released, Poisonwood liberated
with the Oathkeepers, and Bloodsea joining the Free Worlds.

You start landed on Earth, where the Council's commission opens (it needs the
Dado loader, like the rest of the mod); **Accept the commission** makes you a
Free Worlds Commodore, and the first hour begins (see "The first hour").

The start also applies Diplomacy's own event `diplomacy: luna navy yard`: Luna
sells the Navy Advanced hulls (see "Luna's Navy yard").

The start is `data/diplomacy fw veteran.txt`, generated from the game's data by
`tools/fw-veteran/emit.py` (the path it follows, and why, is in
`tools/fw-veteran/path.py`). After the game's campaign changes, make it again
and check it (Python 3, standard library only):

```sh
python3 mods/diplomacy/tools/fw-veteran/emit.py <endless-sky>/data
python3 mods/diplomacy/tools/fw-veteran/check.py <endless-sky>/data
```

`check.py` confirms the file is current, that every event and condition the
campaign's missions apply is reproduced or is on a branch the path does not
take (it lists each with its reason), that every name exists in the game's
data, and that the territory gives each faction its capital.

## Layout

```
mods/diplomacy/
  plugin.txt          the plugin's name and description
  data/               diplomacy.txt (flotilla governments, Dispatches jobs, the Luna yard event),
                      diplomacy factions.txt (rebel governments and fleets, generated),
                      diplomacy jobs.txt (faction jobs, generated by tools/gen-jobs.mjs),
                      diplomacy news.txt (spaceport news) and
                      diplomacy fw veteran.txt (the Free Worlds Veteran start, generated)
  src/                the mod, in DadoScript: Diplomacy.dados is the entry class
                      (extends es.Mod), and the other classes it uses; Regions.dados and
                      Trade.dados (data prices of food, medicine, clothing) are generated
  debug/              the separate "Diplomacy Debug" plugin (plugin.txt and data,
                      no code): see Debug mode
  test/
    sim.test.mjs      the long simulation test (4000 days of invariants)
    factions.test.mjs the faction model's tests (minors, rebellion, wars, peace, operations...)
    m2.test.mjs       M2's tests (squadrons, rivals, fog, supply, occupation, prices, the bus, on_save)
    harness.mjs       builds the mod once and drives a mock game; mock.mjs is the mock Game
    galaxy.mjs        reads the galaxy from the game's data (the Veteran start's territory)
    galaxy.json       the galaxy the tests use, a snapshot made by tools/make-galaxy.mjs
    ingame/           in-game tests: need a game build and the Dado loader
  tools/
    regions/          regions.mjs (the minors, hand-kept) and build.mjs (checks them, writes
                      src/Regions.dados, data/diplomacy factions.txt and the table below)
    gen-jobs.mjs      writes data/diplomacy jobs.txt (and the in-game tests' copies)
    make-galaxy.mjs   writes test/galaxy.json from the game's data
    qjs-time.mjs      times on_day in QuickJS, the game's engine
    deploy-debug.mjs  installs the Diplomacy Debug plugin
    fw-veteran/       emit.py writes the Free Worlds Veteran start, check.py checks it
```

`npm run build -- mods/diplomacy` writes the plugin to `dist/Diplomacy/`
(`plugin.txt`, `data/`, and the mod as `scripts/diplomacy.js`).

## Factions and minors

Human space (every Republic, Free Worlds, Syndicate, pirate and independent
system of the Free Worlds Veteran galaxy, 195 systems) is divided into
**minors**. A major's territory is its **core** (the minor around its capital:
the major itself) plus the other minors it holds. Each non-core minor has a
**default parent** (who held it at the end of the campaign, or before the war
for the Dirt Belt's middle), may be **split** between two sides, and may
**rebel**. Pirate holdings belong to no major and are never taken (the pirates
raid from them).

**Capitals:** the Republic's is **Sol** (Earth, its Parliament), the Free
Worlds' **Gamma Corvi** (Bourne, "the capital of the Free Worlds" in the
prologue), the Syndicate's **Markab** (Hephaestus, its headquarters in "FW
Syndicate Diplomacy 1"). A capital is never captured, ceded or handed over.

The table is made from `tools/regions/regions.mjs` by `tools/regions/build.mjs`,
which checks it against the game's map (every human system in exactly one
minor, each minor contiguous over its own lanes but for pirate dens, each core
holding its capital) and writes `src/Regions.dados` and the rebels' data. The
counts are the Veteran galaxy's (four months in, after the start's scheduled
events: the Navy leaves Algenib, which the pirates take back).

<!-- regions -->
| Minor | Default parent | Systems | Key systems | Rebels |
|---|---|---|---|---|
| Earth | **Republic (core)** | 13 (Republic 13) | capital **Sol**; Sol, Alpha Centauri, Sirius, Eteron, Altair, Vega, Nocte, Denebola, Fingol, Merak, Regulus, Porrima, Muphrid | — |
| The Paradise Worlds | Republic | 15 (Republic 15) | Procyon, Capella, Aldebaran, Menkalinan, Pollux, Castor, Talita, Alhena, Miaplacidus, Alphard, Tejat, Kursa, Wazn, Phurad, Elnath | Paradise Secession |
| The Deep | Republic | 13 (Republic 13) | Wezen, Naos, Aludra, Suhail, Regor, Avior, Markeb, Aspidiske, Epsilon Leonis, Adhara, Gomeisa, Zosma, Dubhe | Deep Compact |
| The Far North | Republic | 12 (Republic 12) | Gorvi, Mintaka, Tortor, Alnitak, Saiph, Rigel, Mebsuta, Betelgeuse, Mirzam, Alheka, Canopus, Phact | Northern Free States |
| The Northern Rim | Republic | 9 (Republic 9) | Hassaleh, Danoa, Sumar, Rajak, Ultima Thule, Cardax, Volax, Sospi, Nihal | Thule League |
| The Western Dirt Belt | Republic | 15 (Republic 15) | Algieba, Tania Australis, Lolami, Mora, Fala, Phecda, Delta Velorum, Turais, Algorel, Gacrux, Cor Caroli, Muhlifain, Limen, Orbona, Terminus | Dirt Belt Union |
| The Central Dirt Belt | Republic | 14 (Republic 7, Free Worlds 7) | Mizar, Ipsing, Arcturus, Holeb, Rutilicus, Vindemiatrix, Sarin, Alioth, Alphecca, Boral, Seginus, Wei, Alnasl, Eber | Belt Free Worlds |
| The Eastern Dirt Belt | Free Worlds | 12 (Republic 4, Free Worlds 8) | Menkent, Cebalrai, Hintar, Kaus Borealis, Rasalhague, Zeta Aquilae, Orvala, Ascella, Naper, Peacock, Tais, Kaus Australis | Eastern Belt Alliance |
| The Rim | **Free Worlds (core)** | 16 (Free Worlds 16) | capital **Gamma Corvi**; Gamma Corvi, Spica, Minkar, Mimosa, Kraz, Acrux, Izar, Zeta Centauri, Hadar, Alkaid, Kochab, Zubeneschamali, Ildaria, Zubenelgenubi, Sabik, Unukalhai | — |
| The South | Free Worlds | 11 (Free Worlds 11) | Kornephoros, Aldhibain, Sargas, Lesath, Rastaban, Girtab, Dschubba, Atria, Han, Alpha Arae, Delta Sagittarii | Southern Pact |
| The Southern Frontier | Free Worlds | 7 (Free Worlds 6, Republic 1) | Alniyat, Antares, Pherkad, Yed Prior, Kappa Centauri, Beta Lupi, Graffias | Bloodsea Free Captains |
| Tarazed's Reach | Free Worlds | 9 (Free Worlds 9) | Tarazed, Umbral, Dabih, Lurata, Albireo, Sadr, Albaldah, Eltanin, Nunki | Tarazed Directorate |
| The Core | **Syndicate (core)** | 16 (Syndicate 16) | capital **Markab**; Markab, Ankaa, Fomalhaut, Delta Capricorni, Scheat, Al Dhanab, Alpheratz, Ruchbah, Algol, Hamal, Alpha Hydri, Achernar, Polaris, Schedar, Mirach, Gamma Cassiopeiae | — |
| The Upper Core | Syndicate | 6 (Syndicate 6) | Moktar, Mirfak, Bellatrix, Menkar, Zaurak, Sheratan | Upper Core Cooperative |
| The Earthward Worlds | Syndicate | 4 (Syndicate 4) | Acamar, Kugel, Diphda, Caph | Earthward Assembly |
| The Lower Core | Syndicate | 4 (Syndicate 4) | Matar, Alnair, Alderamin, Persian | Lower Core Syndics |
| The Northern Pirate Worlds | pirates | 5 (Pirate 5) | Arneb, Unagi, Hatysa, Almaaz, Alnilam | — |
| The Core Pirate Worlds | pirates | 7 (Pirate 7) | Alcyone, Oblate, Durax, Misam, Almach, Gienah, Algenib | — |
| The Southern Pirate Worlds | pirates | 7 (Pirate 6, Independent 1) | Citadelle, Alpherg, Belenos, Fumalsamakah, Thuban, Men, Shaula | — |
<!-- /regions -->

Why these lines: the names are the game's own regions (planet attributes
"paradise", "deep", "north", "dirt belt", "rim", "south", "core", "near earth",
and the map's labels), and each minor follows the lanes. Lore notes are in
`regions.mjs`. In short: the **Central and Eastern Dirt Belt** are where the
war's front ran and stay split between the Republic and the Free Worlds; the
**Southern Frontier** holds Bloodsea (Antares), which joined the Free Worlds,
and Poisonwood (Graffias), still the Republic's; **Tarazed's Reach** joined the
Free Worlds late; the **Earthward Worlds** are the Syndicate's worlds one jump
from Sol. The Free Worlds and the Syndicate share no border at first.

**Rebel factions** are sides of their own (`Factions`: 5 + the minor's index),
with a government defined in `data/diplomacy factions.txt` (display name and
colour, the parent's swizzle) and two fleets, "Small <rebels>" and "Large
<rebels>", copied from the parent's "Small"/"Large" fleets under the rebels'
flag. They are minor-sized: no core and no capital. Promoting a long-lived one
to a major is left for later milestones.

## What it does

* **Turning it on.** It is opt-in, so it can be installed on a save that has
  already finished the Free Worlds campaign. While `free worlds plot
  completed` is set and Diplomacy is not on yet, landing opens **A Council
  commission**: Alondo Gruyere writes that the Senate's defense committee has
  kept your commission open. **Accept the commission** makes the pilot a Free
  Worlds **Commodore** at the campaign's 8,900 credits a day; **Not now** (no
  offer on landing until the game restarts; the planet button stays) and
  **Never** (off for that pilot). The test override `diplomacy: force active`
  and debug mode turn it on without asking, with no membership.
* **Several wars at once.** Up to **3** wars run side by side (a rebellion or
  a defection, which cannot wait, may make it **4**; at 4 a rising is put down
  for now). A new war is declared at most once every 8-20 days, and none
  against a faction already fighting two. **Never two wars between one
  pair:** a rising or a forced war between a pair already at war widens that
  war instead (new goals, up to 4, and a later end; a crisis becomes the
  rising's kind of war). Each war has two sides, one or two
  **goals** (minors), a reason ("split", "claim", "border", "defection"...), a
  **score** and each side's **exhaustion**, and a kind: a **border crisis**
  (limited: one goal, 25-45 days, over at a score of 30), a **war** (40-90
  days, sometimes with a counter-goal for the defender), a **rebellion**, a
  **defection war** (60-120 days) or a **reconquest** of a rebel minor.
* **The war-likelihood rule.** Each pair of factions has a war pressure, a
  chance per day:
  * each minor **both hold part of** adds **0.40%**, growing by half again for
    every 120 days the split goes without a war between them, up to 3 times;
  * each minor one side **claims** (its default parent, or a minor it lost
    systems of in the last 1500 days) that the other holds, on its border,
    adds **0.12%**;
  * each **whole** minor of the other's on its border adds only **0.04%**, or
    **0.40%** while the other is at war and tiring (exhaustion 20%+): an
    opportunity;
  * a major facing rebels who hold a minor it claims adds **0.45%**;
  * **grudges** (6 points per system lost in a war, decaying one point every
    15 days) multiply it by (20 + grudge) / 20;
  * a **truce** of 25-70 days follows every peace (200-400 days of recognised
    independence after a rebellion the rebels did not lose), when it is 0;
  * the player's faction, quiet for 45 days, has its pressures quadrupled, so
    there is always something going on.

  In the tests, with the Veteran galaxy's three split minors the Republic and
  the Free Worlds go to war after a median of 59 days; with the same minors
  whole, 326.
* **Goals and fronts.** A war's goal is the defender's minor on the
  attacker's border that scores best: split ones first, then the attacker's
  claims, then the rest; a core now and then (it scores about level with a
  plain whole minor: about 1 war in 10 is over a core, never its capital), and
  near the player for the first war. Flotillas attack only systems in the war's goals; a side with
  nothing to take there holds its goal system nearest the enemy and intercepts.
* **Peace terms.** When a war ends (by its date, a side's exhaustion reaching
  100%, a crisis decided, or a side holding nothing), a side with a score of
  **15** or more wins. Core systems taken **in that war** go back to their
  major, unless the side that took them won with a score of **60** or more (on
  a draw they stay where they are). The loser gives back what it took from
  the winner in that war. A winner holding **60%** of a goal minor's systems (of
  those the two hold) is ceded the rest of it. An old parent that wins a
  rebellion or a defection war gets back every system that rose (they count as
  taken in that war). Without a winner
  each keeps what it holds (a defected minor stays with its patron, split if
  the old parent took part of it); a rebellion the rebels did not lose ends in
  recognised independence. The chronicle gives the terms:
  "Peace: The Free Worlds win the war over the Central Dirt Belt against the
  Republic; the Republic give back 1 system; the Republic cede the Central
  Dirt Belt (5 systems)."
* **Unrest.** Every non-core minor has an unrest (0-100) that drifts 3% of the
  gap a day toward a target: 8, plus 2 per jump from its owner's capital past
  3, plus **22 under foreign rule** (an owner that is not its default parent),
  plus 8 if split, plus 4 per war its owner fights and its owner's worst
  exhaustion / 5, plus the owner's **defeats** (20 per war lost, 5 per system
  lost, decaying 1 a day), its **core shock** (25 per core system lost,
  decaying 1 every 2 days) and the minor's **neglect** (3 per day pirates
  plunder it unopposed, at most 20, decaying 1 a day).
* **Rebellion.** Above unrest **40** a minor held by a major (two systems or
  more) may rise: a chance per day of (unrest − 40)² / 400 percent, at most
  once in 600 days. **A core never rises.** How it goes, by weight:
  * **secession**, weight 100: the owner's systems in it go to its rebel
    faction (a real government), at war with its old parent at once over the
    minor (a rebellion); other majors may later go to war with the rebels to
    take it (a reconquest). It stays independent until it is taken back;
  * **defection** to a major on its border, weight 40 each, +60 if that major
    is its default parent, +30 if it already holds part of it, halved if that
    major already fights two wars, scaled by the two majors' sizes: its systems
    go to the new patron, and the old parent declares war at once with the
    minor as the goal ("Bloodsea defects to the Republic (7 systems); the Free
    Worlds declare war to take it back."). Its garrisons fight for the patron.
    With no major on its border, it secedes;
  * a separatist faction losing its war (exhaustion 60%+) may ask a major on
    its border for **protection** (1.5% a day): it is annexed, and its war
    becomes a defection war between that major and the old parent.

  Over 4000 days a pilot sees about 4-5 risings (13 secessions and 8
  defections over 5 test pilots, and 1 annexation).
* **Flotillas.** A side at war launches flotillas (small 70, medium 140, large
  250 strength, scaled for ship quality; rebels at 70%) from its system nearest
  the objective: at most 4 per major and 2 per rebel faction (flotillas going
  home do not count), and in any one war at most 3 or its share of those among
  the wars it fights (2 each in two wars). The wars take turns launching first,
  and a war a side has no flotilla in yet launches twice as readily. A flotilla moves one jump a day by the shortest lane path inside
  human space (distances are cached; the lanes are re-read when an event cuts
  or restores them). If an enemy flotilla is nearer than its objective it goes
  after it. Hostile flotillas in one system fight each day.
* **Sieges, captures and consolidation.** At its objective a flotilla besieges
  the garrison (from the planets' defense fleets, 140-400 strength; rebels hold
  theirs at 80%). A siege takes about 5 days, never under 2. When the garrison
  falls the system changes hands (a world change, saved with the pilot). A
  fresh capture **consolidates**: its garrison starts at 60%, stands at 150% of
  full for 20 days and recovers 15% a day, so it is not simply taken back the
  next week. After 10 days without a siege its **patrols** become the new
  owner's: the first time a system leaves its original owner, every fleet named
  for that owner (its patrols, "Republic Logistics", "Navy Surveillance", the
  Oathkeepers and Deep Security; the Free Worlds' militia) is removed and kept,
  and the new owner's "Small"/"Large" fleets are added; between later owners
  those two are swapped; back with its original owner, the system gets its own
  fleets again (at standard periods, since the game does not say what theirs
  were). The captures, swaps and attitude changes of a
  day go to the game as **one** world change (one saved event a day at most).
  Over 4000 days a war flips about 8 systems and moves 3-4 for good (the old
  version flipped 22 and moved 3).
* **Pirate raids**, **relief flotillas** and **commanders** work as before:
  raids (12% a day, up to 4) visit 2-3 inhabited systems of the factions and
  rebels within 4 jumps of a pirate system (read from the day's owners, so a
  system that turns pirate, like Gienah and Algenib 47 days into the Veteran
  start, raids from the next day), plundering the garrisons (and
  adding to the minor's neglect); a major whose space is raided sends relief
  (60% at peace, 10% at war). Every flotilla and raid has a named commander
  (bold, cautious, methodical, reckless) from its side's roster of 5; rebels'
  are "Commander"s. Commanders count victories and may die with their
  flotillas.
* **Sim score.** Every fight rolls a winner each day with odds score_a :
  score_b, score = strength × quality × the commander's attack; quality from
  the real ships of each side's fleets (rebels: their parent's), normalised so
  that an average faction is 1.0, and fleet sizes balance most of the
  difference (the Free Worlds field about 2× the strength, the Syndicate 1.3×).
* **In person.** A player who flies to a flotilla's system finds its ships
  there, and during a siege the defenders; what the player sees destroyed is
  gone from the simulation, and defenders the player helps wipe out hand the
  system to the besieger.
* **The Faction panel.** In a system a faction or rebel faction holds, the
  planet screen has a **Faction** button. Its panel gives the faction's wars
  and standing and a **table of its minors** (held, unrest, status: held,
  split, war goal, rebels, lost), with **Join**/**Leave**, **War Room**,
  **Service Record** and **Close** (keys 1, 2, ...).
* **The War Room** is a full screen: **Wars** (a row per war: sides, goals,
  score, day; choose one for its exhaustion, captures and who holds its goals)
  with a chart of each major's territory over time; **Forces** (every flotilla,
  raid and siege); **Minors** (owner, holdings, unrest; a split minor shows
  both sides) with a chart of the rebels' territory; and **Chronicle** (the
  newest 60 named events: "Siege of Alioth, day 6: Alioth falls to the
  Republic.", "Peace: ...", risings, defections, commanders fallen, reliefs).
* **On the map** each flotilla and raid has a marker and a line, a siege a
  "Siege: 40%" marker, every system still to be taken in a war a ring in the
  attacker's colour, and every minor a label: "Paradise Worlds (Republic)",
  "Rim (Free Worlds core)", "Central Dirt Belt (split)", or "East Dirt Belt,
  front: Republic / Free Worlds" while a war is about it. The side panel gives
  the details.
* **Messages.** Events that concern the player's faction (its wars declared
  and ended, captures in its wars, its minors rising, its commanders fallen)
  are messaged at once; everything else goes into one **daily digest**
  ("Elsewhere: ... And 2 more events; see the War Room.").
* **Spaceport news** (`data/diplomacy news.txt`): people talk about their
  faction's war, the border crisis on Dirt Belt worlds, the split Belt and the
  rebellions, by the conditions below.
* **Operations.** On landing, the job board offers work made from the live
  war, near the player (4 jumps), up to 3 at a time:

  | Operation | When | Outcome written back |
  |---|---|---|
  | Relieve the siege of X | an enemy besieges your faction's system | the besiegers lose 45%; the garrison +30%; score +3; Relief Star |
  | Supply the siege of X | your flotilla besieges an enemy system | it gains 20% strength, the garrison −25%; Siege Cross |
  | Intercept (commander) at X | an enemy flotilla in your war | it loses 45%; score +3; Interceptor's Ribbon |
  | Supply the garrison at X | your system in a war's goals | its garrison stands at 130%; Quartermaster's Medal |
  | Hunt the raiders under (captain) | a pirate raid nearby | the raid loses 45%; Raider's Bane |
  | Hunt the rebels under (commander) | a rebel flotilla nearby | it loses 45%; Loyalty Medal |
  | Volunteer: intercept (commander) | your faction at peace, another war nearby | as Intercept, for the other side; Volunteer's Ribbon |

  Each job's "on complete" sets `diplomacy: op <key>` to 1 (its "on fail" adds
  2); the next day the mod applies the outcome, clears the condition and
  awards the medal. The mod tracks each job it offers (24 at most); every new
  offer of the same job renews its track (the deadline, 20 days, runs from the
  offer the player takes), a track is kept while its job is taken and for 45
  days after its last offer, and a new track clears any outcome left from an
  earlier job of that name, so each outcome is applied once, to its own job. The static jobs feed the war too: scouting and courier
  kills add to `diplomacy: intel`, warship kills to `diplomacy: blows` and
  Dispatches to `diplomacy: dispatches`, turned into score (and less
  exhaustion) for the member's faction in its first war.
* **Medals and the service record.** Each operation done earns its named
  decoration (`diplomacy: medal <id>` counts them: relief, siege, intercept,
  supply, raiders, rebels, volunteer, envoy, investigate). The **Service
  Record** screen lists them with their dates and citations (the newest 40),
  with the member's rank, merit and operations done.
* **The first hour** (the Free Worlds Veteran, or any campaign veteran who
  accepts): an uneasy peace. On landing in the first month the job board offers
  two introductory operations: **escort Alondo's envoy** to a Free Worlds
  world on the split border (it halves that minor's unrest), then **Freya's
  inquiry** into a raid made with Republic surplus codes. **Between days 10 and
  20** a **border crisis** breaks out between the player's faction and its
  likeliest rival over a minor they share, the one nearest the player
  (`diplomacy: crisis minor`). No other war comes before it. While the
  Reconciliation is young (`free worlds reconciliation`, the first 300 days),
  every war between majors is a limited border crisis.
* **Luna's Navy yard.** The campaign wrecks Geminus (event "war begins" clears
  its shipyard), the only world selling the Navy Advanced hulls (Frigate,
  Cruiser, Carrier, Auxiliary), until "geminus rebuilt" 90 days after the
  campaign; and in Diplomacy Geminus (Castor, in the Paradise Worlds) can change
  hands. So Luna, in Sol, which is never taken, sells them too: the event
  `diplomacy: luna navy yard` (a planet's `shipyard` line in an event adds to
  its yards; Luna keeps its own) is applied by the Veteran start, and for any
  other pilot the mod applies the same change once (`diplomacy: luna yard`)
  when the campaign is over or Geminus lies wrecked.
* **Joining, rank, salary and licenses** work as before: merit per enemy ship
  (1) and per operation and job; ranks Recruit 0 to Admiral 400 merit; salary
  200 to 12,000 a day (Commodore 8,900, through `salary: Free Worlds` for the
  Free Worlds); the Republic's Navy licenses at Lieutenant, Captain, Commodore
  and Admiral. Members are allies of their faction's flotillas (+10) and
  enemies of the flotillas and rebels it is at war with (−10).
* **A member lands anywhere in their faction.** Joining raises standing with
  the faction's own government (the one that owns its worlds) to at least 100,
  whatever it was, and keeps it there while a member, so every world of theirs
  lets the member land (Earth asks for 2, Hermes 10, Arachne and Huginn
  Stations 20, Alexandria, Pilot and Carbuncle Station 100). Leaving takes back
  what membership added, but no lower than neutral: an old grudge stays
  forgiven. While a member, the faction's worlds are drawn in their own colour
  on the map (magenta, `member_color`); its usual colour returns on leaving.
* **Faction jobs** (`data/diplomacy jobs.txt`, generated by
  `tools/gen-jobs.mjs`): while the member's faction is at war with another
  major (`diplomacy: enemy`), its job boards offer courier and scout kills,
  scouting, warship kills and breaking a warfleet, as before; there are now
  copies for the Free Worlds and the Syndicate against each other too.

## Command and consequence (M2)

**Squadrons.** From Commodore up, a member commands squadrons: one at
Commodore, two at Admiral and Fleet Admiral, three at High Admiral (two new
ranks above Admiral, 700 and 1100 merit, named per faction: Fleet Admiral and
Grand Admiral, Vice Marshal and Marshal of the Free Worlds, Senior Director and
Executive Director; salaries 15,500 and 19,000). In the War Room's **Command**
tab (shown only when the rank allows one) the player picks a squadron, or "Form
a new squadron", and an order: **attack** an enemy system of a war, **relieve**
one of the faction's besieged systems, **hunt** an enemy flotilla or a pirate
raid, or **hold**. A squadron takes one of the faction's flotilla places (when
every place is taken, the faction's flotilla nearest the target comes under the
player's command); it forms at the faction's system nearest the target and
fights like a flotilla (a flotilla taken over keeps no siege or relief: those
are never taken). Its strength is a medium flotilla's plus one point per
50,000 credits of the player's own fleet, its ships counted at half a new
one's price (`model_cost`; the API has no resale value) and, on mod API 10,
parked ships left out; at most 200. Each day it is held to the lower of its
strength at formation and what the fleet would give now, so selling the fleet
weakens it. It fights at 130% while the player is in its system (its ships are
friendly to the player). Orders name only forces the faction can see (fog of
war); a hunted force that slips out of sight is followed to where it was last
seen, and the squadron holds there. An order carried out (the system
taken, the siege lifted, the quarry gone) leaves it holding, with a message.
Losing one costs 15 merit and 5 reputation with the faction, is in the
chronicle, and no new one forms for 30 days. A peace leaves squadrons holding where they are; leaving the faction
or falling in rank stands the extra ones down.

**Rival commanders.** Each named commander keeps a history with the player
(3 a battle against the player's squadron or the player in person, 1 a ship the
player destroys). At 12 a commander becomes a **rival** (one per side, two at
most) with a trait: *grudge* (125% against the player's squadron), *learned
tactics* (takes 80% of the damage from the player's squadron), *veteran* (attack 115%), *siege engineer*
(sieges 135%) or *ambusher* (reaches 4 jumps farther after the squadron).
Rivals seek out the player's squadron; their side puts a price on the player's
head (bounty hunters may come looking: "diplomacy: bounty", which clears if the
player comes to serve that side; one hunters' mission at a time), and the player's
faction posts a bounty job on the rival. Destroying a rival in person always
kills them, and earns the **Nemesis Star**. Commanders are promoted at 5 and 10
victories and die in battle; both are in the chronicle and the spaceport news.

**Fog of war.** The map and the Forces tab show enemy flotillas only within 1
jump of the faction's territory or its flotillas (2 jumps of the player for a
non-member), or in scouted systems; others keep a faded "seen N days ago" label
for 20 days where they were last seen (at most 32). A scouting job reveals the
system and its neighbours for 10 days.

**Supply.** A flotilla within 2 jumps of one of its side's depots (an inhabited
system it holds) fights at full strength, 8% less per jump farther, down to
70%. A depot raid job puts a depot out for 20 days; a blockade run reinforces a
besieged garrison.

**Occupation and reconstruction.** A system that changes hands gets occupation
unrest (60, or 25 in a minor the occupier calls home), and a capture adds 30
damage; unrest falls 0.5 a day and damage 0.2. The garrison stands at 100 −
unrest/2 percent, the minor's unrest rises a little (at most 4 points), and
jobs appear nearby: put down the resistance (or arm it, for the side that lost
the system), carry refugees, haul reconstruction materials. Damage, by tiers of
30, raises food, medicine and clothing prices there by 12% a tier (batched into
the day's one event) and, unless another mod manages shipyard stock, trims the
shipyards (untracked hulls to 1 at tier 1, none from tier 2; untracked again
when repaired) and, on mod API 10, the outfitters' munitions (Meteor and
Sidewinder missiles, Javelins, Heavy Rockets, Torpedoes: 10 at tier 1, none
from tier 2). A count another mod set is never touched. A side down to under 60% of its home systems **rallies**: its
garrisons stand at 150%, its minors do not rise, it declares no war and none is
declared on it, a war it is in ends once it has run 30 days, captures from it
count half, and no peace takes minors from it; and at most one rising against a
side comes in 240 days.

### Prices: the convention

Diplomacy and Corporations both change commodity prices with `trade` events,
which write absolute prices. So:

* Diplomacy changes a price only by **its own delta**: it reads the price now
  (mod API 10's `trade_base_price`; on API 9 the data price, from the generated
  `src/Trade.dados`, plus its own delta), takes its own delta off, and writes
  that plus the new delta. Restoring writes the price without its delta. A
  change another mod made meanwhile stays (on API 10).
* It never writes a price Corporations has raised in a **crisis** it announced on
  the bus (`corporations.crisis`: that system and its neighbours, those
  commodities, until 5 days after the crisis ends), and catches up afterwards
  (prices are checked every 5 days).
* On an **API 9 game with Corporations enabled** it changes no prices and no
  shipyard stock at all, since it cannot see Corporations' crises there.
* **Corporations turned on later:** on the first day it is enabled, Diplomacy
  untracks every hull and outfit count it set that is still the count it set
  (one a sale or Corporations has changed since is left alone), takes every
  price delta it wrote off again on API 9, and keeps out from then on.
* Corporations, restoring a crisis, writes back the price from before it, which
  includes Diplomacy's delta then; Diplomacy's next check puts its own delta
  right. Another mod can follow the same rule: only its own deltas, never a
  price reserved by someone else's announced crisis.

## Deploying

You need the SDK set up (`npm install`, and `dadoc` on your `PATH`: see the
SDK's GUIDE.md, section 1) and a game built with Dado mods on. From the
`es-mods` folder:

```sh
npm run deploy -- mods/diplomacy                          # into your user plugins folder:
                                                          #   macOS ~/Library/Application Support/argosy/plugins/Diplomacy
                                                          #   Linux ~/.local/share/argosy/plugins/Diplomacy
npm run deploy -- mods/diplomacy --to <game-root>/plugins # into a game run from its source folder
```

It builds the plugin into `dist/Diplomacy/` (`plugin.txt`, `data/`, and
`scripts/diplomacy.js`) and copies that folder to `<plugins>/Diplomacy`. The
game runs it only with the Dado loader installed (`npm run install-loader`).

**Keep only one copy installed.** A game run from its source folder loads
`<game-root>/plugins` as well as your user plugins folder, and when two
plugins have the same name it keeps the one in `<game-root>/plugins` and skips
the other. So a `Diplomacy` (or `Diplomacy Debug`) left in `<game-root>/plugins`,
for example by the old `tools/deploy.sh`, hides the one you deploy to your user
plugins folder. Remove the old copy, or deploy with `--to <game-root>/plugins`
so that it is replaced.

## Debug mode

Debug mode is a second plugin, **Diplomacy Debug**, kept in `debug/`. It has
no code of its own, so `npm run deploy` does not install it:
`tools/deploy-debug.mjs` does, beside Diplomacy:

```sh
npm run deploy -- mods/diplomacy                                   # Diplomacy first
node mods/diplomacy/tools/deploy-debug.mjs                         # then Diplomacy Debug, into your user plugins folder
node mods/diplomacy/tools/deploy-debug.mjs --to <game-root>/plugins
node mods/diplomacy/tools/deploy-debug.mjs --remove [--to ...]     # take it out again
```

While it is enabled the mod runs on any pilot from day 0; if the Free Worlds
hold no systems yet they are given the 28 systems of the campaign's `war
begins` event; the Republic and the Free Worlds are kept at war (a 3-day truce
at most); a flotilla launches whenever a faction has room; once per pilot the
map is revealed and 100,000,000 credits are added; and every launch and siege
is announced (`[Diplomacy debug] …`). Use a test pilot: the changes are saved
with it.

## Testing

```sh
npm test                                                   # from es-mods: every test
node --test mods/diplomacy/test/sim.test.mjs               # the long simulation test
node --test mods/diplomacy/test/factions.test.mjs          # the faction model's tests
node --test mods/diplomacy/test/m2.test.mjs                # M2: squadrons, rivals, fog, occupation, prices, the bus
DIPLOMACY_DAYS=6000 node --test mods/diplomacy/test/sim.test.mjs
node mods/diplomacy/tools/regions/build.mjs --check        # the minors against the map
```

The tests build the mod with the SDK (once per run: `test/harness.mjs`) and
drive it with a mock `Game` (`test/mock.mjs`, every method the mod uses, API
2-9, and with `{ api10: true }` mod API 10's `has`, `notify`, `listen`,
`timing_section`, trade prices and outfit stock) over the real galaxy: `test/galaxy.json`, the game's map with the **Free
Worlds Veteran start's** territory (the game's dated events up to its start,
the events its intro applies, then those it schedules; the Free Worlds hold
57 systems). Make it again after the game's map or the start changes with
`node mods/diplomacy/tools/make-galaxy.mjs <endless-sky>/data`, or set
`ES_DATA=<endless-sky>/data` to read the data directly. Without `dadoc` the
tests fail, saying so (set `DIPLOMACY_ALLOW_SKIP=1` to skip them instead).

`sim.test.mjs` runs the offer, the commission, leaving and joining, and 4000
days with the player hopping around and fighting beside flotillas, and checks
every day: systems change hands only in a war over their minor, by treaty or in
a rising; capitals never; one world change a day; the cap on wars; the `at
war` flags, the flotilla attitudes and `war a`/`war b` (what Corporations
reads) match the wars; flotilla counts, strengths and places; markers, rings
(war goals only) and a label per minor; the planet button, reputations and
salary; the War Room's tabs, rows and charts; and the bounds on conditions,
saved state and messages.

`factions.test.mjs`: the minors are valid, contiguous, cover human space and
keep the capitals in the cores (and `src/Regions.dados` is current); a core
never rises; a secession forms its government, at war with its parent, which
takes it back (6 of 6 runs in part, all of it in 5); a defection hands the
minor to a bordering major and starts a war with it as the goal; with no major
on its border a minor secedes; both outcomes occur (30 risings of the Southern
Frontier: 14 secessions, 16 defections); several wars at once; war comes much
sooner over split minors than whole ones (median 59 days against 326, 20 pilots
each); peace terms cede a goal minor, return core systems, and a white peace
leaves borders be; losing a core system raises unrest in the major's other
minors; territory moves over 4000 days without a side swallowing the rest (5
pilots: 14-29 systems end with another owner; each major stays between 45%
and 180% of its start); operations write back (a relief weakens the besiegers
and awards the Relief Star; intel is read); the first hour (the envoy, the
inquiry, the crisis by day 20 over a shared minor); captures outside the
player's wars only in the digest; the chronicle, history, medals and
operations stay capped, conditions under 320 and the state under 40 KB; an old
save is migrated; and, from the review of M1: a reload of an earlier save of
the same pilot (or a second Veteran pilot accepting the same day) reads its
own world; re-offered operations renew their track and each outcome is
applied once; the pirates' attitudes name no government `""`; a second rising
widens the war a pair fights instead of starting another; the bus events (with
an API 10 mock game), and none on an API 9 game; Corporations' flotilla slots
and destroyed count; a system that turns pirate raids from the next day; patrols
follow the flag and come back with it; `diplomacy: crisis` returns to 0; core
systems are returned only when taken in that war and not on a draw; and a
capital is never taken even in a war over its core (removing the capital guard
in `Simulation.can_take` fails it).

`tools/qjs-time.mjs` times `on_day` in QuickJS (see its header for building
`qjs`): about 2.5 ms a day, 7 ms at worst (the loader's watchdog stops a hook
at 250 ms).

### In the game

```sh
ES_MODLOADER_LIB=<es-modloader>/build-release/linux-aarch64/libesdado.so \
  mods/diplomacy/test/ingame/run.sh <game-binary> <game-root> [test name...]
```

They pass on **loader 0.1.0** (mod API 9). The mod and the probe declare
`api_version()` 9, so a build made with the API 10 SDK still loads there.

```sh
```

`run.sh` runs the game's test framework (Linux, under Xvfb) with a fresh
config per test: the integration tests' config, the Dado loader, this mod, the
test plugin and the **Diplomacy Probe** (`test/ingame/diplomacy_probe`, a tiny
mod that sets `test: luna sells <model>` from Luna's shipyard listing).
`<game-root>` must not have a `Diplomacy` in its `plugins`.

* **War Begins**, **Flotilla In Person**, **Join And Leave**, **Licenses And
  Jobs**, **Veteran Offer**, **Pirate Raid In Person**, **Debug Mode**: as
  before (the panel's first button is still Join, and Accept).
* **Squadron Command** (M2): a Republic Commodore (set by conditions) gets a
  squadron from `diplomacy: force squadron` on the next arrival, and the
  `diplomacy: squadrons` / `squadron 1 ...` conditions report it attacking.
* **Squadron Command Panel** (M2): the same, joining through the Faction panel
  and opening the War Room's Command tab. Panels are closed with their Close
  button, never Escape (which opens the game's main menu over a mod panel).
* **Veteran Start**: the Free Worlds Veteran start's conditions, events,
  reputations, ship and credits; the commission makes a Commodore; Luna sells
  the Frigate, Cruiser and Carrier.
* **Border Crisis**: on the Veteran start, the crisis is set for 10-20 days
  after the commission; brought forward (`diplomacy: force crisis`), it is a
  border crisis (war kind 1) of the Free Worlds over a minor (`diplomacy: crisis
  minor`). (Waiting the days out by taking off and landing is stopped at random
  by the campaign's landing conversations.)

## How it works

| File | |
|---|---|
| `src/Diplomacy.dados` | the entry class: wires the parts, routes the hooks, loads and saves the state, migrates old saves, the Luna yard |
| `src/Tuning.dados` | **every tunable number** |
| `src/Regions.dados` | the minors (generated by `tools/regions/build.mjs`) |
| `src/Factions.dados` | the sides: majors, pirates, rebel factions; governments, capitals, fleets, colours, ranks |
| `src/World.dados` | the state in memory, and its JSON (`Game.data("state")`) |
| `src/State.dados` | the conditions published for missions and other plugins; clearing an old save's |
| `src/Json.dados`, `src/Rng.dados` | JSON writing and reading; a deterministic Park-Miller generator |
| `src/Galaxy.dados` | the lane graph inside human space, cached distances, ownership, minors' holdings |
| `src/War.dados`, `src/Flotilla.dados` | one war; one flotilla or raid |
| `src/Politics.dados` | unrest, rebellion, defection, protection; war pressure, goals, declaring; peace terms; captures; patrol swaps |
| `src/Simulation.dados` | launches, raids and relief, movement, battles, sieges, plunder, homecomings |
| `src/Garrisons.dados`, `src/Admirals.dados`, `src/Quality.dados` | damaged garrisons; commanders; the sim score |
| `src/Changes.dados` | the day's world changes, sent as one `game.change` |
| `src/Chronicle.dados` | the chronicle, the daily digest, the territory history, medals, dates |
| `src/Operations.dados` | jobs from the live war, the first hour's operations, outcomes |
| `src/Battlefield.dados` | spawning flotillas and defenders in person, syncing their strength back |
| `src/Service.dados` | the Faction panel, the War Room and the Service Record; membership, merit, rank, salary, reputations |
| `src/MapView.dados` | the map overlay |

**The state.** Everything the simulation keeps is one JSON text stored with
the pilot (`Game.data("state")`, mod API 6), about 11 KB: the wars, flotillas,
garrisons, captures, per-minor unrest and claims, per-side defeats, grudges
and truces, the rosters, the chronicle (60), the history (120 samples), the
operations (24) and medals (40), and statistics. `world` (a random number
drawn when the pilot's world is made) and `rev` (also in storage) tell the mod
when another pilot, or an older save of this one, was loaded: a revision is
`"<n>.<session>"`, where n is a high-water mark that only grows in a game
session (it is never reset on a load) and the session token is drawn once per
session, so no two save histories of a pilot share one (Corporations' scheme).
On mod API 10, `on_pilot_loaded` also makes the mod read the state again. It
is written after every simulated day and every change in person.

**Wars never touch the game's own politics.** Major flotillas fly under the
plugin's `Republic Flotilla`, `Free Worlds Flotilla` and `Syndicate Flotilla`
governments; a war sets those pairs hostile. A rebel faction's government owns
its systems and its flotillas fly under it; while it is at war with a major,
it and that major's real government are hostile too, so the navy's patrols
fight it. A capture is `system "X"` / `government "<owner>"` on the real
government, saved with the pilot.

## Conditions

The conditions are what missions and other plugins read; the mod writes each
only when it changes. About 150 are written in a typical game, at most about 310.

| Condition | Meaning |
|---|---|
| `diplomacy: active`, `activated`, `declined`, `last day` | on (1); the day it started; Never chosen; the last day simulated |
| `diplomacy: member`, `merit`, `rank`, `enemy` | the major the player serves (1 Republic, 2 Free Worlds, 3 Syndicate); merit (missions add to it); rank (0-8); the major the member's faction is at war with first (the faction jobs go by it) |
| `diplomacy: standing granted`, `colored` | standing (in hundredths) membership added with the faction's government, taken back on leaving; the major whose worlds are drawn in the member colour |
| `diplomacy: war a`, `war b`, `war since` | **one** war between two majors, the player's faction's first, as before: Corporations reads these |
| `diplomacy: at war 1`, `2`, `3` | 1 while that major fights any war |
| `diplomacy: wars` | how many wars are running |
| `diplomacy: war <k> a`, `b`, `goal`, `score`, `kind` | war slot k (1-4): its sides (sides: 1-3 majors, 5 + minor index a rebel faction), its first goal (minor index + 1, in the table's order), its score (positive: a is winning), its kind + 1 (1 crisis, 2 war, 3 rebellion, 4 defection, 5 reconquest) |
| `diplomacy: minor <short name> owner`, `contested`, `unrest`, `core`, `rebel` | per minor (`Paradise Worlds`, `Central Dirt Belt`...): the side holding most of it; 1 if split; unrest 0-100; 1 for a major's core; 1 while rebels hold part of it |
| `diplomacy: rebels` | rebel factions holding territory |
| `diplomacy: crisis`, `crisis day`, `crisis minor` | the first hour: the day the border crisis broke out (back to 0 once it is over); the day it is set for; its goal (minor index + 1) |
| `diplomacy: flotilla <s>.<k> strength`, `kind`, `at`, `goal` | side s's flotillas and raids, in slots k = 1..4 (1..2 for a rebel faction): strength; kind (0 war flotilla, 1 relief, 2 raid, 3 going home); system index + 1 (`game.system_at`) where it is and where it is bound; empty slots 0 |
| `diplomacy: medal <id>` | medals of each kind (relief, siege, intercept, supply, raiders, rebels, volunteer, envoy, investigate) |
| `diplomacy: op <kind> <target>` | set by an operation's job (1 done, 2 failed), read and cleared by the mod the next day |
| `diplomacy: intel`, `blows`, `dispatches` | added to by the faction jobs and Dispatches, read and cleared each day |
| `diplomacy: stat wars`, `launches`, `raids`, `captures`, `rebellions`, `defections`, `separatists`, `flotillas destroyed` | running counts (the rest of the statistics are in the state) |
| `diplomacy: ships here` | flotilla and garrison ships spawned in the player's system on arrival |
| `diplomacy: luna yard`, `pirate attitudes` | applied once: Luna's Navy yard; the pirates' hostility to the flotillas and rebels |
| `salary: Republic commission`, `salary: Free Worlds`, `salary: Syndicate commission` | the daily salary, paid by the game |
| `diplomacy: squadrons`, `squadron <k> at`, `goal`, `strength`, `order` | (M2) the player's squadrons, k = 1..3: system index + 1 where it is and where it is bound, strength, order (1 attack, 2 relieve, 3 hunt, 4 hold); empty slots 0 |
| `diplomacy: rivals`, `bounty` | (M2) rivals alive; 1 while one has a price on the player's head |
| `diplomacy: commander news` | (M2) 1 for 10 days after a commander's promotion or death |
| `diplomacy: occupied`, `damaged` | (M2) systems under occupation unrest; systems with damage |
| `diplomacy: stat squadrons lost`, `squadrons formed`, `rivals killed` | (M2) running counts |

### For Corporations (and other plugins)

The exact names to read, all bounded (Diplomacy writes at most about 310 conditions, most of them 0):

* `diplomacy: active` (1 while Diplomacy runs for the pilot).
* `diplomacy: wars` = n, and for k = 1..n: `diplomacy: war <k> a`, `diplomacy: war <k> b` (the two sides), `war <k> goal`, `war <k> score`, `war <k> kind`. Slots above n are 0. (`diplomacy: war a` / `war b` still name one war between majors, the player's faction's first, for readers of the old pair.)
* Sides: 1 the Republic, 2 the Free Worlds, 3 the Syndicate, 4 the pirates, and 5 + m the rebels of minor m, whose government is:

  | Side | Government | | Side | Government |
  |---|---|---|---|---|
  | 6 | Paradise Secession | | 14 | Southern Pact |
  | 7 | Deep Compact | | 15 | Bloodsea Free Captains |
  | 8 | Northern Free States | | 16 | Tarazed Directorate |
  | 9 | Thule League | | 18 | Upper Core Cooperative |
  | 10 | Dirt Belt Union | | 19 | Earthward Assembly |
  | 11 | Belt Free Worlds | | 20 | Lower Core Syndics |
  | 12 | Eastern Belt Alliance | | | |

  (Sides 5, 13, 17, 21, 22 and 23 are cores and pirate holdings, which never rebel; there are 23 sides, so a scan of sides 1..16 misses the Syndicate's rebels: scan 1..23.)
* `diplomacy: flotilla <s>.<k> strength`, `kind`, `at`, `goal` for s = 1..23, k = 1..4 (rebels 1..2): the live flotillas and raids of each side fill its first slots.
* `diplomacy: stat captures`, `diplomacy: stat flotillas destroyed`: running counts (an increase means a capture or a flotilla destroyed that day).

### The notification bus (mod API 10)

When the game has it (`Game.has("notify")`), Diplomacy posts these events, each
with a JSON payload (sides as above, systems by name, minors by short name):

| Event | When | Payload |
|---|---|---|
| `diplomacy.war` | a war is declared | `{"id":3,"a":1,"b":2,"a_government":"Republic","b_government":"Free Worlds","kind":"war","goals":["Central Dirt Belt"],"reason":"split","until":1100300}` (kind: border crisis, war, rebellion, defection war, reconquest) |
| `diplomacy.peace` | a war ends | `{"id":3,"a":1,"b":2,"winner":2,"moved":5,"score":-22}` (winner 0 on a draw; moved: systems changing hands by its terms) |
| `diplomacy.capture` | a siege takes a system | `{"system":"Alioth","by":1,"from":2,"war":3,"core":false}` |
| `diplomacy.battle` | hostile forces fight in a system (a day) | `{"system":"Holeb","a":1,"b":2,"loss_a":40,"loss_b":72}` (strength lost, before personalities) |
| `diplomacy.rising` | a minor rises | `{"minor":"Paradise Worlds","outcome":"separatist","from":1,"to":6,"from_government":"Republic","to_government":"Paradise Secession"}` (outcome: separatist, defection, annexation) |

Diplomacy **listens** for `corporations.*` (its payloads are in Corporations'
README) and answers:

| Event | Effect |
|---|---|
| `corporations.tender_delivered` | that government's next flotilla goes out at 125%, at most once in 60 days (an award alone does nothing; Corporations M3 tenders only for the Republic, whose Navy hulls are the only military ones) |
| `corporations.tender_failed` | its next flotilla goes out at 75% |
| `corporations.bankrupt` | a profiteering scandal: 6 defeat points (unrest at home) for each major at war, and a chronicle line |
| `corporations.convoy_lost` | in a war zone (held by a side at war, or a flotilla within a jump): a chronicle line |
| `corporations.crisis` | the prices it raised are left alone (see Prices: the convention) |
| `corporations.shortfall` | (Corporations M3) the side's warship shortfall, 0-100: its new flotillas are `shortfall × 40 / 100` percent weaker. With Corporations enabled the mod also reads `corporations: shortfall <side>` each day, so this works on API 9 too |

On an API 9 game (loader 0.1.0) there is no bus: nothing is posted or heard,
and Corporations' crises cannot be seen (hence the price rule above).

**Saving (mod API 10).** With `on_save` the state is written only when the game
writes the pilot; a day only writes a new revision the first time something
changes after a save, so an older save loaded later is always told apart (and
read). On API 9 the state is written every day, as in M1. `timing_section`
splits `on_day` into `politics`, `war`, `squadron`, `operations` and
`occupation` in the game's timing report.

Test overrides, which in-game tests and the console can set:

| Condition | |
|---|---|
| `diplomacy: force active` | non-zero: activate without the campaign |
| `diplomacy: force war` | `a*10+b` (12, 13, 23...): start a war of a on b the next day (ending one between them first), whatever the cap |
| `diplomacy: force peace` | non-zero: end every war the next day, with no terms |
| `diplomacy: force flotilla` | `f`: a medium flotilla of major f (at war) in the next system the player arrives in |
| `diplomacy: force raid` | non-zero: a medium pirate raid in the next system the player arrives in |
| `diplomacy: force rebellion` | minor index + 1: that minor rises the next day (a core does not); with `force outcome` 1 it secedes, 2 it defects if it can |
| `diplomacy: force crisis` | non-zero: the first hour's border crisis comes the next day |
| `diplomacy: force squadron` | system index + 1: on arriving in the next system, a member gets a squadron ordered to attack it (or their first war's first target), room or not |

**Old saves.** A pilot of the old version (active, with its state all in
conditions and none stored) is **migrated** on load: its standing is kept
(active, member, merit, rank, licenses, salary), its old war state is cleared
(flotillas, garrisons, commanders, origins, the war and its attitudes, the old
statistics), borders stay where they are, and a new world starts that day,
with a border crisis 10-20 days later.

## Tunables

All of them are in `src/Tuning.dados`, with comments. The main ones besides
those above: `max_wars` 3 / `hard_max_wars` 4, `declare_gap_min`/`max` 8-20,
`split_pressure` 40, `claim_pressure` 12, `whole_pressure` 4,
`opportunity_pressure` 40, `reclaim_pressure` 45, `truce_min_days`/`max`
25-70, war lengths, `win_score` 15, `cession_share` 60, the unrest weights,
`rebellion_unrest` 40, `rebellion_divisor` 400, `rebellion_cooldown` 600, the
rising weights, `capture_hp` 60, `consolidation` 150 for 20 days, `swap_days`
10, `max_flotillas` 4, `per_war` 3, `rebel_flotillas` 2, and the caps on the
chronicle (60), history (120), medals (40) and operations (24). M2's:
`squadrons_by_rank`, `squadron_credits` 50,000, `squadron_fleet_cap` 200,
`squadron_presence` 130, `squadron_loss_merit` 15 / `standing` 5; `history_battle`
3, `history_kill` 1, `rival_threshold` 12, `max_rivals` 2 and the trait bonuses;
`visibility_range` 1, `scout_days` 10, `sighting_days` 20; `supply_free` 2,
`supply_per_jump` 8, `supply_floor` 70, `depot_raid_days` 20;
`occupation_unrest` 60/25, `capture_damage` 30, `damage_tier` 30, `damage_price`
12, `occupation_minor_cap` 4; `rally_below` 60, `rally_garrison` 150,
`rising_gap` 240; `tender_boost` 125, `tender_penalty` 75,
`scandal_unrest` 6, `crisis_margin` 5, `shortfall_weight` 40; `tender_gap` 60,
`squadron_cooldown` 30, `squadron_value` 50, `rally_peace_days` 30.

### Raising the number of wars at once

Two or more wars run on about 8% of days. The knobs that would raise it
(none is changed by default; the open question is the user's):

* `whole_pressure` (4, in hundredths of a percent a day per whole minor on a
  border): wars over whole minors, so more pairs fight, not only split ones;
* `opportunity_pressure` (40) and `opportunity_exhaustion` (20%): neighbours
  joining in against a major already at war and tiring, which is what makes
  wars overlap;
* `truce_min_days`/`truce_max_days` (25-70): shorter truces bring rematches
  sooner, and longer wars (`war_min_days`/`war_max_days`, 40-90) overlap more;
* `rebellion_unrest` (40) and `rebellion_divisor` (400): lower either and more
  minors rise, each rising adding a rebellion or defection war (allowed past
  the cap, to 4);
* `max_wars` (3) and `faction_war_limit` (2) cap it.

## Known limits

* **The Free Worlds and the Syndicate share no border** at first; they fight
  only once a defection, an annexation or a conquest gives them one.
* **Pirate holdings are never taken**, and pirates hold no minor of a major's.
* **Flotillas abstract the war.** They exist as ships only while the player
  is in their system, and they don't fight the real navies (the patrol swap
  only changes who patrols a captured system).
* **Planets keep their defense fleets** after a capture; only the system's
  government and patrols change.
* **Corporations** reads the conditions above; until it scans sides past 16,
  it misses the Syndicate's rebels' flotillas.
* **Operations and jobs** are on the job board only; there are no hails or
  conversations about the wars beyond the first hour's two dialogs.
* **Merit** counts ships the loader reports as disabled or destroyed by the
  player.
* **Squadrons are ordered from the War Room only**: no hails, no orders in
  flight (that needs API 11's hail and boarding slots).
* **Prices and stock on API 9 with Corporations** are left alone (see Prices:
  the convention); outfitter trims need API 10.
* **Fog** hides enemy flotillas on the map and in the Forces tab; the war
  report, the chronicle and the bus still tell what happened.
