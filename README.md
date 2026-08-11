# TokenStats

TokenStats is a local-first desktop application for understanding token usage
across AI coding harnesses.

It is intended to discover local usage records, normalize token consumption,
and show trends by harness, model, project, and session—without presenting an
estimated cost as an exact bill.

> **Status:** an internal Fedora desktop slice is implemented. Its packaged
> AppImage and multi-source scan have been exercised on the current Fedora/KDE
> host. Codex usage was imported; the current Claude Code root was discovered
> but yielded no usage events. Copilot CLI usage is parsed from complete OTel
> `chat` spans when its opt-in file exporter is enabled, with active
> `assistant.message` and `session.shutdown` records retained as a fallback.
> Clean-machine, CI, release, and cross-platform validation remain open.

## Current slice and proposed direction

The implemented Electron package has a React dashboard and SQLite database.
Its privileged main process scans the current OS user's Codex
`~/.codex/sessions`, Claude Code `${CLAUDE_CONFIG_DIR:-~/.claude}/projects`,
and GitHub Copilot `${COPILOT_HOME:-~/.copilot}/session-state` records, plus the
optional `${COPILOT_OTEL_FILE_EXPORTER_PATH:-<copilot-home>/otel/tokenstats.jsonl}`
OTel file. The
dashboard separates every statistic by source and model, uses Chart.js for
Line/Bar trends, and provides `Today`, `Yesterday`, `This week`, `Last week`,
`This month`, `Last month`, and `Last 6 months` views. The six-month view uses
monthly chart buckets.
Current-source rescans are idempotent and retained history is cumulative until
an explicit future deletion feature is introduced.

Codex imports per-event `last_token_usage` with the active model context.
Claude Code imports assistant-message usage only and stores neither content nor
project/file paths; it uses opaque file IDs. Copilot imports only complete OTel
`chat` metadata when available and switches away from matching session-state
fallback events only after aggregate token equality; without OTel, active CLI
output-token snapshots are replaced by the latest persisted `session.shutdown`
cumulative snapshot for each session/model.
A missing source root or OTel file is a normal fallback state. The app does not
persist prompt, response, source-code, command, or raw-record content. Alerts, tray
behavior, updater, exports, and telemetry are not implemented. For Codex
events and complete Copilot snapshots, the dashboard shows an estimated
API-equivalent USD cost with pricing-snapshot date and coverage; incomplete
provider records remain unknown.

The local runtime validation imported cumulative history from the current user's Codex
profile, repeated the incremental scan, rendered derived statistics, and passed
SQLite integrity and storage-schema privacy checks without copying raw records
into the repository. The v2 parser backfilled existing events with model
metadata without changing stable event IDs or duplicating usage rows. OTel
fixture coverage verifies complete/partial JSONL spans, metadata allowlisting,
and fallback reconciliation; a controlled live Copilot OTel smoke run also
passed on the current Fedora host. This is not cross-platform or clean-machine
evidence.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm package:linux
# macOS only: creates an ad-hoc-signed, unnotarized arm64 ZIP for internal validation
pnpm package:mac:arm64
```

## Proposed direction

The current MVP direction is still proposed and must be validated before
implementation:

- Electron + TypeScript + React/Vite;
- SQLite in the application-data directory, with explicit migrations;
- one adapter per harness, with incremental scanning and fixture coverage;
- Fedora x64 with the current-user Codex, Claude Code, and experimental
  GitHub Copilot adapters; OpenCode remains a later candidate;
- a privileged Electron main process for filesystem access and ingestion;
- a versioned `.tokenstats` archive plus CSV/JSON export;
- GitHub Actions for CI and platform packaging once implementation begins.

The starting `v0.1.x` line is intended for internal/private development and
review, not public distribution. Stable and Nightly are the required update
channels; public readiness and `v0.2.0` remain explicit maintainer decisions.

An ad-hoc-signed, unnotarized macOS arm64 ZIP validation workflow exists
locally, but has not been pushed or run. On a native `macos-15` runner it will
check the arm64 host and packaged native modules, verify the ad-hoc signature,
and launch the isolated packaged app until its renderer appears. Fedora cannot
validate that artifact. It is internal-only, not public macOS distribution;
Developer ID signing, notarization, stapling, and a clean-machine Gatekeeper
gate remain required.

## Privacy principles

- Usage data is the primary product fact.
- Cost is always labeled `observed`, `estimated`, or `unknown`.
- Codex and complete Copilot API-equivalent costs are derived from the reviewed
  pricing catalog and labeled with snapshot date and coverage; incomplete
  provider records remain `unknown`.
- The app is local-first and does not ingest prompt or response content by
  default.
- Imports should be incremental, idempotent, and traceable to their source.
- Source code, API keys, credentials, and complete raw logs must stay out of
  the database by default.

## Documentation

The official project documentation is in [`docs/`](docs/README.md). It records
the proposed product requirements, architecture, data/privacy rules,
platform/release plan, versioning, and UI behavior.

[`ideas/`](ideas/README.md) remains the workspace for brainstorming,
exploration, unresolved questions, and early proposals. It is not evidence
that a feature exists.

- [Documentation index](docs/README.md)
- [Product requirements](docs/product-requirements.md)
- [Architecture overview](docs/architecture-overview.md)
- [Data, privacy, and portability](docs/data-privacy-and-portability.md)
- [GitHub Copilot OTel ingestion](docs/copilot-otel.md)
- [Platform, packaging, and release](docs/platform-packaging-and-release.md)
- [Versioning and update channels](docs/versioning-and-update-channels.md)
- [UI, window, tray, and alerts](docs/ui-window-tray-alerts.md)
- [Open questions](ideas/00-open-questions.md)

Only the current Fedora multi-source slice above is implemented. Planned behavior elsewhere
in the documentation must not be read as implemented, released, or verified.
