# TokenStats

TokenStats is a desktop app for tracking AI coding assistant token usage from
local logs.

It stores usage metadata in SQLite. Prompts, responses, source code, commands,
credentials, and raw logs are not stored.

![TokenStats dashboard](docs/images/tokenstats-dashboard.png)

> **Status:** An internal Fedora/Electron slice, tested on the current
> Fedora/KDE host. GitHub CI, the tag-driven `v0.1.0` release, and native
> macOS arm64 validation have passed; the published release contains Linux
> and macOS arm64 artifacts. Clean-machine and production distribution
> readiness remain open.

## Current features

- Codex, Claude Code, and GitHub Copilot usage import.
- Optional GitHub Copilot OTel support.
- Dashboard with time periods, custom date ranges, and Line/Bar/Pie charts.
- Usage breakdown by source and model, with session counts.
- Estimated API-equivalent costs where pricing data is complete.
- Incremental imports and Settings reset with a verified SQLite backup.
- Closing the window hides TokenStats to the system tray; the tray menu provides
  Show/Hide window and Exit.
- A Fedora RPM package with a standard application launcher and menu entry.

## Run

```bash
pnpm install
pnpm dev
```

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm release:check-version --stable-only -- v0.1.0
pnpm package:linux
pnpm package:linux:rpm
```

`pnpm package:linux` creates the portable AppImage. On Fedora, the RPM build
creates a normal system-installable package:

```bash
sudo dnf install ./dist/TokenStats-0.1.0-linux-x86_64.rpm
```

After installation, TokenStats appears in the desktop application menu under
Utilities with the packaged icon. It does not add an automatic-login entry by
default. Remove it with `sudo dnf remove tokenstats`.

Tray status metrics, alerts, automatic updates, exports, and public
distribution remain follow-on work.

See the [documentation](docs/README.md) for details and [open questions](ideas/README.md)
for planned work.
