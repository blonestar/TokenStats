Status: Proposed

Audience: maintainers, release reviewers, contributors, and users evaluating update safety

Source of truth: this document for version semantics and update-channel behavior; release mechanics are detailed in platform-packaging-and-release.md and unresolved choices are tracked in ../ideas/00-open-questions.md

Last reviewed: 2026-08-10

# TokenStats versioning and update channels

This document defines the proposed version and update policy. No application
version metadata, update feed, updater, or release artifact exists yet.

## Starting version and readiness meaning

The project starts at **`v0.1.0`**. This is an internal/private development
build, not a public release promise. The project remains on `0.1.x` while the
team is building and refining the first visible product.

Moving to **`v0.2.0`** is an explicit readiness decision: there must be enough
real, reviewable product behavior for users to have something meaningful to
look at. It does not automatically mean that the product is public or
production-ready.

Moving to **`v1.0.0`** means production readiness, not merely the passage of
time. It requires reliable priority adapters, proven migrations and
export/import, recoverable signed releases, tested update behavior on supported
platforms, understood privacy/data-loss risks, and a support promise that the
maintainer is prepared to make.

## `vA.B.C` meaning

Normal release tags use the `vA.B.C` form. The `v` prefix is a tag convention;
the underlying version follows Semantic Versioning. See the
[Semantic Versioning specification](https://semver.org/).

### `C`: patch or fix

Increment `C` for backward-compatible fixes, including:

- parser and source-detection corrections;
- alert deduplication and notification fixes;
- UI defects and accessibility fixes;
- performance improvements that preserve the user contract;
- security and packaging/updater fixes;
- migration or export/import fixes that do not require a new user contract.

Examples: `v0.1.0` → `v0.1.1`, and `v0.1.7` → `v0.1.8`.

### `B`: feature milestone

Increment `B` for a meaningful backward-compatible product milestone, such as
a new adapter, dashboard capability, alert period, export format, or settings
surface. During the current private development phase, feature work may remain
on `0.1.x` until the maintainer decides there is enough visible product value
to create `v0.2.0`.

Examples: `v0.1.8` → `v0.2.0`, and later `v1.0.4` → `v1.1.0`.

### `A`: production-readiness or breaking contract

Keep `A = 0` while adapters, data formats, workflows, and support expectations
are still being shaped. Use `v1.0.0` only after the production-readiness bar
is met. After `v1.0.0`, increment `A` for an intentional breaking change to a
user contract, data format, supported platform, or public integration.

Formal SemVer permits more change during `0.x`; TokenStats will still use the
stricter product convention above and call out any breaking `0.x` change in
release notes and migration guidance.

## Channels

The first channel decision is intentionally small: **Stable** and **Nightly**
are sufficient.

### Stable

Stable is the recommended channel for the most reviewable build. During the
current phase, Stable artifacts are internal/private and must not be treated as
a public release merely because they have a Stable label. A Stable `0.1.x`
build may be used for controlled review before the `v0.2.0` readiness decision.

Stable must not receive a Nightly build through version comparison alone. Feed
metadata must identify the channel explicitly.

### Nightly

Nightly is an opt-in development channel built from `main` or an equivalent
development ref. It may contain incomplete features, parser regressions, or
forward-only migrations. It must be visibly marked as higher risk.

Nightly uses a separate application-data profile by default, such as a
`TokenStats/nightly` profile. This prevents a Nightly migration from moving the
Stable database to a schema that Stable cannot read.

### Deferred Beta/Preview channel

Beta/Preview is not required for the first workflow. If a later decision adds
it, it should be an opt-in prerelease channel between Stable and Nightly, with
release notes, migration tests, and signed artifacts when possible. It must not
be introduced merely as another name for an internal `v0.1.x` build.

### Deferred Manual mode

Manual is not a channel in the current design. `Check now`, a release-page link,
and user-initiated installation remain available within Stable/Nightly settings
without creating a separate Manual channel. A future Manual mode could disable
automatic checks, but it is not required for v0.1.

## Prerelease naming

Prereleases append a SemVer identifier:

```text
v0.1.0-nightly.20260810.1
v0.2.0-rc.1
v1.0.0-beta.1
```

The first and third examples are reserved for future channel decisions; the
current active prerelease form is Nightly. Build metadata such as a commit SHA
may be added for diagnostics but must not be the only channel identifier.

Tags and feed metadata must use a consistent version parser. A prerelease must
never outrank the associated normal Stable version merely because its build
timestamp is newer.

## Channel switching

Changing from Stable to Nightly requires an explicit warning that:

- Nightly can contain incomplete behavior and migration risk;
- the Nightly profile is separate by default;
- the user should export a `.tokenstats` archive before switching;
- source files, harness settings, and API credentials are not changed by the
  channel switch.

Changing from Nightly to Stable must not silently reuse a Nightly database or
automatically downgrade its schema. The UI should identify both the selected
channel and active data profile. Recovery uses a compatible profile or an
export/import operation reviewed by the user.

## Update-check behavior

The proposed defaults are:

- automatic checks enabled for Stable and Nightly when the user has opted into
  the channel;
- one check at startup;
- another check every six hours while TokenStats is running;
- `Check now` always available in Settings and the tray menu;
- no automatic download by default;
- no automatic installation or silent restart.

The app should expose the last check time, selected channel, current version,
available version, release notes, artifact size, and a data-profile warning
where relevant.

## Visible update button

When a compatible update is available, the main header should show a visible
text action near Refresh and Settings:

```text
[Refresh]  [Update available — v0.1.1]  [Settings]
```

The action must have an accessible name and cannot rely on color alone. The
same state should appear in Settings and the tray menu.

Proposed button states:

```text
Update available — v0.1.1
Downloading update… 37%
Verifying update…
Ready to install — restart TokenStats now?
Up to date
Update failed — Retry
```

The user action starts the download. The app may continue checking in the
background, but it must not download or install without the configured consent
flow.

## Download, verification, installation, and restart sequence

The proposed sequence is:

1. The selected-channel checker finds a newer compatible version.
2. The app presents the version, channel, release notes, and artifact size.
3. The user clicks the visible update action.
4. The app downloads with progress and disables conflicting update actions.
5. The app verifies checksum and signature when available.
6. Imports and exports finish before installation; an active scan finishes or
   pauses safely.
7. If the release requires a schema migration, the app creates and verifies a
   pre-migration backup. The update is blocked if the backup fails.
8. The app presents `Install and restart` or equivalent explicit confirmation.
9. The app gracefully closes its windows and background process.
10. The platform updater installs the already verified artifact.
11. TokenStats restarts and selects the same channel/profile.
12. The new process runs database migrations before ingestion.
13. The app validates key invariants, restores monitoring state, and reports
    success or failure.

If download, verification, migration, or installation fails, the current
installation and data must remain usable. Rollback means reinstalling a
previous artifact or restoring a compatible backup; automatic schema downgrade
is forbidden.

## Release notes and evidence

Each version should state:

- channel and exact version;
- supported platforms and artifacts;
- adapter and data-format changes;
- migration and backup implications;
- privacy changes;
- known limitations and unverified behavior;
- checksum/signing/provenance status.

The version label alone is not evidence of implementation, release, or platform
verification. Those claims require repository, CI, packaged-artifact, or
platform evidence and a corresponding documentation status update.

## Open decisions

The active channel decision is recorded in
[Q-021](../ideas/00-open-questions.md): Stable and Nightly are sufficient, with
`Check now` as an action rather than a channel. Remaining questions include
exact target OS versions, signing timing, and when the private `0.1.x` build is
ready for the explicit `v0.2.0` milestone.
