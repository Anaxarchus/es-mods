# The Deep (DESIGN.md section 22)

Run from the mod's folder with Python 3 (`ES_DATA` as for `../ambushers`):

- `gen.py`: generates the region past the Maw from the tables at its top (the
  map, depth tiers, stars, ramscoop yields, hazards, hulks, Breakers' Haven,
  the two wormholes, the deeper tiers' wardens and fleets, the Breakers' jobs)
  into `data/shoal deep.txt`, `data/shoal deep wardens.txt`, `data/shoal deep
  jobs.txt` and `src/Deep.dados`; `--image` also draws the map background
  `images/ui/shoal deep.jpg`. Seeded and idempotent. It derives the deeper
  wardens from the tier-1 ones in `shoal ships.txt`/`shoal outfits.txt`, and
  checks the tier-1 fleets in `shoal fleets.txt` against its table.
- `abyss.py`: writes the Abyss's Mk III wrecks into `data/shoal ships.txt`
  (between markers; idempotent). Run `../h2h/h2h.py` and `../ambushers/cap.py`
  after it.
- `balance.py [--fleets]`: simulates reference ships with Shoal gear against
  every warden (and fleet) of every tier, from the data.
