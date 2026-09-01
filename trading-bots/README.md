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
- Stake management (rewritten 2026-09-01): capped Martingale instead of Reverse D'Alembert. Base stake $1. On a loss, stake escalates by ×11.11 (the multiplier needed to fully recover a loss given Differs' real ~9% payout — a plain ×2 doubling under-recovers on this contract). Capped at 3 consecutive escalations ($1 → $11.11 → $123.43 → $1,371.24); a 4th consecutive loss resets to base instead of escalating to ~$15,236, so the strategy accepts the loss and stops chasing rather than spiraling.
  - Bot-level safety: `maxStake` raised to $1,500 (must exceed the $1,371.24 third escalation step or it gets clipped and breaks the recovery math). `profitThreshold` $10, `lossThreshold` $1,600 (overall stop-bot circuit breaker, sized to survive one full worst-case 3-escalation cycle of ~$1,506.78).
  - Note: raising the escalation cap from 2 to 3 steps was a deliberate choice to let more losing streaks fully recover before giving up — but it also multiplies the worst-case single-trade stake by ~11x (from $123 to $1,371). Every step up this ladder trades a lower chance of hitting the cap for a much larger loss when it does.
  - Caveat: Volatility 100 (1s) digits are IID uniform on a certified RNG — the ~90% win rate is fixed by contract math regardless of prediction. The low ~9% payout is exactly why naive doubling doesn't work here and why the escalation is capped rather than chased to full recovery.

RDA Rise Fall's "Trade again after purchase" / stake-management blocks are the shared Reverse D'Alembert function blocks from the original strategy templates. RDA Digits Differs reuses the same function blocks (still labeled "Reverse D'Alembert..." in the workspace) but its internal arithmetic was replaced with the capped-Martingale logic described above — the names are cosmetic leftovers, not the actual behavior.
