# MOPS

The Multilateral Office for Perimeter Suppression: a deniable agency, funded
quietly by the human governments, that pays independent captains a fortune to
destroy hostile aliens on humanity's borders, and disowns them when they die.

- **The way in** (`data/mops missions.txt`), two missions:
  1. **MOPS 1: Breach.** At combat rank 5 or higher (`"combat rating" >= 149`:
     the game shows rank `floor(ln(rating))`, and e^5 = 148.4), in the bar of
     a human spaceport within six jumps of Sumar (30% per visit), Field
     Officer Imre Dask storms in to commandeer a ship: their pilot resigned
     mid-jump and their transport was impounded for docking fees an agency
     that doesn't exist can't pay. With Dask aboard (1 passenger), destroy two
     escaped Unfettered Lightning Bugs ("Specimen Fourteen" and "Fifteen") in
     Sumar, Rajak, Hassaleh, Danoa or Ultima Thule, then land at Farpoint
     (30 days) for a debriefing. Pays 60k. The debriefing branches on whether
     you have already met the Hai (`First Contact: Hai` or
     `First Contact: Unfettered` offered, or `event: label hai space`): a
     first-contact cover-up if not, a short briefing on the Unfettered if so.
     Declining, failing or aborting it leaves it to come back.
  2. **MOPS 2: Contract.** On landing at Farpoint after the debriefing, and on
     every landing there until you sign, Deputy Coordinator Prell offers a
     contractor's position: deniable captains who absorb the embarrassment when
     operations go sideways. Signing (150k bonus) sets `mops: contractor`. The
     whole offer happens in its conversation, so it is never an active mission
     and cannot be failed.
- **Operations** (`data/mops jobs.txt`): repeatable jobs on the boards of
  human spaceports near each border. Each is rarer than vanilla's spacediving
  job (`random < 14`): `random < 10`, or `< 8` for the far perimeter.

  | Job | Offered near | Targets | Needs | Pay |
  |---|---|---|---|---|
  | Unfettered Incursion | Sumar (5 jumps) | Unfettered Raid + Large Unfettered in Sumar, Cardax, Rajak, Hassaleh, Danoa or Ultima Thule | rank 5 | 1.5M |
  | Unfettered War Band | Sumar | two waves: Rajak/Ultima Thule, then Sumar/Cardax/Hassaleh/Danoa | rank 7, 3 ops | 3.5M |
  | Korath Raiders (Polaris) | Polaris | Korath Large Raid + Korath Raid in Polaris, Achernar, Alpha Hydri or Sheratan | rank 6 | 2.4M |
  | Korath Strip-Mining (Durax) | Durax | Korath Miners + 2 Large Raids at Durax; 2 Raids in Misam, Atik, Alcyone or Almach | rank 7, 3 ops | 4.0M |
  | Alpha Cell (South) | the southern rim | 2 Leviathans, 3 Firebirds, a Falcon (government Alpha) | rank 7, 3 ops, FW campaign done | 3.0M |
  | Drone War Spillover | Terminus | 2 Large Kor Sestor + 2 Large Kor Mereti in the Korath sector | rank 8, 5 ops, been there | 5.5M |
  | Graveyard Sweep | Terminus | 3 Ka'het Aggressive groups in the Graveyard | rank 8, 5 ops, been there | 6.0M |

  A job is not offered while you are at peace with its government (the
  storylines can make you friends with the Unfettered, the Korath or the
  Ka'het). Completed jobs count in `mops: operations`.
- **News** (`data/mops news.txt`): rumours and Office notices at human
  spaceports once you are a contractor.

Data only: no loader needed. `scripts/mops.js` is a stub that the repository's
tools require (`npm run build` wants `src/` or `scripts/`).

## Develop

```sh
python3 mods/mops/tools/check.py <endless-sky>/data   # every name, mission, event and planet it uses exists
npm run check -- mods/mops
npm run build -- mods/mops                            # dist/MOPS/
```
