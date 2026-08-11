# 10 — Custom window shell and tray behavior

> **Superseded decision:** the custom frameless/translucent shell is no longer
> decided. Visual polish matters from the first slice, but this shell remains
> an open option and must not block data correctness. See
> [`00-open-questions.md`](00-open-questions.md) Q-017.

## Earlier product proposal

This note previously proposed a custom desktop shell rather than the standard
OS window frame and in-window menu bar. It is retained as a design option, not
an accepted requirement.

The shell should feel like a focused utility:

- subtle rounded corners;
- controlled transparency with a crisp opaque content surface;
- custom minimize, maximize/restore, and close controls;
- no standard application menu bar inside the window;
- a tray icon that keeps the monitor available when the window is hidden.

## Window construction

The Electron window is conceptually frameless and owns its title bar in the renderer. The title bar needs a clear draggable region, while every interactive control must be marked as non-draggable.

```text
[TokenStats logo/name] [drag area........................] [—] [□] [×]
```

Controls:

- `Minimize`: minimize the window normally;
- `Maximize`: maximize the window;
- `Restore`: return to the previous size and position;
- `Close`: hide the window to the tray and keep monitoring active.

The close button should have an accessible label such as `Close window and keep TokenStats running in the tray`. A first-run hint can explain that `Exit TokenStats` is available from the tray menu.

## Rounded corners and transparency

Use a restrained visual treatment rather than a fully translucent window:

- transparent outer window only where the platform renders it correctly;
- opaque inner application surface for charts, tables, text, and focus rings;
- small radius, approximately 10–16 px, subject to visual testing;
- a subtle border and shadow to separate the app from the desktop;
- no important content placed in the transparent edge area;
- respect reduced-transparency/accessibility preferences where available.

Transparency and rounded corners are visual enhancements, not functional dependencies. On a compositor or platform where the combination renders poorly, fall back to an opaque surface while keeping the custom controls and tray behavior unchanged.

## Window menu policy

Do not add a conventional File/Edit/View menu bar to the application window. Put essential actions in:

- the custom title bar;
- the main application navigation;
- Settings;
- the tray context menu;
- keyboard shortcuts with visible help where appropriate.

The app should still preserve platform-appropriate accessibility and keyboard behavior. Removing the menu bar must not remove a way to reach Settings, Refresh, Update, or Exit.

## Tray icon policy

Create the tray icon when the application is running in background-monitoring mode. In the MVP, keep the tray icon visible whenever the app is running and close-to-tray is enabled; do not add a separate “hide tray icon” setting until the behavior is well understood.

### Hover

Use the fixed MVP tooltip defined in [08 — alerts and background monitoring](./08-alerts-and-background-monitoring.md):

```text
TokenStats · Today 42.1M / 100M tokens · 42% · OK · scanned 14:32
```

The tooltip should remain short. Custom tooltip field selection belongs to a later preset-based setting, not the first release.

### Click behavior

- left click: show/focus the main window;
- double-click or alternate activation: support the platform's tray convention if a Linux desktop does not treat a single click as activation;
- right click: show the context menu;
- update/alert state: reflected by an icon variant or badge, with text equivalents in the menu.

Linux tray activation is not identical across desktop environments, so the main behavior must also be available through the context menu.

### Right-click context menu

Recommended MVP order:

```text
TokenStats
Today: 42.1M / 100M tokens
Status: OK · scanned 14:32
----------------------------
Open dashboard
Restore / Maximize
Minimize
Refresh now
Alerts
Settings
Check for updates
Pause monitoring
----------------------------
Exit TokenStats
```

The `Restore / Maximize` item is dynamic: show `Restore` when the window is maximized and `Maximize` otherwise. Do not show both unless the platform menu convention makes the distinction clearer.

`Exit TokenStats` must be visually and semantically distinct from `Close`/`Hide`. It stops the background scan, removes the tray icon, and terminates the app process.

## Startup and close behavior

Recommended MVP defaults:

- `Start automatically`: off until the user enables it;
- `Start minimized to tray`: on when automatic startup is enabled;
- close button: hide to tray;
- tray `Exit`: explicit full quit;
- if monitoring is paused, show that state in the tray tooltip/menu and in Settings.

If the user tries to close while an import/export transaction is active, finish it or ask for confirmation instead of hiding in a state that looks complete but is still writing data.

## State persistence

Persist only useful window state:

- last non-maximized bounds;
- maximized/restored state;
- selected display when the OS supports it;
- whether the app was launched into the tray.

Validate saved bounds on every launch so the window cannot reopen entirely off-screen after a monitor is disconnected.

## Acceptance criteria

- no standard in-window menu bar is visible;
- the custom title bar supports drag, minimize, maximize/restore, and close-to-tray;
- the app remains active after the window is closed;
- the tray icon tooltip shows the fixed MVP statistics;
- right-click exposes Open, Restore/Maximize, Minimize, Refresh, Settings, Update, Pause, and Exit;
- `Exit TokenStats` fully terminates the app;
- rounded/transparency styling has an opaque fallback on Fedora, Ubuntu, and macOS;
- keyboard focus, screen readers, high-DPI scaling, and visible focus rings work with custom controls.

## Official Electron references

- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron BaseWindow window customization](https://www.electronjs.org/docs/latest/api/base-window)
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray)
- [Electron Tray Menu guide](https://www.electronjs.org/docs/latest/tutorial/tray)
- [Electron Menus](https://www.electronjs.org/docs/latest/tutorial/menus)
