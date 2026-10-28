"""The playthrough of the Free Worlds campaign that the Free Worlds Veteran start reproduces.

PATH lists the campaign's missions in the order a player meets them, each with the nominal number
of days until the next one is offered (travel plus the mission; 3 for a mission elsewhere, 2 for a
follow-up on the same world or next door, longer where the campaign makes the player wait), and
optionally the event the next mission waits for. Missions that the campaign offers in parallel and
that end on their own are listed with 0 days.

The branches taken (the canonical, "honorable" Reconciliation path):
  * Hope (FW Hope Recon 1C): catch the Susquehanna planting sensors and accept its captain's word (karma +1).
  * Pirates (FW Pirates 2): the diplomatic suggestion; Thule becomes independent (FW Pirates: Diplomacy,
    karma +1) instead of the attack on Greenrock (FW Pirates: Attack, FW Senate Hearing).
  * Southern prisoners: release them (karma +1), not the prison on Clink.
  * With karma 3 and the Oathkeepers' respect: FW Northern 4.1A and the liberation of Poisonwood
    (not 4.2A, where Poisonwood reverts to the Republic).
  * Bloodsea joins the Free Worlds (FW Bloodsea 1.1), not the battle for Bloodsea (1.2, karma -1).
  * New Tibet: rescue the defector (FW Defend New Tibet), which leads to the Reconciliation ending
    (free worlds 3 reconciliation.txt) instead of Checkmate (free worlds 3 checkmate.txt).
  * Karma > 0: the Navy leaves Rastaban early and Tarazed joins the Free Worlds.
  * Pug: the player's flagship had a Hyperdrive, which the campaign replaces with a Jump Drive.
Side plots not taken: the Wolf Pack (it ends at the armistice), the Conservatory (Ijs founds it anyway
in FW Reconciliation 1), the stack core hunt (the stack core goes on sale at the end anyway), the
Flamethrower (still offered after the start) and the assisted Zug expansion (the unassisted one runs).
"""

PRO = 'human/free worlds 0 prologue.txt'
ST = 'human/free worlds 1 start.txt'
MID = 'human/free worlds 2 middle.txt'
REC = 'human/free worlds 3 reconciliation.txt'
SIDE = 'human/free worlds side plots.txt'
CE = 'human/campaign events.txt'

# The first mission is offered the day after "initial deployment 4" (17 Sep 3014), which FW Recon 0 needs.
FIRST_DAY = (18, 9, 3014)

