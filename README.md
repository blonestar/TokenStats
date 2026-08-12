# TokenStats

TokenStats is a desktop app for tracking AI coding assistant token usage from
local logs.

It stores usage metadata in SQLite. Prompts, responses, source code, commands,
credentials, and raw logs are not stored.

![TokenStats dashboard](docs/images/tokenstats-dashboard.png)

> **Status:** An internal Fedora/Electron slice, tested on the current
> Fedora/KDE host. Clean-machine, CI, cross-platform, and public-release
> validation are not done yet.

## Current features

- Codex, Claude Code, and GitHub Copilot usage import.
- Optional GitHub Copilot OTel support.
- Dashboard with time periods, custom date ranges, and Line/Bar/Pie charts.
- Usage breakdown by source and model, with session counts.
- Estimated API-equivalent costs where pricing data is complete.
- Incremental imports and Settings reset with a verified SQLite backup.

## Run

```bash
pnpm install
pnpm dev
```

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm package:linux
```

Tray/background behavior, alerts, automatic updates, exports, CI, and public
distribution are not implemented yet.

See the [documentation](docs/README.md) for details and [open questions](ideas/README.md)
for planned work.
