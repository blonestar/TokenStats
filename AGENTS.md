# TokenStats — agent guidance

## Current repository state

- The workspace is initialized as a Git repository on the `main` branch.
- The implemented Fedora/Electron slice uses `src/main/`, `src/preload/`,
  `src/renderer/`, `src/shared/`, and `tests/`; official documentation remains
  in `docs/`, while `ideas/` remains exploratory.
- `docs/` is the canonical project documentation folder. `ideas/` is reserved
  for brainstorming, unresolved questions, and exploratory proposals.
- `package.json` provides `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm build`,
  `pnpm release:check-version` (with `--stable-only` for Stable tags),
  `pnpm package:unpacked`, `pnpm package:linux`, and the macOS-only
  `pnpm package:mac:arm64` ad-hoc-signed, unnotarized ZIP validation command. The manual
  `.github/workflows/macos-arm64-validation.yml` workflow targets `macos-15`
  arm64 runner validates the host, binaries/native module, ad-hoc signature, and
  isolated launch before uploading an internal ZIP plus SHA-256 manifest; it has
  not been pushed or run. Local `.github/workflows/ci.yml` and
  `.github/workflows/release.yml` workflows now run Linux verification and
  tag-driven draft-release preparation, but they have not been pushed or run.
  There is no published release, updater, or cross-platform validation yet.
- The Codex parser is `codex-jsonl-v3`: it ingests only per-event
  `last_token_usage`, tracks bounded model metadata from
  `turn_context.payload.model` and Codex thread settings,
  preserves stable event IDs, and resets only Codex cursors when a parser
  version change requires metadata backfill. SQLite schema version 2 adds the
  non-content `usage_events.model` field; schema version 3 completes the
  compatible storage transition; schema version 4 adds the non-content
  inclusion flag and schema version 5 stores non-content OTel file metadata
  used for safe fallback reconciliation. Schema version 6 adds the
  provider-migration ledger; the registered `claude-file-identifiers@1`
  migration then converts any legacy Claude file references to opaque IDs.
- Current-user scanning covers Codex `~/.codex/sessions`, Claude Code
  `${CLAUDE_CONFIG_DIR:-~/.claude}/projects`, and GitHub Copilot
  `${COPILOT_HOME:-~/.copilot}/session-state`. Copilot also reads the opt-in
  OTel JSONL file at `${COPILOT_OTEL_FILE_EXPORTER_PATH:-<copilot-home>/otel/tokenstats.jsonl}`.
  Claude accepts assistant-message usage only and uses opaque file IDs, not
  content or paths. Copilot imports complete OTel `chat` spans when available,
  suppresses the matching session-state fallback by session/model only after
  aggregate token equality, and keeps active `assistant.message` output-only
  snapshots as a fallback until a full shutdown snapshot or OTel span is
  available. Missing, truncated, rotated, and symlinked OTel paths do not
  delete retained events; cursors are reset and the fallback is re-evaluated.
  OTel parsing allowlists model, conversation/turn metadata, timestamps, and
  token fields; prompt, response, tool, path, and arbitrary attributes are
  never persisted.
- The SQLite database is under Electron `userData`, so both source discovery
  and retained application data are isolated per OS user. Rescans are
  idempotent; history is cumulative until the user explicitly resets imported
  data from Settings. Reset creates and verifies a timestamped SQLite backup,
  records backup metadata, clears imported data/cursors/scan history, and then
  re-imports current source files through the existing scan path.
- Provider modules are registered in `src/main/providers/registry.ts`; their
  source definitions and optional migrations are injected into the central
  database. Provider parsers use the generic canonical-event and
  `IngestionStore` contracts in `src/main/ingestion/` rather than importing
  the concrete database implementation. The current registry contains Codex,
  Claude Code, and GitHub Copilot modules; adding another provider requires a
  module, registry entry, fixtures/contract coverage, and reviewed pricing
  source metadata when an estimate is supported.
- The renderer uses `chart.js` and `react-chartjs-2` for source-and-model-
  separated Line/Bar/Pie views. Dashboard IPC accepts `today`, `yesterday`,
  `thisWeek`, `lastWeek`, `thisMonth`, `lastMonth`, `last6Months`, or a validated
  custom inclusive `YYYY-MM-DD` date range; long custom ranges group trends by
  month, short ranges by day, and single-day ranges by hour, all in the current
  OS user's local timezone. Hovering or focusing a model breakdown row keeps
  that model's chart color and mutes the other series/segments to gray. The
  selected period, custom range, and chart type are persisted in renderer
  `localStorage` across refreshes and application restarts. The renderer also
  displays the live Electron application version beside the logo.
- The BrowserWindow and Linux packaged application use the committed
  `assets/icons/64x64.png` T-and-graph icon for the window/taskbar identity;
  the runtime asset is included in the packaged app. The renderer also has a
  basic Settings view with the guarded local-database reset/re-import action.
