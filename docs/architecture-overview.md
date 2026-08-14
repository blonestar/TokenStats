Status: Implemented Fedora slice and Linux AppImage update path; remaining architecture proposed

Audience: contributors, architecture reviewers, security reviewers, and maintainers

Source of truth: this document for the proposed system boundaries; unresolved alternatives are tracked in ../ideas/00-open-questions.md and the numbered idea notes

Last reviewed: 2026-08-13

# TokenStats architecture overview

This document describes the proposed architecture for a local-first Electron
application. The implemented Fedora slice has application code, package
manifest, typed three-operation IPC, SQLite migrations, and current-user Codex,
Claude Code, and experimental GitHub Copilot provider modules. It also has a
provider registry, generic canonical-event/ingestion-store boundary,
model-aware schema/parser support, allowlisted preset/custom date queries, and a
Chart.js Line/Bar/Pie model trend renderer with model-hover isolation; the
broader architecture below remains proposed.

## Architectural goals

The architecture should:

- keep user usage records local and readable without a server;
- make observed usage facts more authoritative than derived cost estimates;
- keep prompt, response, source-code, credential, and complete raw-log content
  out of the database by default;
- isolate filesystem and database access from the renderer;
- make adapters replaceable as harness formats change;
- support incremental, idempotent, auditable imports;
- preserve data through schema changes and portable export/import;
- make platform-specific packaging, tray, notification, and updater behavior
  explicit rather than assuming all desktop environments behave alike.

## Proposed process boundaries

The current proposal is Electron + TypeScript + React/Vite. The boundaries are
responsibilities, not implemented paths; the first vertical slice may use a
smaller repository layout while retaining the same security ownership.

| Area | Responsibility | Must not do |
| --- | --- | --- |
| Electron main process | App lifecycle, filesystem discovery, adapter execution, parsing, SQLite access, migrations, import/export, alert evaluation, tray, background refresh, and update coordination. | Render untrusted UI or expose arbitrary filesystem/shell capabilities to the renderer. |
| Preload | Expose a small, typed, validated `contextBridge` API for approved UI operations. | Pass through arbitrary IPC channels, filesystem paths, shell commands, or unrestricted Electron objects. |
| React/Vite renderer | Dashboard, source diagnostics, settings, alerts, export/import review, update state, and accessible custom window controls. | Read local files, open SQLite, invoke child processes, or decide trust for unvalidated data. |
| Shared contracts | Canonical event types, validation schemas, view models, error codes, and IPC request/response types. | Contain platform I/O or bypass validation. |
| Adapters and parsers | Discover known source candidates, probe formats, parse read-only records, and produce canonical usage events. | Write directly to SQLite, emit prompt/response content, or silently discard unrecognized records. |
| Ingestion service | Own transactions, deduplication, cursor updates, provenance, audit records, rollups, and post-commit alert evaluation. | Trust an adapter to define transaction boundaries or overwrite existing facts silently. |
| Update service | Check the selected feed, compare channels and versions, download after user action, verify, back up when needed, and coordinate restart. | Auto-downgrade the database or restart during an active import/export transaction. |

