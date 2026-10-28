// Types for js/fake-game.js: a stand-in for the game's Game, for testing mods.
import type { Game } from "./es.js";

export interface FakeShip {
	name: string;
	model: string;
	player: boolean;
	/** Disabled; when left out, a ship with no hull is. */
	disabled?: boolean;
	hull: number;
	maxHull: number;
	shields: number;
	maxShields: number;
	/** Absolute amounts, as the game answers them; the maxima give the fractions (mod API 10). */
	energy: number;
	maxEnergy?: number;
	fuel: number;
	maxFuel?: number;
	government: string;
	strength: number;
	tag?: string;
}

export interface FakeSystem {
	government: string;
	links: string[];
	inhabited: boolean;
	defense: string[];
	/** The fleets that arrive on their own, for system_fleet (mod API 3). */
	fleets?: string[];
}

/** One of the player's ships, by UUID (mod API 5). */
export interface FakeFleetShip {
	uuid: string;
	name: string;
	model: string;
	/** Installed outfits by true name, and how many of each are integrated. */
	outfits: Record<string, number>;
	integrated?: Record<string, number>;
	/** The mass integration has saved, in tons, and the outfit space it gave back. */
	massSaved?: number;
	spaceSaved?: Record<string, number>;
	/** Parked (mod API 10). */
	parked?: boolean;
}

/** An outfit the fake game knows (mod API 5). */
export interface FakeOutfit {
	display?: string;
	category: string;
	mass: number;
	cost: number;
	weapon: boolean;
	attributes?: Record<string, number>;
}

/** A planet the fake game knows (mod API 6). */
export interface FakePlanet {
	system: string;
	government: string;
	display?: string;
	/** Services the player may use there: "bank", "trading", "job board", "hire crew", "outfitter", "shipyard". */
	services: string[];
	/** The ship models its shipyards sell, by true name (mod API 9). */
	shipyard?: string[];
}

/** A ship model the fake game knows, by true name (mod API 9). */
export interface FakeModel {
	display?: string;
	cost: number;
	category: string;
	/** License names, as in the data ("Navy"); held as the condition "license: <name>". */
	licenses?: string[];
}

/** A ship destroyed in the step, for losses() (mod API 9). */
export interface FakeLoss {
	model: string;
	government: string;
	byPlayer: boolean;
}

export interface FakeGameOptions {
	/** The system the player is in (default "Sol"). */
	system?: string;
	day?: number;
	step?: number;
	/** Landed: no ships in flight, and spawn() refuses. */
	landed?: boolean;
	conditions?: Record<string, number>;
	ships?: FakeShip[];
	systems?: Record<string, FakeSystem>;
	/** Names of the plugins plugin_enabled() reports as enabled. */
	plugins?: string[];
	/** Fleet names and their strengths, for fleet_strength() and spawn(). */
	fleets?: Record<string, number>;
	/** The player's ships by UUID (mod API 5). */
	fleet?: FakeFleetShip[];
	/** Outfits added to the default ones (mod API 5). */
	outfits?: Record<string, FakeOutfit>;
	/** Mod API 6: the mod's stored text, the planets, and the planet the player is landed on. */
	data?: Record<string, string>;
	planets?: Record<string, FakePlanet>;
	planet?: string;
	/** Mod API 9: ship models added to the default ones, and the used hulls in the landed planet's shipyard. */
	models?: Record<string, FakeModel>;
	usedHulls?: Record<string, number>;
	/** Mod API 10: the standard commodities, prices ([now, as the data sets it] by system and commodity),
	 * what the player carries by commodity, and the features game.has() answers. */
	commodities?: string[];
	prices?: Record<string, Record<string, [number, number]>>;
	cargo?: Record<string, number>;
	features?: string[];
}

export interface FakeGame extends Game {}

