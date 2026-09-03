# Trading bots (DBot XML exports)

Exported from the live Bot Builder (Demo account) on 2026-09-01. Import via Dashboard → My computer, or Bot Builder → Import.

## RDA Rise Fall.xml
- Market: Forex / Major Pairs / EUR-USD (real market data, not synthetic)
- Contract: Rise/Fall, Duration 15 minutes (platform-enforced minimum for real Forex Rise/Fall)
- Entry signal: SMA(5) vs SMA(20) crossover on 1-minute closes — fast > slow → CALL, else PUT
- Stake management: Reverse D'Alembert (increase stake on win, decrease on loss). Base stake raised from $1 to $3 (2026-09-01) so each win moves the balance more, reaching the $10 profit target in fewer of the 15-min trade cycles.

## RDA Digits Differs.xml
- Market: Derived / Volatility 100 (1s) Index (certified RNG, synthetic)
- Contract: Digits — Differs, Duration 1 tick
- Prediction: dynamic Last Digit block (last tick's digit) instead of a fixed number
- Stake management (rewritten 2026-09-01; escalation depth and multiplier tuned repeatedly on 2026-09-03 — see git history): capped, **partial-recovery** Martingale instead of Reverse D'Alembert. Base stake $1. Escalation ladder is now asymmetric by design: **$1 → $11 (tier1) → $5 (tier2) → $25 (tier3) → $125 (tier4)**, capped at 4 consecutive escalations; a 5th consecutive loss resets to base instead of escalating to $625.
  - **Why tier1 is $11 but tier2 drops to $5**: a single isolated loss (streak of exactly 1) is by far the most common non-win outcome, so tier1 uses ×11 — close to the exact ×11.11 needed to fully recover a $1 loss given the ~9% payout. But continuing to compound ×11 on a genuine multi-loss streak would explode fast (×11² = $121, ×11³ = $1,331). So the moment a streak proves itself "real" (2+ consecutive losses), the ladder deliberately drops back to the gentler ×5-per-tier progression used for worst-case containment. This means only the single-most-common case gets a near-full recovery attempt; a continuing streak trades recovery quality for a smaller worst case, same as the flat ×5 ladder before it.
  - This cap applies only within one uninterrupted run of consecutive losses. Any win, at any stage, immediately resets to base *and* fully clears the streak — a completely separate future loss (the very next trade, or 50 trades later) gets the full escalation ladder again, unrestricted by anything from an earlier, already-resolved streak. The cap is not a one-time-per-run allowance.
  - Bot-level safety: `maxStake` $200 (must exceed $125, the largest single stake in the ladder). `profitThreshold` $10 (lowered from $20, 2026-09-03 — see "Does this bot make money" below for why). `lossThreshold` $200 — this **must** stay above the worst-case full cycle for whatever ladder is configured ($1+$11+$5+$25+$125 = $167), otherwise the circuit breaker fires early and the deepest tier becomes dead code that never executes (this was a real bug in an intermediate version — see git history). Any future change to the ladder must re-derive both `maxStake` and `lossThreshold` from the new worst-case cycle total.
  - Raising or lowering `profitThreshold` doesn't change the underlying per-trade math (see "Does this bot make money" below) — it only changes how long the bot runs before locking in a win and stopping.
  - Minimum account balance to run this version: see "Minimum balance" below.
  - **The underlying loss streak itself cannot be prevented, at any length.** Volatility 100 (1s) digits are IID uniform on a certified RNG — each trade is statistically independent of every prior one, so no signal, indicator, or prediction (including the dynamic Last Digit block) can reduce the fixed 10% chance any single trade loses. P(4 in a row) = 0.01%, P(5 in a row) = 0.001% — ten times rarer, not impossible. "Haven't observed a 5-streak yet" is a small-sample artifact, not evidence it can't happen; at ~1-2 seconds/trade a bot generates thousands of trades a day, so both events recur on a long enough timeline. **Adding another tier to cover the next-rarer streak does not fix this — it only relocates the uncovered tail to an even-rarer, larger event** (adding a tier5 to catch 5-streaks would leave 6-streaks uncovered at a bigger size, and so on indefinitely). The only real lever is how much a give-up event costs (ladder depth × multiplier × base stake), never whether one can occur.
  - Caveat: the ~90% win rate is fixed by contract math regardless of prediction. Payout does **not** vary by which digit is predicted — verified live (0, 3, 5, 9 all priced identically at a given stake/duration); the per-digit percentages shown in Deriv's UI are just recent tick-frequency stats, not pricing inputs. Trade-to-trade payout variance (e.g. $1.08 vs $1.10) is ordinary live repricing, not digit-dependent.

RDA Rise Fall's "Trade again after purchase" / stake-management blocks are the shared Reverse D'Alembert function blocks from the original strategy templates. RDA Digits Differs reuses the same function blocks (still labeled "Reverse D'Alembert..." in the workspace) but its internal arithmetic was replaced with the capped-Martingale logic described above — the names are cosmetic leftovers, not the actual behavior.

## Minimum balance — RDA Digits Differs (current: $1→$11→$5→$25→$125 ladder)

Worst case is a 5-loss streak: base $1, then four failed recovery attempts at $11, $5, $25, and $125 — total staked in that one streak = **$167**.

- **Absolute mathematical floor**: $167. At exactly this balance, surviving that one streak leaves $0 — no margin, and the account can't place another trade afterward.
- **Matches the bot's own circuit breaker**: $200 (the `lossThreshold`/`maxStake`). Below this, the bot's own math doesn't add up.
- **Practical recommendation**: $250–$300. Covers one full worst-case streak with room to keep trading afterward toward the $20 profit target, rather than being wiped to the circuit-breaker floor the first time it happens. This streak length recurs over enough trades (see the "cannot be prevented" note above) — this is sized for "when it happens again," not "if."

This is the bot's own structural requirement given its configured constants, not investment advice about how much you should personally risk.

## Why every normal Differs trade profits exactly $0.09

Differs pays a fixed ~9% margin on a $1 stake, verified live on Deriv's platform — not something set in the bot's code, and not adjustable except by staking more (profit scales linearly with stake: $2 base → $0.18/win, $10 base → $0.90/win). Raising the base stake also scales every escalation tier and the minimum-balance requirement by the same factor, so a 10x bigger per-trade profit means a ~10x bigger worst-case exposure ($15,067.80 instead of $1,506.78 at $10 base). There is no way to get a bigger profit-per-win on this contract without proportionally bigger risk — the 9% margin itself is fixed by contract math (see the payout-per-digit note above), not something a stake choice can improve.

## Does this bot make money? (No — and no ladder tuning fixes that)

Confirmed against real session data on 2026-09-03: 1,356 trades, 90.2% win rate (right on target), **-$54.65** total.

The exact-recursion expected value for the $1→$11→$5→$25→$125 ladder: **-$0.0416 per cycle**, averaging **1.111 trades/cycle**, so **≈ -$0.037 per individual trade**. Over 1,356 trades that predicts ≈ -$50.70 — the actual -$54.65 is a near-exact match, i.e. the bot is doing exactly what the math says, not malfunctioning.

**Why**: Differs pays 9% on a 90%-win event; break-even requires ~11.11% (0.1/0.9). That 2.11-point gap is Deriv's house edge, and it applies to every dollar wagered regardless of stake size, timing, or escalation shape — verified by computing expected total stake per cycle ($2.1875) and confirming loss/stake = 0.0416/2.1875 = exactly 1.9%, the same edge as flat $1 betting. **No staking or martingale system changes this — it's a proven result, not a tuning problem.** Escalation only redistributes *when* losses land (smoothing frequent small ones into rarer larger ones); it cannot change the sign or magnitude of the long-run edge.

Given that, `profitThreshold` was lowered to bank wins more often during favorable short-term variance rather than let the edge grind through a longer session — this changes the *distribution* of individual session outcomes (more sessions likely to end green if not over-run), not the underlying per-trade expectation. If this bot is restarted indefinitely, cumulative results across enough sessions will still trend toward the same negative edge. The only way to test something with a chance of genuine positive expected value is RDA Rise Fall, which trades real market price action rather than a certified RNG — see that bot's entry above.

## Why Rise Fall's profits are all different (unlike Differs' flat $0.09)

Two independent reasons, both absent from Differs:
1. **Variable stake**: Rise Fall still runs Reverse D'Alembert, which deliberately changes the stake after every trade (up on a win, down on a loss). Differs' stake is flat at $1 except during a rare escalation, so almost every normal trade has the same profit; Rise Fall's stake is essentially never the same trade-to-trade, so neither is the profit.
2. **Variable payout**: Differs' win probability is fixed by the certified RNG (~90%, always), so its payout ratio barely moves. Rise Fall is a real-market EUR-USD directional contract — its payout is priced off actual market volatility and spread at the moment of purchase, which shifts continuously. Even at an identical stake, two Rise Fall trades placed minutes apart can have different payout ratios because the market itself moved.
