Status: Implemented Fedora slice; remaining requirements proposed

Audience: product owners, contributors, UX reviewers, and users evaluating the MVP

Source of truth: this document for official product requirements; unresolved choices are tracked in ../ideas/00-open-questions.md

Last reviewed: 2026-08-11

# TokenStats product requirements

## Product purpose

TokenStats is proposed as a local-first desktop monitor for understanding token
usage across AI coding harnesses. It should discover local usage records, read
them without changing the source files, normalize the records into one
verifiable model, and show trends by harness, model, project, and session.

The primary product fact is what local sources actually recorded. Cost is
derived data and must always be labeled as `observed`, `estimated`, or
`unknown`. An API-pricing estimate must never look like an exact provider bill,
especially when the source represents subscription usage without a reliable
API equivalent.

The product is intended to answer:

- How many tokens were recorded, and what categories are available?
- Which harness, provider, model, project, or session produced them?
- When was each source last processed successfully?
- Which periods or sources have incomplete, stale, or uncertain data?
- What can be exported and moved to another machine without losing history?

A narrow Fedora slice with current-user Codex, Claude Code, and experimental
GitHub Copilot adapters is implemented. The packaged Fedora AppImage and
multi-source scan have local runtime evidence: Codex usage was imported, the
current Claude root was found but yielded no usage events, and the current
Copilot CLI session-state root yielded active output-token records. Complete
Copilot shutdown reconciliation and pricing are implemented locally; clean
packaged-artifact and cross-platform runtime evidence remains open. Requirements
outside that evidenced slice remain planned until repository and runtime
evidence supports a different status.

The implemented dashboard currently answers token totals by source and model for
`Today`, `Yesterday`, `This week`, `Last week`, `This month`, `Last month`, and
`Last 6 months`, with hourly, daily, or monthly Line/Bar trends, exact model
totals, session/event/day counts, category totals, source scan health, and
estimated API-equivalent USD cost for Codex and complete Copilot snapshots with
snapshot/date and coverage. It does not yet implement project drilldown,
budgets, tray behavior, export/import, or updates.

## Target users

The target audience is broad: practically any user of Codex app/CLI, Claude
Code, OpenCode, Copilot, or a similar local AI coding harness. The first usable
build is still expected to serve an individual developer who wants a private,
low-maintenance usage view without manually reading multiple log formats. The
audience decision is recorded in [Q-001](../ideas/00-open-questions.md).

Secondary users may include privacy-conscious power users who want local
exports, source diagnostics, and reproducible estimates. Teams, administrators,
and cloud analytics users are not the primary v0.1 audience.

## Primary use cases

| Use case | User outcome | Proposed v0.1 behavior |
| --- | --- | --- |
| Discover sources | Understand what TokenStats can read on this machine. | Show discovered, unsupported, permission-denied, stale, disabled, and not-found states with explanations. |
| Confirm and scan | Start a safe first import without surrendering prompt content. | Let the user confirm enabled sources, scan read-only records, and show progress and per-source results. |
| Understand usage | See observed tokens over time and by source. | Provide daily trends, token-category totals, active days, sessions, events, and harness/model/project breakdowns. |
| Check data quality | Know whether the dashboard is complete enough to trust. | Show last successful scan, new events, parser warnings, source health, gaps, and unknown fields. |
| Monitor a personal budget | Receive a useful warning before observed usage becomes surprising. | Evaluate user-defined personal-usage budget rules after committed imports and notify once per threshold and period. |
| Work in the background | Keep monitoring active without keeping the dashboard open. | Close to the tray when enabled, refresh every 60 seconds by default, and provide `Refresh now` and an explicit `Exit TokenStats`. |
| Move history | Continue with the same usage history on another machine. | Export and import a versioned `.tokenstats` archive, with preview, deduplication, conflict handling, and checksums. |
| Update safely | Know what will change and retain control of installation. | Check selected channels, show a visible update action, download only after user action, verify, back up when needed, and restart explicitly. |

## MVP scope: proposed v0.1.0

The following is the working scope pending the decisions in the open-question
matrix:

- a packaged Electron desktop shell using TypeScript and React/Vite;
- a privileged main process for discovery, parsing, SQLite, import/export,
  tray/background behavior, and update coordination;
- a renderer with no direct filesystem or shell access;
- implemented Fedora slice: current-user Codex, Claude Code, and experimental
  GitHub Copilot adapters; Intel macOS remains later unless evidence changes
  that priority;
- an internal-only macOS arm64 package-validation path using an ad-hoc-signed,
  unnotarized ZIP; public distribution requires later Developer ID signing,
  notarization, stapling, and clean-machine Gatekeeper evidence;
- OpenCode and other harness adapters as later work when their local formats
  prove supportable;
- incremental, cancellable, idempotent scanning with a visible cursor and
  provenance model;
- an overview dashboard with observed tokens as the primary KPI;
- input, output, cached-input, cache-write, reasoning, and total token fields
  whenever the source distinguishes them;