- `pricing/api-pricing.json` and its JSON Schema define the accepted version 1
  provider/model pricing catalog. The 2026-08-11 snapshot contains reviewed
  Standard API list prices for Codex-relevant OpenAI models and a reviewed
  GitHub Copilot provider-reference snapshot. The dashboard calculates and
  labels query-time API-equivalent estimates for complete Codex/Copilot token
  snapshots with snapshot/date and coverage metadata; incomplete subscription
  usage must remain unknown and must not be presented as an observed bill.
- Treat `docs/` documents as the source of accepted project documentation only
  when their status and evidence support that claim. Treat `ideas/README.md`,
  `ideas/00-open-questions.md`, and the numbered documents in `ideas/` as
  product and architecture proposals, not as evidence that those features
  already exist.
- Keep descriptions of planned behavior explicitly labeled as planned,
  proposed, or still to be validated.
- Treat the root `README.md` as the public project homepage and keep its status
  and links accurate when the project evolves.

## Synchronization requirement

`AGENTS.md` is living repository guidance and must stay in sync with the
codebase.

- Review this file whenever files, directories, architecture, dependencies,
  scripts, tests, release processes, privacy rules, or development workflows
  change.
- Update `AGENTS.md` in the same change as the relevant codebase or workflow
  change whenever the current guidance would otherwise become incomplete or
  inaccurate.
- Do not document commands, paths, tools, or conventions that are not present
  or verified in the repository. Remove stale instructions promptly.
- If a change is intentionally documentation-only or does not affect the
  guidance, leave this file unchanged and verify that it remains accurate.

## Working principles

- Keep TokenStats local-first and privacy-conscious. Usage records are the
  primary product data; prompt and response content must not be ingested by
  default.
- Treat cost as derived data and label it `observed`, `estimated`, or
  `unknown`. An estimate based on API pricing must never be presented as an
  exact bill.
- Prefer read-only discovery, incremental scanning, idempotent imports, and
  auditable provenance. Adapters should produce canonical events; the central
  ingestion layer owns deduplication, transactions, cursors, and audit history.
- Keep platform-specific behavior and packaging assumptions explicit. Validate
  proposed Electron, SQLite, adapter, notification, tray, and update behavior
  before treating it as implemented.

## Working architecture proposal

The current MVP direction, subject to the unresolved questions in `ideas/` and
the validation spikes described in `docs/`, is:

- Electron + TypeScript + React/Vite;
- filesystem discovery, adapters, parsers, SQLite, import/export, IPC, and
  tray/background behavior in the privileged Electron main process;
- a renderer without direct filesystem access;
- SQLite with explicit SQL migrations and idempotent imports;
- one provider module per harness, with anonymized fixtures and incremental
  cursors;
- a versioned `.tokenstats` archive plus CSV/JSON exports;
- GitHub/GitHub Actions with CI, tag-driven builds, checksums, and draft
  releases once implementation and release work are authorized.

The provider registry, canonical event boundary, and current three-provider
modules are implemented in the Fedora multi-source slice. Local CI and
tag-driven draft-release workflows now exist with a package/tag version gate,
but they have not been pushed or run; the versioned archive, import/export,
published release, updater, and broader background/platform behavior remain
proposals rather than evidence that those features exist.

## Before making changes

1. Inspect the current tree, relevant `ideas/` decisions, manifests, scripts,
   tests, and generated files.
2. Identify whether the requested behavior is implemented, proposed, or not yet
   decided.
3. Preserve unrelated user changes and avoid inventing paths or commands.
4. Update this guide in the same change when the repository facts or workflow
   it describes change.

## Verification and handoff

- The current executable checks are `pnpm test`, `pnpm typecheck`, `pnpm build`,
  `pnpm release:check-version --stable-only -- v0.1.0`,
  and `pnpm package:linux`. Run `pnpm package:mac:arm64` only on macOS; it generates the ignored
  `assets/icons/TokenStats.icns` from committed PNG sources with
  `scripts/create-macos-icon.sh`. Do not claim any command passed until
  actually run. The packaged AppImage has been started and its multi-source
  scan exercised on the current Fedora/KDE host: Codex usage was imported, the
  current Claude root was discovered but yielded no usage events, and Copilot
  was not found. That is not clean-machine,
  cross-platform, published-release, or CI evidence. Fedora cannot validate
  the ad-hoc-signed, unnotarized macOS artifact; a real Apple Silicon workflow
  run remains required. This internal validation is not public distribution:
  Developer ID signing, notarization, stapling, and a clean-machine Gatekeeper
  gate remain required.
- The current suite covers the provider registry plus Codex, Claude Code,
  Copilot, database, and orchestration behavior: per-event usage, model grouping/fallback,
  parser-version backfill, period grouping, incremental cursors,
  idempotency/snapshot replacement, OTel complete/partial spans and fallback
  reconciliation, malformed records, privacy columns, database backup/reset
  behavior, and main-process reset IPC guards.
- A controlled current-host Copilot CLI OTel smoke session produced a JSONL
  file with a complete chat span; the adapter imported it with input/output
  fields and no capture fields. This is not clean-machine, cross-platform, or
  subscription-billing evidence.
- Keep the distinction clear between a local change, a committed/pushed
  change, a merged change, a released artifact, and verified live behavior.
