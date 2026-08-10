# 02 — Stack options and working decision

## Candidates

| Option | Advantages | Risks for this product |
| --- | --- | --- |
| Electron + TypeScript + React/Vite | Predictable rendering on Linux/macOS/Windows; mature packaging tooling; Node is practical for parsing JSONL logs | Larger memory and disk footprint; a native SQLite module must be rebuilt for the Electron runtime |
| Tauri 2 + TypeScript + React + Rust | Small binary and lower resource usage; Rust is strong for file scanning and SQLite | Linux WebKitGTK/glibc baselines, WebView differences, and Rust build/signing add packaging risk |
| Flutter + Dart | One UI toolkit and good desktop packaging | Less aligned with the Node/JavaScript parser ecosystem and the existing web/UI approach; adds another language |
| Native toolkit per OS | Best platform-specific behavior | Three UI implementations and slower delivery; too much scope for the first product |

## Working MVP decision

**Electron + TypeScript + React/Vite + SQLite in the main process.**

Proposed boundaries:

- `main`: filesystem discovery, adapters, parsers, SQLite, import/export, tray/background behavior, and IPC;
- `preload`: a small, validated API exposed through `contextBridge`;
- `renderer`: dashboard and settings, with no direct filesystem or shell access;
- `shared`: types, schema validation, and IPC contracts;
- `fixtures`: anonymized harness logs for parser and migration tests.

The UI is intentionally a custom desktop shell: no standard in-window menu bar or OS frame, a renderer-owned title bar, and explicit minimize/maximize/close controls. This makes the Electron window customization and compositor fallback part of the initial packaging spike.

For the database, use `better-sqlite3` or another well-supported native SQLite binding in the main process, with explicit SQL migrations. Do not add an ORM that hides idempotency, cursors, or query plans; a typed query layer can be added later if it demonstrably reduces errors.

For charts, first build one verifiable chart component and one breakdown table. Choose a chart library through a small spike that tests zoom, tooltips, daily gaps, and many models.

For packaging and updates, the current candidate is `electron-builder` plus `electron-updater`. This is a better fit than relying only on Electron's built-in updater because the product wants a Linux update path as well as macOS and Windows updates. AppImage should be the canonical Linux download/update target; RPM/DEB support should be verified separately during the packaging spike.

## Why Electron for now

“Easy to install” matters more than the smallest binary. Electron includes the same Chromium renderer across targets, while Tauri on Linux requires careful WebKitGTK/glibc baseline management. Tauri remains a valid v2 candidate if a packaging spike proves that AppImage/RPM/DEB works without extra steps on Fedora and Ubuntu machines.

Electron does not solve every release issue automatically: Linux auto-updates are not built in, and serious end-user distribution requires macOS/Windows signing. Release engineering is therefore part of the architecture rather than an afterthought.

## Platform targets

### First internal/private build

- Fedora/Ubuntu x64: AppImage as the easiest download, plus RPM/DEB once packaging tests pass.
- macOS: arm64 and x64 DMG; use a universal build only if it does not complicate the native SQLite module.
- Windows: prepare shared adapter/path abstractions from day one, but enable the installer target in the second phase.

This is an exploratory packaging target, not a public-release promise. The
official current release policy is in
[`../docs/platform-packaging-and-release.md`](../docs/platform-packaging-and-release.md).

### Build rule

Build every OS artifact on the appropriate GitHub-hosted runner or a verified reproducible CI environment. Do not promise cross-building Windows/macOS from a Fedora laptop.

## Required pre-implementation spike

1. A minimal Electron package starts on Fedora, Ubuntu, and macOS.
2. The SQLite native binding works from the packaged app, not only from the dev server.
3. AppImage/RPM/DEB/DMG artifacts install or start on clean test machines.
4. App-data and source discovery handle spaces, Unicode paths, and symlinks.
5. The renderer cannot invoke arbitrary paths or shell commands.
6. A seeded old database migrates to the new version without losing usage events.

If Tauri performs better in this spike, change the decision before building the adapter layer, not afterwards.

## Platform references

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri distribution](https://v2.tauri.app/distribute/)
- [Tauri AppImage limitations](https://v2.tauri.app/distribute/appimage/)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-updater API](https://www.electron.build/docs/api/electron-updater/)
- [electron-builder AppImage updates](https://www.electron.build/appimage/)
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron Tray](https://www.electronjs.org/docs/latest/api/tray)
