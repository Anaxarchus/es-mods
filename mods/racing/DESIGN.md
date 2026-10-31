# The Racing League: design (spoilers)

> The build contract for the mod: every system and number. If you want to
> discover the leagues in play, read the README instead.

A team-management game in Endless Sky (Argosy, built against the released
mod API 11, `min_api` 10; Dado loader 0.3.0). The player never races: they own
a racing team, hire its staff, fund research on its car, sign sponsors and
climb three leagues. Races are simulated weekly and told as results, a story
lap by lap, and news. The whole world is DadoScript in `src/`; `data/` holds
spaceport news near each week's circuits (`racing.txt`, generated) and the
intro mission line (`racing intro.txt`, §13.7).

| file | what |
|---|---|
| `racing.dados` | the mod: hooks, loading and saving, the bus, messages |
| `World.dados` | the world: leagues, calendar, the week's schedule, money, seasons, buying, selling and reviving teams, names, lifetimes and prestige, the archive, saving |
| `Race.dados`, `Result.dados` | one race of twenty cars, lap by lap; its result |
| `Team.dados` | a team: car, seats (two pilots and the crew), money, season |
| `Staff.dados`, `Person.dados` | the staff pool, records, prices, hiring, poaching, careers |
| `Bio.dados` | bios, the hidden peak people grow toward, the scouts' potential |
| `Lore.dados` | notable performances, fame, traits earned on the track |
| `Sponsors.dados`, `Sponsor.dados`, `Deal.dados` | sponsors, deals, clauses, the Corporations bridge |
| `Events.dados`, `Incident.dados` | daily events and their dialogs |
| `Value.dados` | what a team sells for: assets, standings, marketability; sponsor money by season |
| `Office.dados` | the racing office (the UI) |
| `Book.dados`, `Bet.dados` | the Paddock Book: betting for players who own no team (§12) |
| `Intro.dados` | the intro mission line's handover: the Wexley-Thorne team and its four people (§13.7) |
| `Names.dados`, `Rng.dados`, `Fmt.dados` | names and circuits, the dice, numbers as text |

## 1. Time

A week is seven days from the world's start; a season is `WEEKS` = 12 weeks:
`ROUNDS` = 10 race weeks, then a two-week off-season. One small piece of work
per day, so `on_day` stays cheap (QuickJS: about 0.7 ms a day on average,
measured before two cars; twenty-car race days take about 1.7× as long as
ten-car ones did in V8, the other days the same):

| weekday | work |
|---|---|
| 0, 1, 2 | the B, A, S League's round (race weeks) |
| 3 | money: salaries, running costs, interest, sponsors' pay, AI owners' backing and budgets, bankruptcy, the player's ledger and forced sale |
| 4 | R&D: every department develops |
| 5 | staff: careers, rivals' offers lapsing, vacancies, poaching |
| 6 | sponsors: offers, walk-away clauses, the roster request to Corporations |
| every day | the player's team may have an event |

The season's turn uses the off-season's idle race days: the season ends on
weekday 0 after the last round (championship pool, titles, sponsor targets,
AI owners in the red); in the last week, weekday 0 starts the next (promotion
and relegation, regulations, entry fees, calendar), weekday 1 runs contracts
out, weekday 2 fills empty seats. A long gap in days (a mission skipping
months) plays out at most one season of days.

## 2. Leagues and money

Three leagues of 10 teams, each running two cars (§5.1): B, A and S. Money
scales with the league (`scale` 1, 6, 36):

