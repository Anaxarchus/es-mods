// Writes test/galaxy.json, the galaxy the simulation test runs on, from the
// game's data files (see loadGalaxy in test/galaxy.mjs: systems, lanes,
// planets and their defense fleets, and the Free Worlds territory from the
// campaign's events). Run it again after the game's map changes:
//
//     node mods/diplomacy/tools/make-galaxy.mjs <endless-sky>/data
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGalaxy, galaxyToJson } from "../test/galaxy.mjs";

const data = process.argv[2];
if (!data) throw new Error("usage: make-galaxy.mjs <game data folder>");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "galaxy.json");
const galaxy = loadGalaxy(data);
writeFileSync(OUT, JSON.stringify(galaxyToJson(galaxy)) + "\n");
console.log(`wrote ${OUT}: ${galaxy.systems.size} systems, ${galaxy.planets.size} planets; events applied: ${galaxy.events.join(", ")}`);