PATH = [
	# Prologue: helping the Free Worlds before the war; no events until sides are chosen.
	(PRO, 'FW Recon 0', 3), (PRO, 'FW Recon 1', 3), (PRO, 'FW Recon 2', 3), (PRO, 'FW Recon 3', 3), (PRO, 'FW Recon 3B', 2),
	(PRO, 'FW Escort 0', 3), (PRO, 'FW Escort 1', 3), (PRO, 'FW Escort 1B', 3), (PRO, 'FW Escort 2', 3), (PRO, 'FW Escort 2B', 3),
	(PRO, 'FW Escort 3', 3),
	(PRO, 'FW Katya 1', 3), (PRO, 'FW Katya 1B', 2), (PRO, 'FW Katya 2', 3), (PRO, 'FW Katya 2B', 2), (PRO, 'FW Katya 2C', 2),
	(PRO, 'FW Katya 3', 3), (PRO, 'FW Katya 4', 3), (PRO, 'FW Katya 5', 3), (PRO, 'FW Katya 5B', 2), (PRO, 'FW Katya 5C', 2),
	(PRO, 'FW Katya 6', 3), (PRO, 'FW Katya 6B', 2), (PRO, 'FW Katya 6C', 2), (PRO, 'FW Katya 7', 3), (PRO, 'FW Katya 7B', 2),
	(PRO, 'FW Katya 7C', 2),
	(PRO, 'Rescue Katya 1', 3), (PRO, 'Rescue Katya 2', 3), (PRO, 'Defend Sabik', 3),
	# Chapter 1.
	(ST, 'Liberate Kornephoros', 3), (ST, 'FW Prisoner Parole', 3), (ST, 'FW Prisoner Parole 2', 3),
	(ST, 'FW Syndicate Diplomacy 1', 3), (ST, 'FW Syndicate Diplomacy 1B', 3), (ST, 'FW Syndicate Diplomacy 1C', 2),
	(ST, 'FW Syndicate Diplomacy 1D', 3),
	(ST, 'FW Hope Recon 1', 3), (ST, 'FW Hope Recon 1C', 0), (ST, 'FW Hope Recon 1B', 2), (ST, 'FW Hope Recon 1D', 3),
	(ST, 'FW Plasma Testing 1', 2), (ST, 'FW Plasma Testing 1B', 3), (ST, 'FW Supply Convoy 1', 3), (ST, 'FW Pirates 1', 3),
	(ST, 'FW Senate 1', 3), (ST, 'FW Senate 1B', 8),  # the "fw senate timer" wait
	(ST, 'FW Pirates 2', 3), (ST, 'FW Pirates: Diplomacy 1', 3), (ST, 'FW Pirates: Diplomacy 2', 3),
	(ST, 'FW Pirates: Diplomacy 3', 3), (ST, 'FW Pirates: Diplomacy 4', 3),
	(ST, 'FW Early Warning 1', 3), (ST, 'FW Early Warning 2', 3), (ST, 'FW Early Warning 3', 3), (ST, 'FW Early Warning 4', 3),
	(ST, 'FW Early Warning 5', 2),
	(ST, 'FW Refinery 1', 3), (ST, 'FW Refinery 1A', 3),
	(ST, 'FW Rogue Elements', 0, 'wolf pack reveal'),
	# Chapter 2.
	(MID, 'FW Diplomacy 1', 3, 'navy occupying the south'), (MID, 'FW Diplomacy 1B', 3), (MID, 'FW Diplomacy 1C', 3),
	(MID, 'FW Diplomacy 1D', 3),
	(MID, 'FW Southern Recon 1', 3), (MID, 'FW Southern Recon 1B', 3), (MID, 'FW Southern Battle 1', 3),
	(MID, 'FW Southern Battle 1B', 3), (MID, 'FW Southern Battle 2', 3), (MID, 'FW Southern Battle 3', 3),
	(MID, 'FW Southern Prisoners - Release', 3), (MID, 'FW Southern Prisoners - Released', 3),
	(MID, 'FW Southern Break', 0),
	(MID, 'FW Northern 1', 3, 'fw occupying the north'), (MID, 'FW Northern 2', 3), (MID, 'FW Northern 2A', 2),
	(MID, 'FW Northern 2B', 2), (MID, 'FW Northern 2C', 2), (MID, 'FW Northern 2D', 2), (MID, 'FW Northern 3', 3),
	(MID, 'FW Northern 3B', 3), (MID, 'FW Northern 4', 3), (MID, 'FW Northern 4.1A', 3),
	(MID, 'FW Alphas 1.1', 3), (MID, 'FW Alphas 1.1A', 3),
	(MID, 'FW Bloodsea 1', 3), (MID, 'FW Bloodsea 1.1', 3), (MID, 'FW Bloodsea 1.1A', 3), (MID, 'FW Bloodsea 1.1B', 3),
	(MID, 'Pirates Use Cutthroats', 0), (MID, 'FW Dreadnoughts Ready', 3),
	(MID, 'FW Albatross 1', 3), (MID, 'FW Albatross 2', 3), (MID, 'FW Albatross 2A', 3), (MID, 'FW Albatross 2B', 3),
	(MID, 'FW Rand 1', 3), (MID, 'FW Rand 1B', 3), (MID, 'FW Defend New Tibet', 3),
	# Chapter 3: Reconciliation.
	(REC, 'FW Reconciliation 1', 3), (REC, 'FW Reconciliation 1B', 3), (REC, 'FW Reconciliation 1C', 3),
	(REC, 'FW Reconciliation 2', 0), (REC, 'FW Navy Out Of Rastaban', 3), (REC, 'fw tarazed joins', 0),
	(REC, 'FW Reconciliation 2A', 3), (REC, 'FW Reconciliation 2B', 3), (REC, 'FW Reconciliation 2C', 3),
	(REC, 'FW Defend Farpoint', 3), (REC, 'FW Embassy 1', 3), (REC, 'FW Embassy 1B', 3), (REC, 'FW Reconciliation Break', 0),
	(REC, 'FW Embassy 1C', 3, 'fw reconciliation break'),
	(REC, 'FW Syndicate Capture 1', 3), (REC, 'FW Syndicate Capture 1B', 3), (REC, 'FW Syndicate Capture 1C', 3),
	(REC, 'FW Pug 1', 14),  # waits for "pug invasion 4"
	(REC, 'FW Pug 1 Return', 2), (REC, 'FW Pug 2', 3), (REC, 'FW Pug 2A', 3), (REC, 'FW Pug 2B', 3),
	(REC, 'FW Pug 2C: Hyperdrive', 2),
	(REC, 'FW Pug 3', 3), (REC, 'FW Pug 3A', 3), (REC, 'FW Pug 3B', 3), (REC, 'FW Pug 3C', 3), (REC, 'FW Pug 4', 3),
	(REC, 'FW Pug 4A', 3), (REC, 'FW Pug 4B', 3), (REC, 'FW Pug 4C', 2), (REC, 'FW Pug 5', 3), (REC, 'FW Pug 5A', 3),
	(REC, 'FW Pug 5B', 2), (REC, 'FW Pug 6', 3),
	(REC, 'FW Syndicate Extremists 1', 3), (REC, 'FW Syndicate Extremists 1A', 3), (REC, 'FW Syndicate Extremists 1B', 3),
	(REC, 'FW Syndicate Extremists 1C', 3),
]

