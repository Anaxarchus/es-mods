# Corsair Charts

Pirate treasure trails for Argosy (Endless Sky with the Dado mod loader).
Sometimes a pirate you destroy or disable transmits a chart. Follow it, and
it leads somewhere. Charts come in four kinds, from scorched scraps to the
black charts of the most infamous captains, and each kind leads further and
asks more of you.

* **Needs** the Dado loader with mod API 11 or newer (loader 0.3.0). Without
  it only the data loads.
* **Play:** land with a chart aboard to investigate it. The planet-screen
  button **Corsair Charts** shows where the trail stands, lets you seek
  another lead or abandon the trail, and keeps a collection log. The map
  marks the next lead.
* Spoilers (every step, item and number): [DESIGN.md](DESIGN.md).

## Develop

```sh
python3 mods/corsair_charts/tools/gen.py               # data/charts {outfits,ships,fleets}.txt and src/Tables.dados
python3 mods/corsair_charts/tools/niche.py             # exotics and hulls next to their closest stock equivalents
python3 mods/corsair_charts/test/ingame/make_tests.py  # the in-game test plugin
npm test                                               # unit tests (test/charts.test.mjs) with the others
mods/corsair_charts/test/ingame/run.sh                 # in the real game: load tests, and E2E with an API 11 loader
```
