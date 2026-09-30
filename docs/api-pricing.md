Status: Accepted data standard; Codex, current and legacy Claude Code models, and complete-snapshot Copilot runtime cost integration implemented

Audience: maintainers, adapter authors, and contributors implementing cost estimates

Source of truth: `../pricing/api-pricing.json` for reviewed price snapshots and `../pricing/api-pricing.schema.json` for format version 1

Last reviewed: 2026-09-30

# API pricing catalog

TokenStats stores public provider prices as reviewed, versioned data instead of
looking them up at runtime. The catalog contains OpenAI models relevant to
Codex and exact OpenAI model identifiers reported by Claude Code, Anthropic
API prices for current and legacy Claude Code models, and GitHub Copilot
per-token reference rates. Later snapshots can add additional provider or
plan-specific rates without changing the version 1 structure.

Historical snapshots remain in the catalog so previously reviewed rates are not
rewritten; the latest snapshot matching each exact source and model is selected
for new estimates.

The Electron main process bundles and reads the catalog for Codex, Claude Code,
and GitHub Copilot dashboard estimates. The current slice calculates a
query-time estimated API-equivalent USD amount for complete token snapshots,
exposes pricing snapshot/date and event coverage, and fails closed to `unknown`
when an event cannot be priced. Active Copilot CLI snapshots with output-only
data remain unpriced until a complete shutdown snapshot is persisted.

## Version 1 rules

- `format` and `formatVersion` identify the contract. A breaking structural or
  semantic change requires a new format version.
- `snapshots` is append-only in meaning. When a price changes, add a new
  snapshot with a new `id`; do not rewrite the snapshot used by historical
  estimates.
- `sourceIds` on a snapshot maps the reviewed rates to exact TokenStats source
  identities such as `codex-current-user` or `copilot-current-user`. Runtime
  pricing matches this field exactly; a new provider remains `unknown` until a
  reviewed snapshot explicitly maps it.
- When multiple snapshots map one source, query-time estimates first require an
  exact `matchIds` entry for the event's model, then select the snapshot with
  the greatest `verifiedAt`, greatest `effectiveFrom`, and lexicographically
  greatest `id` as deterministic tie-breakers. A newer snapshot for one model
  therefore does not hide another model's reviewed price. This is a
  current-catalog rule, not a historical billing assertion.
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
`cacheWriteInputTokens`, `cacheWriteOneHourInputTokens`, `outputTokens`, and
`reasoningOutputTokens`. The one-hour field is an optional subset of aggregate
cache-write tokens. A new meter that cannot be represented honestly requires
a new format version rather than an improvised field.

## Cost semantics

The OpenAI and Anthropic entries are direct-provider Standard API list prices.
The GitHub Copilot entry is a provider reference-rate snapshot: all prices are
per million tokens and GitHub states that one AI credit equals $0.01 USD.
These prices exclude subscription allowances, provider credits or discounts,
tool-call fees, regional processing uplifts, third-party hosting, and
unsupported billing variants. A cost derived from local usage must therefore
be shown as an **estimated API-equivalent cost**, not an observed bill.

Claude Code records expose both the aggregate cache-creation count and, in
current logs, a non-content breakdown between five-minute and one-hour writes.
TokenStats uses that breakdown when it matches the aggregate, applying the
model's exact cache-write rate. Older records without the breakdown use the
five-minute rate as an explicit estimate. An inconsistent breakdown is
rejected for pricing rather than silently assigned the cheaper rate.

Adapters must also establish whether cached, cache-write, and reasoning counts
are subsets of another recorded count before calculating a cost. The catalog
does not authorize double-counting. If a required rate, exact model match, or
token relationship is unavailable, the cost remains `unknown`.

## Current OpenAI/Codex snapshot

