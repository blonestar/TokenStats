Status: Proposed

Audience: users, UX reviewers, accessibility reviewers, and contributors implementing the desktop shell

Source of truth: this document for dashboard, window, tray, alert, and update interaction requirements; unresolved choices are tracked in ../ideas/00-open-questions.md

Last reviewed: 2026-08-12

# TokenStats UI, window, tray, and alerts

This document describes both the implemented Codex dashboard slice and the
broader proposed desktop experience. The current screen has selected-period or
custom-calendar token totals, model-separated Chart.js Line/Bar/Pie trends, exact model totals,
token-category totals, source health, and a manual scan action. Custom window
chrome, tray items, alerts, notifications, and update UI remain proposed. The
current slice also includes a basic Settings view for the local database reset
and re-import flow.

## Dashboard information architecture

The proposed app is a dark, dense, analytical desktop utility, but information
clarity and data quality take priority over visual imitation. The main
navigation is:

- **Overview** — observed-token trends, token categories, active days, sessions,
  estimated-cost context, and source health;
- **Sources** — autodetection, selected-source state, permissions, parser
  diagnostics, source paths, scan age, and warnings;
- **Sessions** — concrete session drilldown when the source supplies a stable
  session identity;
- **Models** — harness/provider/model breakdown, token mix, and confidence;
- **Alerts** — personal budgets, thresholds, current periods, notification history, and
  quiet hours;
- **Settings** — privacy, refresh, export/import, startup, window/tray, pricing
  snapshot information, and updates.

The first-run and empty states should explain what was found, what was not
found, what permission or format issue exists, and what the user can do next.
The main actions are proposed as `Scan now`, `Add source` only when a later
manual-source decision enables it, and `Import backup`.

## Primary metric: observed tokens

The first KPI is **Observed tokens**, not a large dollar amount. The overview
should show the total for the selected date range and, when available, separate
input, output, cached input, cache write, reasoning, and total values.

The implemented chart shows observed tokens separated by model. It offers Line,
Bar, and Pie modes, hourly buckets for single-day ranges, daily buckets for
shorter ranges, and monthly buckets for longer ranges. A custom calendar control
selects an inclusive start/end date in the local timezone. Hovering or focusing
a row in the visible per-model total/share list keeps that model's chart color
and turns the other series or pie segments gray. It retains exact tooltip values.
Missing buckets inside the selected calendar range are shown as zero only after
the full retained source history has been queried. The summary and model list
show Codex or complete Copilot estimated API-equivalent cost with coverage and
pricing date; estimated-cost and session chart modes remain follow-on
proposals. A later
detailed breakdown should expose:

```text
Harness | Model | Sessions | Input | Output | Cached | Reasoning | Est. cost | Confidence
```

Compact values such as `42.1M` should have full values in the tooltip or detail
view. The selected date range, timezone, source freshness, and data coverage
must remain visible.

The implemented Electron window uses the committed TokenStats T-and-graph icon
for its Linux window and taskbar identity. Broader custom window chrome remains
proposed.

## Estimated-cost labeling

Cost is secondary derived data. Every cost surface must identify:

- `Observed` cost when a source directly supplies a cost fact;
- `Estimated API-equivalent cost` when TokenStats calculates it from a stored
  pricing snapshot;
- `Incomplete token data` with the matched pricing snapshot when a provider
  model is known but the current usage record does not contain all token fields;
- `Unknown` or `No reliable cost estimate` when the source or pricing data is
  insufficient or the model has no matching catalog entry.

Estimated values must expose their pricing snapshot date/source and confidence.
Subscription usage without a defensible API equivalent must remain unknown. The
default tray tooltip and alert metric should prefer observed tokens and should
not imply that an estimate is an invoice.

## Custom frameless window

Visual polish and an effective dashboard matter from the start. The current
window proposal is a custom shell rather than the standard OS
frame or an in-window File/Edit/View menu:

```text
[TokenStats logo/name] [drag area........................] [—] [□] [×]
```

Requirements:

- a clear draggable title-bar region;
- every interactive title-bar control marked as non-draggable;
- accessible labels for Minimize, Maximize, Restore, and Close;
- visible focus rings and keyboard activation;
- no important content placed in a transparent edge area;
- platform-appropriate keyboard access to Settings, Refresh, Update, and Exit.

The custom shell is a visual and interaction proposal, not a dependency for
the core data model. A packaging spike must validate it on Fedora, Ubuntu, and
macOS before the behavior is treated as supported.

## Rounded corners and transparency fallback

Use a restrained visual treatment:

- transparent outer window only where the platform compositor renders it
  correctly;
- opaque inner application surface for text, charts, tables, focus rings, and
  dialogs;
- subtle border and shadow;
- small radius, approximately 10–16 px, subject to visual testing;
- respect reduced-transparency and accessibility preferences where available.

If rounded/translucent rendering is unreliable, fall back to an opaque rounded
or rectangular surface without losing custom controls, tray behavior, keyboard
navigation, or data readability. Transparency is never a functional
requirement.

## Window controls and close behavior

- `Minimize` minimizes the window normally.
- `Maximize` maximizes the window.
- `Restore` returns to the last non-maximized bounds.
- `Close` hides the window to the tray when background monitoring is enabled.

The close label should make the behavior explicit, for example:
`Close window and keep TokenStats running in the tray`.

`Exit TokenStats` is a separate, unambiguous action. It stops monitoring,
removes the tray item, and terminates the process. Closing the window must not
look like a full exit.

The app should persist only useful window state: last non-maximized bounds,
maximized/restored state, selected display where supported, and whether it was
launched into the tray. Bounds must be validated at startup so a disconnected
monitor cannot leave the window entirely off-screen.

