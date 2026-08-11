Status: Proposed

Audience: maintainers, release engineers, platform testers, security reviewers, and contributors working on packaging

Source of truth: this document for target platforms, packaging, release, signing, and update policy; unresolved choices are tracked in ../ideas/00-open-questions.md

Last reviewed: 2026-08-11

# TokenStats platform, packaging, and release

This is a release-engineering proposal. The repository now has a package
manifest, build script, unpacked Linux packaging command, and a local manual
macOS arm64 validation workflow, but no CI, release workflow, released
artifact, signing configuration, or updater implementation. The unpacked build
starts and scans on the current Fedora/KDE host, which is not yet clean-machine
or release verification. The macOS workflow has not been pushed or run.

## Platform targets

### Initial targets

The implemented Fedora slice targets the current OS user's Codex, Claude Code,
and experimental GitHub Copilot data. The current follow-on platform direction
is:

- Fedora x64, with the exact supported Fedora versions to be named before a
  production-readiness claim;
- macOS arm64 as the first macOS target after the Fedora slice;
- macOS x64 later unless evidence requires it.

Ubuntu timing and exact OS versions remain open; they are not first-slice
support claims.

Windows is a later target. Shared path, filesystem, adapter, and update
abstractions should avoid making Windows impossible, but Windows support is not
part of the first platform promise unless [Q-026](../ideas/00-open-questions.md)
changes.

Platform support means more than an artifact that launches. It requires clean
machine evidence for discovery, SQLite, migrations, notifications, login
startup, tray activation, close-to-tray behavior, custom window controls,
high-DPI rendering, update verification, and recovery after interrupted work.

## Proposed Electron packaging

The current stack proposal is Electron + TypeScript + React/Vite with a native
SQLite binding in the main process. Packaging must build native modules for the
exact Electron runtime; success in the development server is not evidence that
the packaged app works.

The current packaging candidate is `electron-builder`, producing platform
artifacts from the appropriate operating-system runner. A Tauri alternative
remains possible if the required packaging spike demonstrates lower risk, but
the project must decide before the adapter layer and release workflow become
dependent on Electron assumptions.

## Artifacts

The proposed artifact set is:

| Platform | Candidate artifact | Release policy |
| --- | --- | --- |
| Fedora x64 | `.AppImage` | Primary Linux download and self-update candidate. |
| Fedora x64 | `.rpm` | Optional first-release artifact after clean install tests; package-manager updates may be the fallback. |
| macOS arm64 validation | ad-hoc-signed, unnotarized `.zip` | Internal-only validation; workflow exists locally but has not been pushed or run. |
| macOS arm64 | `.dmg` | Requires signed/notarized production-ready distribution. |
| macOS x64 later | `.dmg` | Consider only after arm64 evidence or changed priority. |
| Windows later | `.exe` installer and/or `.msix` | Add only after the Windows installer, identity, notifications, signing, and update path are tested. |

Every artifact should include version, platform, and architecture in its name.
Each published artifact gets a matching SHA-256 checksum entry. Do not rely on
an unversioned `latest` file as the only download reference.

## electron-builder and electron-updater proposal

`electron-builder` plus `electron-updater` is the current candidate because the
product needs a Linux AppImage investigation in addition to macOS and Windows
packaging. This is not yet a dependency or implementation decision.

