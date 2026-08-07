# Quant release notes

## 2.0.1 — LLM connection-test and calendar fixes

The LLM Settings connection test no longer truncates at eight tokens. OpenAI reasoning models can consume that entire budget before emitting visible text, and local Ollama/OpenAI-compatible endpoints can truncate the probe. The shared connection-test budget is now 128 tokens for both endpoint families.

Validation: the full release gate passed TypeScript, Quant integration, fast UI resilience, one-command startup, all 44 Python tests, forecast packaging, native ARM64 sidecar health, production build, and the built renderer harness.
