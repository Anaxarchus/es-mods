# Diplomacy: design notes

An Endless Sky mod, written in DadoScript against the Dado mod API (9). It
lives in `es-mods` as `mods/diplomacy` and is built, tested and deployed with
the SDK's commands (see README.md, which also has every number).

## The faction model

* **Majors and minors.** Human space is three majors (the Republic, the Free
  Worlds, the Syndicate), thirteen minors and three pirate holdings
  (`tools/regions/regions.mjs`, checked and turned into `src/Regions.dados` by
  `tools/regions/build.mjs`). **The minor that holds a major's capital is the
  major**: its core. A major's territory is its core plus the minors it holds,
  whole or in part. Ownership is never stored: it is the systems' real
  governments, read each morning; a minor's owner is whoever holds most of it.
* **Capitals** (Sol, Gamma Corvi, Markab) are never taken, ceded or handed
  over. The rest of a core can be fought over, but losing core systems weighs
  far more: 20 score instead of 8, 15% exhaustion instead of 5%, a core shock
  of 25 unrest in the major's other minors, and peace terms return core systems
  unless the victory was overwhelming.
* **Cores never rebel or defect.** Only non-core minors do.
* **Pirates** are a side without a core. Their holdings (the northern, core and
  southern pirate worlds; the southern one includes Men, the independent world
  Thule, and Shaula, where Greenrock is; Ultima Thule is another system, in
  the Northern Rim) are regions no major takes in M1: they are where raids
  start. Gienah and Algenib are in the core pirates' holding
  because the Veteran start's scheduled "navy done with algenib" hands them to
  the pirates.
* **Rebels.** A seceding minor becomes a side of its own: a real government
  defined in data, with fleets that are its parent's ships under its flag. It
  is minor-sized: no core, no capital. It stays independent until a major
  takes its systems back; a faction with nothing left is dissolved.
  **Not in M1:** promoting a long-lived rebel faction to a major (a capital, a
  core, its own minors); an M3 idea.

## Why the old wars churned, and what replaced it

The old version ran one war at a time between two of the three factions, only
Republic-Free Worlds or Republic-Syndicate, and let any faction recapture
anything within two jumps of its original border. Its flotillas aimed at the
nearest target, which was usually the system just lost, so a war flipped 20-50
systems and moved almost none, and captured systems kept their old owner's
patrols.

* **Wars are about minors.** A war has one or two goals (minors), and its
  flotillas attack only systems in them. A pair never fights two wars: a
  rising or a forced war between a pair at war widens the war they fight. A
  core is a goal now and then (about 1 war in 10; never its capital). The two-jump rule is gone: a goal is
  a minor of the defender's on the attacker's border.
* **Consolidation.** A fresh capture's garrison starts at 60%, stands at 150%
  of full for 20 days and recovers fast, so it is not taken back at once.