# Actions inside conversations on branches this path does not take: (file, line).
SKIP = {
	(PRO, 504): 'FW Recon 3B: "fw recon: caught" (only if caught by the Navy)',
	(ST, 1146): 'FW Pirates 2: the Greenrock suggestion (diplomacy chosen)',
	(ST, 1152): 'FW Pirates 2: the Antares suggestion (diplomacy chosen)',
	(MID, 253): 'FW Southern Recon 1B: the Electron Turret variant (Electron Beam given)',
	(MID, 2189): 'FW Defend New Tibet: "fw did not rescue defector" (the Checkmate branch)',
}

# Invisible missions that fire on landing once their trigger is met, emulated: their events are applied
# from the first landing after the trigger ('after <mission>' or 'event <name>').
TRIGGERS = [
	(CE, 'Ildaria Pirates Compatibility', 'event initial deployment 2'),
	(CE, 'Central Outfitters Expansion Trigger', 'event initial deployment 2'),
	(CE, 'Southern Carriers Trigger', 'event initial deployment 3'),
	(SIDE, 'FW Zug Expansion: Unassisted', 'after FW Diplomacy 1'),
	(CE, 'Navy expands typhoon sales', 'event deep sky tech available'),
]

# Other missions marked as offered so that they do not fire on the first landing (status, why).
EXTRA = [
	('event: war begins', 'declined', 'the news of the bombings, shown on landing to every pilot from 4 Jul 3014'),
	('remembrance day', 'declined', 'Remembrance Day (19 Feb 3014), shown on landing to every pilot'),
	('FW Commitment', 'failed', 'fails once sides are chosen'),
	('FW Escort: Escorts', 'failed', 'failed by FW Escort 2B on completion'),
	('FW Hope Recon 1C', 'declined', "the honorable branch: accept the Susquehanna's word and let it go"),
	('oathkeepers founded', 'declined', 'news when "oathkeepers founded" fires'),
	('plasma turret available', 'declined', 'news when "plasma turret available" fires'),
	('FW Death of Nguyen', 'declined', 'news when "death of nguyen" fires'),
	('FW Greenrock Lost Announcement', 'declined', 'news when "fw abandoned Greenrock" fires'),
	('FW Southern Break Ends', 'done', 'the break between the southern and northern campaigns'),
	('FW Reconciliation Break Ends', 'done', 'the break before FW Embassy 1C'),
	('FW Southern Recon 1B (Turret)', 'failed', 'failed by FW Southern Recon 1B on completion'),
	('FW Pug 4: Escorts', 'failed', 'fails when FW Pug 6 is done'),
	('FW Pug 4B: Enemies', 'failed', 'fails when FW Pug 6 is done'),
	('FW Pug 4B: Reinforcements', 'failed', 'fails when FW Pug 6 is done'),
	('FW Pug 5A: Enemies', 'failed', 'fails when FW Pug 6 is done'),
]
