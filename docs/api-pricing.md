Status: Accepted data standard; Codex runtime cost integration implemented

Audience: maintainers, adapter authors, and contributors implementing cost estimates

Source of truth: `../pricing/api-pricing.json` for reviewed price snapshots and `../pricing/api-pricing.schema.json` for format version 1

Last reviewed: 2026-08-11

# API pricing catalog

TokenStats stores public API prices as reviewed, versioned data instead of
looking them up at runtime. The initial catalog contains OpenAI models relevant
to Codex. Later snapshots can add Anthropic/Claude Code, GitHub Copilot,
xAI/Grok, and other providers without changing the version 1 structure.

The Electron main process bundles and reads the catalog for the Codex dashboard.
The current slice calculates a query-time estimated API-equivalent USD amount,
exposes pricing snapshot/date and event coverage, and fails closed to `unknown`
when an event cannot be priced. Claude Code, GitHub Copilot, xAI/Grok, and other
providers are catalog extensions and runtime integrations still to be reviewed.

## Version 1 rules

- `format` and `formatVersion` identify the contract. A breaking structural or
  semantic change requires a new format version.
- `snapshots` is append-only in meaning. When a price changes, add a new
  snapshot with a new `id`; do not rewrite the snapshot used by historical
  estimates.
- Every snapshot identifies the `provider`, product, verification date,
  effective date when the provider publishes one, ISO currency, billing mode,
  unit, and official sources. `effectiveFrom: null` means the official source
  did not establish an effective date; it does not mean “effective forever.”
- `modelId` is the canonical display identifier. `matchIds` contains the exact
  identifiers that a source adapter may emit. Matching is exact and
  case-sensitive; guessed or fuzzy matches are not allowed.
- A tier may bound the number of input tokens. Omitting a lower or upper bound
  leaves that side open. Tiers for one model must not overlap.
- Rates use the canonical TokenStats token field names and are denominated in
  the snapshot's currency per `unit.quantity` tokens. An omitted rate is
  unknown, never zero.
- Each model references the official source records that support its rates or
  identifiers. Every source has its own retrieval date.

Version 1 supports `inputTokens`, `cachedInputTokens`,
`cacheWriteInputTokens`, `outputTokens`, and `reasoningOutputTokens`. A new
meter that cannot be represented honestly requires a new format version rather
than an improvised field.

## Cost semantics

The current entries are direct-provider Standard API list prices. They exclude
subscription charges, provider credits or discounts, tool-call fees, regional
processing uplifts, third-party hosting, and Batch/Flex/Fast modes. A cost
derived from local Codex, Claude Code, Copilot, or Grok usage must therefore be
shown as an **estimated API-equivalent cost**, not an observed bill.

Adapters must also establish whether cached, cache-write, and reasoning counts
are subsets of another recorded count before calculating a cost. The catalog
does not authorize double-counting. If a required rate, exact model match, or
token relationship is unavailable, the cost remains `unknown`.

## Current OpenAI/Codex snapshot

The `openai-codex-2026-08-11` snapshot was checked on 2026-08-11 against the
[official OpenAI API pricing page](https://developers.openai.com/api/docs/pricing)
and the linked official model pages recorded in the catalog. It includes the
GPT-5.6 Sol, Terra, and Luna family, GPT-5.5, GPT-5.4, and GPT-5.3-Codex. For
models whose official documentation applies long-context pricing above 272,000
input tokens, the catalog stores separate short- and long-context rates.