* **Patrols follow the flag** after 10 quiet days (the old owner's patrol
  fleets removed, the new owner's added), batched with the day's other changes
  into one world change: a pilot's save grows by at most one event a day.
* **Peace terms** decide what changes hands for good (cession of a goal
  minor the winner mostly holds; core systems returned; gains given back by
  the loser), so territory really moves, and the chronicle says why.

## The war-likelihood rule, and the brakes

Each pair has a war pressure: split minors (both hold part) weigh most and
grow the longer the split goes unfought; claims (a minor that was yours, or
that you lost systems of lately) less; whole minors on a border least, unless
their owner is at war and tiring (an opportunity). Grudges multiply it; a
truce zeroes it. The player's faction, quiet for 45 days, quadruples its
pressures. In the tests the Republic and the Free Worlds, splitting three
minors at the Veteran start, go to war after a median of 59 days; with those
minors whole, 326.

Nothing snowballs, by construction:

* capitals are never lost, and core systems come back at peace;
* a conqueror holding a minor that is not its own suffers **foreign rule**
  (+22 unrest), so conquered minors rise, often **defecting back** to their
  default parent (the default parent gets the biggest weight);
* splits and claims make a rematch likely, and a loser's grudge makes it
  likelier;
* a faction is not attacked while it fights two wars, and a major already at
  war invites opportunistic neighbours only once it tires.

Over 4000 days and 5 pilots, each major stayed between 45% and 180% of its
start, and 14-29 systems ended with another owner.

## Rebellion and defection

Unrest (README.md: the target and its parts) above 40 may make a minor rise.
It **secedes** (its rebel faction, at war with its old parent over it at once)
or **defects** to a major on its border (that major takes its systems, and the
old parent declares war at once with the minor as the goal; its garrisons are
then the patron's). With no major on its border it secedes. Weights favour
going home (the default parent), a major already holding part of it, and a
patron not already at war twice.

* **The cap.** A rising cannot wait for a slot: a rebellion or a defection may
  take the war count one past the cap (3 → 4). At 4 the rising is put down for
  now (its unrest halved), and the minor may try again later (600 days at the
  earliest). The other choice, deferring the war while the minor has already
  changed hands, would leave a defected minor with no war over it.
* **Peace** decides whether a defected minor stays with its patron (the
  patron's win, or a draw), goes back (the old parent's win: every system that went over), or is split
  (a draw after the old parent took part of it), which then raises the
  pressure for the next war under the split rule.
* **Protection (in M1).** A separatist faction losing its war (exhaustion
  60%+) may ask a major on its border for protection: it is annexed, and the
  war becomes that major's against the old parent.
* Over 4000 days a pilot sees about 5 risings, a little over half secessions.

## The player

* **The commission.** A campaign veteran is offered a Council commission
  (Alondo Gruyere, the Free Worlds diplomatic corps) and serves the Free
  Worlds as a Commodore.
* **The first hour, an uneasy peace.** Two introductory operations (Alondo's
  envoy to the border, Freya's inquiry into a raid made with Republic surplus
  codes), then, between days 10 and 20, a **border crisis** between the
  player's faction and its likeliest rival over the shared minor nearest the
  player. No war comes before it, and while the Reconciliation is young (300
  days) wars between majors stay limited border crises.
* **The War Room and the chronicle**, **operations** whose outcomes the
  simulation applies, **medals** and the **service record**, the daily digest
  and spaceport news: README.md.

## How it is built

The state is one JSON text kept with the pilot (`Game.data`), bounded (about
14 KB with M2, under 17 KB in the survey); the conditions are what missions and
other plugins read (about 150, at most about 330), written only when they
change. Distances are cached per source system and dropped when the lanes
change; supply's depot distances are kept until an owner changes or a depot
goes down or back up; the rival check runs only when a commander's history
with the player grew. `on_day` takes about 3.0 ms in QuickJS
(`tools/qjs-time.mjs`; 3.5 ms with a busy player commanding three squadrons on
API 10, `busy`), far under the loader's 250 ms watchdog.

## Milestones

**M1:** the faction model; multiple wars; goals and peace terms; rebellion,
defection and protection; the churn fixes; the War Room, chronicle,
operations, medals and service record; the first hour; the digest, news, the
Faction table; mod API 9; Luna's Navy yard.

## M2: command and consequence

**What it adds.** Squadrons the player commands (`Squadron`), rival
commanders (`Rivals`, with `Admirals`' rosters widened to six fields: name,
personality, wins, history, trait, rival), fog of war (`Intel`), supply
(`Simulation.supply`), occupation and reconstruction (`Occupation`, with the
generated `Trade` table), the Corporations link over mod API 10's bus, and
API 10 housekeeping (`on_save`, `timing_section`). README.md, "Command and
consequence (M2)", says what the player sees.

**Decisions.**

* *A squadron is a flotilla.* It holds one of the faction's places (four per
  major) and moves, fights and besieges through the same code; only its goal
  comes from the player. When the AI has filled every place, the flotilla
  nearest the target comes under command rather than a fifth one appearing: the
  caps that keep the war readable stay true. Its strength counts the player's
  fleet at half price, capped, and never more than at formation or than the
  fleet now gives; a lost squadron is not replaced for 30 days. The player still
  matters: in the reviewer's High-Admiral experiment (three squadrons of a
  carrier fleet re-sent every 15 days, 2000 days of war, 8 seeds) the Republic
  ends at 60 systems on average (low 48) against 76 (low 45) without
  squadrons; 31 squadrons formed and 30 lost a run (47 and 45 before the
  cooldown).
