# TokenStats

TokenStats is a local-first desktop application for understanding token usage
across AI coding harnesses.

It is intended to discover local usage records, normalize token consumption,
and show trends by harness, model, project, and session—without presenting an
estimated cost as an exact bill.

> **Status:** documentation-first planning. This repository contains product
> and architecture proposals; the application is not implemented yet.

## Proposed direction

The current MVP direction is still proposed and must be validated before
implementation:

- Electron + TypeScript + React/Vite;
- SQLite in the application-data directory, with explicit migrations;
- one adapter per harness, with incremental scanning and fixture coverage;
- first adapter priorities of Codex, Copilot, and Claude Code, with OpenCode
  as a follow-on candidate;
- a privileged Electron main process for filesystem access and ingestion;
- a versioned `.tokenstats` archive plus CSV/JSON export;
- GitHub Actions for CI and platform packaging once implementation begins.

The starting `v0.1.x` line is intended for internal/private development and
review, not public distribution. Stable and Nightly are the required update
channels; public readiness and `v0.2.0` remain explicit maintainer decisions.

## Privacy principles

- Usage data is the primary product fact.
- Cost is always labeled `observed`, `estimated`, or `unknown`.
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
- [Platform, packaging, and release](docs/platform-packaging-and-release.md)
- [Versioning and update channels](docs/versioning-and-update-channels.md)
- [UI, window, tray, and alerts](docs/ui-window-tray-alerts.md)
- [Open questions](ideas/00-open-questions.md)

The application is not implemented until the repository contains the relevant
code and verification evidence. Planned behavior in the documentation must
not be read as implemented, released, or verified behavior.
