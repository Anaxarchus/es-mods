// The carve-up of human space into minor factions: hand-maintained, checked by
// tools/regions/build.mjs against the game's map (the Free Worlds Veteran
// galaxy, test/galaxy.json), which also writes src/Regions.dados, the rebel
// governments and fleets in data/diplomacy factions.txt, and the README table.
//
// Each major's core is the minor around its capital: the major itself. It
// never rebels or defects, and its capital can never be taken. The other
// minors belong to a major by default ("parent"), may be split between two,
// and may rebel. Pirate holdings belong to no major and cannot be taken.
//
// Fields:
//   name     the minor's name, as players see it ("the Paradise Worlds" reads it
//            with "the" where `the` is set)
//   short    a short name for map labels and conditions (no quotes)
//   parent   "Republic", "Free Worlds", "Syndicate" or "Pirate"
//   core     true for a major's core (it holds the capital)
//   rebels   the name of the government it forms if it secedes (non-core only)
//   colour   the rebels' map colour (0..1)
//   enclaves systems allowed to touch the rest only through another minor
//            (pirate dens); everything else must be contiguous
//   systems  every system in it; each human system is in exactly one minor
//   lore     a line on why, for the README

export const CAPITALS = { 'Republic': 'Sol', 'Free Worlds': 'Gamma Corvi', 'Syndicate': 'Markab' };

