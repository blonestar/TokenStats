# TokenStats — agent guidance

## Current repository state

- The repository uses `main` as its default branch; feature work is performed
  on dedicated branches.
- The implemented Fedora/Electron slice uses `src/main/`, `src/preload/`,
  `src/renderer/`, `src/shared/`, and `tests/`; official documentation remains
  in `docs/`, while `ideas/` remains exploratory.
- `docs/` is the canonical project documentation folder. `ideas/` is reserved
  for brainstorming, unresolved questions, and exploratory proposals.
- `package.json` provides `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm build`,
  `pnpm release:check-version` (with `--stable-only` for Stable tags),
  `pnpm package:unpacked`, `pnpm package:linux` (portable AppImage),
  `pnpm package:linux:release` (AppImage plus GitHub updater metadata),
  `pnpm package:linux:rpm` (Fedora installable RPM),
  `pnpm package:win` (Windows x64 NSIS installer),
  `pnpm package:win:release` (Windows installer plus GitHub release metadata),
  and the macOS-only
  `pnpm package:mac:arm64` ad-hoc-signed, unnotarized ZIP validation command. The manual
  `.github/workflows/macos-arm64-validation.yml` workflow targets `macos-15`
  arm64 runner validates the host, binaries/native module, ad-hoc signature, and
  isolated launch before uploading an internal ZIP plus SHA-256 manifest; run
  `31606807111` passed on GitHub. Local `.github/workflows/ci.yml` and
  `.github/workflows/release.yml` workflows now define Linux verification and
  tag-driven draft-release preparation, including Windows x64 package and
  installer smoke jobs; Windows CI run `34980761042` passed the Windows test,
  packaging, and isolated launch smoke path. GitHub CI and the tag-driven `v0.1.0`
  release run have passed; `v0.1.0` is published with the Linux AppImage,
  macOS arm64 ZIP, and combined SHA-256 manifest. `electron-updater` now
  implements explicit check, download, and install/restart behavior for
  packaged Linux AppImages; the published `v0.1.4` release includes the tray
  tooltip implementation, updater metadata, and checksum manifest, and was
  created through the release publish path. Future published releases must use
  the same path. `v0.1.4` uses a stable local AppImage filename and synchronizes
  existing user desktop launchers when the updater changes the AppImage path;
  RPM launcher integration remains package-manager-owned.
  RPM, Windows clean-machine/support, macOS ZIP, clean-machine validation, and broader
  distribution readiness remain unverified; publication does not establish those
  claims.
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
- The BrowserWindow and packaged application use the committed
  `assets/icons/64x64.png` T-and-graph icon for the runtime window/tray identity;
  Windows packaging also uses the generated `assets/icons/TokenStats.ico`;
  the runtime asset is included in the packaged app. Closing the main window
  hides it to the tray; the tray hover tooltip shows the app name and, once
  usage is imported, the observed token totals for today and the current
  month with an estimated API-equivalent cost, refreshed when a scan or reset
  completes. The tray menu exposes Show/Hide window and an explicit Exit
  action that fully quits the app. The Fedora RPM target supplies the
  standard desktop launcher and Utilities menu registration; automatic login
  startup is not enabled. Every app start runs a source scan, and the renderer
  shows a full-screen blurred progress overlay while startup, manual,
  automatic, or reset work is active. Settings persist automatic local-data
  refresh (enabled by default at 1 minute; supported intervals are 1, 5, 10,
  15, 30, and 60 minutes), expose `Refresh local sources`, and retain the
  guarded local-database reset/re-import action. Manual and scheduled refresh
  share the main-process scan path; hidden windows remain eligible until the
  explicit tray Exit action.
- `pricing/api-pricing.json` and its JSON Schema define the accepted version 1
  provider/model pricing catalog. The latest 2026-09-08 snapshots contain
  reviewed Standard API list prices for Codex-relevant OpenAI models and a
  reviewed GitHub Copilot provider-reference snapshot; older snapshots remain
  immutable for historical provenance. The dashboard calculates and
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
modules are implemented in the Fedora multi-source slice. CI and tag-driven
draft-release workflows now have verified GitHub runs with a package/tag
version gate. `v0.1.0` is published with Linux and macOS arm64 artifacts, and
  `v0.1.4` is published with the Linux AppImage, updater metadata, and checksum
manifest. Close-to-tray, the basic tray menu, and the tray tooltip token and
cost summary are implemented in the packaged Linux slice, and the Fedora RPM
packaging target provides the installable launcher path. The updater is
implemented only for packaged Linux AppImages: automatic checks are enabled by
default, run at startup and every six hours, and can be disabled or changed to
1, 6, 12, or 24 hours from Settings; downloads happen only after the visible
update action and require a second install-and-restart action. The main process
blocks installation while a scan or reset is active. Startup collection and
scheduled background monitoring are implemented in the local slice, with
validated refresh settings and scan-state IPC. The versioned archive,
import/export, detailed tray status, RPM/macOS update paths, and broader
platform behavior remain proposals or unverified; published
preview artifacts do not establish clean-machine or production distribution
readiness.

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
  `pnpm release:check-version --stable-only -- v0.1.5`,
  `pnpm package:linux`, and `pnpm package:linux:rpm`. Run `pnpm package:win`
  and `scripts/validate-windows-package.ps1` on a Windows runner; the current
  Fedora host cannot execute that validation. Windows CI run `34980761042`
  passed these Windows checks. Run `pnpm package:mac:arm64` only on macOS; it generates the ignored
  `assets/icons/TokenStats.icns` from committed PNG sources with
  `scripts/create-macos-icon.sh`. Do not claim any command passed until
  actually run. The published `v0.1.4` AppImage has been checksum-verified and
  started on the current Fedora/KDE host; its KDE StatusNotifier tooltip
  exposed the observed today/month token totals and secondary estimate. Its
  multi-source scan was exercised: Codex usage was imported, the current Claude
  root was discovered but yielded no usage events, and Copilot was not found.
  That is not clean-machine evidence; GitHub PR CI, the successful `v0.1.0`
  release run, `v0.1.4` release run `34857918122`, native Apple Silicon
  workflow run `31606807111`, and the published releases are separately
  verified. The Mac
  artifact is ad-hoc-signed and unnotarized, so this internal validation is not
  production distribution: Developer ID signing, notarization, stapling, and
  a clean-machine Gatekeeper gate remain required.
- The current suite covers the provider registry plus Codex, Claude Code,
  Copilot, database, and orchestration behavior: per-event usage, model grouping/fallback,
  parser-version backfill, period grouping, incremental cursors,
  idempotency/snapshot replacement, OTel complete/partial spans and fallback
  reconciliation, malformed records, privacy columns, database backup/reset
  behavior, and main-process reset IPC guards.
- Refresh-settings persistence/validation, one-minute scheduler behavior,
  startup scan state, main-process refresh IPC, and window/tray lifecycle
  including the tray tooltip token/cost summary refresh are covered by
  focused tests.
- A controlled current-host Copilot CLI OTel smoke session produced a JSONL
  file with a complete chat span; the adapter imported it with input/output
  fields and no capture fields. This is not clean-machine, cross-platform, or
  subscription-billing evidence.
- Keep the distinction clear between a local change, a committed/pushed
  change, a merged change, a released artifact, and verified live behavior.
