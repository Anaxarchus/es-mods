# Ambusher variant tools

Scripts used to build the ambusher ships for the Breakers' distress jobs
(DESIGN.md section 17). Run from this folder with Python 3:

- `gen.py`: generates the ambusher variants and fleets from the loot table in
  the script; writes `ships.txt`, `fleets.txt` and `pool.json` to `$OUT`
  (default: here), to merge into `data/shoal ships.txt` and `data/shoal fleets.txt`.
  Thirteen exotic lines since v0.3.4 (the Driftnet Ramscoop), fourteen since
  v0.3.5 (the Lamprey Launcher). `--merge` writes them into the plugin's data in
  place. After merging, run `../h2h/h2h.py` again: it adds the cutlass roll to
  the ambusher fleets.
- `cap.py`: checks every drowned variant fits its hull (outfit/engine/weapon space,
  gun ports, turret mounts, cargo space for what rides in its hold, and every
  ammunition capacity for what is loaded).
- `dist.py`: prints the per-ship exotic distribution computed from the data.
- `es.py`: the small Endless Sky data reader they share.

`ES_DATA` (default `~/dev/GitHub/endless-sky/data`) and `PLUGIN_DATA` (default this mod's `data/`) set where `es.py` reads from.
