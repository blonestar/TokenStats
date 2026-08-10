# TokenStats — brainstorming

Status: ideation only. The repository is initialized locally, but there is no implementation, release workflow, or external-service connection yet.

## Working definition

TokenStats is a local-first desktop application that discovers local AI coding harnesses, reads their usage records, normalizes token consumption, and displays trends by harness, model, project, and session.

The primary goal is not to analyze prompt content. It is to answer:

- How many tokens were actually recorded?
- Which harness or model consumed them?
- What portion was input, output, cached, or reasoning usage?
- Which cost is known, and which is only an estimate based on public API pricing?
- When was each source last processed successfully, and how complete is the data?

## Initial architecture hypothesis

- Desktop: Electron + TypeScript + React/Vite.
- Privileged layer: Electron main process; the renderer has no direct filesystem access.
- Database: SQLite in the application-data directory; SQL migrations and idempotent imports.
- Ingestion: one adapter per harness, with incremental cursors and fixture tests.
- Portability: versioned `.tokenstats` archive plus CSV/JSON export.
- Repository/release: GitHub, GitHub Actions, tag-driven builds, draft releases, checksums, and later signing/notarization.

This is the working MVP decision, not an irreversible commitment before a short packaging spike.

## Documents

- [01 — product and scope](./01-product-and-scope.md)
- [02 — stack options and decision](./02-stack-options-and-decision.md)
- [03 — database, data model, and export/import](./03-data-model-and-export.md)
- [04 — autodetection and adapters](./04-autodetection-and-adapters.md)
- [05 — roadmap, risks, and acceptance criteria](./05-roadmap-and-risks.md)
- [06 — UI direction after the screenshot example](./06-ui-direction.md)
- [07 — GitHub repository and automated release](./07-github-and-release.md)
- [08 — alerts and background monitoring](./08-alerts-and-background-monitoring.md)
- [09 — versioning and update channels](./09-versioning-and-update-channels.md)
- [10 — custom window shell and tray behavior](./10-window-shell-and-tray.md)

## Most important principle

Usage data is the primary product data. Cost is a derived value with an explicit `observed`, `estimated`, or `unknown` label; it must never look like an exact bill when it is only calculated from API pricing.
