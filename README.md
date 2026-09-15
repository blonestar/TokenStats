# TokenStats

TokenStats is a desktop app for tracking AI coding assistant token usage from
local logs.

It stores usage metadata in SQLite. Prompts, responses, source code, commands,
credentials, and raw logs are not stored.

![TokenStats dashboard](docs/images/tokenstats-dashboard.png)

> **Status:** An internal Fedora/Electron slice, tested on the current
> Fedora/KDE host. GitHub CI, the tag-driven `v0.1.4` release, and native
> macOS arm64 validation have passed; Windows CI run `34980761042` passed the
> Windows x64 NSIS build and isolated packaged-launch smoke test. `v0.1.4`
> publishes the Linux AppImage, updater metadata, and checksum manifest, while
> the internal `v0.1.0` release contains the macOS arm64 artifact.
> Clean-machine and production distribution readiness remain open.

## Current features

- Codex, Claude Code, and GitHub Copilot usage import.
- Optional GitHub Copilot OTel support.
- Dashboard with time periods, custom date ranges, and Line/Bar/Pie charts.
- Usage breakdown by source and model, with session counts.
- Estimated API-equivalent costs where pricing data is complete.
- Incremental imports and Settings reset with a verified SQLite backup.
- Startup collection with a full-screen progress overlay, plus persisted local
  data auto-refresh in Settings (enabled by default at one minute; supported
  intervals are 1, 5, 10, 15, 30, and 60 minutes).
- Manual `Refresh local sources` action shared with the background scan path.
- Closing the window hides TokenStats to the system tray; the tray hover
  tooltip shows the observed token totals for today and the current month with
  estimated API-equivalent costs, and the tray menu provides Show/Hide window
  and Exit.
- A Fedora RPM package with a standard application launcher and menu entry.
- A Windows x64 NSIS installer build in CI and the tag-driven release pipeline;
  the installer smoke path is verified, while full Windows support and
  clean-machine evidence remain pending.
- Packaged Linux AppImage update checks with Settings controls for enablement,
  startup checks, and a 1/6/12/24-hour interval; download, then install and
  restart remain explicit actions. RPM and the current macOS ZIP remain manual
  update paths.
- The Linux AppImage uses a stable local filename so an update keeps the
  existing desktop launcher on the same path.

## Run

```bash
pnpm install
pnpm dev
```

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm release:check-version --stable-only -- v0.1.5
pnpm package:linux
pnpm package:linux:rpm
# Run on a Windows runner for the NSIS installer:
pnpm package:win
```

`pnpm package:linux` creates the portable `TokenStats-linux-x86_64.AppImage`.
Keep that AppImage at a persistent writable path when using the packaged
click-to-update flow. On Fedora, the RPM build creates a normal
system-installable package:

```bash
sudo dnf install ./dist/TokenStats-0.1.4-linux-x86_64.rpm
```

After installation, TokenStats appears in the desktop application menu under
Utilities with the packaged icon. It does not add an automatic-login entry by
default. Remove it with `sudo dnf remove tokenstats`.

Detailed tray status, alerts, exports, and public distribution remain follow-on
work. The implemented tooltip is currently limited to observed token totals
and secondary API-equivalent estimates. The updater is scoped to the packaged
Linux AppImage release feed; the Windows release pipeline does not establish
Windows updater support.

See the [documentation](docs/README.md) for details and [open questions](ideas/README.md)
for planned work.
