# Trading bots (DBot XML exports)

Exported from the live Bot Builder (Demo account) on 2026-09-01. Import via Dashboard → My computer, or Bot Builder → Import.

## RDA Rise Fall.xml
- Market: Forex / Major Pairs / EUR-USD (real market data, not synthetic)
- Contract: Rise/Fall, Duration 15 minutes (platform-enforced minimum for real Forex Rise/Fall)
- Entry signal: SMA(5) vs SMA(20) crossover on 1-minute closes — fast > slow → CALL, else PUT
- Stake management: Reverse D'Alembert (increase stake on win, decrease on loss)

## RDA Digits Differs.xml
- Market: Derived / Volatility 100 (1s) Index (certified RNG, synthetic)
- Contract: Digits — Differs, Duration 1 tick
- Prediction: dynamic Last Digit block (last tick's digit) instead of a fixed number
- Stake management: Reverse D'Alembert
- Caveat: Volatility 100 (1s) digits are IID uniform on a certified RNG. Differs wins ~90% of trades by contract math regardless of which digit is predicted — the dynamic prediction does not create a real statistical edge. Kept for stake-management testing purposes.

Both bots' "Trade again after purchase" / stake-management blocks are shared Reverse D'Alembert function blocks, unchanged from the original strategy templates.