* *A delivered tender boosts one launch*, at most once in 60 days per
  government. Corporations M3 tenders only for the Republic (only Navy hulls
  are military), about 280 awards and deliveries in 2,500 days; as a 30-day
  window on every award or delivery the boost was on nearly all the time. With
  the captured stream replayed (8 seeds × 4000 days) the Republic averages 87
  systems (low 53), 90 (low 71) with the boost turned off and 79 (low 43) with
  no posts: the boost itself no longer moves it; the rest is the chaotic
  trajectory changing with any event.
* *Rivals are the commanders already there.* No new actors: history accrues
  on the existing roster, a trait is rolled once, one rival per side and two
  in all, so the chronicle stays a story.
* *Fog is a view, not a rule.* The simulation knows everything; the map and the
  Forces tab show what the faction could know. Sightings fade instead of
  vanishing, so the map still says where the danger was.
* *Supply is gentle* (8% a jump past 2, floor 70%). At 10% a jump past 1 with a
  floor of 60%, sieges dragged on, war weariness rose, and minors rose in
  cascades (a survey pilot's Syndicate fell to 1 system).
* *Occupation feeds unrest only a little* (at most 4 points of a minor's
  target), and brakes stop the spirals that M1 already had now and then (seeds
  10 and 12 of M1's survey took the Republic to 22-23 systems): at most one
  rising against a side in 240 days, and a side under 60% of its home rallies:
  stronger garrisons, no risings, no war declared by it or on it, a war it is
  in ends after 30 days, captures from it count half, no cessions. A rallying
  side holds what it has rather than recovering (survey seed 8's Syndicate
  stops at 12 instead of bleeding to 7).
* *Prices by delta only*, and never a price another mod announced it raised
  (README.md, "Prices: the convention"). On API 9 with Corporations enabled
  Diplomacy leaves prices and stock alone rather than guess.
* *On API 10, save on `on_save` only*, with a revision written on the first
  change after a save, so an older save is still told apart; on API 9 the M1
  daily save stays. `api_version` and `min_api` stay 9: every API 10 call is
  behind `game.has`.

**Numbers** (5 pilots × 4000 days, test galaxy): days with 0/1/≥2 wars
51.1% / 43.9% / 5.0% (M1: 44.5 / 48 / 7.4); risings 24 (separatist 8,
defection 16, annexation 2; M1's base 21 on the same seeds); lowest holdings
Republic 53, Free Worlds 38, Syndicate 24 of 89/57/30; at most 32 occupation
records and 45 price deltas; about 75 trade lines a year, batched into the
day's one change event (about 65 change events a year in all); state at most
17 KB.

**M3 needs.**

* *Treaties and influence:* non-aggression pacts, alliances and guarantees,
  offered and broken; influence as a currency the player earns (operations,
  squadron victories) and spends on them; alliances bring a third major into a
  war.
* *Politics and coups:* each major's government as factions (hawks, doves, the
  military) that unrest, defeats and the player's standing move; coups that
  change a major's policy or split it; a rebel faction that lasts becoming a
  major (capital, core, minors).
* *Capture and prisoner exchange:* a rival's flagship disabled rather than
  destroyed is captured; prisoners held, traded in peace terms or for the
  player's lost squadron commanders.
* *Pirate warlords:* named pirate commanders with holdings that grow and shrink,
  majors campaigning against them, warlords seizing weakly held border systems
  and selling their services in wars.
* *API 11 hail and boarding slots:* ordering a squadron by hailing it in flight,
  rivals hailing the player before a fight, boarding a rival's disabled
  flagship for the capture above; a stock convention with Corporations'
  outfit stock like the one for prices (M2 trims only untracked munitions).
