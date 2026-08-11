# 08 — Alerts and background monitoring

> **Superseded terminology:** alerts represent a user-defined personal usage
> budget or threshold, never a provider quota or billing-plan limit. Exact
> periods, refresh behavior, and threshold configuration remain open in
> [`00-open-questions.md`](00-open-questions.md).

## Product decision

Yes, usage alerts are worth adding. They turn TokenStats from a report that the user opens occasionally into a quiet monitor that can warn before consumption becomes surprising.

The feature must be described as **best-effort personal-budget monitoring**,
not provider-quota enforcement. TokenStats cannot stop a harness or provider
from consuming more tokens; it can only report what has been observed in local
source records.

## Recommended MVP

### Budget periods

- daily;
- weekly;
- monthly.

Use calendar periods in the user's selected timezone. Store timestamps in UTC, but calculate period boundaries using the configured display timezone. The first version should use Monday as the start of the week, with a later locale preference if needed.

### Metrics

Make observed tokens the default alert metric because they are more defensible than cost estimates. Support:

- total tokens across all enabled sources;
- estimated API-equivalent cost only when a pricing snapshot exists;
- per-harness or per-project scopes later, not in the first settings screen.

Cost alerts must say `estimated` and include the pricing snapshot/date. Subscription-plan usage without a reliable API equivalent should be unavailable for cost alerts rather than presented as a false exact number.

### Thresholds

Default thresholds:

- 80% — warning;
- 100% — budget reached;
- 120% — over budget.

Let the user enable/disable each threshold. Fire each threshold at most once per rule and period. If one scan jumps from 70% to 125%, send one concise notification that says the personal budget was exceeded and records which thresholds were crossed; do not create three noisy notifications at once.

### Notification content

Example:

```text
TokenStats — daily personal budget reached
Observed usage: 104M / 100M tokens (104%)
Last successful scan: 14:32
Data may lag by up to the refresh interval.

[View details]
```

Clicking the notification should open the relevant period in the dashboard. The notification history should remain visible in Settings so the user can understand what happened after returning from a meeting or focus session.

## Desktop behavior

### Tray mode

The app should create a tray/status item when background monitoring is enabled. The tray menu can show:

- `Open dashboard`;
- dynamic `Restore` or `Maximize` depending on the window state;
- `Minimize`;
- current daily usage and personal budget;
- alert state (`OK`, `warning`, `reached`, `over budget`);
- last scan time;
- `Refresh now`;
- `Settings`;
- `Check for updates`;
- `Pause monitoring`;
- `Exit TokenStats`.

The tray is a status surface, not a second dashboard. Keep it short and useful.

Closing the custom window hides it to the tray and keeps monitoring active. `Exit TokenStats` is the explicit action that stops the process and removes the tray icon. The tray menu should always provide a clear exit path.

### MVP tooltip decision

Use a fixed tooltip in the first version rather than adding a settings screen for choosing individual tooltip fields. A predictable tooltip is more valuable than early customization.

Suggested tooltip:

```text
TokenStats · Today 42.1M / 100M tokens · 42% · OK · scanned 14:32
```

The fixed tooltip should show:

- current daily observed tokens;
- daily quota and percentage when a daily quota is enabled;
- current alert state;
- last successful scan time.

Do not put estimated cost in the default tooltip. It can be ambiguous, can be unavailable, and makes the tooltip harder to scan.

Tray interactions:

- left click: open or focus the dashboard;
- right click: open the compact context menu;
- hover: show the fixed tooltip;
- icon state: use a neutral, warning, reached, or over-quota state, with a non-color label available in the menu for accessibility.

Later, add a small `Tooltip content` setting with a few tested presets (`Tokens`, `Cost`, `Last scan`) rather than an arbitrary collection of fields.

### Startup settings

Use separate settings so users understand the behavior:

- `Start automatically` — launch TokenStats when the user logs in;
- `Start minimized to tray` — launch without opening the main window;
- `Keep running when the window is closed` — close the window but leave monitoring active.

Do not make `Start automatically` silently imply that the window is hidden. The first-run default can be off, with an onboarding suggestion after the user enables an alert.

### Native notifications