export declare class FakeGame {
	constructor(options?: FakeGameOptions);
	here_: string;
	day_: number;
	step_: number;
	landed: boolean;
	conditions: Map<string, number>;
	ships: FakeShip[];
	systems: Record<string, FakeSystem>;
	plugins: Set<string>;
	fleets: Record<string, number>;
	reputations: Map<string, number>;
	/** Kills per tag prefix that the next player_kills(prefix) reports. */
	kills: Map<string, number>;
	/** What the mod did: */
	logs: string[];
	messages: string[];
	changes: string[];
	spawned: { fleet: string; government: string; tag: string; arrive: boolean }[];
	map: ({ line: [string, string]; color: [number, number, number] }
		| { marker: string; color: [number, number, number]; label: string }
		| { detail: string; title: string; text: string; color: [number, number, number] }
		| { mapLabel: string; text: string; color: [number, number, number] }
		| { ring: string; scale: number; color: [number, number, number] })[];
	planetButtonLabel: string;
	panel: { title: string; text: string; buttons: string[]; columns?: string[]; rows?: string[][]; full?: boolean; selected?: number; charts?: { label: string; values: number[] }[] } | null;
	/** Mod API 8: jobs offered on this landing, by name, and their text. Clear it between landings. */
	jobs: Map<string, string>;
	/** Mod API 5. */
	fleet: Required<FakeFleetShip>[];
	outfits: Record<string, FakeOutfit>;
	/** The outfitter's selected ships' UUIDs, the one in focus first. Set it before the outfitter hooks. */
	outfitterShips: string[];
	outfitterButtonLabel: string;
	/** Dialogs game.confirm() opened; a test answers OK by calling on_confirm(game, token). */
	confirms: { text: string; token: number }[];
	/** Mod API 6. */
	storage: Map<string, string>;
	planets: Record<string, FakePlanet>;
	/** The planet the player is landed on; planet() answers it while landed. */
	planet_: string;
	/** Dialogs game.ask_number() opened; a test answers OK by calling on_number(game, token, value). */
	numberAsks: { text: string; token: number; most: number }[];
	/** Mod API 9. */
	models: Record<string, FakeModel>;
	/** Whether ship_stock_on(true) was called. */
	shipStockOn: boolean;
	/** Shipyard stock by "<planet>\u0000<model>"; an absent pair is untracked. */
	shipStock: Map<string, number>;
	orderNotes: Map<string, string>;
	/** Ships bought with buy_ship(), which also adds them to `fleet` and charges the "credits" condition. */
	purchases: { model: string; name: string; planet: string }[];
	/** The ships destroyed in the coming step: set it before on_step, and empty it after. */
	stepLosses: FakeLoss[];
	/** Used hulls in the landed planet's shipyard, by model, for ship_in_stock(). */
	usedHulls: Map<string, number>;
	/** Mod API 10. */
	commodities: string[];
	prices: Record<string, Record<string, [number, number]>>;
	/** What the player carries, by commodity, for cargo(). */
	carried: Map<string, number>;
	/** Whether outfit_stock_on(true) was called, and outfitter stock by "<planet>\u0000<outfit>". */
	outfitStockOn: boolean;
	outfitStock: Map<string, number>;
	/** Ships ship_remove() took out of `fleet`. */
	removed: FakeFleetShip[];
	features: Set<string>;
	/** The notification patterns the mod listens for. */
	listening: Set<string>;
	/** What the mod posted with notify(), when this game is on no FakeBus. */
	posted: { name: string; payload: string }[];
	/** Notifications queued for the mod with receive(); drain(mod) delivers them. */
	incoming: { name: string; payload: string; sender: string }[];
	/** The timing sections the mod named. */
	sections: string[];
	bus: FakeBus | null;
	busName: string;
	/** Queue a notification for this game's mod, from `sender`. */
	receive(name: string, payload: string, sender: string): void;
	/** Deliver the queued notifications the mod listens for to its on_notification. */
	drain(mod: { on_notification?(game: Game, name: string, payload: string, sender: string): void }): void;
}

/** Mod API 10: the notification bus between several mods, each with a FakeGame of its own. */
export declare class FakeBus {
	constructor();
	members: Map<string, { mod: object; game: FakeGame }>;
	queue: { name: string; payload: string; sender: string }[];
	/** How many deliveries the last drain() made, and every delivery so far. */
	lastDeliveries: number;
	delivered: { to: string; name: string; payload: string; sender: string }[];
	/** Join a mod, under its name, and its game: the game's notify() posts to this bus. */
	join(name: string, mod: object, game: FakeGame): void;
	post(sender: string, name: string, payload: string): boolean;
	/** Deliver the queue as the game does (no self-delivery, 4 rounds or 1024 deliveries); answers how many. */
	drain(): number;
}
