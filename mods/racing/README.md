# The Racing League

Own a racing team in three leagues that race every week across real systems
of human space. You never fly the races: you buy a team, hire the
people, fund the research on the team's racing ship, sign sponsors, answer
the trouble (and the luck) that comes up, and try to climb from the B League
to the S League. A team goes up only from its third season in a row in a
league (a team just relegated may bounce straight back), and only as many
come down from the league above as go up.

- **Start** at any planet with a bank: the *Racing League* button and the
  Team tab. Buy any team whose owners will sell, in any league, for what it
  is worth and a seller's premium: you get it as it is, with its people on
  their contracts, its car, sponsors, cash and debts. Or revive a defunct
  team from the archive in the place the B League keeps for you.
- **A way in**: with a million credits and no team, keep an eye on the
  spaceport bars of human space. An aristocrat down on his luck has a
  family racing team to bring back, and needs a sponsor.
- **Names and prestige**: rename your team (Team tab); AI teams rename now
  and then too, and every team keeps its name history. A team's age and
  lifetime trophies make its prestige, which raises its price, draws
  sponsors and keeps people a little cheaper. Teams go defunct; the archive
  remembers them, and a legend can come back.
- **Two cars**, F1 style: every team races two cars of its design, a #1 and
  a #2 pilot, with one crew for both (stops on the same lap queue). The
  **teams' championship** (both cars' points) decides promotion, prize money
  and sponsors' targets; the **drivers' championship** is each pilot's own,
  and its title stays with them. Teammates are measured against each other.
  Two pilots cost two salaries.
- **Staff** come from one pool of named people that every team hires from.
  You see their records, never their talent; prices follow the records, and
  rivals poach. Everyone has a bio (where they are from, how they got here,
  what people say) that hints at what they are worth, and a scouts' rating
  of their potential: a guess, wide for newcomers with no record.
- **Lore**: people, pilots above all, keep a history of their notable races
  (upsets, comebacks, titles, disasters), grow famous when they beat what
  their car should do (the famous ask more, draw sponsors and add to what a
  team is worth), and can earn a few permanent traits on the track.
- **Contracts** are exclusive, one to five seasons, at a salary locked when
  signed: sign a promising newcomer cheap for years and keep them as they
  grow. Breaking one costs; a rival who wants your star pays you a buyout;
  renew in a contract's last season, or it rolls on a season at a time.
- **Money** comes from prizes, the championship and sponsors, and goes on
  salaries, research, running costs and repairs. Good teams make a lot; bad
  ones can cost a fortune. Deep debt forces a sale. A team sells for more
  than its place and its cash when it has won lately, sponsors have paid it
  well (your own company's money does not count) and it has prestige; the
  Finances tab shows the price part by part.
- **Sponsors** are independent firms, or, with Corporations and the *Racing
  League and Corporations* plugin installed, the exchange's companies (which
  then profit when the teams they back meet their targets, and your own
  company can sponsor teams too).
- **Events** wait for you to land; leave one too long and your staff decide.
- **Betting**: while you own no team, the *Paddock Book* (the office's Bets
  tab) takes your bets on every league: the next race's winner, a podium,
  the winning team and teammates head to head, and the season's champions,
  promotion and relegation, at decimal odds that move as the season goes.
  The book prices what the paddock knows and keeps a margin; reading the
  people well helps a little. Buying a team voids your bets on its league.

Needs the Dado mod loader (mod API 10 or newer). How it all works, numbers
included: [DESIGN.md](DESIGN.md) (spoilers).

## Develop

```sh
npm run build -- mods/racing
npm test                                # every mod; this one's: mods/racing/test
node mods/racing/tools/balance.mjs 6 10 0 good   # seasons with a bot
node mods/racing/tools/book-edge.mjs 8 10        # the Paddock Book against a blind bettor
mods/racing/test/ingame/run.sh          # the real game (ES_LOADER=<a 0.3.0 libesdado>)
```
