# Cutlass roll tools

The Glass-Edge Cutlass (hand to hand) drops on drowned warships in every drowned
pool, independently of the exotics (DESIGN.md section 19). Run with Python 3
(`ES_DATA` and `PLUGIN_DATA` as for `../ambushers`):

- Since v0.3.5 the derelict wreck fleets also roll Warden Cores per ship in
  the hold (`CORE_ROLLS` in `h2h_common.py`, DESIGN.md section 21); `h2h.py`
  expands both rolls and `dist.py` reports and checks both.
- `h2h.py`: expands every drowned pool (the drowned fleets in `data/shoal
  fleets.txt` and the salvage leads' npc fleets in `data/shoal missions.txt`)
  with each warship's roll, in place, and writes the cutlass ship variants to
  `data/shoal cutlass ships.txt`. Idempotent; run it after any change to the
  pools or to the variants it copies (and after merging `../ambushers/gen.py`).
- `dist.py`: per pool, the exotic distribution, the cutlass distribution and an
  exact independence check (`--before <data dir>` adds an older release's
  exotic distribution to compare).
- `h2h_common.py`: the roll (counts and weights) and the pool list they share.
