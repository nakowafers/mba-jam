# MBA Jam

Companion domain for the 10-team **MBA** Sleeper NBA Dynasty League, governing weekly Lock-In lineup optimization and dynasty trade evaluation under custom MBA scoring rules.

## Language

### League & Roster Structure

**Manager**:
One of the 10 human participants who controls a single Roster in the MBA league.
_Avoid_: User, Owner, Account, Player

**Roster**:
A Manager's collection of NBA players (divided across Starter Slots, Bench, Reserve/IR, and Taxi) and owned Draft Pick Assets.
_Avoid_: Team, Club, Franchise

**Starter Slot**:
One of the 10 active lineup positions that contribute to a Roster's weekly matchup total (`PG`, `SG`, `G`, `SF`, `PF`, `F`, `C`, `C`, `UTIL`, `UTIL`).
_Avoid_: Position, Starting Spot

**Pinned Starter**:
A Starter Slot occupied by a player who already has a Locked Score for the current scoring week and therefore cannot be moved to the Bench until the next scoring week.
_Avoid_: Frozen Slot, Locked Position

### Weekly Lock-In & Lineup Optimization

**Lock-In Window**:
The period between the completion of an NBA player's most recent game and the tip-off of that player's next scheduled game in the same scoring week, during which a Manager can lock that game's score or swap the player into a Starter Slot and lock it.
_Avoid_: Waiver Period, Roster Lock

**Locked Score**:
A single completed NBA game score chosen (or defaulted at the player's final game of the week) to count as that player's sole point contribution for the scoring week.
_Avoid_: Weekly Total, Frozen Points

**Lock-In Threshold**:
The minimum score a player must achieve in their current Lock-In Window to justify locking immediately, equal to the expected maximum score ($E[\max]$) across their remaining scheduled games in the scoring week.
_Avoid_: Target Score, Average Projection

**Effective Weekly Score**:
A player's expected single-game contribution for the current scoring week, defined as the greater of their lockable score in the current Lock-In Window or their Lock-In Threshold across remaining scheduled games in the week.
_Avoid_: Weekly Projection, Raw Score

**Swap & Lock Alert**:
An urgent recommendation triggered when a Bench player's score inside an open Lock-In Window exceeds the Effective Weekly Score of an eligible, non-pinned Starter Slot.
_Avoid_: Lineup Warning, Bench Alert

**Matchup Leverage**:
The head-to-head projected score differential between a Manager's Roster and their weekly opponent's Roster, which shifts borderline Lock-In decisions toward floor protection (when leading comfortably) or ceiling chasing (when trailing significantly).
_Avoid_: Win Probability, Score Gap

### Dynasty & Trade Evaluation

**Dynasty Value**:
A unified metric quantifying the long-term worth of an NBA player or Draft Pick Asset in the MBA league, combining custom MBA fantasy points per game, player age curve, and two-Center positional scarcity.
_Avoid_: Trade Points, Market Rank, Player Rating

**Draft Pick Asset**:
The right to a specific future rookie draft selection (defined by Season `2026–2029`, Round `1` or `2`, and Original Roster whose standings determine the slot), regardless of which Manager currently holds it.
_Avoid_: Traded Pick, Future Pick

**Projected Pick Tier**:
The estimated slot bucket (`Early` 1–3, `Mid` 4–6, or `Late` 7–10) of a Draft Pick Asset, derived from the Original Roster's inverse Max Points For (`ppts`) and standings for near-term drafts (`2026–2027`) and regressed toward Mid-Round for distant drafts (`2028–2029`).
_Avoid_: Pick Rank, Draft Order

**Consolidation Premium**:
The non-linear value bonus applied to the higher-value elite assets in an uneven multi-asset trade (such as 2-for-1 or 3-for-1), reflecting that a 10-team league has only 10 Starter Slots per Roster.
_Avoid_: Star Tax, Trade Multiplier

**Replacement Cut Asset**:
The lowest-Dynasty-Value Bench player(s) on a Roster that must be dropped (or displaced) to absorb excess incoming players in an uneven trade.
_Avoid_: Throw-In, Waiver Fodder

**Flipped Asset**:
A player or Draft Pick Asset acquired in a historical trade that was subsequently traded away in a later transaction by the acquiring Roster.
_Avoid_: Re-traded Player, Moved Pick