Use OS-native notifications rather than a custom “popup next to the clock.” This follows the user's system notification settings and behaves naturally across desktop environments. Notification support still needs platform-specific testing:

- Linux relies on the desktop notification service and may vary by desktop environment;
- macOS notification delivery requires a signed application in current Electron behavior;
- Windows requires the packaged application identity/shortcut configuration for reliable toast behavior.

## Refresh and near-real-time monitoring

### MVP: one-minute reconciliation loop

The default should be:

- refresh automatically every 60 seconds while monitoring is active;
- provide `Refresh now` at all times;
- show `Last scan`, `New events`, `Skipped/failed sources`, and `Data may be delayed` state;
- pause or lengthen the interval when the machine is on battery or the user enables quiet hours, if this proves useful.

One minute is a good initial tradeoff: it is close enough for quota awareness without keeping parsers and the disk busy every few seconds.

### Later: event-driven source watching

Add filesystem watchers as an acceleration layer:

1. a source file change triggers a debounced scan;
2. the cursor-based parser ingests only new data;
3. alert evaluation runs after the transaction commits;
4. the one-minute scan reconciles missed watcher events, file rotation, sleep/resume, and app restarts.

This is better described as **near-real-time**. A harness may buffer usage, write in batches, rotate logs, or expose no usable local event until a session step finishes. The UI should never promise sub-second accuracy.

### Manual refresh behavior

`Refresh now` should:

- cancel or coalesce with an already running scan;
- show progress for slow sources;
- report per-source errors instead of failing the whole refresh;
- update dashboard, tray status, and alert evaluation from the same committed result;
- preserve the previous good data if a source is temporarily unavailable.

## Settings model

Each rule needs:

- enabled/disabled;
- period: daily, weekly, or monthly;
- metric: observed tokens or estimated cost;
- quota amount and unit;
- threshold list;
- scope: global in v1;
- timezone/period-boundary policy;
- quiet-hours and sound preference;
- last notification and current period status.

Global monitoring settings need:

- automatic refresh interval;
- start automatically;
- start minimized to tray;
- keep running when the window is closed;
- native notifications enabled;
- pause monitoring;
- notification-history retention.

## Data and correctness rules

- Evaluate alerts only after new usage events are committed.
- Use a unique `(rule_id, period_key, threshold)` delivery key to prevent duplicates.
- If a source fails, preserve the last good aggregate and mark freshness/coverage in the alert.
- A quota should not reset merely because the app was closed; period state is derived from stored events.
- Importing historical data may cross thresholds. Imports should default to silent backfill, with an explicit option to notify about the current period after import.
- Export/import must include alert rules, but not notification secrets or OS-specific startup state unless the user opts in.
- Alerts must never include prompt content, response content, or source code.

## Suggested implementation order

1. One global daily token rule.
2. 80%/100%/120% threshold evaluation and deduplication.
3. Native notification and click-through to the dashboard.
4. Tray icon with fixed tooltip, left-click open, and right-click menu.
5. Weekly/monthly rules.
6. Tray status and `Refresh now`.
7. One-minute background refresh.
8. `Start automatically` and `Start minimized`.
9. Event-driven watchers, configurable tooltip presets, and per-harness/per-project scopes.

## Acceptance criteria

- a daily quota notification appears once when the observed total crosses the configured threshold;
- repeated scans do not repeat the same period/threshold notification;
- a new period resets alert state without deleting history;
- the notification shows usage, quota, percentage, last scan time, and an actionable link;
- the tray tooltip shows the fixed MVP statistics without opening the main window;
- left-click opens/focuses the dashboard and right-click exposes refresh, alert, pause, and quit actions;
- closing the window can leave monitoring active when the setting is enabled;
- the app can start at login without opening the main window when both startup settings are enabled;
- `Refresh now` and the one-minute scan share the same ingest, deduplication, and alert-evaluation path;
- failed/stale sources are visible and do not silently produce a falsely precise quota state.

## Official Electron references

- [Electron Notification API](https://www.electronjs.org/docs/latest/api/notification)
- [Electron notification guide and platform considerations](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [Electron `app.setLoginItemSettings`](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows)
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray)