## Tray tooltip

The fixed v0.1 tooltip proposal is:

```text
TokenStats · Today 42.1M / 100M tokens · 42% · OK · scanned 14:32
```

It should show:

- current daily observed tokens;
- the daily personal budget and percentage when enabled;
- current alert state;
- last successful scan time.

Do not put estimated cost in the default tooltip. It can be unavailable,
ambiguous, and harder to scan. Later versions may add tested presets, but not an
arbitrary field picker in the first release.

## Tray interaction and menu

The tray item is a compact status surface, not a second dashboard. Proposed
behavior:

- left click: open or focus the dashboard;
- alternate/double activation: follow the platform convention where required;
- right click: open the context menu;
- hover: show the fixed tooltip;
- icon state: neutral, warning, reached, or over-budget, with text equivalents
  in the menu so color is not the only signal.

The proposed right-click menu is:

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

`Restore / Maximize` is dynamic. Linux tray activation is not identical across
desktop environments, so the context menu must always provide a reliable way
to open the dashboard and exit. See the official [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray).

## Startup behavior

Use separate settings so users understand the consequences:

- `Start automatically` — launch TokenStats at login;
- `Start minimized to tray` — launch without opening the main window;
- `Keep running when the window is closed` — keep background monitoring active
  after Close.

The proposed defaults are automatic startup off, minimized startup on when
automatic startup is enabled, and close-to-tray available when monitoring is
enabled. Enabling automatic startup must not silently imply that the window is
hidden. A first-run explanation is appropriate after a user enables an alert.

## Automatic and manual refresh

The MVP refresh proposal is a 60-second reconciliation loop while monitoring is
active, with `Refresh now` always available.

The UI should show:

- last successful scan;
- new event count;
- skipped, stale, or failed sources;
- `Data may be delayed` when freshness or coverage is insufficient;
- progress for slow sources;
- per-source errors instead of failing the entire refresh.

Manual and automatic refresh must coalesce with an already running scan and use
the same adapter, ingestion, transaction, deduplication, rollup, and alert
evaluation path. A source failure preserves the last good aggregate and marks
the result as stale or incomplete.

Filesystem watchers may later accelerate refreshes, but the one-minute scan
remains the reconciliation fallback for rotation, sleep/resume, application
restart, and missed watcher events. The UI must not promise sub-second
accuracy.

## Alerts

Alerts represent a user-defined personal usage budget or threshold. They are
informational, best-effort monitoring, not provider quota or billing-plan
enforcement. The
current proposal is:

- global daily, weekly, and monthly rules in the first usable release;
- observed tokens as the default metric;
- estimated cost only where a stored pricing snapshot and defensible token
  semantics exist, with explicit labeling; cost alerts remain follow-on work;
- 80% warning, 100% reached, and 120% over-budget thresholds;
- configurable threshold enable/disable;
- one delivery per rule, period, and threshold;
- a jump across multiple thresholds summarized without noisy duplicates;
- period boundaries in the configured display timezone;
- Monday as the proposed first day of the week, pending the locale decision;
- historical imports silent by default, with an explicit current-period option.

An alert must include the period, current amount, personal budget, threshold, last
successful scan, and data-delay caveat. It should provide `View details` and
open the relevant dashboard period rather than only opening the home screen.

## Native notifications

Use OS-native notifications rather than a custom popup next to the clock. A
proposed notification is:

```text
TokenStats — daily personal budget reached
Observed usage: 104M / 100M tokens (104%)
Last successful scan: 14:32
Data may lag by up to the refresh interval.

[View details]
```

The app should preserve notification history in Settings without storing
prompt, response, or source-code content. Linux notification behavior can vary
by desktop environment; macOS and Windows packaged identity/signing may affect
reliability. These are platform validation requirements, not current support
claims. See the official [Electron Notification API](https://www.electronjs.org/docs/latest/api/notification)
and [notification guide](https://www.electronjs.org/docs/latest/tutorial/notifications).

## Visible update button

When a compatible update is available, show a prominent text button near
Refresh and Settings:

```text
[Refresh]  [Update available — v0.1.1]  [Settings]
```

The button must:

- identify the version and channel;
- expose release notes and artifact size nearby;
- use text and an accessible label, not color alone;
- require an explicit user action to begin download;
- show downloading, verifying, ready-to-install, restarting, and failed states;
- never silently restart the app.

The same update state belongs in Settings and the tray menu. Stable and Nightly
are the only required channels; `Check now` is a user action, not a third
channel. `v0.1.x` remains private/internal until the explicit `v0.2.0`
readiness decision.

## Accessibility requirements

The custom shell and dense dashboard must support:

- keyboard navigation and activation for every action;
- visible, non-color-only focus indicators;
- semantic headings, labels, table headers, and status announcements;
- screen-reader names for custom window and tray-related controls;
- high-DPI scaling and readable minimum text sizes;
- reduced motion and reduced transparency preferences where available;
- chart summaries and table alternatives for users who cannot use a visual chart;
- explicit units, currency, timezone, confidence, and data-age labels;
- alert states represented by text, icon, and status semantics rather than color
  alone.

Accessibility is part of the acceptance bar for the custom window, not a later
polish task.

## Open UI decisions

The remaining UI questions are concentrated in [Q-009](../ideas/00-open-questions.md)
(whether to add an advanced manual source path later), Q-017 (custom shell),
Q-018 (close/tray/startup defaults), Q-019 (alert and refresh scope), and Q-020
(weekly boundary). Until resolved and tested, the behavior above is proposed.
