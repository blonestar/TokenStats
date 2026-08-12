# 07 — GitHub repository and automated release

## Repository shape

This remains a release-workflow proposal and exploration note. Local Linux CI
and tag-driven draft-release workflows now exist but have not been pushed or
run; the manual macOS arm64 validation workflow has not been pushed or run on a
real Apple Silicon runner. The current official release policy is in
[`../docs/platform-packaging-and-release.md`](../docs/platform-packaging-and-release.md).

Working structure:

```text
apps/desktop/              # Electron main, preload, renderer
packages/core/             # canonical model, ingestion, deduplication, migrations
packages/adapters/         # harness adapters
packages/ui/               # shared UI/tokens/charts, if needed
fixtures/                  # redacted parser fixtures
scripts/                   # packaging, checksum, fixture helpers
docs/                      # user, developer, and release documentation
.github/workflows/         # CI, build, and release
```

If the first vertical slice is small, it can begin as one package; define boundaries by responsibility rather than creating monorepo ceremony before it is needed.

## Branch and change rules

- `main` is the releasable branch.
- Features go through pull requests.
- Pull-request CI is required: typecheck, lint, unit tests, parser fixtures, migrations, and export/import round trips.
- Release tags use the semver form `v0.1.0`.
- Avoid combining schema migration, parser behavior, and a UI redesign into one untestable release unless necessary.
- Every adapter has fixtures and a changelog note when its parser changes.
- Version tags and release notes follow the policy in [09 — versioning and update channels](./09-versioning-and-update-channels.md).

## Workflows

### `ci.yml`

Trigger: pull requests and pushes to `main`.

- Node/pnpm setup with lockfile enforcement;
- typecheck, lint, and tests;
- parser fixtures on a Linux runner;
- SQLite migration chain from the oldest tested schema;
- export/import round trip;
- dependency/security audit;
- optional packaged smoke test on pull requests or nightly.

### `build.yml`

Trigger: manual and selected pushes to `main` for preview builds.

Use a matrix by OS/architecture, upload artifacts, and publish a checksum manifest. Preview artifacts must not automatically become stable releases.

### `release.yml`

Recommended flow:

1. The maintainer creates and pushes a `vX.Y.Z` tag.
2. The workflow verifies that the tag matches package/app/schema metadata.
3. Linux and macOS artifacts build in parallel.
4. A clean packaged smoke test runs.
5. The workflow creates a SHA-256 manifest, SBOM/provenance, and release notes.
6. The workflow creates a **draft GitHub Release** with all artifacts.
7. The maintainer reviews and publishes the release.
8. The stable channel/auto-update sees the new version only after publication.

The first release can be unsigned while the pipeline is being validated, but stable end-user releases should have macOS signing/notarization, Windows signing when that target arrives, and verifiable checksums/provenance.

## Artifacts by platform

Current platform sequence:

- Fedora x64: `.AppImage`, optionally `.rpm` after clean-install evidence;
- macOS arm64: unsigned `.zip` only for the first internal validation, then a
  signed/notarized `.dmg` for production-ready direct distribution;
- macOS x64 and Ubuntu timing remain open;
- later Windows x64: `.exe` installer and/or `.msix`.

Every artifact has a name containing version/platform/architecture and a matching checksum. Do not upload only an unversioned “latest” file.

## Signing and secrets

- Pull-request CI has no signing secrets.
- Store release-signing secrets in a GitHub `release` environment with required reviewer approval.
- Start jobs with read-only permissions; grant `contents: write` only to the job that creates or publishes the release.
- Pin third-party Actions to full commit SHAs and regularly verify their source and release versions.
- Never put provider API keys, raw fixture data, or user exports in CI secrets or artifacts.

## Update strategy

