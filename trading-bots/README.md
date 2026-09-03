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
- Stake management (rewritten 2026-09-01, escalation depth extended to 3 tiers 2026-09-03, multiplier shrunk to 5x same day): capped, **partial-recovery** Martingale instead of Reverse D'Alembert. Base stake $1. On a loss, stake escalates ×5 per consecutive loss: $1 → $5 → $25 → $125. Capped at 3 consecutive escalations; a 4th consecutive loss resets to base instead of escalating to $625, so the strategy accepts the loss and stops chasing rather than spiraling.
  - **This is a deliberate downgrade from full recovery.** The mathematically exact multiplier for this contract's ~9% payout is ×11.11 (needed to fully recover a prior loss in one win). ×5 does not fully recover — e.g. a $5 win after a $1 loss returns ~$0.45 profit against a $1 hole, net still down ~$0.55. The trade-off was chosen deliberately: after a real $1,506.78 4-loss-streak loss on the ×11.11 version (worst case at that config), the priority shifted from "guarantee full recovery" to "cap the worst case" — new worst-case 4-loss streak is $1 + $5 + $25 + $125 = **$156**, about 1/10th of the previous $1,507.
  - This cap applies only within one uninterrupted run of consecutive losses. Any win, at any stage, immediately resets to base *and* fully clears the streak — a completely separate future loss (the very next trade, or 50 trades later) gets the full 3-tier escalation again, unrestricted by anything from an earlier, already-resolved streak. The cap is not a one-time-per-run allowance.
  - Bot-level safety: `maxStake` $200 (must exceed the $125 third escalation step). `profitThreshold` $20 (changed 2026-09-03, was $50 briefly, $10 before that). `lossThreshold` $200 — this **must** stay above the worst-case full cycle for whatever multiplier/depth is configured, otherwise the circuit breaker fires early and the deepest tier becomes dead code that never executes (this was a real bug in an intermediate version — see git history). Any future change to escalation depth or multiplier must re-derive both `maxStake` and `lossThreshold` from the new worst-case cycle total.
  - Raising `profitThreshold` doesn't change the underlying per-trade math (see "Why $0.09" below) — it only changes how long the bot runs before locking in a win.
  - Minimum account balance to run this version: see "Minimum balance" below.
  - **The 4-loss streak itself cannot be prevented.** Volatility 100 (1s) digits are IID uniform on a certified RNG — each trade is statistically independent of every prior one, so no signal, indicator, or prediction (including the dynamic Last Digit block) can reduce the fixed 10% chance any single trade loses. P(4 in a row) = 0.1⁴ = 0.01% per attempt, but at ~1-2 seconds/trade a bot generates thousands of trades a day; over 10,000 trades the chance of at least one 4-streak is ~63%. It is a "when," not an "if" — the only lever available is how much it costs when it happens (escalation depth × multiplier × base stake), not whether it happens.
  - Caveat: the ~90% win rate is fixed by contract math regardless of prediction. Payout does **not** vary by which digit is predicted — verified live (0, 3, 5, 9 all priced identically at a given stake/duration); the per-digit percentages shown in Deriv's UI are just recent tick-frequency stats, not pricing inputs. Trade-to-trade payout variance (e.g. $1.08 vs $1.10) is ordinary live repricing, not digit-dependent.

RDA Rise Fall's "Trade again after purchase" / stake-management blocks are the shared Reverse D'Alembert function blocks from the original strategy templates. RDA Digits Differs reuses the same function blocks (still labeled "Reverse D'Alembert..." in the workspace) but its internal arithmetic was replaced with the capped-Martingale logic described above — the names are cosmetic leftovers, not the actual behavior.

## Minimum balance — RDA Digits Differs (3-tier, ×5 version)

Worst case is a 4-loss streak: base $1, then three failed recovery attempts at $5, $25, and $125 — total staked in that one streak = **$156**.

- **Absolute mathematical floor**: $156. At exactly this balance, surviving that one streak leaves $0 — no margin, and the account can't place another trade afterward.
- **Matches the bot's own circuit breaker**: $200 (the `lossThreshold`/`maxStake`). Below this, the bot's own math doesn't add up.
- **Practical recommendation**: $250–$300. Covers one full worst-case streak with room to keep trading afterward toward the $20 profit target, rather than being wiped to the circuit-breaker floor the first time it happens. A 4-loss streak recurs regularly over enough trades (see the "cannot be prevented" note above) — this is sized for "when it happens again," not "if."

This is a ~10x smaller minimum balance than the previous ×11.11 configuration ($2,000–$2,500), at the cost of no longer fully recovering a loss on the escalated win — see the partial-recovery trade-off noted above. This is the bot's own structural requirement given its configured constants, not investment advice about how much you should personally risk.

## Why every normal Differs trade profits exactly $0.09

Differs pays a fixed ~9% margin on a $1 stake, verified live on Deriv's platform — not something set in the bot's code, and not adjustable except by staking more (profit scales linearly with stake: $2 base → $0.18/win, $10 base → $0.90/win). Raising the base stake also scales every escalation tier and the minimum-balance requirement by the same factor, so a 10x bigger per-trade profit means a ~10x bigger worst-case exposure ($15,067.80 instead of $1,506.78 at $10 base). There is no way to get a bigger profit-per-win on this contract without proportionally bigger risk — the 9% margin itself is fixed by contract math (see the payout-per-digit note above), not something a stake choice can improve.

## Why Rise Fall's profits are all different (unlike Differs' flat $0.09)

Two independent reasons, both absent from Differs:
1. **Variable stake**: Rise Fall still runs Reverse D'Alembert, which deliberately changes the stake after every trade (up on a win, down on a loss). Differs' stake is flat at $1 except during a rare escalation, so almost every normal trade has the same profit; Rise Fall's stake is essentially never the same trade-to-trade, so neither is the profit.
2. **Variable payout**: Differs' win probability is fixed by the certified RNG (~90%, always), so its payout ratio barely moves. Rise Fall is a real-market EUR-USD directional contract — its payout is priced off actual market volatility and spread at the moment of purchase, which shifts continuously. Even at an identical stake, two Rise Fall trades placed minutes apart can have different payout ratios because the market itself moved.
