Status: Accepted data standard; Codex and complete-snapshot Copilot runtime cost integration implemented

Audience: maintainers, adapter authors, and contributors implementing cost estimates

Source of truth: `../pricing/api-pricing.json` for reviewed price snapshots and `../pricing/api-pricing.schema.json` for format version 1

Last reviewed: 2026-08-11

# API pricing catalog

TokenStats stores public provider prices as reviewed, versioned data instead of
looking them up at runtime. The catalog contains OpenAI models relevant to
Codex and GitHub Copilot per-token reference rates. Later snapshots can add
additional provider or plan-specific rates without changing the version 1
structure.

The Electron main process bundles and reads the catalog for the Codex and
GitHub Copilot dashboards. The current slice calculates a query-time estimated
API-equivalent USD amount for complete token snapshots, exposes pricing
snapshot/date and event coverage, and fails closed to `unknown` when an event
cannot be priced. Active Copilot CLI snapshots with output-only data remain
unpriced until a complete shutdown snapshot is persisted.

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

The OpenAI entries are direct-provider Standard API list prices. The GitHub
Copilot entry is a provider reference-rate snapshot: all prices are per million
tokens and GitHub states that one AI credit equals $0.01 USD. Both exclude
subscription allowances, provider credits or discounts, tool-call fees,
regional processing uplifts, third-party hosting, and unsupported billing
variants. A cost derived from local Codex or Copilot usage must therefore be
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

## Current GitHub Copilot snapshot

The `github-copilot-2026-08-11` snapshot was checked on 2026-08-11 against
the [official GitHub Copilot models and pricing page](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing).
It stores the OpenAI, Anthropic, Google, GitHub fine-tuned, Microsoft, xAI,
and Moonshot model tables shown there, including their long-context tiers.
Claude Sonnet 5 is recorded with the promotional rate and its stated
2026-08-31 end date in the tier note. Copilot code completions and next-edit
suggestions are excluded because GitHub documents a separate counting
mechanism for them.