- Use `electron-updater` with GitHub Releases or a compatible static update feed.
- Check for updates at startup, every six hours while the app is running, and through an explicit `Check now` action.
- Check automatically, but keep download/install user-initiated by default. The visible `Update available — vA.B.C` button starts the download and install flow.
- After the user clicks the update button, show progress, verify the artifact, gracefully finish/stop active work, close the app, install the update, and restart the app.
- Never force an unexpected restart and never terminate an active import/export transaction.
- Stable updates use signed artifacts and published non-prerelease releases.
- On Linux, make AppImage the canonical self-update target. Test RPM/DEB update behavior separately and fall back to a package-manager/release-page instruction when automatic installation is not reliable.
- macOS/Windows updates require the appropriate signed packaging and updater configuration.
- Every update must run the database migration before ingestion and create a recoverable backup before a migration.
- Pause update installation while an import, export, or scan transaction is active.
- Rollback means installing the previous artifact while preserving the app-data database; do not promise schema downgrades.

## One-click update and restart sequence

1. The background checker finds a compatible release for the selected channel.
2. The main header shows a prominent `Update available — vA.B.C` button.
3. The user clicks the button once.
4. The app disables conflicting actions and downloads the selected artifact with visible progress.
5. The app verifies the checksum/signature and confirms that the download is complete.
6. The app finishes or safely pauses an active scan; import/export must finish before the update can continue.
7. The app creates a database backup when the update includes a schema migration.
8. The app gracefully closes its windows and background process.
9. The platform updater installs the new application version.
10. The application starts again, runs migrations before ingestion, and restores the previous monitoring state.
11. The app reports success, or keeps the previous version/data intact and offers `Retry` if installation fails.

The user should not need to click a second time after the download completes. If a platform requires a final confirmation, the dialog must clearly say `Ready to install — restart TokenStats now?` and provide `Restart now` and `Later`.

## Release-channel artifacts

- `stable`: internal/private non-prerelease builds such as `v0.1.0` and
  `v0.1.1` until a public-release decision is made.
- `nightly`: automated builds from `main`, with a date/build identifier and a separate risk warning.

The starting `v0.1.x` line is internal/private, not a public release promise.
The updater must never treat a nightly build as a stable update. A channel
switch requires confirmation, and nightly should use a separate application-
data profile by default to avoid moving the stable database forward with an
unrecoverable schema migration. `Check now` remains an action, not a separate
channel.

## Release acceptance checklist

- all target artifacts exist;
- each artifact starts on a clean VM/runner;
- the application opens and migrates an existing database;
- parser fixtures are green;
- `.tokenstats` export/import has been tested;
- release notes list known limitations by adapter/platform;
- checksums/SBOM/provenance are available;
- the draft release is manually reviewed before publication.

## Platform-specific verification

- Linux notifications are tested on a GNOME-based Fedora environment and an Ubuntu environment, including a missing/disabled notification daemon.
- macOS notification behavior is tested with a signed build; unsigned development builds are not sufficient evidence.
- Windows notification behavior is tested from the packaged installer with its Start Menu identity/AppUserModelID.
- `Start automatically`, tray startup, close-to-tray, and clean exit are tested separately on each target.
- frameless custom controls, drag regions, rounded/transparency fallback, and maximize/restore state are tested separately on each target.
- closing the window hides to tray, while `Exit TokenStats` fully stops the process.
- A minute refresh and manual `Refresh now` are tested while the main window is hidden.

## Official references checked during brainstorming

- [Electron distribution](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)
- [Electron packaging with Forge](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)
- [Electron updating](https://www.electronjs.org/docs/latest/tutorial/updates)
- [Electron auto-updater platform notes](https://www.electronjs.org/docs/latest/api/auto-updater/)
- [electron-updater API](https://www.electron.build/docs/api/electron-updater/)
- [electron-builder AppImage updates](https://www.electron.build/appimage/)
- [GitHub Actions workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)
- [GitHub Actions secrets](https://docs.github.com/en/actions/concepts/security/secrets)
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use)