- Codex and complete Copilot estimated API-equivalent costs from reviewed
  pricing snapshots, with visible coverage/date and an `estimated` label;
  incomplete provider records remain `unknown`;
- a Sources/diagnostics surface for path status, parser version, scan age,
  permissions, warnings, and data gaps; manual source selection is not a
  v0.1 requirement;
- a local SQLite database with explicit migrations and recoverable backup rules;
- `.tokenstats`, CSV, and JSON export/import paths as described in the data
  and portability document;
- personal daily, weekly, and monthly token-budget alerts with configurable
  80%, 100%, and 120% thresholds, subject to the alert-scope questions;
- native desktop notifications, tray status, close-to-tray behavior, and a
  60-second reconciliation refresh;
- a visible update action and Stable/Nightly channels, subject to packaging and
  signing validation;
- offline operation for local data import and dashboard use.

The MVP does not promise that every harness, path, model, platform, cost, or
notification is available on every machine. Unsupported or incomplete data
must remain visible instead of being silently converted into a precise-looking
number.

The first scan imports safely available supported history. Canonical usage facts
are retained cumulatively; current source rescans are idempotent, and no
deletion UI exists yet. Disabling or forgetting a source must not silently
delete retained history. Copilot is the exception to append-style ingestion:
active CLI `assistant.message` output-token totals are provisional, and the
latest persisted `session.shutdown` cumulative snapshot replaces the prior
snapshot for the same session/model instead of being summed.

## Non-goals

The following are outside the proposed v0.1 scope unless an open question is
explicitly resolved and the requirements are expanded:

- cloud accounts, cloud sync, or multi-device synchronization;
- team dashboards, shared budgets, or centralized administration;
- provider billing APIs or automatic reconciliation with invoices;
- subscription-plan cost calculation without a defensible API equivalent;
- prompt-content, response-quality, source-code, or productivity analysis;
- storing complete raw sessions or raw logs in the application database;
- an external adapter/plugin marketplace;
- provider-quota enforcement or stopping a harness when a threshold is crossed;
- guaranteed real-time or sub-second usage visibility;
- automatic database downgrade;
- Windows support in the first platform target unless explicitly brought
  forward by the platform decision.

## Product metrics and data-quality measures

These are local product-success and correctness measures, not a proposal to
send analytics to a server:

| Measure | Desired outcome | Evidence required later |
| --- | --- | --- |
| Source coverage | A new user can discover and parse the Codex source in the first slice without manual path entry. | Anonymized fixtures plus live read-only probes on Fedora x64. |
| Import correctness | Repeating a scan does not duplicate canonical events. | Deduplication tests, cursor tests, and repeated-import evidence. |
| Metric clarity | The dashboard distinguishes observed tokens from estimated or unknown cost. | UI acceptance test and accessible labels. |
| Freshness | The UI identifies the last successful scan and delayed/failed sources. | Scanner and dashboard integration test. |
| Provenance | Every imported event can be traced to a source identity, parser version, and bounded source position or hash. | Database and export inspection. |
| Portability | A `.tokenstats` archive can round-trip without losing events or alert rules. | Cross-profile import/export test. |
| Alert correctness | A period/threshold produces at most one delivery unless the user explicitly resets or edits the rule. | Boundary, jump, period-rollover, and repeated-scan tests. |
| Privacy | Default database and exports exclude prompts, responses, source code, credentials, and complete raw logs. | Redaction audit and fixture inspection. |
| Update safety | Failed verification or installation leaves the current data and installation usable. | Packaged upgrade, failure, and rollback tests. |

No telemetry, account, or cloud analytics is required for these measures.

## Alerts

Alerts are proposed as best-effort personal-budget monitoring, not provider
quota enforcement. TokenStats can
only report what it has successfully observed in local records; it cannot stop
a harness or provider from using more tokens.

The current proposal is:

- daily, weekly, and monthly calendar periods in the configured display
  timezone;
- Monday as the first day of the week unless the locale decision changes it;
- observed tokens as the default and most defensible metric;
- estimated API-equivalent cost only where a reviewed pricing snapshot and
  defensible token semantics exist, with explicit `estimated` wording;
- no cost alert for subscription usage without a reliable API equivalent;
- global scope in v0.1, with per-harness and per-project scopes deferred;
- configurable 80% warning, 100% reached, and 120% over-budget thresholds;
- one delivery per `(rule, period, threshold)` even when scans repeat;
- a large jump crossing several thresholds summarized without noisy duplicate
  notifications;
- evaluation only after usage events are committed;
- the last successful scan and a data-delay caveat in every notification;
- silent historical import backfill by default, with an explicit option to
  notify about current-period crossings.

## Tray and background behavior

The proposed monitor remains available after the main window is hidden when
background monitoring is enabled. The close control hides the window to the
tray; `Exit TokenStats` is the explicit full-quit action.

The first version should provide:

- a fixed tooltip with today’s observed tokens, daily personal budget and
  percentage when configured, alert state, and last successful scan time;
