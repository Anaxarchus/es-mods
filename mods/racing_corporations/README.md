# The Racing League and Corporations

Joins [The Racing League](../racing) and [Corporations](../corporations).
Neither of the two knows the other: each has its own notifications on the bus
(their READMEs), and this plugin, which needs both, carries what one says to
the other. With either missing it hears nothing and does nothing; it keeps
nothing with the pilot, so it can be added or removed at any time.

- The exchange's companies sponsor the racing teams, out of a racing budget
  each.
- A sponsor pays its deals every week, booked as a cost in its earnings; at
  the season's end a deal earns the company brand exposure, booked as
  revenue: more than it cost if the team met its target, much less if not.
  Through the earnings, it moves the share price.
- The player's own company (Corporations' charter) sponsors only as the
  player says: the *Sponsorship* button at any bank lists every team, what its
  standing is worth a week, and the company's deals; choose one and *Offer a
  deal*. An AI team answers at once (it takes 90% of its worth or more, with
  a slot free); an offer to the player's own team waits on the Racing
  League's Sponsors tab.

```sh
npm run check -- mods/racing_corporations
node --test mods/racing_corporations/test/   # all three mods on one FakeBus
```

## How it works (spoilers)

| hears | sends |
|---|---|
| `racing.sponsors_wanted` (the teams) | `corporations.roster_wanted` |
| `corporations.roster` (the companies) | `racing.sponsors`: every company but the player's, with its budget and fortune |
| `corporations.bankrupt` | `racing.sponsor_gone` |
| `racing.sponsor_paid` | `corporations.book`, a cost for each sponsor (a name not a company's is ignored) |
| `racing.sponsor_result` | `corporations.book`, the return |
| (the Sponsorship screen) | `racing.sponsor_offer` |
| `racing.sponsor_answer` | a message to the player |
| `racing.team_renamed` | the teams it lists, and offers waiting, follow the new name |

**Budget** a week: 0.1% of the company's market value (`BUDGET_SHARE`; it was
0.04% when Corporations answered Racing itself), within 30k–12M, and no more
than 10% of its cash. **Fortune**: 3 × the share price's 30-day move, within
−1..1.

**Return** on a deal's season, on its `basis` (what it paid this season, but
never more than the deal's worth by the team's standing, so overpaying buys no
exposure):

- target met: basis × (1.35 + 0.10 per place better than the target, up to 3)
- target missed: basis × 0.25, plus the penalty the team pays back (4 weeks'
  pay; none for a walk-away)

Targets and standings are places in the teams' championship (Racing's teams
run two cars each; the listing is unchanged, one entry a team). Targets are
about where a team is expected to finish (±), and 63% of deals
meet them. Measured over six seasons with all three mods (test/bridge.test.mjs
holds the bounds): returns are about 1.25× what sponsors paid (903M paid,
1,129M back), the best sponsors net 20–35M and the unlucky lose a few million,
no company failed for it, and the exchange's value followed the same path as
without the bridge (market noise, 16.5–22B). Every team in every league is
sponsored by the exchange; the larger budgets (top companies 1.1–1.7M a week,
against an S League title deal of up to 864k) leave Racing's cut-down offers
as a safety net that did not fire in that run.

**The player's company.** Its board holds each offer to: what is left of its
racing budget (the rule above, less its deals and offers waiting), an eighth
of its cash, 1.5× what the team's standing is worth (`OVERPAY`), and, for the
player's own team, no more than that worth (`SELF_PAY`; a team the player
buys is listed as theirs at once, since Racing posts a fresh listing, and a
deal the company already had with it is cut to its worth by Racing): a company is not a
channel for moving money into its owner's team, and since the return is on
the deal's worth, overpaying any team earns nothing. Offers wait for their
answer; one at a time per team.

Saves: nothing of its own. Racing deals from before keep running; their
payments and results are booked to the companies once the bridge is there.
