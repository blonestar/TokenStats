# 03 — Database, data model, and export/import

## Should the application have its own database?

Yes. SQLite is a good fit for a local-first desktop application: one portable database, transactions, indexes by date/harness/model, and no server dependency.

Do not rely on copying an active `.db` file. Export must use SQLite backup/snapshot behavior or a logical export inside a transaction, because an active WAL database can have accompanying `-wal` and `-shm` files.

## Working data model

### `sources`

One discovered local source: adapter, display name, canonical location, status, last scan, parser version, and cursor metadata.

### `sessions`

A normalized session: harness, external session ID when available, project label, start/end time, and provenance.

### `usage_events`

An append-only fact:

- stable `event_id` and deduplication fingerprint;
- `source_id`, `session_id`, and adapter/parser version;
- observed timestamp in UTC;
- provider, harness, model, and optional model version;
- input, output, cached input, cache write, reasoning, and total tokens;
- cost amount/currency only when calculated;
- `cost_kind`: `observed`, `estimated`, or `unknown`;
- `confidence`: `exact`, `partial`, `inferred`, or `unknown`;
- provenance: source hash, file identity, offset/line, and limited metadata JSON.

### `pricing_snapshots`

A versioned price table with effective date, input/output/cache rates, source, and checksum. Costs are calculated against a stored snapshot, never against an unversioned live value.

### `alert_rules`, `alert_deliveries`, `imports`, `schema_migrations`, and `daily_rollups`

`alert_rules` stores the period (`daily`, `weekly`, `monthly`), metric (`tokens` or an estimated cost), scope, quota, threshold, timezone, enabled state, and notification preferences.

`alert_deliveries` stores the rule, period key, threshold, delivery time, observed usage snapshot, and delivery status. Its unique key prevents the same threshold from repeatedly notifying during one period.

Import history and migration metadata form an audit trail. Rollups are derived caches and can be rebuilt from append-only events.

## Portable format

The preferred format is a custom `.tokenstats` ZIP archive, not only a raw SQLite file:

```text
manifest.json       # format_version, app_version, export_time, timezone, counts
events.jsonl        # canonical usage events, without prompt/response content
sessions.jsonl      # optional, when sessions have a stable identity
sources.json        # adapter and display metadata, path optional
pricing.json        # snapshots that explain estimated costs
settings.json       # portable settings only, no secrets
checksums.txt       # SHA-256 for every member
```

Optionally provide `snapshot.sqlite` for advanced backup, but keep the logical archive as the canonical interchange format so it can survive an internal schema change.

## Import behavior

- Show new records, duplicates, conflicts, and unknown records before import.
- Make imports idempotent using the canonical event fingerprint.
- Never overwrite local events without an explicit choice.
- If the same fact differs, preserve a conflict record and choose the newer provenance version only through an explicit rule or verification.
- Do not assume the original local path is valid on the new machine; mark the source as `migrated/unavailable` until a new scan reconnects it.
- Keep schema version and parser version separate.

## User export formats

- `.tokenstats`: complete transfer between machines;
- CSV: daily, model, or harness summaries for Excel/Sheets;
- JSON: integration with other tools;
- raw-log export only as an advanced, explicitly confirmed option.

## Data that must stay out of the database

API keys, OAuth tokens, prompts, responses, source code, and complete raw sessions. If parser debugging needs raw material, keep redacted fixtures separate from user data.
