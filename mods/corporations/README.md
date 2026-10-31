# Corporations

A stock exchange for human space, written in DadoScript for the Dado mod
loader. It runs on mod API 9 games (`min_api` 9) and uses API 10 features only
where `game.has()` says the game has them. HANDOFF.md has the design, the
numbers and the history; this file lists what other mods and mission writers
can rely on.

```sh
npm run check -- mods/corporations      # build, then run its hooks against the fake game
npm test                                # every test (mods/corporations/test/*.test.mjs)
node mods/corporations/tools/balance.mjs [days] [every] [nobuy] [start=N]
node mods/corporations/tools/growth.mjs [days] [start=N] [war]   # (M4) values, technology, capital events by year
node mods/corporations/tools/probe.mjs [days] [start offset]
node mods/corporations/tools/chiefs.mjs [days] [start=N]   # (0.4) the chiefs' pool over a long run
```

## Conditions

Missions and other mods can read these, and change the standing ones:

| condition | meaning |
|---|---|
| `corporations: standing <id>` | the player's standing with a company, -100 to 100 (absent = 0). The canonical companies are 1 to 15 in Names order: 1 Betelgeuse Shipyards, 2 Gemini Shipyards, 3 Lionheart Industries, 4 Southbound Shipyards, 5 Syndicated Shipyards, 6 Tarazed Corporation, 7 Tycho Crater Shipyards, 8 Deep Sky, 9 Lovelace Labs, 10 Syndicated Systems, 11 Delta V Corporation, 12 Kraz Cybernetics, 13 Polymath Nanoinstruments, 14 Megaparsec Incorporated, 15 Poseidon Industries. Holding a company's shares adds up to 10 while held (not stored). |
| `corporations: news <key>` | a spaceport news item shows while this is at least `days since epoch` (Press). |
| `corporations: convoy <id>` (and `… safe`, `… lost`, `… failed`) | set by the convoy escort and intercept jobs; read and cleared by the mod each day. |
| `corporations: relief <id>` | set by a crisis's relief-cargo job; ends the crisis. |
| `corporations: covert <n>` (and `… done`, `… failed`) | set by sabotage and espionage jobs. A fine the player can't pay is owed and taken from what they earn. |
| `corporations: hauling <id>`, `delivered <id>`, `late <id>` | set by parts jobs. |
| `corporations: shortfall <side>` | (M3) for each Diplomacy side (1 Republic, 2 Free Worlds, 3 Syndicate, 6–20 rebels) with military shipyards: the share, 0–100, of its military shelves' targets that is missing. Written when it changes. |
| `corporations: scrutiny` | (M3) the market regulator's attention to the player, 0–100 (board votes, disclosures, insider trading); a fine at 60. |
| `corporations: tip <n>` | (M3) set by a tip job; the tip is revealed, then cleared. (M4: tips can also tell of a coming research breakthrough.) |
| `corporations: op <id>` (and `… won`, `… failed`, `… lost <k>`) | (M4) set by the job to fight beside a security company's sweep against pirates: taken, the pirates destroyed, the job failed, the company's k-th ship there destroyed; read and cleared by the mod. |
| `corporations: blockade <n>` | (M3) set by a blockade run into a besieged system (n = its index + 1); cleared once read. |

