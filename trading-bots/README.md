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
- Stake management (rewritten 2026-09-01; escalation depth, multiplier, and base stake all tuned repeatedly on 2026-09-03 — see git history): capped, **partial-recovery** Martingale instead of Reverse D'Alembert. **Base stake $2** (tested at $1, $0.50, and $0.35 first — see "Payout margin varies by stake" below for why $2 was chosen over smaller amounts). Escalation ladder is asymmetric by design: **$2 → $23.53 (tier1, ×11.7647) → $10 (tier2, ×5) → $50 (tier3, ×25) → $250 (tier4, ×125)**, capped at 4 consecutive escalations; a 5th consecutive loss resets to base instead of escalating to $1,250.
  - **Why tier1 uses ×11.7647, not a round ×11 or ×11.11**: the full-recovery multiplier is 1/margin, and margin is *not* a fixed 9% across all stake sizes (see below) — at $2 stake the measured margin is 8.5%, so 1/0.085 = 11.7647 is the actual multiplier needed to fully recover a $2 loss. Using a generic ×11.11 here would under-recover, the same mistake the original flat ×5 ladder made at a different scale.
  - **Why tier2–4 drop back to ×5/×25/×125 of base rather than continuing to compound tier1's multiplier**: a single isolated loss is by far the most common non-win outcome, so only tier1 gets a near-full-recovery attempt. Continuing to compound ×11.76 on a genuine multi-loss streak would explode fast (×11.76² ≈ $276, ×11.76³ ≈ $3,244 relative to base). The moment a streak proves itself "real" (2+ consecutive losses), the ladder deliberately falls back to the gentler, fixed ×5-per-tier progression used purely for worst-case containment — these multipliers are chosen for cost control, not recovery math, so they don't need to be re-derived from the payout margin the way tier1 does.
  - This cap applies only within one uninterrupted run of consecutive losses. Any win, at any stage, immediately resets to base *and* fully clears the streak — a completely separate future loss (the very next trade, or 50 trades later) gets the full escalation ladder again, unrestricted by anything from an earlier, already-resolved streak. The cap is not a one-time-per-run allowance.
  - Bot-level safety: `maxStake` $400 (must exceed $250, the largest single stake in the ladder). `profitThreshold` $10. `lossThreshold` $400 — this **must** stay above the worst-case full cycle for whatever ladder is configured ($2+$23.53+$10+$50+$250 = $335.53), otherwise the circuit breaker fires early and the deepest tier becomes dead code that never executes (this was a real bug in an intermediate version — see git history). Any future change to the ladder — including base stake, since that changes the measured margin and therefore tier1's correct multiplier — must re-derive `maxStake`, `lossThreshold`, and tier1's multiplier from fresh live-tested numbers, not copied forward from a different stake size.
  - Raising or lowering `profitThreshold` doesn't change the underlying per-trade math (see "Does this bot make money" below) — it only changes how long the bot runs before locking in a win and stopping.
  - Minimum account balance to run this version: see "Minimum balance" below.
  - **The underlying loss streak itself cannot be prevented, at any length.** Volatility 100 (1s) digits are IID uniform on a certified RNG — each trade is statistically independent of every prior one, so no signal, indicator, or prediction (including the dynamic Last Digit block) can reduce the fixed 10% chance any single trade loses. P(4 in a row) = 0.01%, P(5 in a row) = 0.001% — ten times rarer, not impossible. "Haven't observed a 5-streak yet" is a small-sample artifact, not evidence it can't happen; at ~1-2 seconds/trade a bot generates thousands of trades a day, so both events recur on a long enough timeline. **Adding another tier to cover the next-rarer streak does not fix this — it only relocates the uncovered tail to an even-rarer, larger event** (adding a tier5 to catch 5-streaks would leave 6-streaks uncovered at a bigger size, and so on indefinitely). The only real lever is how much a give-up event costs (ladder depth × multiplier × base stake), never whether one can occur.
  - Caveat: the ~90% win rate is fixed by contract math regardless of prediction. Payout does **not** vary by which digit is predicted — verified live (0, 3, 5, 9 all priced identically at a given stake/duration); the per-digit percentages shown in Deriv's UI are just recent tick-frequency stats, not pricing inputs. Trade-to-trade payout variance (e.g. $1.08 vs $1.10) is ordinary live repricing, not digit-dependent.

RDA Rise Fall's "Trade again after purchase" / stake-management blocks are the shared Reverse D'Alembert function blocks from the original strategy templates. RDA Digits Differs reuses the same function blocks (still labeled "Reverse D'Alembert..." in the workspace) but its internal arithmetic was replaced with the capped-Martingale logic described above — the names are cosmetic leftovers, not the actual behavior.

## Minimum balance — RDA Digits Differs (current: $2 base, ×11.7647/×5/×25/×125 ladder)

Worst case is a 5-loss streak: base $2, then four failed recovery attempts at $23.53, $10, $50, and $250 — total staked in that one streak = **$335.53**.

