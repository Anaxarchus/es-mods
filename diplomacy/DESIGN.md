# Diplomacy: design notes

An Endless Sky mod, written in DadoScript against the Dado mod API. It lives in
the mod SDK as `mods/diplomacy` and is built, tested and deployed with the
SDK's commands (see README.md).

## What it does

* **Activation.** It stays idle until the Free Worlds campaign is over (the
  game's own "campaign is over" condition), then offers itself on landing. A
  player who accepts serves the Free Worlds as a Commodore at the campaign's
  salary, and it runs every day from then on.
* **Factions.** The three main factions: the Republic, the Free Worlds and the
  Syndicate. Each has a capital system that can never be taken.
* **Wars.** Now and then two factions go to war. A war lasts a while and ends
  in a truce. Borders stay where the war left them.
* **Flotillas.** A faction at war launches flotillas of various sizes (small,
  medium, large) from its territory toward an enemy system. A flotilla moves
  one jump a day. If an enemy flotilla is closer to it than its objective is,
  it goes after that flotilla instead. Two hostile flotillas in one system
  fight.
* **Sieges and captures.** A flotilla at its objective lays siege. It fights
  the system's defenders, which are the planets' defense fleets, the same ones
  the player fights to dominate a planet. Each day both sides lose strength.
  When the defenders are gone, the system changes hands. A siege takes several
  days, so an enemy flotilla a few jumps away can arrive in time to break it.
* **Limits.** A capital is never taken, and no faction can push the border
  more than two jumps past its original territory.
* **On the map.** Every flotilla is drawn at its system in its faction's
  colour, with a short label and a line to its objective. A system under siege
  gets a marker. The details (commander, strength, task) are in the map's side
  panel when the player selects the system.
* **In person.** A player who flies to a flotilla's system finds its ships
  there, and during a siege finds the defenders too. What happens in that
  battle is what the simulation keeps: ships the player sees destroyed are
  gone from the flotilla's strength.
* **Joining.** On any planet in a faction's system, the planet screen has a
  "Faction" button that opens the faction's panel: wars, flotillas, territory,
  and Join or Leave. A member is an ally of the faction's flotillas and an
  enemy of its enemies' flotillas.
* **Rank and salary.** A member earns merit for each enemy flotilla ship
  destroyed and each faction mission completed. Merit sets the member's rank,
  and the faction pays a daily salary that grows with rank. The Republic also
  issues its Navy licenses at higher ranks.
* **Faction jobs.** During a war, members find job-board work against the
  enemy: carrying dispatches, intercepting couriers, destroying scouts,
  scouting systems, destroying medium and capital warships, and breaking
  warfleets. The bigger jobs are offered only at higher ranks.

* **Pirate raids.** Pirate systems send raids through 2–3 nearby settled
  systems, staying up to 3 days in each and plundering, before going home.
  The factions may send relief flotillas to hunt them, rarely while at war.
* **Commanders.** Every flotilla and raid has a named commander with a
  personality that changes how it fights and moves. Commanders persist and can
  die.
* **Sim score.** Battles and sieges roll a daily winner weighted by each side's
  score: strength, times a quality from its fleets' real hull, shields, damage
  per second and speed, times its commander's personality.

## How it is built

The flotilla ships fly under their own governments ("Republic Flotilla" and
so on), which this mod's plugin defines. The diplomacy layer therefore never
changes the game's own politics: a war is hostility between the flotilla
governments, and a captured system is handed to the real faction government
through a world change that is saved with the pilot.

The mod keeps its state in the player's conditions, which are saved with the
pilot. Everything prefixed `diplomacy:` belongs to it. Conditions are integers,
so systems are stored by their index in the game's sorted system list. Missions
can read the same conditions, so data plugins can react to the wars.

Days are simulated in the mod's `on_day` hook. Battles the player is present
at are real: the mod spawns the ships, tags them, and reads back what is left.

## Harness features this needs

Galaxy queries, a day hook, territory changes that persist, government
attitudes and player reputation, spawning tagged fleets, counting the player's
kills, map overlays, a planet-screen button and a scripted panel. Those are
added to the harness (mod API version 2), as general features any mod can use.