Electron's built-in [`autoUpdater`](https://www.electronjs.org/docs/latest/api/auto-updater/)
documents macOS and Windows support and does not provide a built-in Linux
auto-update path. The project therefore needs a dedicated spike for
`electron-updater`, AppImage feeds, package-manager fallbacks, artifact
verification, and channel separation. See the
[electron-updater documentation](https://www.electron.build/electron-updater.html)
and [electron-builder AppImage update guidance](https://www.electron.build/appimage/).

The updater must not be treated as safe merely because a download completed. It
must identify the channel and version, verify integrity/signature, coordinate
with imports and migrations, and retain a recoverable previous state.

## Signing and notarization

The current release policy proposal is:

- a private Fedora implementation may use unsigned artifacts only when the
  release notes clearly say so; the macOS arm64 validation artifact is instead
  ad-hoc-signed and unnotarized, for internal-only validation;
- a public Stable release should be signed for each platform where signing is
  expected by the OS and updater;
- macOS production-ready distribution requires Developer ID signing and
  notarization and stapling, with evidence from a packaged build rather than a
  development run;
- Windows production-ready distribution requires appropriate code signing and
  stable application identity before claiming reliable installer notifications
  or updates;
- Linux artifacts should provide checksums and, when the selected distribution
  path supports it, verifiable signing/provenance;
- signing credentials belong in a protected GitHub release environment and
  never in pull-request jobs, repository files, or user exports.

`v0.1.x` is not a public release promise. It remains an internal/private build
until the maintainer decides there is enough visible product value to move to
`v0.2.0`. The exact signing threshold for a later public or production-ready
release remains open in [Q-023](../ideas/00-open-questions.md).

## Current macOS arm64 validation path

`pnpm package:mac:arm64` is a macOS-only command that generates
`assets/icons/TokenStats.icns` from committed PNG icon sources, builds the app,
and creates the ad-hoc-signed, unnotarized
`dist/TokenStats-<version>-mac-arm64.zip` artifact with publishing disabled.
`.github/workflows/macos-arm64-validation.yml` is manual-only, uses the native
Apple Silicon `macos-15` runner, and uploads that ZIP with a `SHA256SUMS.txt`
manifest. The workflow exists locally but has not been pushed or run.

Before upload, the workflow asserts an arm64 host; checks the arm64 main
executable and every packaged `.node` module (including `better_sqlite3.node`);
verifies the strict, deep ad-hoc code signature; and launches the app with a
temporary isolated user-data directory until the TokenStats renderer appears
through a local DevTools endpoint. It does not scan source data or use a real
application-data directory. The checksum manifest is generated and checked
inside `dist/`, so its entries are bare artifact filenames.

This ad-hoc-signed, unnotarized artifact is internal-only. Fedora cannot
validate it; a real Apple Silicon workflow run remains required. Public macOS
distribution remains unready and requires Developer ID signing, hardened
runtime, notarization, stapling, and a clean-machine Gatekeeper gate.

## GitHub Actions proposal

Only the manual macOS arm64 validation workflow exists, and it has not yet run.
CI and release workflows remain proposals with this intended shape:

### `ci.yml`

Run on pull requests and pushes to `main`:

- install from a committed lockfile;
- typecheck, lint, and run unit/integration tests;
- run anonymized parser fixtures;
- migrate a seeded database from the oldest supported schema;
- test `.tokenstats` export/import round trips;
- run dependency and security checks;
- optionally run a packaged smoke test on selected branches or Nightly.

### `build.yml`

Run manually or on selected `main` pushes for preview artifacts:

- build on the appropriate OS/architecture matrix;
- keep preview artifacts separate from Stable releases;
- upload artifacts and a checksum manifest;
- run clean-machine or disposable-runner smoke checks where feasible.

### `release.yml`

Proposed tag-driven flow:

1. A maintainer creates and pushes a `vA.B.C` tag.
2. The workflow verifies that the tag matches application and schema metadata.
3. Fedora artifacts build first; macOS arm64 artifacts join once the follow-on
   spike is authorized and validated.
4. Packaged smoke tests run before publication.
5. The workflow creates checksums, SBOM/provenance, and release notes.
6. A draft GitHub Release is created with versioned artifacts.
7. A maintainer reviews the artifacts, notes, channel, and evidence.
8. The release is published; only then should the Stable feed expose it.

Release jobs should start with read-only permissions and grant write access only
to the narrow job that creates or publishes the release. Third-party Actions
should be pinned to full commit SHAs after their source is reviewed. Use a
protected `release` environment with required approval for signing or
publishing credentials. These proposed controls follow the GitHub guidance on
[workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts),
[secure use](https://docs.github.com/en/actions/reference/security/secure-use),
and [environment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

## Checksums, SBOM, and provenance

Each release should publish:

- one artifact per supported platform and architecture;
- a SHA-256 manifest with stable filenames;
- release notes listing known adapter, data, platform, and update limitations;
- an SBOM when the build system can produce one reliably;
- build provenance or artifact attestations when the GitHub workflow supports
  them;
- the commit/tag and relevant application/schema version.

Checksums establish integrity after download; they do not by themselves prove
who built an artifact. Signing and provenance should be documented separately.

## Update checks and user-controlled installation

The proposed default is:

- check at startup and every six hours while the app is running;
- provide `Check now` in Settings and the tray menu;
- never download automatically by default;
- show a visible `Update available — vA.B.C` action with channel, release
  notes, and artifact size;
- require the user to start download/install through that visible action;
- show progress and verification state;
- never silently restart the app.

Stable and Nightly channel behavior is specified in
[versioning and update channels](versioning-and-update-channels.md). Nightly
should use a separate application-data profile by default.

## Download, verify, install, and restart flow

The proposed sequence is:

1. The selected-channel checker finds a compatible release.
2. The main window, Settings, and tray expose the same update state.
3. The user clicks the visible update action.
4. TokenStats downloads the selected artifact with progress and prevents
   conflicting update actions.
5. The app verifies the checksum and signature when available.
6. Active import/export work finishes before installation can continue; a scan
   may finish or pause safely.
7. If a migration is expected, the app creates and validates a recoverable
   database backup.
8. The app asks for or receives the explicit `Install and restart` action.
9. The app gracefully closes windows and background work.
10. The platform updater installs the artifact and restarts TokenStats.
11. The new process validates the data profile and runs migrations before
    ingestion.
12. The app records success or failure and leaves the prior release/data
    available for recovery if any step fails.

If a platform requires a second confirmation, it must clearly say that the
restart will install the already verified update. A failed download or
verification must not make the current installation unusable.

## Rollback behavior

Rollback means reinstalling a known previous application artifact while
preserving the application-data database. It does not mean automatically
downgrading the schema. Before channel changes or risky migrations, the user
should be offered a `.tokenstats` export and shown which profile is active.

If a migration cannot be safely reversed, recovery uses the pre-migration
backup or logical archive in a compatible application version. Update failure
must preserve source files, harness settings, API credentials, and local usage
data.

## Release acceptance checklist

Before calling a release artifact verified, maintainers must have evidence that:

- every promised artifact exists with a versioned name and checksum;
- each artifact starts on a clean target environment;
- an existing supported database opens and migrates without event loss;
- adapter fixtures, deduplication, and export/import tests pass;
- source paths, permissions, Unicode, spaces, and symlinks behave as expected;
- notifications, login startup, tray activation, close-to-tray, and explicit
  exit are tested on each promised platform;
- frameless controls and opaque transparency fallback are usable and accessible;
- update verification, backup, restart, failure, and recovery paths are tested;
- release notes state what remains proposed, unsupported, or unverified.

## Open decisions

The current channel and v0.1 posture are already decided for this
documentation phase: `v0.1.x` is internal/private (Q-003), and Stable/Nightly
are the required channels with explicit user-controlled installation (Q-021).
The remaining platform and release questions are:

- exact Fedora/macOS support versions, macOS x64 timing, Ubuntu timing, and
  Windows timing (Q-026);
- Linux AppImage versus RPM/DEB defaults and update fallback;
- the exact check cadence and restart details during implementation;
- whether automatic updates may ever be enabled by default after the private
  preview.
