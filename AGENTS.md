# TokenStats — agent guidance

## Current repository state

- The workspace is currently planning-only, but it is now initialized as a Git
  repository on the `main` branch.
- The baseline project material is `README.md`, `.gitignore`, `AGENTS.md`, and
  the planning documents in `ideas/`.
- There is no application implementation, package manifest, build script, test
  suite, CI workflow, or release workflow yet. Do not infer any of these from
  the architecture proposals or from the existence of a GitHub remote.
- Treat `ideas/README.md` and the numbered documents in `ideas/` as product and
  architecture proposals, not as evidence that those features already exist.
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

The current MVP direction, subject to the spikes and decisions described in
`ideas/`, is:

- Electron + TypeScript + React/Vite;
- filesystem discovery, adapters, parsers, SQLite, import/export, IPC, and
  tray/background behavior in the privileged Electron main process;
- a renderer without direct filesystem access;
- SQLite with explicit SQL migrations and idempotent imports;
- one adapter per harness, with anonymized fixtures and incremental cursors;
- a versioned `.tokenstats` archive plus CSV/JSON exports;
- GitHub/GitHub Actions with CI, tag-driven builds, checksums, and draft
  releases once the repository is initialized.

These are proposals, not implementation constraints, until the repository
contains the corresponding code and verified tooling.

## Before making changes

1. Inspect the current tree, relevant `ideas/` decisions, manifests, scripts,
   tests, and generated files.
2. Identify whether the requested behavior is implemented, proposed, or not yet
   decided.
3. Preserve unrelated user changes and avoid inventing paths or commands.
4. Update this guide in the same change when the repository facts or workflow
   it describes change.

## Verification and handoff

- There are currently no executable project checks. Do not claim that builds,
  tests, linting, packaging, or releases passed until those checks exist and
  have actually been run.
- When implementation begins, add the real install, development, test, lint,
  build, packaging, and release commands here as soon as they become stable.
- Keep the distinction clear between a local change, a committed/pushed
  change, a merged change, a released artifact, and verified live behavior.
