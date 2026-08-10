# 06 — UI direction after the screenshot example

The screenshot is a useful signal that the product should have a dark, dense, analytical dashboard, but it should not be the final information model. The current example puts estimated cost too far in front and does not show whether sources are healthy or data is complete.

## Keep

- a dark, desktop-first visual language;
- a date-range control and quick 7/30/90-day choices;
- a chart with hover tooltips and metric switching;
- a breakdown table by model/harness;
- a compact, information-rich layout.

## Improve

### 1. Tokens as the primary fact

The first KPI should be `Observed tokens`, not a large dollar amount. The cost card should say, for example, `Estimated API-equivalent cost` and provide a tooltip with the pricing snapshot. For subscription or unknown models, show `No reliable cost estimate`.

### 2. Make source health visible

Add to the header:

- `Last scan` time;
- number of new events;
- source-health indicator;
- `2 sources need attention` when a parser or permission has a problem;
- a refresh button that does not hide errors.

### 3. Separate overview from breakdown

Suggested navigation:

- `Overview` — trends and key KPIs;
- `Sources` — detection, paths, permissions, and parser diagnostics;
- `Sessions` — drill down to a concrete session;
- `Models` — compare models and token mix;
- `Alerts` — quotas, thresholds, notification history, and quiet hours;
- `Settings` — refresh, privacy, pricing, export/import, startup behavior, and updates.

### 4. A chart that explains rather than decorates

Default chart: daily observed tokens, stacked as input/output/cache/reasoning. Toggle `Tokens / Estimated cost / Sessions`. In cost view, always show `observed` vs `estimated` in the legend. Do not draw data gaps as zero without an explanation.

### 5. Breakdown table

Columns:

`Harness | Model | Sessions | Input | Output | Cached | Reasoning | Est. cost | Confidence`

Add sorting, filtering, and drilldown. Do not show only percentage share and cost; the user must see the underlying quantities.

### 6. Onboarding and empty states

The first screen should not look like an empty chart. It should show:

- what was found;
- what was not found;
- which permissions are needed;
- `Scan now`, `Add source`, and `Import backup` actions.

## Alerts and background controls

The Settings/Alerts screen should make the monitoring contract explicit:

```text
Alerts
[x] Enable usage alerts

Daily quota       [ 100M ] [tokens v]   [x] Enabled
Weekly quota      [ 500M ] [tokens v]   [x] Enabled
Monthly quota     [ 2.0B ] [tokens v]   [x] Enabled

Notify at         [80%] [100%] [120%]
[x] Use native desktop notifications
[ ] Quiet hours             [22:00] — [08:00]

Startup
[x] Start automatically
[x] Start minimized to tray
[ ] Keep running when the window is closed

Refresh
Automatic refresh            [Every 1 minute v]
[ Refresh now ]              Last scan: 12:34:05
```

V1 should use one global quota across all enabled sources. Per-harness and per-project scopes are useful later, but they can make the first settings screen noisy and make alert behavior harder to explain.

Every notification should include the period, current amount, quota, threshold, last scan time, and a `View details` action. Clicking it opens the relevant dashboard period rather than only opening the application home screen.

## Update settings

Updates deserve a visible Settings section, not a hidden background behavior:

```text
Updates
Channel                 [Stable v]
[x] Check automatically
[ ] Download updates automatically (optional)

Current version         v0.1.0
Last checked            2026-08-10 14:35
Status                  Up to date

[Check now]
```

When an update is downloaded:

```text
Version v0.1.1 is ready
Fixes parser and alert reliability.

[Install and restart] [Later]
```

Do not silently restart the application. Nightly selection should show a warning and explain that nightly builds may require a separate data profile or an export before switching back to Stable.

## Visible update action

When a compatible update is available, show a prominent blue button in the main header, near Refresh and Settings:

```text
[Refresh]  [Update available — v0.1.1]  [Settings]
```

The button must include text and an accessible label; color alone is not the signal. Clicking it is explicit user consent to download and install that version.

Button states:

```text
Update available — v0.1.1
Downloading update… 37%
Verifying update…
Restarting to install…
Up to date
Update failed — Retry
```

The same update state should appear in the tray menu and Settings, but the main header is the primary action surface. Do not force the user to open Settings to update.

## Window shell

The application should not use the standard OS window frame or an in-window application menu. Use a custom title bar with:

- app identity and optional drag area;
- minimize;
- maximize/restore;
- close, which hides the window to the tray by default.

The shell should use a subtle rounded surface and controlled transparency, with an opaque inner content layer so text, charts, focus rings, and shadows remain crisp. If a platform compositor cannot render the desired transparency/rounded treatment reliably, fall back to an opaque rounded or rectangular surface without losing any window behavior.

Detailed shell and tray rules are in [10 — custom window shell and tray behavior](./10-window-shell-and-tray.md).

## Suggested layout

```text
[TokenStats] [Overview Sources Sessions Models Settings]       [7d 30d 90d] [Refresh]

[Observed tokens] [Input] [Output] [Cached] [Active days] [Est. cost + confidence]

[Tokens / Cost / Sessions chart ----------------------------] [Source health]

[Harness/model breakdown table ------------------------------]

[Data quality: gaps, unknown model, parser warnings, last scan]
```

## Visual rules

- do not use color as the only signal;
- use a secondary color for cost and consistent colors for token categories across charts/tables;
- format 1B/1M compactly, with the full value in the tooltip;
- always make currency, timezone, and pricing snapshot available in details;
- show alert state and scan freshness in the tray tooltip/menu;
- support keyboard navigation, high-DPI displays, and reduced motion from the beginning.
