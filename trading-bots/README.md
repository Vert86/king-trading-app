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
- Stake management (rewritten 2026-09-01): capped Martingale instead of Reverse D'Alembert. Base stake $1. On a loss, stake escalates by ×11.11 (the multiplier needed to fully recover a loss given Differs' real ~9% payout — a plain ×2 doubling under-recovers on this contract). Capped at 2 consecutive escalations ($1 → $11.11 → $123.43); a 3rd consecutive loss resets to base instead of escalating to ~$1,371, so the strategy accepts the loss and stops chasing rather than spiraling.
  - This cap applies only within one uninterrupted run of consecutive losses. Any win, at any stage (base, 1st, or 2nd escalation), immediately resets to base *and* fully clears the streak — a completely separate future loss (the very next trade, or 50 trades later) gets the full 2-tier escalation again, unrestricted by anything from an earlier, already-resolved streak. The cap is not a one-time-per-run allowance.
  - Bot-level safety: `maxStake` $150 (must exceed the $123.43 second escalation step or it gets clipped and breaks the recovery math). `profitThreshold` $10. `lossThreshold` $50 — deliberately tighter than the ~$135.54 worst-case single cycle, so the bot fully halts well before it could absorb a complete worst-case cycle even once.
  - Caveat: Volatility 100 (1s) digits are IID uniform on a certified RNG — the ~90% win rate is fixed by contract math regardless of prediction. The low ~9% payout is exactly why naive doubling doesn't work here and why the escalation is capped rather than chased to full recovery. Payout does **not** vary by which digit is predicted — verified live (0, 3, 5, 9 all priced identically at a given stake/duration); the per-digit percentages shown in Deriv's UI are just recent tick-frequency stats, not pricing inputs. Trade-to-trade payout variance (e.g. $1.08 vs $1.10) is ordinary live repricing, not digit-dependent.

RDA Rise Fall's "Trade again after purchase" / stake-management blocks are the shared Reverse D'Alembert function blocks from the original strategy templates. RDA Digits Differs reuses the same function blocks (still labeled "Reverse D'Alembert..." in the workspace) but its internal arithmetic was replaced with the capped-Martingale logic described above — the names are cosmetic leftovers, not the actual behavior.
