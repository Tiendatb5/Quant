# Quant release notes

## 2.1.0 — Quant Signal Engine V2, Signal Board Candidate Filters, and New App Logo

Quant v2.1.0 is a major engine release introducing **Quant Signal Engine V2**, dedicated **Signal Board candidate filtering**, and a new branding design.

### Highlights:
- **Signal Board Candidate Filters:** Directly filter the scanned universe for `🟢 Buy Candidates` and `🔴 Short Candidates` with live Setup Quality scores (`quality 82/100`), candidate badges, and active count summary meters.
- **Authoritative 1D Signal Desk:** Pure 1D daily price structure evaluation decoupled from visual chart zoom/range. Honest decision classification (`BUY CANDIDATE`, `SHORT CANDIDATE`, `WAIT`, `NO TRADE`, `INVALIDATED`) with explicit blocker breakdowns.
- **Setup-Specific Causal Historical Replay:** Lookahead-free 5-year daily replay modeling next-open entries, 5 bps slippage, pre-entry gap invalidations, same-bar stop priorities, and 10-bar timeout exits.
- **Statistical Confidence Intervals:** Deterministic `mulberry32` PRNG bootstrap 95% CI on expectancy $R$ and 95% Wilson score intervals on win rate.
- **Forward Outcome Store:** Persistent forward candidate tracker (`quant-signal-outcomes-v1.json`) automatically resolving outcomes against subsequent daily prints.
- **New App Logo & Branding:** Integrated the new Quant blue fox logo across window titlebars, Electron runtime icons, HTML favicons, and the top-left terminal header.

## 2.0.1 — LLM connection-test and calendar fixes

The LLM Settings connection test no longer truncates at eight tokens. OpenAI reasoning models can consume that entire budget before emitting visible text, and local Ollama/OpenAI-compatible endpoints can truncate the probe. The shared connection-test budget is now 128 tokens for both endpoint families.

Validation: the full release gate passed TypeScript, Quant integration, fast UI resilience, one-command startup, all 44 Python tests, forecast packaging, native ARM64 sidecar health, production build, and the built renderer harness.
