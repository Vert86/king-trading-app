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
- Stake management (rewritten 2026-09-01, escalation depth extended 2026-09-03): capped Martingale instead of Reverse D'Alembert. Base stake $1. On a loss, stake escalates by ×11.11 (the multiplier needed to fully recover a loss given Differs' real ~9% payout — a plain ×2 doubling under-recovers on this contract). Capped at **3** consecutive escalations ($1 → $11.11 → $123.43 → $1,371.24); a 4th consecutive loss resets to base instead of escalating to ~$15,236, so the strategy accepts the loss and stops chasing rather than spiraling.
  - This cap applies only within one uninterrupted run of consecutive losses. Any win, at any stage, immediately resets to base *and* fully clears the streak — a completely separate future loss (the very next trade, or 50 trades later) gets the full 3-tier escalation again, unrestricted by anything from an earlier, already-resolved streak. The cap is not a one-time-per-run allowance.
  - Bot-level safety: `maxStake` $1,500 (must exceed the $1,371.24 third escalation step or it gets clipped and breaks the recovery math). `profitThreshold` $50 (raised from $10, 2026-09-03). `lossThreshold` $1,600 — this **must** stay above the ~$1,506.78 worst-case full cycle (1 + 11.11 + 123.43 + 1,371.24), otherwise the circuit breaker fires after the 2nd escalation loss and the 3rd tier can never execute. This was a real bug in an intermediate version: a $50 breaker (sized for the old 2-tier cap) silently made the 3rd tier dead code. Any future change to escalation depth must re-derive this threshold the same way.
  - Raising `profitThreshold` doesn't change the underlying per-trade math (see "Why $0.09" below) — it only changes how long the bot runs before locking in a win. Per-trade expected value is still slightly negative (0.9 × $0.09 − 0.1 × $1 ≈ −$0.019/trade before the escalation mechanism), so a higher target is not a higher-edge target, just a longer session before stopping on a win.
  - Minimum account balance to run this version: see "Minimum balance" below.
  - Caveat: Volatility 100 (1s) digits are IID uniform on a certified RNG — the ~90% win rate is fixed by contract math regardless of prediction. The low ~9% payout is exactly why naive doubling doesn't work here and why the escalation is capped rather than chased to full recovery. Payout does **not** vary by which digit is predicted — verified live (0, 3, 5, 9 all priced identically at a given stake/duration); the per-digit percentages shown in Deriv's UI are just recent tick-frequency stats, not pricing inputs. Trade-to-trade payout variance (e.g. $1.08 vs $1.10) is ordinary live repricing, not digit-dependent.

RDA Rise Fall's "Trade again after purchase" / stake-management blocks are the shared Reverse D'Alembert function blocks from the original strategy templates. RDA Digits Differs reuses the same function blocks (still labeled "Reverse D'Alembert..." in the workspace) but its internal arithmetic was replaced with the capped-Martingale logic described above — the names are cosmetic leftovers, not the actual behavior.

## Minimum balance — RDA Digits Differs (3-tier version)

Worst case is a 4-loss streak: base $1, then three failed recovery attempts at $11.11, $123.43, and $1,371.24 — total staked in that one streak = **$1,506.78**.

- **Absolute mathematical floor**: $1,506.78. At exactly this balance, surviving that one streak leaves $0 — no margin, and the account can't place another trade afterward.
- **Matches the bot's own circuit breaker**: $1,600 (the `lossThreshold`). Below this, the bot's own math doesn't add up — you'd run out of real money before the bot's stop-loss logic would trigger.
- **Practical recommendation**: $2,000–$2,500. This covers one full worst-case streak with room to keep trading afterward (grinding back the loss via ordinary ~90%-win base trades toward the $10 profit target), rather than being wiped to the circuit-breaker floor the first time it happens. A 4-loss streak has roughly a 0.01% chance per attempt, but at maybe 1-2 seconds per trade it isn't a rare edge case over a long running session — it's a when, not an if.

This is the bot's own structural requirement given its configured constants, not investment advice about how much you should personally risk.

## Why every normal Differs trade profits exactly $0.09

Differs pays a fixed ~9% margin on a $1 stake, verified live on Deriv's platform — not something set in the bot's code, and not adjustable except by staking more (profit scales linearly with stake: $2 base → $0.18/win, $10 base → $0.90/win). Raising the base stake also scales every escalation tier and the minimum-balance requirement by the same factor, so a 10x bigger per-trade profit means a ~10x bigger worst-case exposure ($15,067.80 instead of $1,506.78 at $10 base). There is no way to get a bigger profit-per-win on this contract without proportionally bigger risk — the 9% margin itself is fixed by contract math (see the payout-per-digit note above), not something a stake choice can improve.

## Why Rise Fall's profits are all different (unlike Differs' flat $0.09)

Two independent reasons, both absent from Differs:
1. **Variable stake**: Rise Fall still runs Reverse D'Alembert, which deliberately changes the stake after every trade (up on a win, down on a loss). Differs' stake is flat at $1 except during a rare escalation, so almost every normal trade has the same profit; Rise Fall's stake is essentially never the same trade-to-trade, so neither is the profit.
2. **Variable payout**: Differs' win probability is fixed by the certified RNG (~90%, always), so its payout ratio barely moves. Rise Fall is a real-market EUR-USD directional contract — its payout is priced off actual market volatility and spread at the moment of purchase, which shifts continuously. Even at an identical stake, two Rise Fall trades placed minutes apart can have different payout ratios because the market itself moved.