- left-click activation that opens or focuses the dashboard, subject to Linux
  desktop conventions;
- a right-click menu with Open, Restore/Maximize, Minimize, Refresh now,
  Alerts, Settings, Check for updates, Pause monitoring, and Exit;
- separate `Start automatically`, `Start minimized to tray`, and `Keep running
  when the window is closed` settings;
- native notifications rather than a custom notification surface;
- a visible stale/error state when a source fails, while preserving the last
  good aggregate.

## Update behavior

The current product proposal uses two human-readable modes:

- Stable — recommended default;
- Nightly — opt-in development build with higher risk and a separate data
  profile by default.

Automatic checks are proposed at startup and every six hours while running.
Downloading and installation remain explicit user actions. A visible header
button should show the available version, channel, release notes, and progress;
the app must not silently restart. Before a migration, the update flow creates
a recoverable backup, finishes or pauses safe work, verifies the artifact, and
restarts only after the user confirms installation.

`Check now` remains available in Settings and the tray even though Manual is
not a separate channel. `v0.1.x` is an internal/private build and is not a
public release promise. The project stays on `0.1.x` until the maintainer
decides that there is enough visible product value to move to `v0.2.0`.

The packaging and channel details remain subject to the release and exact
support questions in [Q-021](../ideas/00-open-questions.md),
[Q-023](../ideas/00-open-questions.md), and
[Q-026](../ideas/00-open-questions.md).

## Acceptance criteria

These are planned acceptance criteria, not completed checks:

| ID | Criterion | Verification target |
| --- | --- | --- |
| PRD-AC-01 | The first scan shows what was found, what was not found, and why. | Discovery and onboarding test. |
| PRD-AC-02 | Current-user Codex, Claude Code, and experimental Copilot adapters import anonymized fixtures without prompt/response content; Claude also persists no project/file path. | Adapter fixture and privacy tests; platform claims need their own runtime evidence. |
| PRD-AC-03 | Repeated scans and rotated files do not duplicate canonical events. | Cursor, fingerprint, and migration tests. |
| PRD-AC-04 | After the first usage slice, the dashboard labels every Codex and complete Copilot estimated cost with its pricing snapshot/date and coverage, while incomplete provider estimates remain unknown. | Pricing, dashboard, and accessibility tests. |
| PRD-AC-05 | Unavailable, stale, permission-denied, unsupported, and disabled sources are distinguishable and actionable. | Source-health test. |
| PRD-AC-06 | Daily, weekly, and monthly threshold crossings notify at most once per period and threshold, with last-scan caveats. | Alert boundary and notification test. |
| PRD-AC-07 | The app continues a configured background scan while the window is hidden, and `Exit TokenStats` fully stops it. | Tray and lifecycle test on each target platform. |
| PRD-AC-08 | `Refresh now` and the scheduled refresh share the same ingest, deduplication, transaction, and alert-evaluation path. | Integration test. |
| PRD-AC-09 | A `.tokenstats` export/import round trip preserves events, provenance, pricing snapshots, and selected portable settings. | Cross-profile portability test. |
| PRD-AC-10 | A failed update download, verification, migration, or installation preserves the previous usable installation and data. | Packaged failure and rollback test. |
| PRD-AC-11 | The targeted Fedora x64 artifact starts on a clean test machine before the first slice is called verified; later targets require their own evidence. | Platform smoke tests and release evidence. |
| PRD-AC-12 | No planned feature is described as implemented or verified without repository, runtime, CI, or platform evidence. | Documentation review. |

## Unresolved decisions

The decision index contains both accepted constraints and unresolved questions.
The following are accepted for the current documentation direction and are not
awaiting another answer:

- broad harness-user audience and first workflow assumption (Q-001);
- Fedora x64 plus Codex as the first working vertical slice, followed by
  Copilot, Claude Code, and an early macOS arm64 spike (Q-002 and Q-022);
- internal/private `v0.1.x` until an explicit visible-product `v0.2.0` decision
  (Q-003);
- verified pre-migration backups, latest-three retention, no automatic
  downgrade, and a separate Nightly profile (Q-015–Q-016);
- Stable and Nightly as the required channels, with `Check now` as an action
  rather than a channel (Q-021).
- per-OS-user source discovery and application-data isolation, plus cumulative
  retained history until explicit deletion (Q-024–Q-025).

The remaining questions are maintained in
[ideas/00-open-questions.md](../ideas/00-open-questions.md):

- explicit out-of-scope items (Q-004);
- token categories, provider-specific pricing snapshots, source paths, and
  manual-source follow-on policy (Q-005–Q-010);
- privacy metadata, export paths, portability, and import alert behavior
  (Q-011–Q-014);
- custom window/tray behavior and alert period/refresh policy (Q-017–Q-020);
- signing requirements, exact OS versions, and later platform timing
  (Q-023 and Q-026).

Until a decision is recorded, the current assumptions above remain proposed.