| | B | A | S |
|---|---|---|---|
| franchise (the money scale: a place's worth, overdraft, fees) | 1M | 10M | 100M |
| race prize pool (by car, 20 places: 13%, 10%, 9%, 8%, 7%, 6.5%, 5.7% .. 1.2%; a team's two cars' together) | 290k | 1.74M | 10.4M |
| championship pool (by the teams' table: 22%, 16%, 13%, 11%, 9%, 8%, 7%, 6%, 5%, 3%) | 1.5M | 9M | 54M |
| season entry fee (4%) | 40k | 400k | 4M |
| running costs a week (half in the off-season) | 6k | 80k | 500k |
| crash repairs (35k × scale × 0.5–1.5) | ~35k | ~210k | ~1.3M |
| promotion grant (20% of the new franchise) | — | 2M | 20M |
| relegation parachute (4% of the old) | 40k | 400k | — |

Points 25-18-15-12-10-8-6-4-2-1 to the first ten of the twenty cars (as in
F1, which also runs twenty), to the car's pilot (the drivers' championship)
and its team (the teams' championship: both cars' points). The teams'
championship is the one that counts for a team: by it teams go up and down
at the season's turn (§2.2), the championship pool pays, sponsors' targets
are set and met, and a team's standings are valued (§2.1). It is the team's
season; the drivers' is the pilot's own (§5.1).

There are no franchise fees: the player buys an existing team at its price
(§13.1), or revives a defunct one in a place the league keeps for them in
the B League (§13.5). Selling pays what the team is worth (§2.1; a negative
sale is taken from the player's credits, never below 0), and the team races
on under AI owners. Buying and selling at once always loses money (the
owners' premium). The team keeps its own cash: the player puts money in and
takes it out (Finances), in thousands.

Overdraft: a team may go below 0 at 1% a week. Past 25% of the franchise the
player is warned each week; past 40% two money days running, the league forces
a sale at 35% of the franchise (`FIRE_SALE`) plus the cash (the overdraft),
with no premium; the team races on under AI owners. The player may buy
again.

### 2.1 What a team is worth

`Value.dados`. A buyer pays the assets, plus a premium for the standings, one
for the marketability and one for the prestige (every team is valued so: the
player's, and the ones for sale, §13.1):

- **assets**: 55% of the league's franchise (`SALE`) + the team's cash (less
  any overdraft). (It was 55% × 0.9–1.1 by table position + cash; the
  position moved to the standings.)
- **standings**: each season of the last `SEASONS` = 5 (the team's history):
  the franchise of the league it was played in × (`STAND_K` 0.8 × q³ +
  `TITLE_K` 0.6 for a title), q = 1 first .. 0 last (5th of 10 is 0.8 ×
  0.17 = 0.14). The season under way counts its table so far × the share of
  its rounds run, without a title; not for a team bought this season (none
  of it is its own).
- **marketability**: `MKT_K` 1.5 × what sponsors paid each season (weekly pay
  and podium bonuses) net of the penalties paid back, less what a team in
  that league usually gets (`MKT_BASE` 250k × scale a season: 250k, 1.5M,
  9M, about the median; measured over three worlds × six seasons, sponsors
  paid the champions about 2.1M, 12.8M, 36M a season and the last about
  120k, 600k, 4M). The season under way counts the money so far against the
  usual pro rata (rounds run, or weeks since a team bought this season was
  bought). Never below −`MKT_FLOOR` 5% of the franchise. It counts money, not
  targets hit or missed: a deal that paid 4.8M and missed (4 weeks' pay back)
  adds 3.2M; one that paid 120k and hit, 120k. Plus `fame` (§6.2): the
  fame of the team's people, F = the pilots' (`pilot_fame`: the better
  one's + `PAIR_FAME` 0.5 × the other's, at most 100) + 0.35 × each crew
  member's,
  as `FAME_K` 12% of the franchise × F / (F + 100): never 12% (a household
  name in the seat, fame 100, alone is 6%); measured after ten seasons, the
  B League's teams' people add 0–35k, the A League's 30–400k, the S League's
  0.7–6M.
- **prestige**: `PRESTIGE_K` 20% of the franchise × prestige / 100 (§13.3):
  lifetime, so it neither decays nor drops at a season's turn; a legendary
  old champion (prestige 90) adds 18% of the franchise, about a third of the
  place's own worth (`SALE` 55%). Measured after ten AI-only seasons:
  prestige 0–40 in the B League (median 14), 0–48 in the A League (15),
  1–72 in the S League (34).

Every season's standings and sponsor money are weighted `DECAY` = 0.5 per
season of age, with now counted in rounds (season s ends at s; a round is a
tenth): a title is worth its full weight when won, 71% halfway through the
next season, 50% at its end, and nothing after five seasons. There is no
drop at the season's turn.

The value never goes below the assets less 5% of the franchise: a team that
earns less from sponsors than a usual one, or paid back more than it earned,
is a small liability to a buyer, but the place in the league is what is
bought and it still sells. A team that loses and that sponsors shun sells for
about its assets.

**Related parties**: sponsor money from the player's own company is booked
apart (`sponsor_related`) and counts `RELATED_K` = 0: a self-sponsored team is
worth its cash and no more. It is booked as it is paid, so on a team the
player buys only what their company paid during their ownership is related:
what it paid the team before, at arm's length, is in the price the player
paid for the team. On buying, such a deal paying more than its worth (the
bridge lets a company offer an AI team up to 1.5× its worth) is cut to its
worth (`Sponsors.take_over`), as the bridge holds offers to the owner's own
team (`SELF_PAY`), with a message. Racing knows no other mod, so it takes a sponsor
known only by its direct offers (`racing.sponsor_offer`, source "direct";
through the bridge, only the player's company sends them) paying the player's
team as the owner's. Its payments and penalties still move the team's cash.

Examples, mid-season (round 5) of season 4, with the measured sponsor money:

| team | assets | standings | marketability | value | old formula |
|---|---|---|---|---|---|
| S champion three seasons running, leading, 36M a season from sponsors, 40M cash | 95M | 213M | 70M | 379M (4.0×) | 100.5M |
| A, 3rd, 4th, 3rd, 3rd now, 3.3M a season, 2M cash | 7.5M | 6.1M | 4.6M | 18.2M (2.4×) | 7.8M |
| A, 5th every season, 1.5M a season (the usual), 2M cash | 7.5M | 2.4M | 0 | 9.9M (1.3×) | 7.6M |
| the same, its sponsor money all from the player's company | 7.5M | 2.4M | −0.5M | 9.4M | 7.6M |
| B, 9th, 10th, 8th, last now, 140k a season, 100k cash | 0.65M | 0.01M | −0.05M | 0.61M (0.93×) | 0.59M |

In a simulated world after six seasons (AI teams valued the same way), the S
League's teams range from about 56M to 335M, the A League's 5–34M, the B
League's 0.5–2.5M.

Sponsor money is booked as it is paid (Sponsors: pay, podium; penalties at
the season's end or when the player ends a deal) on every team, and closed
into the team's `sponsor_history` at the season's end (after the clauses).
Saves from before: on loading, each team's history is estimated from its
deals still running: their payments this season are this season's, all they
paid before goes to the season before. Deals that have ended and penalties
paid are not known, so the estimate errs low (the price is never inflated by
it); it is a fair start that real seasons replace within a few.

Measured before two cars (tools/balance.mjs, 8 seeds, a bot that hires the best staff it can
afford, signs away good people, funds R&D from what comes in and signs
sponsors whose targets it can meet): five of eight bot teams reach the S
League within 3–8 seasons of founding in B, two stay in B, one is sold for
debt. In S a winning team clears about 20M a season; a losing one on the same
budget loses about 27M (test/money.test.mjs). AI teams fold a few times in ten
seasons, mostly relegated owners.

### 2.2 Promotion and relegation

`World.movers`, `promotions`, `eligible`. At the season's turn, by last
season's final teams' tables:

- **Up** from the B and A Leagues: the top **eligible** teams, at most
  `MOVE` = 2. An ineligible team is passed over and the next eligible one
  goes instead (the passed-over team keeps its title, place and prize money;
  a news line, and a message if it is the player's: "... won the B League but
  is not yet eligible for promotion (2nd season there of the 3 it needs)").
- **Eligible** at the end of season *s*: *s* is at least the team's
  `PROMO_SEASONS` = 3rd season in a row in its league (`s − since + 1 ≥ 3`,
  `Team.since` = the first season it raced wholly there), or it came down
  into the league by relegation (`Team.rebound`: eligible at once, every
  season until it leaves the league). So a team promoted at the start of
  season 5 may go up again at the end of season 7 at the earliest; a team
  relegated at the start of season 5 may go straight back up at the end of
  season 5.
- `since`: a team that moves league counts from the new league's first
  season (`move`: since = the new season, rebound = it came down). A team
  that joins a league otherwise (a defunct team's successor, a revived team,
  any new team: `first_full_season`) counts from this season if its league
  has not raced yet this season, else from the next: so it needs three whole
  seasons. The first teams of a new world have been in their league since
  they were founded (their age from before the records, §13.3), so some are
  eligible from the start and some not. Buying or selling a team changes
  nothing (it keeps its seasons).
- **Down** from the A and S Leagues: as many as go up from the league below
  (`promotions(l − 1)`: its eligible teams, at most `MOVE`), the bottom ones;
  a team new to its league this season (a revived team, §13.5; a bankrupt
  team's successor inheriting the flag; a team founded under the old rules,
  in an old save) is spared, and the next one up goes instead. No eligible
  team below: nobody goes down, and the bottom teams are told they stay up
  ("No B League team was eligible for promotion, so X and Y stay in the A
  League"). Relegation is driven by promotion, so every league keeps its
  size (the B League's eleventh team too, §13.5); and a league never
  promotes more than the league above has teams not spared.
- A team the player buys is no newcomer: it keeps its place in the table,
  the zone it is in, and its seasons in the league.

The Standings' Zone column shows it as the table stands: "promotion" for the
top eligible teams, "eligible in N seasons" for a team not yet eligible (it
may go up at the end of season now + N), "relegation" for as many of the
bottom as can come up from below, "spared", and "safe (no challenger)" for
the bottom `MOVE` who stay up for want of eligible teams below; the
explanation under the table says how many go up and down this season. The
Team tab and the sidebar tell a team's own standing ("Its 2nd season in a
row in the B League: eligible for promotion from the end of season 6").

Old saves (no `since`, `rebound`): `estimate_stay` from the team's history
(every finished season, "season:league:place"): the run of seasons at its
end in the league it is in; if the season before the run was in a higher
league, it came down (rebound); a team in another league than its last
season's moved at this season's start. Where the run goes back to the
team's first known season, the benefit of the doubt: in its league since it
was founded, and a team of the first season (whose past is from before the
records) eligible at once (since = 1 − 3). No history at all: since it was
founded (a first team: eligible).

No consolation money for a team passed over: it has the title, the
championship pool's share, and the next season to be eligible in.

## 3. AI teams

Each has owners' `backing` a week (B 10k, A 60k, S 360k × 0.6–1.5; scaled on
promotion and relegation), a development rate (0.55–0.8, +0.1 a league up), and
an organisation `org` (0.5–1.0): how well its R&D money turns into speed. The
player's team is 1.0: being well run is the player's edge. A week's R&D budget
is the development rate × (backing + sponsors + an average prize) − 90%
(`AI_SALARY`; half before two cars) of the salaries, plus 2% of cash above a reserve (8% of the franchise), × 0.6 in the
red; owners take 5% a week of cash above twice the reserve. Split 25/25/20/15/15
over the departments.

Owners give up and the team goes defunct (§13.4: it goes to the archive,
and a new team, age 0, with a new name, a weaker car, the old points, and new
staff and sponsors, takes its place): two seasons in the red, or 30% (`FOLD`)
of the time in the red at a season's end; relegated owners sell up 30% of the
time from S, 15% from A; 8% of owners a season cut their backing to 30%.
Bankruptcy outright past −40% of the franchise. A team the player sold is an
AI team like any other and may go defunct too. Measured (8 AI-only worlds ×
10 seasons): about 23 teams go defunct in a world's ten seasons (26 before
this change, the same rule), two or three a season of 30; at least 9 teams
of every league were for sale on every day sampled.

## 4. The car

Five departments: propulsion, handling, reliability, armour, simulation. A
week's gain is `DEV_K` (0.5) × √(budget / 1000) × the research officer's yield
(1 + 0.35 × skill, ± 0.1 noise, less for a steady one) × `org` × simulation's
boost (1 + (simulation − 15) / 150, for the other four) / (1 + level / 40).
Regulations: at each new season every level keeps 50% of its excess over 15;
one department chosen at random (of the first four) keeps 30%. The car rating
shown is the mean of the four racing departments.

## 5. A race

Circuits are 32 real systems (Sol, Alpha Centauri, Vega, ... Kochab), each
with a character: sprint lanes (24 laps of 62 s; propulsion 65%, handling 25%,
armour 10%; crash 3%), asteroid course (18 × 84 s; 20/65/15; 6%), hazard run
(16 × 96 s; 25/30/45; 11%), mixed (20 × 78 s; 40/40/20; 4.5%). Each league's
calendar draws 10 different circuits a season.

Lap time = base × factor × (1 + noise), factor = 1 − 0.06 × (pace − ln 20) −
0.015 × pilot skill − setup − form + approach, where pace is the character's
weights over the logs of propulsion, handling and armour; setup is the race
engineer's 0.006 × skill ± 0.004 noise; approach +0.4% (conservative), 0,
−0.4% (aggressive), with crash risk × 0.6, 1, 1.6. Lap noise 0.4% × (1 − 0.3 ×
pilot skill). The grid is a qualifying lap; cars start 0.6 s apart. One stop
each, near half distance (a good engineer within a lap): 18 s of pit lane
plus 2.8 − 0.5 × crew chief skill + |noise| s, botched (+6–14 s) 6% × (1 −
0.6 × skill) of the time. Mechanical failure: 10% × 25 / reliability a race.
Crash: hazard × (30 / armour)^0.6 × (1 + 0.5 × pilot aggression) × (1 − 0.35 ×
pilot skill) × approach; 60% end the race (and cost repairs), the rest cost
5–12 s. A faster car behind must pass: 45% + its pilot's aggression and skill
+ the pace gap; else it is held 0.3 s behind. The player's league's race is
told lap by lap (start, the player's grid slot and battles, lead changes,
every retirement and botched stop, the finish and fastest lap); every race
makes a news line.

### 5.1 Two cars, two championships

Every team runs two cars of its one design, F1 style: the #1 pilot's (seat
0) and the #2's (seat `SECOND` 5); the four crew members work for both.
Twenty cars a race; the pace differences within a team come from the pilots
(skill, aggression, traits), the setup (the engineer's, drawn for each car),
the stops and the dice.

- **The pit crew** services one car at a time: two cars called in on the
  same lap (each car's stop lap is drawn as before) is a double stack, the #2
  waiting for the #1's stop + `STACK` 1 s, unless the engineer is good (skill
  over 0.3, or a Strategist) and keeps them a lap apart.
- **Team orders**: a #1 behind its #2 gets `ORDERS` +0.3 on its passing
  move; a #2 behind its #1, −0.15. Measured: the #1 is ahead at the flag in
  about 60% of races. The player swaps the two on the Team tab.
- **Crashes, failures, repairs** are each car's (two wrecked cars, two
  repair bills). Events' form is the team's, for both cars.
- **Records**: each pilot gets their own car's race. A pilot's measure is
  places gained on where the car's pace puts it: the team's pace rank among
  the teams R (1 the fastest design; both cars share it) expects the car at
  2R − 0.5 on the grid of twenty; scored /6 (it was /3 on ten cars, the same
  rating). The crew get the team's race: both cars' points; a win, podium or
  retirement once, by the best car; one observation of their measure, the
  two cars' mean.
- **The teams' championship**: both cars' points, wins (a car's), podiums
  (each car's); a team's race (`Team.finishes`, what sponsors' walk-away
  clauses and the table's tie-break read) is its best car's place among the
  teams, 1..10. A podium bonus is paid once a race, by the best car.
- **The drivers' championship**: each pilot's points, wins, podiums, starts
  and best finish this season (`Person.d_*`, in one league: a pilot who moves
  league mid-season starts that league's tally again; one released keeps
  theirs). Stand-ins score for their team only.
- **Titles**: the drivers' champion's title is the pilot's (`titles` +1, a
  title in their history, fame 15 × the league); the teams' champion's is the
  team's and its crew's (fame 6), and its pilots keep "teams' champion" in
  their history (fame 5; their title count is the drivers'). Both go on the
  news; `racing.champion` names the teams' champion and the drivers'
  (`driver`, `driver_team`).
- **Head-to-head**: teammates are counted against each other through the
  season (`h_*`: races together, ahead on the grid, ahead at the flag; a new
  teammate starts it again). At the season's end, ahead in 80% of 5 or more
  races is a line in the history ("out-raced teammate Ivo Yilmaz all season",
  "outqualified ... 8 times in 10"; fame 1.5 and 1) and the Team tab shows it
  as it stands.
- **Sponsors and fame**: the pilots' fame as one, `pilot_fame` (the better
  one's + half the other's, at most 100), is what draws sponsors (`FAME_PAY`)
  and adds to a team's value (§2.1).

**Old saves** (one pilot a team): on loading, each team's pilot keeps the #1
seat and gets the team's season so far as their drivers' tally (points, wins,
podiums, starts, best finish); the team's points stay its teams' points. The
pilots' pool grows to its new size (rookies with careers drawn as at the
start), AI teams fill their #2 seats from it, and the player is told their #2
seat is empty (a stand-in drives it until they hire). Old results show their
one car a team with the #1 pilot. Saved again, the world plays on as one in
memory would (tested).

**Balance.** The second pilot is a second salary: AI teams' wage bills rose
by about a fifth to a third, and with nothing else changed more of them ran
in the red (24% of weeks in every league, from 17–20%) and owners folded more
often. Two changes keep the leagues viable, without giving the money back: the
race prize pool is 290k × scale (from 250k: +16%, paid by car), and AI owners
budget R&D after 90% of their salaries (`AI_SALARY`, from 50%), so their cars
develop a little less. Measured with `tools/balance.mjs` and AI-only worlds
(32 seeds × 10 seasons, per team and week, before → after):

| | B | A | S |
|---|---|---|---|
| AI salaries a week | 15.8k → 21.2k | 58.1k → 74.1k | 197k → 236k |
| of it the pilots' | 4.5k → 9.6k | 15.5k → 31.3k | 51k → 100k |
| AI cash | 0.37M → 0.41M | 2.80M → 2.74M | 15.6M → 15.5M |
| AI R&D a week | 40k → 32k | 285k → 264k | 1.77M → 1.78M |
| weeks in the red | 19% → 13% | 17% → 19% | 20% → 22% |
| bot founding here (16 seeds): reached S | 8 → 9 | 6 → 9 | 16 → 15 |
| forced sales | 2 → 4 | 6 → 5 | 0 → 1 |
| bot's mean cash after ten seasons | 3.3M → 3.5M | 8.6M → 12.0M | 16.6M → 19.9M |

AI owners folding: 60 → 58 times in 320 world-seasons (giving up in the red
22 → 25, relegated owners selling up 37 → 33). The player's wage bill is the
cost that grew most (the bot's mean salaries a week, founding in A, 172k →
226k; in S 474k → 528k), so a team that climbs is dearer to run, as F1's
second car is.

## 6. Staff

`POOL` = 42 people per role (30 seats and 12 free), 84 pilots (60 seats and
24 free), shared by every team.
Hidden: skill and trait (≈ normal × 0.45 within −1..1; trait is a pilot's
aggression, otherwise steadiness), and the peak (§6.1); skills drift ±0.04 a
season, and those with room to grow move 30% of the way to their peak. Visible: races, wins, podiums, points, titles, retirements,
crashes, best league, crises handled (good/bad), and the role's measure:
places gained against the car's pace rank (pilot; on a grid of twenty since
two cars, §5.1), setup in tenths of a
percent (engineer), average stop (pit crew chief), R&D yield (research), deal
yield (commercial). The starting pool has careers of 0–8 seasons drawn from
its hidden stats.

Rating = the role's scores summed / (observations + 10), + 0.06 × (good − bad
crises), within ±1. Ask a week = ROLE_BASE (pilot 3.5k, engineer 2k, research
2k, pit 1.5k, commercial 1.8k) × e^(2.5 × rating) × 1, 2.5 or 6 (best league)
× (1 + 0.08 a title) × (0.75–1 by experience) × (1 + `FAME_ASK` 0.35 ×
fame / 100), to 100 credits.

AI hiring: the best of experience (0.5 × races/40) and rating (2 ×) with a
little noise among those asking at most 8% of the team's weekly income; else
the cheapest. Each empty seat is filled this way, both pilots' included. Contracts (§6.3) run 1–3 seasons (AI) or 1–5 (the player); at
the end AI teams keep three in four rated above −0.2 at their ask. Careers
last 12 ± 4 seasons; a retiree's place goes to a rookie.

The player hires from the Staff tab (a pilot to the seat chosen, "Seat: #1"
or "#2", by default the empty one; "Find a pilot" from a pilot's row picks
that row's seat): free people at their ask (a signing fee
of 2 weeks), or anyone at another team at 1.3× their ask plus the buyout of
their contract (§6.3) to that team; whoever they replace is paid their release
clause. Poaching: each week each AI team has 3% (12% in the off-season) to go
after someone with 20+ observations rated 0.15 better than its own (for a
pilot, its weaker pilot, whose seat they take), in its league or below, at 1.3× ask, if it can afford the buyout (§6.3). For the
player's staff that is an offer: 7 days to match it (Team tab: a retention
bonus of 4 weeks of the new salary; the contract runs at least to the end of
next season), else they leave and the player gets the buyout. An empty seat
is filled by a stand-in (skill −0.6, no record), so the team always races,
both cars.

### 6.1 Bios and potential

`Bio.dados`. Each person has a third hidden stat, `peak`: the skill they grow
toward, drawn once when they join the pool: skill + youth × max(0, 0.1 +
0.22 × a normal draw), youth = 1 − races / 60 (within 0..1). So rookies have
about 0.15 of headroom on average (some none, a few 0.5+), a long career
none. Each season a person with headroom gains `DEVELOP` = 30% of what is
left (replacing the old flat +0.04 under 30 races; the pool's mean skill
over eight seasons is unchanged, measured). The skill they joined with is
kept too (`skill0`): bios are told from it.

All of it is drawn from the person's own dice (Rng seeded by the world's
start day and the person's id), never the world's, so it changes nothing
else, and nothing but `peak` and `skill0` is saved: the bio and the scouts'
error are told again from the same dice.

**Bio**: four to six sentences: where they are from (40 real worlds of human
space in eight regions: the core, the wealthy worlds, the Deep, the
frontier, Syndicate industry, the hard-scrabble south, pirate havens,
stations), how they came to the job (by role), how they handle it (a pilot's
aggression, otherwise steadiness), whether they have more to give, and
sometimes what the paddock says of them and a quirk. Each hinting sentence
is picked from five tiers (−2..2) by its stat plus noise against steps at
±0.15 and ±0.5: the path into the job from skill0 (noise 0.3), the temper
from the trait (0.3), the outlook from the headroom ((peak − skill0 − 0.12)
× 2.5, noise 0.25), the paddock's word from skill0 (0.5); 12% of hints are
turned around (the middle tier says nothing either way). Measured over 840
people: correlation about 0.64 (path and skill), 0.65 (temper and trait),
0.49 (outlook and headroom), 0.5 (the paddock's word and skill); of the best
quarter, 20% have a noncommittal or poor path into the job (11% poor), and
13% of the worst quarter a glowing one.

**Scouts' potential** (0..100): 50 + 45 × max(peak, skill) + σ × z, z a normal
draw fixed for the person, σ = 5 + 15 / √(1 + races / 15): about ±20 for a
rookie, ±13.7 at 30 races, ±11.7 at 60, never under ±5. The record narrows
the guess but never gives the answer. Correlation with the truth about 0.83;
mean error about 15 for rookies, 8.5 past 60 races.

Shown in the office: a Potential column (the scouts' range, potential ± σ)
on the Staff and Team tabs, and the potential and bio under the record when
a person is chosen. Saves from before bios: on loading, everyone without a
peak gets one from their own dice and their record now (skill0 = skill), so
the same save always gives the same bios.

### 6.2 Lore: notable performances, fame, traits

`Lore.dados`. None of it draws the world's dice: it follows from the races
(and R&D weeks and sponsor deals), so it changes nothing but what it is
meant to. A race is read against its own expectations: each car's pace rank
(1 the fastest design of the field, from the car alone; a team's two cars
share it; `Result.ranks`, not saved) and its grid slot. On a grid of twenty
the car is expected at 2 × rank − 1 (the better of its team's two slots).

**History** (`Person.notes`): a pilot's race is notable as (the most notable
one, if any) a first career win, a win in the 4th-fastest car or slower
(upset), a win from P5 or further back, a plain win, a podium in the
6th-fastest car or slower, a charge (8+ places from the grid, into the top
6), points on debut, or a crash out from the front row (a win "from the
back" is from P7 or further back); plus milestones (the
50th, 100th, 150th, 200th race; 10th, 25th, 50th, 100th win), titles,
promotions and traits earned. The crew: titles, promotions, their team's
upsets, a stop of 2.3 s or less, a setup worth 0.9% a lap or more, a botched
stop; research officers and commercial directors through their traits.
Stored as compact entries (`season:round:league:circuit:code:a:b:team`, about
13 KB in a ten-season save) and told when read, newest first, under the bio:
"Season 10, round 4, the Hassaleh Scramble (A League): won in only the
7th-fastest car, from P1 with Albedo Racing." At most `HISTORY` 10 entries
besides titles (all titles are kept), at most `SAME` 3 of one kind (a fourth
plain win replaces the oldest); past 10, the least notable goes (each kind has
a score, +10 a league up; an upset 55 + 3 × the car's rank, a plain win 20).

**Fame** (0–100): each notable thing adds its points × the league (1, 1.5, 2)
× (1 − fame/100), so it never passes 100. A pilot: a win 3 (+2 a first, +3 an
upset, +2 from P5 back), a podium 1 (+2 in the 6th-fastest car or slower), a
charge 2, points on debut 1.5, a crash from the front row −1, a title 15,
promotion 3, a trait 3, the teams' title with the team 5, out-racing a
teammate all season 1.5 (outqualifying 1). The crew: their team's win 0.8 (+1.5 an upset), their
own quick stop or setup 0.8, a title 6, promotion 1, a trait 2. Each new
season keeps `FAME_KEEP` 80%. Labels: under 5 a paddock unknown, 15 known in
the paddock, 30 a name to watch, 50 a fan favourite, 75 a star, then a
household name. Measured after eight seasons: of 210 people, about 125 are
unknown, 30 names to watch, 7 fan favourites, 3 stars; the best pilot 55–68.
Effects: the ask × (1 + 0.35 × fame/100); the team's value (§2.1); a new
sponsor deal pays × (1 + `FAME_PAY` 0.15 × the pilots' fame/100, §5.1).

**Traits** (at most `MAX_TRAITS` 3, never lost, never twice): earned when a
feat has been done the trait's number of times (`Person.progress`; Steady
Crew's is a streak that a slow or botched stop resets). Each maps onto one
real input of the race or the week:

| trait | role | feat (times) | effect |
|---|---|---|---|
| Giant Killer | pilot | a win in the 4th-fastest car or slower (3) | lap factor −0.1% everywhere |
| Comeback King | pilot | a charge: 8+ places from the grid into the top 6 (3) | +0.06 on its passing moves |
| Hazard Master | pilot | 6+ places better than the car's expected place (2 × rank − 1) at a hazard run (3) | −0.25% a lap at hazard runs, crash risk there × 0.9 |
| Rock Dancer | pilot | the same on an asteroid course (3) | −0.25% a lap on asteroid courses |
| Iron Nerves | pilot | a win from pole in the 3rd-fastest car or slower (3) | rivals' passing moves on it −0.06 |
| Metronome | pilot | the fastest lap in the 4th-fastest car or slower (2) | lap noise × 0.85 |
| Setup Wizard | engineer | a setup worth 0.9% a lap or more (3) | setup +0.08% a lap |
| Strategist | engineer | 3+ places gained on both the grid and the car's expected place, by either car (4) | always pits within a lap of half distance; keeps the two cars' stops a lap apart |
| Lightning Stops | pit crew chief | a stop of 2.6 s or less (5) | stops −0.15 s |
| Steady Crew | pit crew chief | 15 races running with both stops 3.0 s or less | botch chance × 0.6 |
| Breakthrough Mind | research | an R&D week's yield 130% or more (6) | yield +0.05 |
| Rainmaker | commercial | a deal at 120% or more of the going rate (6) | deal yield +0.05 |

The most a pilot gains on a circuit is 0.35% a lap (Giant Killer and a
circuit kind's trait), within PILOT_K × 0.25 of skill; three pace traits move
a midfield A League team about 0.1–0.2 of a place a race on average (tested
over 300 races from the same dice). Measured: after eight to ten seasons a
quarter of the pool (40–60 of 210) has a trait, 2–9 people three.

Shown in the office: a Fame column and trait tags after the name ("Ivo
Yilmaz [Me IN GK]") on the Staff and Team tabs; under the record when a person
is chosen, the fame and its label, the traits with their effects, and
"Notable:" with the history after the bio.

### 6.3 Contracts

Contracts are exclusive, to the end of a season, at a salary locked when
signed (`Person.signed`; `contract_end` the last season). The player picks the
length on the Staff tab ("Contract: 1..5 seasons" before Hire or Sign away):
the salary is the ask × (1 + `LENGTH_K` 0.03 × (seasons − 2)) (one season
3% less, five 9% more); AI teams sign for 1–3 at the ask. A cheap rookie
signed for five seasons stays cheap as they grow: measured with the bot below,
the player's staff were paid 45–78k a week less than their asks of the day
(founding in B, A, S) with the long-contract policy (15–34k with two-season
ones).

- **Release clause** (the team ends it): `RELEASE_K` 35% of the salary still
  owed (`weeks_left`: the season's weeks to run, plus 12 a season after),
  at least 6 weeks (`SEVERANCE`).
- **Buyout** (a rival takes them): `BUYOUT_K` 50% × the weeks left × the
  larger of salary and ask, at least 4 weeks' salary, paid to their team (the
  player's team gets it when an offer lapses unmatched). An AI team goes after
  someone only if it can pay: the buyout is at most 8 weeks' salary (the old
  price) or 50% of its cash. So a long contract of a rising star is dear to
  break (a B League rookie signed for five seasons at 2.6k who becomes a star
  is bought out for over a million), and someone in the last weeks of a
  contract (the off-season of its last season: 2 weeks left) goes for about 4
  weeks' salary.
- **Renewal**: in a contract's last season the Team tab shows Renew and the
  length ("Contract: n seasons"); the demand is the ask (fame raises it) × (1 +
  `POT_K` 0.25 × (scouts' potential − 60)/40, above 60) × (1 − `LOYAL_K` 2% a
  season served at the team, at most 5) × the length's factor, never below
  85% of the salary now; the new salary starts at once and runs to the end of
  season now + n. A contract left to run out renews itself at the turn for one
  season at the one-season demand (with a message). AI teams renew as before.
- **Loyalty** (`Person.loyal`): seasons at the team, counted at each turn,
  back to 0 on joining another.

**Old saves**: on loading, everyone without lore gets no history, fame 0 and
no traits, and anyone hired is on a one-season contract (to the end of the
season under way) at their salary.

**Balance** (`tools/balance.mjs`, 16 seeds × 10 seasons, founding in B, A or
S; `LORE_OFF=1` turns fame's price and pull, traits' effects and the clauses
off for an A/B; the outcomes are as noisy as the seeds): reaching the S
League 6/9 (B, on/off), 13/11 (A), 15/15 (S); forced sales 3/2, 3/3, 1/1; the
bot's mean cash after ten seasons 6.1M/3.6M, 11.8M/10.4M, 18.4M/15.0M; with
the long-contract policy (`long`: promising newcomers for five seasons,
renewing the good for three) 7.1M, 13.4M, 20.8M. AI teams alone (24 seeds):
salaries a week B 16k (16k off), A 60k (57k), S 206k (176k: the S League's
famous ask more), cash unchanged (0.33M, 2.9M, 16.7M), owners folding 14 times
in 240 seasons of worlds (10 off).

## 7. Sponsors

A deal pays a week, a podium bonus (1.2 weeks' pay; twice for a win), and has
two clauses: a target position at the season's end (missing it costs 4 weeks'
pay and ends the deal) and a walk-away (four finishes in a row averaging
worse than target + 3.5 end it at once; targets, appeal and the walk-away
read the teams' championship: a team's place in its table, and a race as its
best car's place among the teams). Pay = 16k × scale × appeal (0.5 last
to 1.5 first: the table after three rounds, before that the car's rank, and
no worse than 6th for a team just promoted) × slot (1, 0.55, 0.35) × (1 + 0.3
× the sponsor's fortune) × the commercial director's yield (1 + 0.3 × skill ±
noise, +0.05 a Rainmaker) × 0.85–1.15 × the pilots' pull (1 + 0.15 ×
fame/100, §6.2; both pilots, `pilot_fame`). A sponsor never commits more than its weekly budget. When
no sponsor drawn can pay a deal in full, the one with the most budget left
offers the player what it can still afford, if that is at least 25%
(`FIT_MIN`) of the deal; AI teams sign only deals paid in full. (Under the
old Corporations budgets, near 1M a week at most, a leading S League team's
864k title deal outgrew every sponsor and it got no offers; with the
bridge's budgets this fallback rarely fires, and stays as a safety net.) The
player has up to 3 deals; offers come on founding and then 35% of weeks (more
with a good commercial director, more with no sponsor), each open 14 days. AI
teams keep 2 deals, signing at most one a week.

Without outside sponsors, 20 built-in sponsors (budgets 40k to 9M a week,
fortunes drifting). Outside sponsors come over the bus by this mod's own
notifications; it knows no other mod by name (the Racing League and
Corporations bridge, `mods/racing_corporations`, joins it to Corporations):

| | |
|---|---|
| posts `racing.sponsors_wanted` | each sponsors day and on loading a pilot: `{"day", "season", "teams": [{"name", "league", "position", "expected", "fair", "free", "player", "deals": [{"sponsor", "weekly", "target", "until"}]}]}`; `position` and `expected` are places in the teams' championship (1..10, unchanged by two cars); `fair` is what the team's standing fetches a week in its next slot (16k × scale × appeal × slot) |
| hears `racing.sponsors` | `{"day", "sponsors": [{"name", "sector", "budget", "fortune"}]}`: while a roster is fresher than 60 days only its sponsors offer deals (built-in deals already signed run to their end) |
| hears `racing.sponsor_gone` | `{"sponsor"}`: its deals end at once |
| hears `racing.sponsor_offer` | `{"id", "sponsor", "sector", "team", "weekly"}`: a sponsor's own offer to one team. An AI team takes it with a slot free (of 3) and pay ≥ 90% (`ACCEPT`) of its `fair`; the player's team gets it as an offer on the Sponsors tab |
| posts `racing.sponsor_answer` | `{"id", "sponsor", "team", "accepted", "offered", "reason", "weekly", "fair", "target"}`; reason "too little", "no room", "already sponsored", "no such team" |
| posts `racing.sponsor_paid` | `{"day", "payments": [{"sponsor", "amount"}]}`: what outside sponsors paid that day (weekly pay, podium bonuses) |
| posts `racing.sponsor_result` | `{"sponsor", "team", "player", "league", "season", "target", "position", "hit", "paid", "basis", "penalty"}`: each outside deal at the season's end, and when it ends early (walk-away: a miss with no penalty; the player ending it: a miss with the penalty) |

A deal keeps what it is worth a week (`worth`: its pay when signed from the
sponsor's own draw, a cut-down deal its full worth, a direct offer the team's
`fair`), and this season's payments and their `basis`: the part within that
worth (pay up to `worth`, a bonus up to `worth` × 1.2, doubled for a win). The
receiver can reward exposure without rewarding overpayment. Saves from before
read deals with worth = pay and nothing paid this season.

| posts `racing.team_renamed` | `{"from", "to", "league", "player"}`: a team took a new name (the player's rename, an AI team's, §13.2), followed by a fresh `racing.sponsors_wanted`; a direct offer still under the old name finds the team (its name before the last) |

Teams are known over the bus by name, and inside Racing by a stable id (deals,
bets, staff, tables, lore): a rename changes only the name.

Racing also posts, for other mods: `racing.result` {team, league, round,
position (its best car's), circuit}, `racing.champion` {team, league, season,
driver, driver_team} (the teams' champion, and the drivers'),
`racing.bankrupt` {team, league}, `racing.sponsor_signed` {sponsor, team,
weekly}; and sets the conditions `racing: season` and `racing: league` (0 no
team, 1 B, 2 A, 3 S).

## 8. Events

Each day, 6% (`CHANCE`) of an event for the player's team, none in its first
week and none while 3 wait. 26 templates (16 blunders, 10 windfalls), each tied
to a seat and told with the team's own people, sponsors, rivals and circuits.
Each has a hidden roll h (0–2, weighted per template). Blunders, answers 1
and 2 against h, in tiers (1 wins, −1 in between, −3 costs a lot):

| | h = 0 | h = 1 | h = 2 |
|---|---|---|---|
| aggressive | −1 | −3 | +1 |
| conservative | +1 | −1 | −3 |

Windfalls' two answers are their own (cash now or an investment, a deal or
not; one a sure thing or both gambles). The third answer lets the chief (the
responsible seat) handle it: good 35% + 30% × skill, bad 25% − 20% × skill,
else middling; the result goes on their record (good, bad, of how many),
which moves their rating and price. Effects: cash (× 1, 4, 12 by league),
department levels (× level / 30), the pilot's form for the next race, or the
sponsor's weekly pay.

The dialog opens only on the planet screen: in flight the event posts a
message ("Land to respond within 5 days, or ... deals with it"); the next
landing opens the oldest as a panel (3 answers and Later), and the outcome
panel chains to the next; the Racing button opens waiting events first. Past
5 days (`DAYS`) the chief handles it alone, on their record, with a message.

## 9. The office

The "Racing League" button on every planet with a bank opens a full screen:
Team (seats: Pilot #1, Pilot #2 and the crew; approach, release, match an
offer, swap #1 and #2, a pilot's drivers' place and head-to-head; the team's
record, prestige and names, and Rename the team; without a team the teams
for sale, "League", and the Archive of defunct teams, Buy and Revive, §13), Staff (the pool by role, hire or sign away, a pilot's
seat), R&D (levels, budgets in thousands a week), Calendar, Standings (the
teams' table with zones and prestige, or the drivers': "Table"; a team chosen
shows its record, names and price), Finances (ledger, cash chart,
put in, take out, sell; what the team would sell for, part by part, here and
in the sell dialog), Sponsors (offers and deals, sign, end), Last race
(twenty cars with their pilots, or lap by lap), News and Bets (the Paddock
Book, §12). Without a team the office is a spectator's: Calendar,
Standings, Last race and News show every league ("League"), and Bets takes
the player's bets.

## 10. Saving

One text with the pilot (`Game.data("state")`): lines of `w|` (scalars), `c|`
calendar, `f|` final tables, `t|` teams, `p|` people, `s|` sponsors, `d|`
deals, `i|` events, `b|` bets (§12), `r|` last results, `y|` story, `n|` news,
`l|` ledger, `x|` the archive of defunct teams (`Team.archive_encode`: id,
name, last league, born, died, fate, record, names) (the `w|` line ends with
the next bet's id and what settled bets staked and returned, then the
revived team's id; an older one without them has no bets, no revived team; a `p|`
line ends with the peak and skill0, then fame, traits, the feats' counts,
the history (entries joined by `;`), the season signed and the seasons
served, then the drivers' tally and the head-to-head (§5.1); an older line without the peak is given one, §6.1, and one without
the lore is migrated, §6.3; a `t|` line ends with the season's sponsor money, at arm's
length and related, and the sponsor history; an older line without them gets
an estimate, §2.1; a `t|` line's seats are six, an older one's five, migrated
§5.1; a `t|` line ends with the season it was founded, its lifetime
record, its name history and its revival share; an older line without them
gets an estimate, §13.3; then its first season in its league and whether it
came down into it (`since`, `rebound`); an older line without them gets an
estimate, §2.2; `h|` lines keep the bios written by hand (§13.7), and the
`w|` line's last field is the intro line's state; an `r|` line ends with each car's pilot and car, and the fastest
lap's pilot);
floats exactly (shortest round trip), so a loaded world plays on as the one in
memory would (tested). Written in `on_save` when it changed; read in
`on_pilot_loaded` (and lazily by any hook). A text that does not read is kept
under "state broken" and a new world starts. About 73 KB at first, about 114 KB
after ten seasons (16 KB of it the staff's histories; 59 KB and 93 KB before
two cars: the pool's 42 more pilots and twenty-car results).

## 11. Tests and tools

`npm test` runs `test/*.test.mjs` against the SDK's FakeGame: the world,
determinism and saving, races, promotion and relegation, money, staff,
sponsors with and without the real Corporations mod on a FakeBus, events,
bios and potential (determinism, saving, hints and potential against the
hidden stats, growth, the office, saves from before bios), and what a team
sells for (a champion against a weak team, money against targets hit,
decay, the owner's own company, no flipping, the office, saves from before),
the lore (histories and their caps, fame's rise, bound and fading, traits'
rules and bounded effects, a team's value, determinism and saving, saves
from before, the office) and contracts (lengths and locked salaries, expiry
and renewal, demands, release clauses, buyouts, AI teams that can and cannot
afford them), and two cars (two_cars.test.mjs: both championships and their
champions, promotion by the teams' table, double stacks, team orders and the
head-to-head, the #1 and #2 seats, poaching the weaker seat, both pilots'
fame, the bus's team listing, the office, a one-pilot save mid-season), and
buying and selling teams, renames, name histories, lifetimes, prestige, the
archive and revivals (buying.test.mjs: the price and what comes with the
team, the teams for sale in the office, buying and selling at once losing
money, a team in debt, a forced sale, the player's company's deals on a
bought team, saves from before, the rename rules and everything keyed to a
team after one, AI renames and their determinism, prestige's bounds and
effects, lifetimes over seasons, defunct teams and the archive's cap,
reviving one, and the B League's eleventh team through a season, promotion,
a sale and the cut), the Paddock Book (betting.test.mjs: owners may not bet and buying a team
voids that league's bets, the margin on every market, pricing off the
world's dice and the same after a reload, settling every market and its
voids, payouts, limits, the Bets tab, saving and saves from before, bets
changing nothing in the world, and the house's edge over a blind bettor).
`test/ingame/run.sh` runs the real game with the loader (pass a 0.3.0 build)
on "Racing League E2E". `tools/balance.mjs` (seasons with a bot; policies good, poor, none, long;
`LORE_OFF=1`),
`tools/qjs-time.mjs` (QuickJS timing per weekday), `tools/make-news.mjs`
(writes `data/racing.txt`), `tools/book-edge.mjs` (the Paddock Book against
a blind bettor, by market and by odds; `BIO=1` a bio reader, `DUMP=` every
price and outcome for fitting, §12).

## 12. The Paddock Book

`Book.dados`, `Bet.dados`. The league's licensed bookmaker takes bets from a
player who owns no team, on every league, at the Bets tab of the office.

**Who may bet.** Only a player without a team. Buying a team (or reviving
one, in the B League) voids, and refunds, every open bet on that league: the team takes a place in
it at once, and an owner must not hold a bet on their own races; bets on the
other two leagues stand (the team cannot touch them: season bets settle at
the season's end, before promotion moves anyone, and the book takes no new
bets from an owner). Selling the team (or a forced sale) makes the player a
spectator again. As a guard, a bet that would settle on the league of the
player's own team is void.

**Markets**, per league, odds decimal throughout (a winning stake returns
stake × odds):

| market | on | wins | void |
|---|---|---|---|
| race winner | a pilot, the next round | first at the flag | the pilot does not start |
| podium | a pilot | in the first three, finishing | the pilot does not start |
| winning team | a team | either car first | the team has gone |
| head to head | a pilot against their teammate | ahead at the flag | either does not start, they are not teammates on the day, or both retire |
| drivers' champion | a pilot | the title | nobody scored |
| teams' champion | a team | the title | the team has gone (bankrupt) |
| promotion (B, A) | an eligible team (§2.2) | goes up: the top eligible teams | the team has gone |
| relegation (A, S) | a team (not one spared) | goes down: as many of the bottom not spared as go up from below | the team has gone |

Race markets are on each league's next round, from the race before until the
race runs (once a day is played, its race is off the board). Season markets
open with the season (the last week of the off-season, once promotion,
regulations and the calendar are done; season 1 from the start) and close
with `CLOSE` = 2 rounds to go; ante post, they stand whoever drives where.
Between a season's end and the next one's start the book is shut. Bets on
anything that never ran (a long gap in days skips races) are void at the next
race or season. Places and titles are never shared (the classification and
the tables always break ties), so there are no dead heats; the voids above
cover the rest. Settling: race bets on the race day, season bets on the
season's end (`World.end_season`, the tables final), paid with one message
through `pending_payout` (as a forced sale is).

**Stakes**: at least 1k, 6k, 36k and at most 25k, 150k, 900k (B, A, S;
`MIN_STAKE`, `MAX_STAKE`), entered in thousands; no bet may win more than
500k, 3M, 18M (`MAX_WIN`, so the most on a longshot is less); at most
`MAX_OPEN` 10 open bets. The slip keeps the last `HISTORY` 30 settled bets,
and the totals staked and returned for good.

**Prices.** The book prices only what a sharp outsider could know, never a
hidden stat: each car's pace on the circuit's character (`Race.pace`: its
design, which the paddock sees on track), the pilot's rating (the record the
market prices, `Staff.rating`) and the scouts' potential (shown to all), the
pilot's and team's points a race this season (shrunk by 3 races), and how
often cars retire at that kind of circuit. A car's strength is

    s = 8.6 × (pace − the field's mean) + 1.66 × rating + 0.78 × (potential − 60) / 45
        + 0.135 × the pilot's points a start + 0.047 × the team's points a race

(a stand-in rates −0.8). Weights fitted (Plackett–Luce on the top ten) to
2,400 simulated races and shrunk a fifth on the pilot's terms, which the fit
overstates within a team. A race is s plus a normal noise (`NOISE` 1.15),
each car retiring at the circuit kind's rate (`DNF` 7.7%, 8.7%, 11.6%,
8.9%); the book plays it `RACE_SIMS` 2000 times. The season's rest is played
`SEASON_SIMS` 400 times: each run draws each car a persistent error
(`PERSIST` 0.8: what the record cannot show) and each team a random walk a
round (`DRIFT` 0.2: R&D, owners cutting their money), with race noise making
up the rest of `NOISE`, the remaining circuits' characters, the points
table, and the tables as they stand. Promotion and relegation follow §2.2:
who is eligible, and so how many go up from each league and down from the
one above, is known at the season's start (`World.promotions`), so each run
promotes the top eligible teams and relegates that many of the bottom not
spared. Only eligible teams are offered for promotion (an ineligible team
has no price), and a market's chances add up to its places (one or two;
the margin is laid over that many, `price_in`); with no eligible team below,
there is no promotion market in that league and no relegation market above. Chances get a quarter of a pseudo-count
(so nothing is impossible). Measured corrections: head to heads are
sharpened (the favourite + 0.5 × (p − ½) × (4p(1 − p))³, up to six points
near 70/30; team orders give a #1 `FIRST` 0.15 against its #2), race
winners and winning teams flattened a little (chance^0.97, ^0.9), relegation
more (^0.85: a team falling apart mid-season is no rarity). All from dice of
the book's own (seeded by the world's start, the season, the league, the
round and the market), never the world's: the same state always gives the
same board (reloaded too), and a round's prices keep their noise all week
(waiting does not reroll them). Pricing a league's market takes about 100 ms
(a race) to 350 ms (a season from its start) in QuickJS, once a day: the
board is kept for the day.

**Margin.** Each market's overround (`MARGIN`): race winner 15%, podium 12%,
winning team 12%, head to head 8%, drivers' champion 18%, teams' champion
15%, promotion 12%, relegation 15%. It is laid on each chance as k ×
(0.4 + 1.1 × (1 − √(p / slots))), so a longshot carries about three times
the favourite's share, then the odds are rounded down to the board's ticks
(0.01 under 2, 0.05 under 5, 0.1 under 10, 0.5 under 20, 1 under 50, 5 under
100, then 10), at most 200 (8 for a head to head). A near certainty (odds
under 1.05) has no price.

**The house's edge**, measured (`tools/book-edge.mjs`, 48 AI-only worlds ×
10 seasons, 1.1M bets: every price of every market, race markets the day
before each round, season markets at the season's start, after round 4 and
after round 7). Stakes that win the same (1 / odds) — level stakes are swamped
by the 200s on no-hopers (−47% overall):

| market | blind bettor | market | blind bettor |
|---|---|---|---|
| race winner | −18.1% | drivers' champion | −22.2% |
| podium | −13.2% | teams' champion | −19.5% |
| winning team | −14.5% | promotion | −14.8% |
| head to head | −7.8% | relegation | −16.4% |
| race markets | −9.9% | season markets | −18.6% |

By odds: under 2 −7.5%, 2–4 −11.5%, 4–10 −16.7%, 10–30 −19.9%, 30–100
−21.3%, 100+ −81%. No market and no band of odds is +EV: of 48 cells
(market × odds band) the bettor's best is −4.6% (promotion at 2–4, 1,000
bets; the head to head favourite −6.5%, race winners at 30–100 −7.6%). Tuning
used half these worlds; the other half came out the same (−10.2% against
−10.3% overall).

**Skill.** Reading the people helps, a little: the book uses the scouts'
number but not the bios' hints, nor how a pilot suits a circuit (traits). A
bettor who backs only head to head outsiders (odds over 2) with 15 or more
points of potential over their teammate made +4.4% on 3,184 bets (±2.5%;
+25.8% before the book weighed the scouts' potential, which is why it does).
Beating the book on the season's longshots, where 400 runs leave noise in
the price, takes knowing better than the scouts.

**Saving**: `b|` lines (`Bet.encode`: id, market, league, season, round,
selection, the other pilot, stake, odds, day, status, payout, day settled,
the bet as told); the `w|` line's last three fields are the next bet's id,
staked and returned. Saves from before have none. Bets change nothing in
the world: a world with bets plays out exactly as one without (tested), and
a reloaded one exactly as the one in memory.

**The board**, a B League race (round 4):

    Pilot           Team                  Car   Points  Rating  Odds
    Otto Kovac      Equinox Racing Club   43.4  67      +0.01   1.83
    Una Tamm        Halcyon Velocity      43.6  63      +0.00   5.60
    Yara Ishida     Equinox Racing Club   43.4  51      -0.07   5.70
    Sela Okafor     Halcyon Velocity      43.6  60      -0.04   7.40
    Gus Jaeger      Aphelion Racing Team  35.2  58      +0.54   14.0
    Ansel Okafor    Lodestar Competition  43.7  17      -0.16   55
    Udo Thorne      Lumen Competition     34.7  2       -0.01   200

and its head to head, Otto Kovac 1.26 to beat Yara Ishida (3.45), Gus Jaeger
1.07 against Nia Xu (6.80); the drivers' champion, Kovac 1.34, Tamm 5.10,
Ishida 9.30, Okafor 10.5, Jaeger 33.

## 13. Owning a team: buying, names, lifetimes, prestige, the archive

### 13.1 Buying a team

`World.buy`. There are no franchise fees: the player buys an existing team
at its price, from any league, on the Team tab without a team (a table of the
league in view: place, prestige, age, titles, the parts of its worth and the
asking price; choose a team for its record, names and price; Buy, then a
confirm). The owners ask its value (§2.1, the same that selling it would pay)
and a willing seller's premium: `MARKUP` 10% (15% for last season's champions
or the table's leader, `CHAMP_MARKUP`), at least `MARKUP_MIN` 3% of the
franchise, and never less than `ASK_FLOOR` 10% of it (a team in debt still
costs something). So buying and selling at once loses at least the premium.
The owners of a team leading a season under way (from `LEADS_AFTER` 3
races) do not sell; every other team is for sale.

The team comes as it is: its id, name and name history, place and points,
history, lifetime and prestige, car and R&D budgets, staff on their
contracts and salaries, sponsors (direct deals from the player's company
included, cut to their worth, §2.1), cash and any overdraft. Its owners
leave; it runs at the player's organisation (`org` 1). It is not spared
relegation. Open bets on its league are void and refunded (§12). Racing
posts a fresh `racing.sponsors_wanted` at once, so the bridge treats it as
the player's team (`player`: true; its own-team limit) without waiting a week.

Selling (or a forced sale) hands the team to new AI owners with money of
their own (10% of the franchise as cash), who rename it 60% of the time
(`NEW_OWNER_RENAME`); it races on.

Old saves: a team founded under the old rules stays the player's,
unchanged.

### 13.2 Names

`World.rename`. Every team has a name history (`Team.names_log`: the season
and the round it took each name, and why: founded, renamed by its owner, new
owners, a new title sponsor, a rebrand, revived, defunct), shown with the
team ("Albedo Racing (seasons 1-6, founded) -> Kestrel Racing (season 7 on,
new owners)"); the first and the last 15 names are kept.

The player renames their team on the Team tab (Rename the team, free): the
mod API has no text input, so the office offers names from the generator
(More names for others) and the names of the player's own ships, which the
player names in the game. The rules (`name_problem`): not empty, at most
`NAME_MAX` 32 characters, unique among the teams (any case) and the
archive's (a defunct team's name is kept for its revival); `clean_name`
keeps letters, digits, spaces and ' . & ! + ( ) / - (so no `|`, `;`, `:` or
tabs, which the save and the histories use).

AI teams rename now and then, each from its own dice (`World.dice`: the
world's start, the team, the season and the day; never the world's dice):
on new owners after the player sells (60%), on a first title sponsor
(`SPONSOR_RENAME` 1.5%: the sponsor's first word before the team's name,
whatever name a sponsor arrives with), after finishing last in its league
(`REBRAND_LAST` 6%). Measured (8 AI-only worlds × 10 seasons): about one
sponsor's name and three rebrands in a world's ten seasons, besides new
owners' names after the player sells.

A rename changes the name and nothing else: deals, bets, staff, tables and
lore hold the team's id. A news line, a message for the player's own team,
`racing.team_renamed` and a fresh `racing.sponsors_wanted` go out. Histories
keep the old name (`World.team_name_at`: a pilot's "won ... with Albedo
Racing" stays as it was won).

### 13.3 Lifetimes and prestige

Each team keeps its lifetime (`Team.life`, by its id, through renames and
owners): races, wins and podiums (by car), teams' titles by league, drivers'
titles its pilots won with it, promotions, seasons in each league; and
`born`, the season it was founded. The first teams raced before the records
began: their own dice give them an age (B 0–10 seasons, A 0–20, S 5–35).

**Prestige** (0–100), `World.prestige`: `AGE_PTS` 30 × (1 − e^(−age / 20))
for the age, plus `TROPHY_PTS` 70 × X / (X + 50) for the record, X =
teams' titles 3, 6, 12 (B, A, S), drivers' titles 3, wins 0.25, podiums
0.04, promotions 1, seasons in A 0.05 and S 0.15. Labels: under 12 an
upstart, then established, from 30 storied, from 55 legendary. Slow to
change; a rename or new owners keep it; going defunct ends it (until a
revival). Effects, all bounded:

- the price (§2.1): up to 20% of the franchise;
- sponsors: a deal pays × (1 + `PRESTIGE_PAY` 0.1 × prestige / 100), beside
  the pilots' fame; so does a team's `fair` (the bridge's worth);
- staff: renewals ask up to `PRESTIGE_STAY` 5% less at a prestigious team.

Shown on the Team tab, the teams for sale, the Standings (a column, and the
team chosen) and the archive.

Old saves: estimated, low: seasons, titles and promotions from the team's
history (all its seasons are kept), the races of those seasons, the wins
and podiums of this season only, drivers' titles from the pilots' histories;
founded in its first known season (season 1 at the earliest); a name history
of the name it has.

### 13.4 Defunct teams and the archive

A team whose owners give up (§3) goes defunct: it goes to the archive
(`World.archive`, `to_archive`: its id, names, born, the season it went, why,
its record), with a news line ("... is defunct after 9 seasons; a new team,
..., takes its place"), and a new team of age 0 takes its place. The archive
keeps the last `ARCHIVE` 30 and every champion for good. The Team tab's
Archive lists them: seasons, last league, titles, wins, podiums, prestige
(at the end), why, and the price to revive.

### 13.5 Reviving a defunct team

`World.revive`. The league keeps one place for the player in the B League,
empty by default. A player without a team may revive any archived team in
it (Archive, choose one, Revive): it comes back with its id, name and name
history (a "revived" name after its defunct years), born and record, and
`REVIVE_SHARE` 50% of its old prestige, recovering `REVIVE_SEASON` 0.1 a
season and `REVIVE_PODIUM` 0.01 a podium to its whole; a car like a new
team's (B levels × 0.75–0.95), stand-ins in every seat (the player hires),
`REVIVE_CASH` 20% of the B franchise as its cash, and two sponsors' offers.
It races from the next round, spared relegation this season; bets on the B
League are void. A news line: "After 4 seasons in the archive, ... returns
to the grid".

The price: the place (`SALE` 55% of the B franchise, as any team's assets
count it), the first cash, and the brand (its revived prestige as a value
counts it, §2.1), with the seller's `MARKUP`. Selling at once pays the
place, the cash and the prestige, so it loses the markup.

While the player owns it, the B League has eleven teams (22 cars: points to
the first ten cars, the prize pool to the first twenty, the championship
pool to the first ten teams, sponsors' appeal and targets and the standings'
value over the league's own size; the book prices eleven); promotion and
relegation swap as many for as many (§2.2), so the eleventh stays in the B
League whichever team it is. A revived team counts its seasons from
scratch: revived before the season's first B round, it may go up at the end
of its third season; later, after three whole seasons. Once the player sells it (or the league forces the sale), it
races on under AI owners, and at that season's end the B League's last team
(the revived one, if last) goes defunct (`cull`; why: "the league cut the B
League back to ten teams"): the reserved place is free again. Buying an
existing team leaves it empty.

**From code** (missions, other scripts): `World.add_legacy(name, born, died,
record)` puts a hand-made defunct team in the archive (record as
`Team.life`); `World.revive(id, planet)` revives one and takes no money (the
office charges `revive_price`); then `staff.player_hire_at(w, person, years,
seat)` signs the people. `not_revivable(team)` says why not.

### 13.6 Balance

`tools/balance.mjs` (16 seeds × 10 seasons, policy good) now buys the
cheapest team for sale in its league and tops its cash up to 40% of the
franchise (what founding once gave a new team) from its own credits; its
outlay is about the old fee (B 0.96M, A 10.0M, S 102.9M on average), and
it starts with the team's staff and sponsors. Before (founding) → after
(buying): reached the S League 11 → 10 (B), 11 → 14 (A), 16 → 16 (S);
forced sales 4 → 0, 5 → 6, 1 → 2; the bot's mean cash after ten seasons
1.2M → −0.3M, 2.8M → 7.1M, 2.6M → 2.7M.

Promotion's eligibility (§2.2), the same 16 seeds × 10 seasons, policy
good, before (top two always up) → after: reached the S League 10 → 5
(starting in B: three seasons in B, then three in A, before the S League),
9 → 13 (A), 14 → 16 (S); forced sales (or no team at the end) 0 → 1, 6 → 3,
2 → 0; the bot's mean cash after ten seasons −0.96M → −1.07M, 13.8M → 15.2M,
23.1M → 22.9M. Fewer relegations from A and S (a B or A League short of
eligible teams sends fewer down) make the upper leagues a little safer.

### 13.7 The intro mission line

`data/racing intro.txt`, `Intro.dados`. A short, comic way into the
leagues. The Honourable Peregrine ("Perry") Wexley-Thorne, the penniless
last of a racing family, approaches a player in a spaceport bar of human
space (Republic, Free Worlds, Syndicate, Neutral, Independent; 35% a
landing) who has `credits` >= 1,000,000, owns no team (`racing: owns team`
0) and has the reserved place free (`racing: slot free` 1); the mod sets
both conditions every day (and on every flush). The player pays a 400,000
credit sponsorship, and carries Perry (a passenger) through six legs:

| mission | where it ends | what happens |
|---|---|---|
| 1 The Pitch | Valhalla | (the bar, anywhere) the pitch and the payment; at Valhalla, Ambrose Kettle, the team's old engineer, building clockwork birds, signs "because the young are doing it all wrong" |
| 2 The Prodigy | Bourne | Wren Achterberg, 19, a street racer of courier skiffs, signs on the back of a citation (the player pays her 5,000 credit fine) |
| 3 The Star | Martini | Lucius Varga, a former B and A League pilot playing one on the holovid drama 'Redline Hearts', signs to do his own stunts |
| 4 The Crew Chief | Foundry | Dolores Mbeki, the Syndicate yards' fastest refuelling chief, signs in 2.9 seconds to end the meeting |
| 5 The Seat | Luna | the leagues' registry admits the team to the reserved place in the B League, three seasons before it may go up (§2.2: "I have never done anything for three seasons in a row") |
| 6 The Inheritance | Hestia | a letter from childless Great-Uncle Barnaby, 97; Perry leaves to be at his side (and in his will), signing the team over; sets `racing: intro done` = 1 |

Each leg is offered on landing where the last ended (`landing`, `has "...:
done"`), and fails if the player buys a team or the reserved place is
taken on the way (`to fail`; `on fail` pays the 400,000 back); abandoning
it (`on abort`) does not. `racing: intro begun` keeps the bar offer from
coming back; `racing: intro over` ends the line.

**The handover** (`Intro.handover`, from the mod's `flush` when `racing:
intro done` is 1; the condition is then set to its answer, so it runs once,
and handover itself does nothing a second time, `World.intro`): the
family's team, Wexley-Thorne Racing, is put in the archive
(`add_legacy`: founded 50 seasons before, defunct 12 before, a record of 760
races, 70 wins, 210 podiums, teams' titles B 1, A 2, S 3, 4 drivers'
titles, 3 promotions, seasons B 4, A 12, S 22: legendary, prestige about
74) and revived in the reserved place (`revive`: 50% of its prestige,
about 37, storied; a new team's car; 200k of first cash; two sponsors'
offers; spared relegation; it counts its seasons for promotion from
scratch), run from the planet the player is on (Hestia when in flight). Four
people are made as the missions tell them (fixed names, written bios kept
as `h|id|text` lines, records, hidden skill, peak and trait) and signed on
five-season contracts (this one included) at fixed salaries:

| | seat | skill (peak) | trait | record | salary a week | they would ask |
|---|---|---|---|---|---|---|
| Wren Achterberg | pilot #1 | 0.25 (0.75) | 0.35 | none | 900 | 2.6k |
| Lucius Varga | pilot #2 | 0.30 (0.32) | −0.25 | 120 races, 14 wins, 38 podiums | 1,500 | 21.5k |
| Ambrose Kettle | race engineer | 0.55 | 0.4 | 380 races, 41 wins, 3 titles, the S League | 2,000 | 70k |
| Dolores Mbeki | pit crew chief | 0.40 (0.55) | 0.5 | none | 600 | 1.1k |

(the pool's skill is about a normal draw × 0.45: these are good B League
people, Kettle and in time Wren better.) The research and commercial seats
are the player's to fill. A message and a news line tell it. If by then the
player owns a team or the reserved place is taken (or another team has the
name), the sponsorship is paid back (`pending_payout`), with a message, and
the condition is set to 3. Measured with `balance.mjs`'s good bot (12 seeds,
the handover at the start of season 2): it finishes the B League 1st–3rd in
its first season and 1st after, goes up after its third season (the rule),
and is 1st–3rd in the A League from its first season there (one seed 4th–6th);
the same bot with average people in the same seats finishes 2nd–4th in its
first B season, so most of the start is the player's organisation and the
cheap salaries, and the four make it sure.