Mod data (`Game.data`, the mod's own): `state`, `world`, `rev`, `layers`.
The chiefs' pool is in `state` (`i|` and `I|` records); a `state` from before
0.4 (no `i|`) is read into a pool on load: its chiefs keep their names, posts
and ways, idle executives (`a|`) join the pool free.

## Notifications (mod API 10)

On a game with the bus (`game.has("notify")`), Corporations posts these after
the day they happen, each with a JSON payload, at most 32 a day. It listens for
`diplomacy.*` (a war, a peace, a capture, a battle, a siege make the warring
governments order warships urgently) and (0.5) for two requests of its own,
which any mod can make (it knows no other mod by name; the *Racing League and
Corporations* plugin uses them to make its companies the racing teams'
sponsors):

- `corporations.roster_wanted` (any payload): answered with `corporations.roster`.
- `corporations.book` `{"company", "amount", "note"}`: income (amount > 0) or a
  cost (< 0) for a listed company, booked like its own: cash, and revenue or
  costs toward its next report, so its earnings and price. `note`, for an
  income large enough to matter, says what drove the report ("on its racing
  sponsorship of …"). Anything else (not a listed company, not a number) is
  ignored.

| name | payload |
|---|---|
| `corporations.tender_awarded` | `{"government", "model", "units", "winner", "price", "days", "bids"}`: a government's military tender won |
| `corporations.tender_delivered` | `{"government", "model", "units", "winner"}` (`winner` "" when the government's own yards built them) |
| `corporations.tender_failed` | `{"government", "model", "units", "winner", "reason"}`, reason `"delivery failed"`, `"bankrupt"` or `"convoy lost"`; the government tenders again |
| `corporations.bankrupt` | `{"company", "sector", "per_share"}` (per_share as text, "0.00" for nothing) |
| `corporations.crisis` | `{"company", "kind", "sector", "system", "commodities", "factor", "days"}`: a strike, accident or recall raising commodity prices in `system` and next to it; kind `"strike"`, `"accident"` or `"recall"`, commodities a list of names, factor a number (1.5) |
| `corporations.shortfall` | `{"side", "government", "shortfall"}` (M3): a Diplomacy side's warship shortfall, 0–100, when it moves 5 points or more (the condition above has every change) |
| `corporations.nationalised` | `{"company", "government", "system"}` (M3): a company nationalised by the government that captured its home system |
| `corporations.sweep` | `{"company", "system", "won", "ships_lost"}` (M4): a security company's sweep against the pirates around `system` |
| `corporations.roster` | `{"day", "companies": [{"id", "name", "sector", "value", "cash", "change", "player", "private"}]}` (0.5; it was `corporations.sponsors`, the answer to The Racing League, in 0.4.1): the answer to `corporations.roster_wanted`: the listed companies, largest first (at most 40, and the player's own company always), value and cash in credits, change the share price's 30-day move as a fraction, `player` for the player's own company, `private` while it is not offered to the market |
| `corporations.convoy_lost` | `{"owner", "model", "units", "to", "system", "by_player"}`: hulls lost on their way to a shipyard (`to`, a planet or system) near `system`; `by_player` true when the player intercepted it |

Timing sections (`game.has("timing_section")`): `on_day` reports `market`,
`convoys`, `losses`, `crises` and (M3) `boardroom` (chiefs, board, shorts,
tips, sanctions and the player's company) apart.

## The boardroom (M3)

- **Chief executives** (0.4) come from one pool of 64 shared by every
  company, the player's included. Each has hidden stats that run the company
  and a public career record (what the companies they ran earned, against
  their sectors, while they ran them); prices follow the record. Boards hire
  on experience and record within budget, poach strong chiefs, and vote out
  poor ones (an ouster stays on the record); careers last about ten years.
  The exchange's Chiefs tab lists the pool, each chief's record and history,
  and hires, poaches or lets go the player's chief; an AI offer for the
  player's chief can be matched within 10 days. The player's board ousts
  nobody while the player controls it (private, or half the shares).
- **Board power:** holding 5% of a company lets the player block or price up a
  bid for it; 10% sets its payout and directs its bidding; 20% sells the stake to
  a suitor at a premium. Holdings are capped at 35%; 20% and 30% are disclosed.
- **Shorts:** margin 50%, a lender's fee (about 15% a year) and dividends; a
  margin call past 80% of the margin; a buyout or bankruptcy closes them. No
  shorting a company in trouble or one you hold.
- **Tips:** jobs at banks near a company reveal a decided future (an earnings
  one-off, a crisis, an arranged tender winner). Trading on one (from the day
  it is delivered) risks a fine: 25% of the time, 15% of the value traded (30%
  for a crisis tip).
- **Sanctions:** at war, a government deals with no company whose home its enemy
  holds; a Diplomacy member's shares in its enemies' companies are frozen and
  half their dividends withheld. A captured home shocks a company (canon:
  rescued; others: maybe nationalised).
- **Your company:** found one at a bank (M4: in any sector, at 1M, 10M or 100M;
  see below). In freight and security (API 10), ships you hand over leave your
  fleet for good and add to the work it can take on. After 4 reports, an IPO (priced on what the company owns, not on
  ships you could take back), defend it with your votes, sell out (it becomes
  the market's and your ships come back) or dissolve it.
- **Refits:** the outfitter's Refit button builds an outfit into the hull, sold
  by an Outfits, Engines or Electronics company's line; a troubled maker leaves
  its line short in the outfitter on API 10 (outfit stock).

## Growth and innovation (M4)

- **Scale.** The established companies are worth around a billion credits
  each, newcomers a million, ten million or a hundred million; the exchange
  as a whole is in the tens of billions and grows with the economy.
- **Technology.** Every company has process, scale and quality levels, kept
  for good once reached, and spends on research toward one of them; a
  breakthrough is news. Established companies start well ahead.
- **Finance.** Companies grow when busy, paying with cash, debt or new
  shares; offerings dilute holders, buybacks reward them, and expensive
  shares split. A 10% board seat can also direct research and forbid new shares.
- **Security fleets.** Security companies own real warships, bought from
  human shipyards' stock (never the last one on a shelf). Now and then a
  government or the shipping lines pay for a sweep against pirates; the
  winner sends a flotilla, which can lose ships for good (sturdier hulls lose
  fewer). You can fight beside it: a job on nearby boards, and the company's
  ships and the pirates are there for real.
- **Your company.** Any sector, 1M, 10M or 100M to start. From the exchange's
  Company tab: research focus and budget, growth plan and building yards,
  putting money in at any time (once listed, for new shares), dividends,
  offerings and buybacks, margins and a chief. It can bid for a smaller rival
  (not an established company) from the market tab.
- **Saves from before M4** get a new exchange: shares are bought out at their
  last price, shorts closed, a company of your own wound up (its ships come
  back); hull orders, shipyard stock, losses, news and standing carry over.

## Trade prices (crises)

A crisis raises the data price (`trade`) of its sector's commodities in a
system and the systems next to it with one `game.change`, and undoes it with
one more. On API 10 the undo reads the price now (`trade_base_price`) and
takes off only the crisis's own rise (at least 1), so a change another mod
made meanwhile stays: the convention between the mods is "only undo your own
deltas". On API 9 the price now cannot be read, so the undo writes back the
price the game's data sets (the crisis remembers it): a change another mod
made to that system's commodity during the crisis would be overwritten.
A system and commodity another Corporations crisis has raised is left alone.

## Checking job texts

`node mods/corporations/tools/validate-jobs.mjs [game binary] [resources]`
runs every kind of job text the mod writes through the real game's parser
(`--parse-assets` on a temporary config folder) and prints any warning.
