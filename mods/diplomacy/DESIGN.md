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
11 KB); the conditions are what missions and other plugins read (about 140),
written only when they change. Distances are cached per source system and
dropped when the lanes change. `on_day` takes about 2.5 ms in QuickJS
(`tools/qjs-time.mjs`), far under the loader's 250 ms watchdog.

## Milestones

**M1 (this one):** the faction model; multiple wars; goals and peace terms;
rebellion, defection and protection; the churn fixes; the War Room, chronicle,
operations, medals and service record; the first hour; the digest, news, the
Faction table; mod API 9; Luna's Navy yard.

**M2 (next):**

* **Mod API 10.** Detect it with `game.has(...)` (or a guarded call) and keep
  API 9 working. Then:
  * **the notification bus** (`notify`/`listen`/`on_notification`): publish
    `diplomacy.war.declared`, `diplomacy.war.ended` (with terms),
    `diplomacy.capture`, `diplomacy.minor.rebelled`/`defected` and
    `diplomacy.state` (every war, each side and goal). **Corporations** then
    listens instead of reading `war a`/`war b`: it can raise demand per war and
    per front (shipyards near a front, government contracts for both sides of
    every war), and Diplomacy can listen back (a company's military contracts
    adding to a side's flotilla strength);
  * `on_save`: save the state only when the game writes the pilot (as
    Corporations' TODO describes) instead of every day;
  * `pilot_loaded` in place of the world/rev check;
  * `trade_price`: wars and blockades moving commodity prices in front systems.
* **Pirate suppression:** majors may campaign against pirate holdings (a
  minor-like war with no peace terms), and pirates may seize a weakly held
  border system.
* **Diplomacy proper:** treaties (non-aggression, alliances, a guarantee of a
  rebel faction), offered and broken; alliances bring a third major into a war
  (so the Free Worlds and the Syndicate can fight while they share no border).
* **More operations:** escort a relief flotilla in person (an `npc accompany`
  of the flotilla's ships), blockade runs, envoys between the factions; story
  hails and conversations for wars involving the player.
* **The War Room:** a history of finished wars, per-minor histories, the map
  centred on a chosen row.

**M3 (later):**

* rebel factions that last becoming majors (a capital, a core, minors of their
  own); a major broken by losses splitting;
* planets' defense fleets and shipyards following the flag (a captured world's
  defenses and stock), with Sol's Luna always the Republic's;
* the other factions' wars beyond human space (the Coalition, the Hai), and
  player-founded factions.