export const MINORS = [
	// ---- The Republic: Earth and the worlds around it, the Paradise Worlds, the
	// Deep, the Far North, the northern frontier and the western Dirt Belt.
	{ name: 'Earth', short: 'Earth', parent: 'Republic', core: true,
		systems: ['Sol', 'Alpha Centauri', 'Sirius', 'Eteron', 'Altair', 'Vega', 'Nocte', 'Denebola', 'Fingol', 'Merak', 'Regulus', 'Porrima', 'Muphrid'],
		lore: 'Sol and the "near Earth" worlds around it: the heart of the Republic, its Parliament on Earth.' },
	{ name: 'the Paradise Worlds', short: 'Paradise Worlds', parent: 'Republic', rebels: 'Paradise Secession', colour: [0.95, 0.75, 0.3],
		systems: ['Procyon', 'Capella', 'Aldebaran', 'Menkalinan', 'Pollux', 'Castor', 'Talita', 'Alhena', 'Miaplacidus', 'Alphard', 'Tejat', 'Kursa', 'Wazn', 'Phurad', 'Elnath'],
		lore: 'The wealthy "paradise" planets north of Earth (Martini, Glory, Geminus), whose descriptions call them the Paradise Worlds.' },
	{ name: 'the Deep', short: 'Deep', parent: 'Republic', rebels: 'Deep Compact', colour: [0.55, 0.75, 0.95],
		systems: ['Wezen', 'Naos', 'Aludra', 'Suhail', 'Regor', 'Avior', 'Markeb', 'Aspidiske', 'Epsilon Leonis', 'Adhara', 'Gomeisa', 'Zosma', 'Dubhe'],
		lore: 'The rich, inward-looking northwest (Valhalla, Midgard): the planets tagged "deep", under the map\'s Deep label.' },
	{ name: 'the Far North', short: 'Far North', parent: 'Republic', rebels: 'Northern Free States', colour: [0.75, 0.85, 0.9],
		systems: ['Gorvi', 'Mintaka', 'Tortor', 'Alnitak', 'Saiph', 'Rigel', 'Mebsuta', 'Betelgeuse', 'Mirzam', 'Alheka', 'Canopus', 'Phact'],
		lore: 'The northern frontier and its Navy bases (Farpoint, Prime): the "north" planets of the far north jobs, facing the northern pirates.' },
	{ name: 'the Northern Rim', short: 'Northern Rim', parent: 'Republic', rebels: 'Thule League', colour: [0.6, 0.9, 0.7],
		systems: ['Hassaleh', 'Danoa', 'Sumar', 'Rajak', 'Ultima Thule', 'Cardax', 'Volax', 'Sospi', 'Nihal'],
		lore: 'The frontier worlds between the Far North and the Syndicate\'s upper Core, tagged "frontier" and "north"; Cardax borders Syndicate Moktar.' },
	{ name: 'the Western Dirt Belt', short: 'West Dirt Belt', parent: 'Republic', rebels: 'Dirt Belt Union', colour: [0.8, 0.6, 0.45],
		systems: ['Algieba', 'Tania Australis', 'Lolami', 'Mora', 'Fala', 'Phecda', 'Delta Velorum', 'Turais', 'Algorel', 'Gacrux', 'Cor Caroli', 'Muhlifain', 'Limen', 'Orbona', 'Terminus'],
		lore: 'The poor farming worlds of the Dirt Belt (the "dirt belt" planets) that stayed with the Republic, out to Terminus.' },
	// The Dirt Belt's middle and east: split between the Republic and the Free
	// Worlds since the war, and the likeliest place for the next one.
	{ name: 'the Central Dirt Belt', short: 'Central Dirt Belt', parent: 'Republic', rebels: 'Belt Free Worlds', colour: [0.85, 0.7, 0.35],
		systems: ['Mizar', 'Ipsing', 'Arcturus', 'Holeb', 'Rutilicus', 'Vindemiatrix', 'Sarin', 'Alioth', 'Alphecca', 'Boral', 'Seginus', 'Wei', 'Alnasl', 'Eber'],
		lore: 'Where the war\'s front ran: New Tibet (Alioth) and Hope (Wei) went to the Free Worlds, Arcturus and Mizar stayed Republic.' },
	{ name: 'the Eastern Dirt Belt', short: 'East Dirt Belt', parent: 'Free Worlds', rebels: 'Eastern Belt Alliance', colour: [0.9, 0.55, 0.25],
		systems: ['Menkent', 'Cebalrai', 'Hintar', 'Kaus Borealis', 'Rasalhague', 'Zeta Aquilae', 'Orvala', 'Ascella', 'Naper', 'Peacock', 'Tais', 'Kaus Australis'],
		lore: 'The Free Worlds\' northern expansion into the Dirt Belt (Rasalhague to Kaus Australis), with Menkent and Cebalrai still Republic.' },

	// ---- The Free Worlds: the Rim around Bourne, the South, the southern
	// frontier with Bloodsea, and Tarazed's reach.
	{ name: 'the Rim', short: 'Rim', parent: 'Free Worlds', core: true,
		systems: ['Gamma Corvi', 'Spica', 'Minkar', 'Mimosa', 'Kraz', 'Acrux', 'Izar', 'Zeta Centauri', 'Hadar', 'Alkaid', 'Kochab', 'Zubeneschamali', 'Ildaria', 'Zubenelgenubi', 'Sabik', 'Unukalhai'],
		lore: 'The Rim worlds around Bourne (Gamma Corvi), the Free Worlds\' capital: the "rim" planets, where the Southern Mutual Defense Pact began.' },
	{ name: 'the South', short: 'South', parent: 'Free Worlds', rebels: 'Southern Pact', colour: [0.4, 0.85, 0.3],
		systems: ['Kornephoros', 'Aldhibain', 'Sargas', 'Lesath', 'Rastaban', 'Girtab', 'Dschubba', 'Atria', 'Han', 'Alpha Arae', 'Delta Sagittarii'],
		lore: 'The "south" planets of the south jobs, from Deep and Clink (Kornephoros) to Rastaban, which the Navy occupied and left.' },
	{ name: 'the Southern Frontier', short: 'South Frontier', parent: 'Free Worlds', rebels: 'Bloodsea Free Captains', colour: [0.75, 0.25, 0.3],
		systems: ['Alniyat', 'Antares', 'Pherkad', 'Yed Prior', 'Kappa Centauri', 'Beta Lupi', 'Graffias'],
		lore: 'The lawless far south toward the pirate worlds: Bloodsea (Antares), which joined the Free Worlds, and Poisonwood (Graffias), still Republic.' },
	{ name: 'Tarazed\'s Reach', short: 'Tarazed Reach', parent: 'Free Worlds', rebels: 'Tarazed Directorate', colour: [0.3, 0.8, 0.75],
		systems: ['Tarazed', 'Umbral', 'Dabih', 'Lurata', 'Albireo', 'Sadr', 'Albaldah', 'Eltanin', 'Nunki'],
		lore: 'The southeast around Wayfarer (Tarazed), the shipbuilders who joined the Free Worlds late in the war.' },

	// ---- The Syndicate: the Core around Hephaestus, the upper Core, the
	// worlds facing Earth and the lower Core.
	{ name: 'the Core', short: 'Core', parent: 'Syndicate', core: true,
		systems: ['Markab', 'Ankaa', 'Fomalhaut', 'Delta Capricorni', 'Scheat', 'Al Dhanab', 'Alpheratz', 'Ruchbah', 'Algol', 'Hamal', 'Alpha Hydri', 'Achernar', 'Polaris', 'Schedar', 'Mirach', 'Gamma Cassiopeiae'],
		lore: 'The Syndicate\'s heartland under the map\'s Core label, around its headquarters on Hephaestus (Markab), down to Schedar and Mirach.' },
	{ name: 'the Upper Core', short: 'Upper Core', parent: 'Syndicate', rebels: 'Upper Core Cooperative', colour: [0.45, 0.45, 0.95],
		systems: ['Moktar', 'Mirfak', 'Bellatrix', 'Menkar', 'Zaurak', 'Sheratan'],
		lore: 'The northern Core\'s frontier "core" worlds, facing the core pirates of Alcyone.' },
	{ name: 'the Earthward Worlds', short: 'Earthward', parent: 'Syndicate', rebels: 'Earthward Assembly', colour: [0.7, 0.55, 0.95],
		systems: ['Acamar', 'Kugel', 'Diphda', 'Caph'],
		lore: 'The "near Earth" Syndicate worlds one jump from Sol (Caph) and the Paradise Worlds (Acamar).' },
	{ name: 'the Lower Core', short: 'Lower Core', parent: 'Syndicate', rebels: 'Lower Core Syndics', colour: [0.3, 0.6, 0.9],
		systems: ['Matar', 'Alnair', 'Alderamin', 'Persian'],
		lore: 'The southwestern Core toward Algenib, where the Navy fought the Syndicate extremists.' },

	// ---- Pirate holdings: no major's, and never taken.
	{ name: 'the Northern Pirate Worlds', short: 'Northern Pirates', parent: 'Pirate',
		systems: ['Arneb', 'Unagi', 'Hatysa', 'Almaaz', 'Alnilam'],
		lore: 'The northern pirates beyond the Far North (the "north pirate" planets).' },
	{ name: 'the Core Pirate Worlds', short: 'Core Pirates', parent: 'Pirate', enclaves: ['Almach', 'Gienah', 'Algenib'],
		systems: ['Alcyone', 'Oblate', 'Durax', 'Misam', 'Almach', 'Gienah', 'Algenib'],
		lore: 'The core pirates east of the Syndicate (Alcyone), their den at Almach, and Gienah and Algenib, which the pirates take back when the Navy leaves Algenib ("navy done with algenib", 47 days into the Veteran start).' },
	{ name: 'the Southern Pirate Worlds', short: 'Southern Pirates', parent: 'Pirate', enclaves: ['Shaula'],
		systems: ['Citadelle', 'Alpherg', 'Belenos', 'Fumalsamakah', 'Thuban', 'Men', 'Shaula'],
		lore: 'The southern pirates past the Rim, with Thule (Men), independent since the war, and Greenrock (Shaula).' },
];
