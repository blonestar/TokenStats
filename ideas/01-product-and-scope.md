# 01 — Product and scope

## Product idea

One offline desktop application that gives the user a reliable view of AI coding-tool consumption without manually adding up local logs from multiple tools.

The value is concentrated in three areas:

1. discovering sources without complicated configuration;
2. providing one verifiable usage-data model;
3. preserving a portable historical dataset that can continue on another machine.

## First user flow

1. Install and launch the application.
2. Show discovered harnesses, detection status, and the latest available data date.
3. Let the user confirm which sources should be tracked.
4. Run the first scan and import usage facts without prompts or source code.
5. Show trends, breakdowns, and data-quality information.
6. Let the user refresh, pause a source, or export a portable backup.

## MVP metrics

- total observed tokens;
- input, output, cached input, and reasoning tokens when the source distinguishes them;
- active days, sessions, and usage-event count;
- breakdown by harness, provider, model, and project;
- estimated cost only when a pricing snapshot exists, with a confidence label;
- last successful scan, number of new events, and parser warnings;
- gaps or unknown periods when the source does not provide complete usage data.

## Monitoring and alerts

The application should also act as a lightweight usage monitor, not only as a historical dashboard:

- daily, weekly, and monthly token quotas;
- configurable warning thresholds such as 80%, 100%, and 120%;
- native desktop notifications when a threshold is crossed;
- a tray/background mode so monitoring can continue while the main window is closed;
- `Start automatically` and `Start minimized` settings;
- automatic refresh every 60 seconds in the MVP, plus an explicit `Refresh now` action;
- near-real-time file watching later, with the minute scan remaining the reconciliation fallback.

Alerts are informational and best-effort. They do not stop a harness or provider, and every alert should show the last successful scan time and data-coverage caveat.

## Candidate sources

Initial adapters can target Codex CLI, Claude Code, Gemini CLI, and OpenCode. Cursor, Cline/Roo, and other tools are candidates only after their local formats prove stable enough to support.

Path names and log formats must not be hardcoded into the UI. Every adapter needs fixtures covering real variations: file rotation, an incomplete final JSONL line, model changes, missing cache fields, and duplicate events.

## Privacy by default

- Do not store prompts, responses, source code, or complete raw logs in the database.
- Store only usage facts, grouping metadata, and provenance hashes/offsets.
- Show the full source path only in the Source diagnostics screen; make it optional in exports.
- Do not send data to the cloud in the MVP.
- If pricing refresh is ever added, make it explicit; local data import must work offline.

## Not in the MVP

- cloud accounts and multi-device synchronization;
- team dashboards;
- automatic provider billing API access;
- cost calculation for subscription plans that have no API equivalent;
- prompt-content or response-quality analysis;
- an external plugin marketplace.