- **Absolute mathematical floor**: $335.53. At exactly this balance, surviving that one streak leaves $0 — no margin, and the account can't place another trade afterward.
- **Matches the bot's own circuit breaker**: $400 (the `lossThreshold`/`maxStake`). Below this, the bot's own math doesn't add up.
- **Practical recommendation**: $500–$600. Covers one full worst-case streak with room to keep trading afterward toward the $10 profit target, rather than being wiped to the circuit-breaker floor the first time it happens. This streak length recurs over enough trades (see the "cannot be prevented" note above) — this is sized for "when it happens again," not "if."

This is the bot's own structural requirement given its configured constants, not investment advice about how much you should personally risk.

## Payout margin varies by stake — verified live, changes the recovery math

Earlier versions of this document assumed the payout margin held constant at ~9% regardless of stake size. **That assumption was wrong**, confirmed by testing live on Deriv's platform (Volatility 100 (1s), Differs, 1 tick):

| Stake | Payout | Margin |
|---|---|---|
| $0.35 | $0.37 | 5.7% |
| $0.50 | $0.53 | 6.0% |
| $1.00 | $1.09 | 9.0% |
| $2.00 | $2.17 | 8.5% |
| $10.00 | $10.87 | 8.7% |

Margin drops noticeably below $1 stake — most likely because payouts round to the nearest cent, and that rounding eats a much larger fraction of a small stake's profit than a large one's. Above $1 it settles in the 8.5–9% range.

**Practical consequence**: the full-recovery multiplier (1/margin) is *not* a universal constant — it must be re-measured for whatever base stake is actually configured. Using a flat ×11.11 (correct at $1) against a $0.50 or $0.35 base would under-recover every escalation, and using it against a $2 base (÷ 0.085 → really ×11.7647) would slightly over-recover. This is why base stake was raised from $0.50 → $2: $0.50's 6% margin is a strictly worse edge to trade against than $2's 8.5%, on top of needing a different (and initially uncalculated) multiplier. Profit-per-win still scales linearly with stake within a given margin tier (a $2 base wins $0.17/trade vs $1's $0.09), but raising the base also scales every escalation tier and the minimum-balance requirement by the same factor — there's no way to increase per-trade profit without proportionally increasing worst-case exposure.

## Does this bot make money? (No — and no ladder tuning fixes that)

Confirmed against real session data on 2026-09-03 (on the earlier $1-base, ×11/×5/×25/×125 ladder): 1,356 trades, 90.2% win rate (right on target), **-$54.65** total.

The exact-recursion expected value for that $1→$11→$5→$25→$125 ladder: **-$0.0416 per cycle**, averaging **1.111 trades/cycle**, so **≈ -$0.037 per individual trade**. Over 1,356 trades that predicts ≈ -$50.70 — the actual -$54.65 is a near-exact match, i.e. the bot was doing exactly what the math says, not malfunctioning. The $2-base ladder now in use hasn't been re-run through this same recursion with its updated 8.5%-margin numbers, but the conclusion below is margin-driven and holds regardless of the exact ladder shape.

**Why**: Differs pays 9% on a 90%-win event; break-even requires ~11.11% (0.1/0.9). That 2.11-point gap is Deriv's house edge, and it applies to every dollar wagered regardless of stake size, timing, or escalation shape — verified by computing expected total stake per cycle ($2.1875) and confirming loss/stake = 0.0416/2.1875 = exactly 1.9%, the same edge as flat $1 betting. **No staking or martingale system changes this — it's a proven result, not a tuning problem.** Escalation only redistributes *when* losses land (smoothing frequent small ones into rarer larger ones); it cannot change the sign or magnitude of the long-run edge.

Given that, `profitThreshold` was lowered to bank wins more often during favorable short-term variance rather than let the edge grind through a longer session — this changes the *distribution* of individual session outcomes (more sessions likely to end green if not over-run), not the underlying per-trade expectation. If this bot is restarted indefinitely, cumulative results across enough sessions will still trend toward the same negative edge. The only way to test something with a chance of genuine positive expected value is RDA Rise Fall, which trades real market price action rather than a certified RNG — see that bot's entry above.

## Why Rise Fall's profits are all different (unlike Differs' flat $0.09)

Two independent reasons, both absent from Differs:
1. **Variable stake**: Rise Fall still runs Reverse D'Alembert, which deliberately changes the stake after every trade (up on a win, down on a loss). Differs' stake is flat at $1 except during a rare escalation, so almost every normal trade has the same profit; Rise Fall's stake is essentially never the same trade-to-trade, so neither is the profit.
2. **Variable payout**: Differs' win probability is fixed by the certified RNG (~90%, always), so its payout ratio barely moves. Rise Fall is a real-market EUR-USD directional contract — its payout is priced off actual market volatility and spread at the moment of purchase, which shifts continuously. Even at an identical stake, two Rise Fall trades placed minutes apart can have different payout ratios because the market itself moved.
