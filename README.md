# TokenStats

TokenStats is a local-first desktop application for understanding token usage
across AI coding harnesses.

It is intended to discover local usage records, normalize token consumption,
and show trends by harness, model, project, and session—without presenting an
estimated cost as an exact bill.

> **Status:** early planning. This repository currently contains product and
> architecture notes; a runnable application has not been implemented yet.

## Direction

The current MVP direction is a working proposal:

- Electron + TypeScript + React/Vite;
- SQLite in the application-data directory, with explicit migrations;
- one adapter per harness, with incremental scanning and fixture coverage;
- a privileged Electron main process for filesystem access and ingestion;
- a versioned `.tokenstats` archive plus CSV/JSON export;
- GitHub Actions for CI and platform packaging once implementation begins.

## Principles

- Usage data is the primary product fact.
- Cost is always labeled `observed`, `estimated`, or `unknown`.
- The app is local-first and does not ingest prompt or response content by
  default.
- Imports should be incremental, idempotent, and traceable to their source.

## Project notes

The planning documents in [`ideas/`](ideas/) are the source of truth for the
current product direction. Start with [`ideas/README.md`](ideas/README.md),
then review the relevant topic before making architectural or implementation
decisions.

- [Product and scope](ideas/01-product-and-scope.md)
- [Stack options and working decision](ideas/02-stack-options-and-decision.md)
- [Data model and export/import](ideas/03-data-model-and-export.md)
- [Autodetection and adapters](ideas/04-autodetection-and-adapters.md)
- [Roadmap, risks, and acceptance criteria](ideas/05-roadmap-and-risks.md)
- [UI direction](ideas/06-ui-direction.md)
- [GitHub repository and automated release](ideas/07-github-and-release.md)
- [Alerts and background monitoring](ideas/08-alerts-and-background-monitoring.md)
- [Versioning and update channels](ideas/09-versioning-and-update-channels.md)
- [Window shell and tray behavior](ideas/10-window-shell-and-tray.md)