Electron's security guidance should be treated as a baseline for the eventual
implementation: keep the renderer isolated, use local packaged UI, validate
IPC, and avoid granting Node or shell access to the renderer. See the official
[Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security),
[BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window),
and [Electron context isolation guidance](https://www.electronjs.org/docs/latest/tutorial/context-isolation).

The current provider boundary is implemented in `src/main/providers/` and
`src/main/ingestion/`. A `ProviderModule` exposes an identity, source
definition, discovery function, and optional provider-owned migration hooks.
Discovery returns `ProviderSource` values whose scanners consume the generic
`IngestionStore` and emit canonical `UsageEvent` values. The registry is the
explicit extension point for the current Codex, Claude Code, and GitHub
Copilot modules; it is not a dynamic external plug-in loader.

## React/Vite frontend

React/Vite is the implemented renderer stack for the Fedora slice because the product needs a dense,
desktop-first dashboard with charts, tables, filtering, source diagnostics,
settings, and custom window controls. The renderer should receive view models
and command results through preload rather than reconstructing database queries.

The current dashboard implements `Today`, `Yesterday`, `This week`, `Last week`,
`This month`, `Last month`, `Last 6 months`, and validated custom inclusive
calendar-date queries. It uses hourly buckets for single-day ranges, daily
buckets for shorter ranges, and monthly buckets for longer ranges, with
source-and-model-separated totals and Chart.js Line/Bar/Pie views. Hovering or
focusing a model breakdown row isolates its color in the active chart and mutes
the other series/segments. The current slice also includes a basic Settings
view for a confirmed, backup-first local database reset and re-import; the
other navigation and settings surfaces listed below remain proposed.

The initial UI information model is proposed as:

- Overview — observed-token trends, category totals, active days, sessions,
  source health, and data-quality caveats;
- Sources — discovery state, selected paths, permissions, parser versions,
  last scan, warnings, and manual source selection;
- Sessions — drilldown when a source exposes stable session identity;
- Models — token mix and breakdown by harness/provider/model;
- Alerts — personal budgets, thresholds, current period, notification history, and
  quiet hours;
- Settings — privacy, refresh, export/import, startup, window/tray, pricing,
  and updates.

Charts must distinguish missing data from zero usage. The renderer should show
full values, currency, timezone, pricing snapshot, confidence, and source age
in details or tooltips rather than relying on compact display values alone.

## SQLite responsibilities

SQLite is the proposed local database. The main process owns the connection,
explicit SQL migrations, transaction boundaries, backups, and query access.
The renderer receives read models, never the database file.

The database should contain at least these logical areas:

- `sources` — adapter, display label, canonical location or location hash,
  status, parser version, last scan, and cursor metadata;
- `sessions` — normalized session identity, harness, project label, start/end,
  and provenance when available;
- `usage_events` — append-oriented canonical usage facts and deduplication
  identity;
- `pricing_snapshots` — versioned rates with effective date, source, and
  checksum;
- `alert_rules` and `alert_deliveries` — personal-budget configuration and idempotent
  notification records;
- `imports`, `schema_migrations`, and audit records — operation history;
- `daily_rollups` or equivalent derived caches — rebuildable aggregates, never
  the only copy of usage facts.

Migrations must be forward-only in normal operation, backed up before risky
changes, and tested from the oldest supported schema. A migration failure must
leave the prior database recoverable. Automatic schema downgrade is forbidden
in the current proposal.

## Canonical usage events

Adapters should emit a canonical event rather than writing storage-specific
records. The proposed event contains:

| Field group | Proposed content |
| --- | --- |
| Identity | Stable `event_id` when available, otherwise a deterministic fingerprint over normalized source identity and event fields. |
| Relationships | `source_id`, optional `session_id`, harness, provider, model, and optional model version. |
| Time | Observed event timestamp in UTC, plus enough source context to diagnose timezone conversion. |
| Usage | Input, output, cached input, cache write, reasoning, and total token counts when present; absent values remain absent/unknown rather than guessed. |
| Cost | Amount and currency only when observed or calculated; `cost_kind` is `observed`, `estimated`, or `unknown`. |
| Confidence | `exact`, `partial`, `inferred`, or `unknown`, separate from cost kind. |
| Provenance | Adapter/parser version, file identity, bounded offset or line, source hash, and limited non-content metadata. |

An event is a fact from a source, not a billing assertion. If the source does
not expose a cost, the event may still be complete for token usage. If a model
name or token category is absent, the ingestion layer preserves the unknown
state rather than inventing a value.

## Adapter and ingestion model

Each adapter conceptually has four responsibilities:

1. `discover` — identify candidates from known locations and environment
   signals;
2. `probe` — classify whether a candidate is parseable, unsupported,
   permission-denied, stale, or otherwise unavailable;
3. `ingest` — read from a cursor and yield canonical events without writing to
   SQLite;
4. `diagnose` — report parser version, warnings, coverage, and actionable
   source errors.

The central ingestion flow is proposed as:

1. the scheduler or user requests a scan;
2. discovery and source selection resolve the allowed candidates;
3. the adapter reads only the selected source using its cursor;
4. partial final JSONL records are held for a later retry;
5. the ingestion service normalizes events and computes fingerprints;
6. one transaction inserts new facts, records duplicates/conflicts, updates
   cursors, and writes audit/provenance information;
7. derived rollups and alert evaluation run from the committed result;
8. dashboard and tray view models receive the same scan result;
9. failures preserve the previous good aggregate and mark freshness/coverage.

The flow must be idempotent across repeated scans, file rotation, renames,
application restarts, and sleep/resume reconciliation. A parser version change
may trigger a controlled reparse without silently deleting prior facts.

In the implemented slice, the provider scanners call only the generic
ingestion-store contract. `TokenDatabase` owns SQL transactions, deduplication,
cursors, inclusion/reconciliation state, scan history, and dashboard reads.
Provider migrations are supplied by the registry with stable IDs and explicit
versions, tracked in a non-content ledger, so a provider migration can be
added after the global schema chain has already reached version 6. The current
example is the Claude opaque-file-ID migration. Adding a provider is currently a code change:
implement its module, register it, add anonymized fixtures and
contract/integration tests, and add a reviewed pricing snapshot/source mapping
if cost estimates are supported.

The implemented Copilot adapter reads current-user `session-state/events.jsonl`
records and, when the user has enabled the CLI file exporter, a separate OTel
JSONL file. It accepts only complete `chat` spans with bounded model, session,
turn, timestamp, and token metadata. The ingestion layer keeps the OTel cursor
and non-content file metadata separate, switches away from matching session-state
fallback events only after aggregate token equality, retains both provenance
rows with an inclusion flag, and retries an incomplete final JSONL line on the
next scan. Missing, rotated, or truncated OTel files reset tracking without
deleting retained history.

## Autodetection and manual sources

Discovery must be fast, predictable, and explainable. The proposed order is:

1. known OS app-data and configuration directories;
2. known environment variables;
3. executable or configuration presence on `PATH`;
4. a small file/directory probe.

An advanced user-selected folder or file may be added later for a known
adapter, but it is not required or promised in v0.1.

TokenStats must not scan the entire home directory or other OS users' profiles
by default. Discovery and application data are isolated to the current OS user.
The UI should
show distinct states for `found and parseable`, `found but unsupported format`,
`found but permission denied`, `not found`, `disabled by user`, and
`stale/no new data`. Manual source selection is a later/advanced recovery
option, not a v0.1 requirement; each candidate still requires adapter
validation and diagnostics.

The implemented Fedora slice scans current-user Codex `~/.codex/sessions`,
Claude Code `${CLAUDE_CONFIG_DIR:-~/.claude}/projects`, and experimental GitHub
Copilot `${COPILOT_HOME:-~/.copilot}/session-state`. Claude accepts only
assistant-message usage and persists opaque file IDs rather than content or
project/file paths. Copilot imports active CLI `assistant.message` output-token
snapshots, then uses the latest persisted `session.shutdown` cumulative
snapshot for each session/model and replaces the previous snapshot. Active
snapshots leave input/cache fields unknown until shutdown; missing roots are
normal. Fixtures cover the adapter formats; platform support and macOS
validation still require their own runtime evidence. OpenCode remains a later
candidate.

## IPC boundary

The preload API should expose intent-level commands and read models, for
example:

- list source health and request a diagnostic;
- start, cancel, pause, or refresh a scan;
- query dashboard aggregates and session details;
- preview and confirm an export or import;
- read and update validated portable settings;
- manage alert rules and open notification details;
- check, download, verify, and install an update after explicit user action;
- show, hide, minimize, maximize, restore, and exit the application.

The exact channel names are not decided. Each request must validate its input,
apply authorization based on the local app state, and return structured errors
that cannot leak raw log content. IPC tests should prove that arbitrary paths,
commands, and channels are rejected.

## Tray and background process

The main process owns the tray and the refresh scheduler. A hidden window does
not mean the app is stopped. The tray is a compact status surface with observed
daily usage, personal-budget state, last scan time, refresh, settings, pause, update, and
explicit exit actions.

Electron documents that Linux tray activation can differ by desktop
environment, so left-click behavior must have a context-menu fallback and
cannot be treated as identical across Fedora and Ubuntu desktops. See the
[Electron Tray API](https://www.electronjs.org/docs/latest/api/tray).

The scheduler should coalesce manual and periodic refreshes, avoid concurrent
imports, and reconcile after startup, wake, and file rotation. A watcher may be
added later as an acceleration layer; the 60-second scan remains the correctness
fallback in the proposed MVP.

## Update service

The update service is a main-process concern. The current implementation covers
the packaged Linux AppImage Stable path and should:

- read the selected channel feed at startup when enabled and at the configured
  1, 6, 12, or 24-hour interval when automatic checks are enabled;
- compare versions with prerelease-aware rules;
- expose a visible update action rather than silently downloading or restarting;
- download only after user action and report progress;
- verify checksum/signature before installation;
- wait for imports/exports and safely finish or pause scans;
- create a recoverable database backup before a migration;
- restart only after explicit install confirmation;
- migrate before ingestion on next launch;
- retain a usable previous installation and data path if an update fails.

The implemented `electron-updater` controller uses typed preload IPC and keeps
automatic download/install disabled. Its Settings state is persisted under
Electron `userData`; it shows enabled/startup/interval controls and current
last/next check times. It shows the state in the header, Settings, and tray,
and requires one click to download followed by a second click to install and
restart. Electron's built-in
[autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/) is
documented for macOS and Windows; the current Linux implementation uses the
electron-builder AppImage feed. RPM package-manager updates, macOS ZIP updates,
signature/provenance validation, and clean-machine recovery remain proposals or
unverified platform work.

## Pricing input boundary

The accepted version 1 catalog and schema live in `../pricing/`. The
2026-08-11 snapshots contain reviewed OpenAI/Codex Standard API list prices and
GitHub Copilot provider reference rates, bundled into the privileged main
process. The current dashboard calculates query-time Codex and complete
Copilot estimates from them and returns immutable snapshot metadata and
coverage; no cost is stored in the usage-event table. Historical persisted
estimates and an explicit non-AI catalog refresh remain follow-on work. Runtime
AI search is outside the architecture because pricing must be deterministic,
reviewable, and usable offline. A future explicit
non-AI refresh can add a new snapshot; it must never rewrite the snapshot used
by historical estimates silently.

## Platform-specific behavior

The initial platform proposal is:

- Fedora x64: first implementation and packaging target; exact supported
  versions remain open;
- macOS arm64: early follow-on support spike; public signing/notarization is a
  later distribution gate, not a prerequisite for the Fedora slice or private
  spike;
- macOS x64 and Ubuntu x64: later unless validation evidence changes priority;
- Windows: shared path/adapter abstractions from the start, with installer
  support later unless the platform decision changes.

Platform-specific concerns include filesystem permissions, symlinks, Unicode
and spaces in paths, login startup, tray activation, native notifications,
frameless windows, transparency, display bounds, high-DPI scaling, signing,
notarization, and native SQLite module compatibility with packaged Electron.

## Known risks

- Harness formats may change or omit stable token data.
- A provider or subscription usage record may not have a defensible API cost.
- A native SQLite binding may work in development and fail in a packaged build.
- Permission and sandbox behavior may differ by OS and desktop environment.
- Project labels, paths, hashes, or provenance can still expose sensitive
  context even when content is excluded.
- A parser reparse or migration can duplicate or lose history if identities and
  backup rules are weak.
- Linux update and notification behavior is not uniform across distributions.
- Frameless/translucent windows can create accessibility and compositor issues.
- A release artifact can be reproducible-looking without trustworthy signing or
  provenance.

## Validation spikes before implementation claims

The following spikes are required before the relevant behavior is treated as
accepted or implemented:

1. Start a minimal Electron package on Fedora x64, then on macOS arm64 for the
   early follow-on spike.
2. Prove the selected native SQLite binding works from the packaged app.
3. Install or start AppImage/RPM/DEB/DMG artifacts on clean test machines.
4. Probe source paths containing spaces, Unicode, symlinks, permissions, and
   rotation without changing source files.
5. Demonstrate that the renderer cannot invoke arbitrary filesystem paths or
   shell commands.
6. Run a seeded database through the supported migration chain without losing
   usage events.
7. Run the Codex, Claude Code, and Copilot anonymized fixture packs against
   incomplete lines, duplicates, model changes, missing cache fields, and
   malformed records; expand runtime evidence before claiming another platform.
8. Test tray, notification, login startup, close-to-tray, custom controls, and
   opaque visual fallback separately on each supported desktop target.
9. Test update verification, migration backup, interrupted install, restart,
   and rollback behavior with a packaged artifact.

## Reference links

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron Tray](https://www.electronjs.org/docs/latest/api/tray)
- [Electron Notification](https://www.electronjs.org/docs/latest/api/notification)
- [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/)
- [electron-builder AppImage updates](https://www.electron.build/appimage/)
- [electron-updater documentation](https://www.electron.build/electron-updater.html)
