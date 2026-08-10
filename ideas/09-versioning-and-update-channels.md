# 09 — Versioning and update channels

> **Current direction:** the official policy in
> [`../docs/versioning-and-update-channels.md`](../docs/versioning-and-update-channels.md)
> supersedes exploratory alternatives in this note. `v0.1.x` is internal/private,
> the project moves to `v0.2.0` only after an explicit visible-product
> readiness decision, and Stable/Nightly are the required channels.

## Starting version

Start with **`v0.1.0`**.

This is the first installable internal/private build: useful for controlled
development and review, but not a public release or production-readiness
promise. The project can remain on `0.1.x` until the maintainer decides there is
enough visible product value for `v0.2.0`.

## Version format

Normal releases use:

```text
vA.B.C
```

Prereleases append a SemVer prerelease identifier:

```text
v0.2.0-beta.1
v1.0.0-rc.1
v0.2.0-nightly.20260810.1
```

Build metadata such as a commit SHA can be added when useful, but it must not be used as the only channel identifier.

## Product versioning convention

### `C` — patch/fix release

Increment `C` for backward-compatible fixes:

- parser fixes;
- alert deduplication fixes;
- UI defects;
- performance improvements;
- security fixes;
- packaging and updater fixes.

Examples:

```text
v0.1.0 → v0.1.1
v1.2.3 → v1.2.4
```

### `B` — feature release

Increment `B` for new backward-compatible user functionality:

- a new harness adapter;
- weekly/monthly alerts;
- a new export format;
- a new dashboard view;
- new settings that do not invalidate existing data.

Reset `C` to zero:

```text
v0.1.1 → v0.2.0
v1.0.4 → v1.1.0
```

### `A` — major/product readiness release

Keep `A = 0` while the product is still in preview and the data model, adapters, or workflows may change materially.

Move to **`v1.0.0` only when the product is production-ready**, meaning:

- the core adapters are reliable;
- migrations and export/import are proven;
- stable releases are signed and recoverable;
- update behavior is tested on supported platforms;
- privacy and data-loss risks are understood;
- the product can make a clear support promise.

After `v1.0.0`, increment `A` for an intentional breaking change to the user contract, data format, supported platform, or public integration behavior.

## Important SemVer note for `0.x`

Formal SemVer treats `0.x` as initial development, where compatibility is not guaranteed. TokenStats should still use the stricter product convention above: `B` means a feature release and `C` means a fix release, even before `1.0.0`. Any breaking change in `0.x` must be called out prominently in the release notes and migration plan.

The project follows the standard SemVer meaning of patch/minor/major after `v1.0.0`. See the [Semantic Versioning specification](https://semver.org/).

## Exploratory channel alternatives

The following alternatives are retained for exploration only. The current
required channels are Stable and Nightly; Beta/Preview and Manual are deferred
and are documented in the official versioning document.

### Stable — default

Published, signed, non-prerelease versions:

```text
v0.1.0
v0.1.1
v0.2.0
v1.0.0
```

Stable is the default for normal users. `0.x` builds can be distributed through Stable as a stable preview, but the UI and release notes should still say that the product is pre-1.0.

### Beta/Preview — opt-in

Release candidates and feature-complete previews:

```text
v0.2.0-beta.1
v0.2.0-beta.2
v1.0.0-rc.1
```

Use this channel to validate a coming Stable release without the volatility of nightly builds. Beta should still have release notes, migration tests, and signed artifacts when possible.

### Nightly — opt-in and risky

Automated builds from `main`:

```text
v0.2.0-nightly.20260810.1
```

Nightly is for development and early feedback. It can contain incomplete features, parser regressions, or forward-only database migrations. It must be clearly marked in the UI and should use a separate application-data profile from Stable by default.

### Manual — opt-out of automatic updates

This is not a release stream. It means:

- do not check automatically;
- do not download automatically;
- show a `Check now` action and release-page link;
- let the user install a selected artifact manually.

Do not add a separate `Dev` channel in the first version. Nightly plus Manual covers the useful cases without creating another support promise.

## Settings behavior

Recommended defaults:

- channel: `Stable`;
- automatic checks: enabled;
- check at startup and every six hours while running;
- automatic download: disabled by default; the visible update button starts the download;
- installation: the same explicit update action proceeds to graceful shutdown, install, and restart;
- release notes: shown before installation;
- manual update check: always available.

Changing to Beta or Nightly should require a confirmation message explaining the risk. Changing back to Stable should not silently downgrade the database or binary.

## Update lifecycle

1. The app checks the feed for the selected channel.
2. It compares the available version using SemVer prerelease rules.
3. It shows a visible blue `Update available — vA.B.C` action, with channel, release notes, and artifact size available nearby.
4. The user clicks once to start the download and install flow.
5. The app shows download progress and verifies the artifact/signature/checksum.
6. Before restart, it finishes or pauses scans and creates a database backup if a migration is expected.
7. The app gracefully closes, the platform updater installs the new version, and the app restarts.
8. On next launch, it runs the migration before ingestion.
9. It records update success/failure and keeps the previous release available for rollback.

## Data and channel safety

- Stable and Beta may share a database only if migration tests prove the path in both directions needed by supported upgrades.
- Nightly should use a separate profile by default, for example `TokenStats/nightly`, rather than silently sharing Stable data.
- Do not support automatic downgrade of the database schema.
- Before a channel switch, offer `.tokenstats` export and show the current database/profile.
- If an update fails, preserve app data and offer the previous artifact or release page.
- Channel selection must not change the user's source files, harness settings, or API credentials.
- A failed download or verification must leave the current installation usable.
- Closing/restarting for an update must not discard an in-progress import/export or uncommitted user setting.

## Channel naming in the UI

Use human-readable labels:

```text
Stable — recommended
Beta — upcoming features, some risk
Nightly — latest development build, highest risk
Manual — no automatic updates
```

Avoid exposing raw feed URLs or internal updater terminology in normal Settings. Put diagnostics, feed URL, selected artifact, and update logs behind an Advanced section.