The `openai-codex-2026-09-23` snapshot was checked on 2026-09-23 against the
[official OpenAI API pricing page](https://developers.openai.com/api/docs/pricing)
and the linked official model pages recorded in the catalog. It includes GPT-6
Astra, Sol, and Luna, the GPT-5.6 Sol/Terra/Luna family, GPT-5.5, GPT-5.4, and
GPT-5.3-Codex. GPT-6 Sol and Luna use separate rates above 272,000 input
tokens. GPT-5.6 Sol is recorded at the current promotional Standard API rate,
noted by OpenAI as available at least through 2026-11-21.

## Current Anthropic/Claude Code snapshot

The `anthropic-claude-code-2026-09-23` snapshot maps 18 exact current and
legacy model IDs to Claude Code's `claude-current-user` source. This includes
new `claude-opus-5-5` at $4/MTok input, $0.20/MTok cached input, $5/MTok
five-minute cache writes, $8/MTok one-hour cache writes, and $20/MTok output;
Claude Sonnet 5 and the remaining Opus, Fable, Mythos, Sonnet, and Haiku models
also have five-minute and one-hour cache rates. Anthropic's current prompt
caching table sets one-hour writes at 2x base input price; Opus 5.5 cache reads
are $0.20/MTok (5% of base input price). Anthropic released Opus 5.5 on
2026-09-22. The snapshot was checked against the
[official Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing),
[prompt-caching usage format](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
and [model ID reference](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions).
Anthropic confirmed Sonnet 5's $2/$10 input/output price is now standard; the
previously announced September increase will not occur. The snapshot retains
priced historical IDs for models Anthropic has retired from its API and marks
limited-availability Mythos models in its notes.

Claude Code cost estimates use standard API list pricing. The current adapter
normalizes Anthropic's uncached input plus cache-read and cache-write counts to
the inclusive input total expected by the shared cost calculator. It keeps the
one-hour cache-write token count separately without storing raw usage content.
Fast-mode and US-only inference price multipliers are not represented in the
imported token fields, so estimates assume standard speed and default/global
routing; they are API-equivalent estimates, not observed subscription charges.

## Claude Sonnet 5.5 snapshot

The `anthropic-claude-code-2026-09-29` snapshot adds the exact
`claude-sonnet-5-5` model ID, released by Anthropic on 2026-09-28, to Claude
Code's `claude-current-user` source. Its Standard API list prices are $2/MTok
input, $0.20/MTok cached input, $2.50/MTok five-minute cache writes, $4/MTok
one-hour cache writes, and $10/MTok output across the full 1M context window.
The rates were checked on 2026-09-29 against the
[official Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing)
and the [Sonnet 5.5 model overview](https://platform.claude.com/docs/en/models/sonnet-5-5/overview).
Because runtime selection requires an exact model match, the earlier
`anthropic-claude-code-2026-09-23` snapshot continues to price the other
Claude models.

## GPT-6.1 Sol and Copilot additions (2026-09-30)

The `openai-codex-2026-09-30` snapshot adds the exact `gpt-6.1-sol` model ID to
Codex from the [official OpenAI pricing page](https://developers.openai.com/api/docs/pricing)
and [model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol):
$2/MTok input, $0.10/MTok cached input, and $10/MTok output through 272,000
input tokens; above that, $4, $0.20, and $15. OpenAI lists no cache-write rate,
so none is recorded.

The `github-copilot-2026-09-30` snapshot adds reference rates from the
[official GitHub Copilot models and pricing page](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing)
for `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`, `claude-sonnet-5.5`,
`claude-opus-5.5`, and `grok-4.7`. Sonnet 5.5 is $2/$0.20/$2.50/$10 and Opus 5.5
is $4/$0.20/$5/$20 (input/cached/cache write/output per MTok). Grok 4.7 is
$2/$0.50/$6 through 200,000 input tokens and $4/$1/$12 above it, with no cache
write rate listed. The existing Anthropic prices were rechecked against the
[official Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing)
on 2026-09-30 and did not change, so no Anthropic snapshot was added. Earlier
snapshots continue to price all other models through exact matching.

## OpenAI model identifier reported by Claude Code

The `openai-claude-code-2026-09-25` snapshot maps the exact `gpt-5.6-luna`
identifier found in Claude Code's source to OpenAI Standard API list prices.
The rates are $0.20/MTok uncached input, $0.02/MTok cached input,
$0.25/MTok cache writes, and $1.20/MTok output through 272,000 input tokens;
the catalog records the official long-context tier separately. This is an
API-equivalent estimate for the observed model ID. It does not establish which
proxy, subscription, or account handled billing.

## Current GitHub Copilot snapshot

The `github-copilot-2026-09-08` snapshot was checked again on 2026-09-23 against the
[official GitHub Copilot models and pricing page](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing).
The page's prices still match this snapshot, which stores the OpenAI,
Anthropic, Google, Microsoft, xAI, and Moonshot tables shown there, including
GPT-6 Astra, Gemini 3.7/3.8 Flash, MAI-Code-1.1-Flash, Grok 4.6, and Claude
Fable 5.1 entries. GitHub's Gemini 3.6/3.7/3.8 Flash promotional rate is
recorded through 2026-12-31. Copilot code completions and next-edit suggestions
are excluded because GitHub documents a separate counting mechanism for them.
