# 05 — Roadmap, risks, and acceptance criteria

## Phase 0 — prove the formats

- collect redacted fixtures for the first 2–4 harnesses;
- confirm which usage fields actually exist and what “token cost” means for each harness;
- run the Electron vs Tauri packaging spike;
- define the canonical event and event fingerprint.

## Phase 1 — vertical slice

- packaged desktop shell;
- one adapter;
- SQLite schema and migrations;
- first scan, deduplication, and token dashboard;
- export/import round trip.

## Phase 2 — useful daily application

- remaining priority adapters;
- watcher plus periodic reconciliation;
- source health and diagnostics;
- daily/model/harness breakdown;
- observed vs estimated cost and pricing snapshots.
- daily/weekly/monthly alert rules;
- native notifications, tray mode, 60-second refresh, and `Refresh now`;
- `Start automatically` and `Start minimized` settings.

## Phase 3 — distribution

- Linux AppImage, RPM, and DEB;
- macOS arm64/x64 DMG;
- release notes, checksums, SBOM/provenance;
- automated update checks, channel feeds, background downloads, and restart-to-install;
- signing/notarization once the release channel is stable;
- Windows installer after the shared adapter/path layer is validated.

## Phase 4 — hardening

- migration tests across multiple versions;
- large-log performance tests;
- corrupted-input recovery;
- clean-machine install/upgrade tests;
- accessibility, keyboard navigation, and high-DPI testing;
- privacy review and redaction audit.

## MVP acceptance criteria

- the user does not need to enter a path manually for at least two adapters;
- every imported event has provenance and a deduplication identity;
- refresh never duplicates history;
- the dashboard clearly separates observed tokens from estimated cost;
- alert thresholds fire once per period/threshold and show the last scan time;
- the application can run in the background without opening the main window;
- updates can be checked, downloaded, and installed after an explicit restart;
- stable, beta/preview, nightly, and manual update modes are clearly separated;
- a `.tokenstats` export from one machine imports on another without losing events;
- the application works offline;
- packaged artifacts start on the targeted Fedora, Ubuntu, and macOS versions;
- CI tests parsers, schema migrations, and export/import on every pull request.

## Largest risks

1. Harness formats change or do not preserve usage in a stable way.
2. “Raw token cost” is mistaken for an actual bill under a subscription plan.
3. The native SQLite binding fails only in the packaged build.
4. Linux filesystem permissions or sandboxing block access to logs.
5. The application stores more private content than the user expects.
6. Automated release produces an artifact that is not reproducible or signed.
7. A universal macOS build complicates native dependencies.

## Decisions to confirm before implementation

- whether Electron overhead is acceptable for a desktop monitor;
- which two harnesses come first based on real fixture availability;
- whether AppImage or a distro package is the Linux default;
- whether exports include full paths or only redacted source labels;
- whether the application starts automatically in the tray;
- whether v1 includes a pricing table or token counts only.
- whether v1 alerts are global only or can be scoped per harness/project;
- whether weekly periods start on Monday or follow the operating system locale;
- whether estimated-cost alerts are enabled in v1 or token alerts come first.
- whether nightly builds use a separate application-data profile from stable builds;
- whether RPM/DEB auto-update is enabled or only AppImage auto-update is supported on Linux.
