Status: Implemented storage/privacy slice; remaining portability proposed

Audience: users, privacy reviewers, contributors implementing storage, and maintainers responsible for migrations

Source of truth: this document for data collection, storage, privacy, export/import, and migration rules; unresolved choices are tracked in ../ideas/00-open-questions.md

Last reviewed: 2026-08-13

# TokenStats data, privacy, and portability

TokenStats is proposed as a local-first application. Usage records are the
primary product data; cost is derived data and must carry an explicit confidence
and provenance trail. The application should work offline for local scanning,
dashboard use, and logical import/export.

The implemented Fedora slice has a local SQLite database for sources, cursors,
scan runs, and usage events, but no portability/export implementation yet.
Schema version 2 stores bounded model identifiers alongside token metadata,
schema version 3 completes the compatible storage transition, schema version 4
adds a non-content inclusion flag, and schema version 5 stores non-content OTel
file metadata. Schema version 6 adds only a non-content provider-migration
ledger; the registered `claude-file-identifiers@1` migration converts any
legacy Claude file references to opaque IDs. Claude imports
assistant-message usage only and stores no content or project/file path. The
`codex-jsonl-v3` migration path resets only Codex cursors, rescans read-only
source records, and fills missing model metadata without changing event IDs or
counting duplicate rows as new imports. Copilot reconciles each persisted
session/model to its latest shutdown snapshot rather than summing snapshots;
while a CLI session is active, it can use the persisted assistant-message
output-token total with input/cache fields unknown. When the user opts into the
Copilot CLI OTel file exporter, TokenStats reads only complete `chat` span
metadata and token attributes, then suppresses the matching session-state
fallback only after aggregate token equality. Missing or rotated OTel files
retain their historical rows while resetting file tracking and re-evaluating
the fallback. OTel prompt/response/tool/path attributes are ignored even if
the exporter is configured to capture content.
Application data lives under Electron `userData`; together with current-user
source roots, this isolates data per OS user. The implemented Settings reset
creates a verified SQLite backup plus non-content metadata under
`userData/backups/`, clears imported data/cursors/scan history transactionally,
and re-runs the normal local scan. It never modifies source logs. Full
portability/export behavior still requires additional implementation and tests.

## Update connectivity and privacy

When TokenStats is running as a packaged Linux AppImage and automatic checks are
enabled, the main process makes an HTTPS request to the configured GitHub
Releases feed at startup when that option is enabled and then at the selected
1, 6, 12, or 24-hour interval to check the Stable version. A user can also
start a manual check from Settings while automatic checks are disabled. The
request is part of the updater protocol and may expose normal network metadata
such as the requesting IP
address, user agent, operating system/architecture, current app version, and
the requested repository URL to GitHub or its delivery infrastructure. TokenStats
does not send source-log paths, usage records, prompts, responses, source code,
credentials, or local database contents as part of the check. The update
artifact is downloaded only after the user clicks the visible update action.

Local scanning and dashboard use remain usable without the update request; a
failed check is surfaced as update state rather than a data-scan failure. RPM
installs and the current macOS ZIP validation artifact do not use this updater
path.

## Data collected from local sources

The default ingestion boundary is limited to information needed to count and
group usage. Each OS user has isolated application data and source discovery;
TokenStats must not scan other OS users' profiles by default:

| Category | Proposed data | Default handling |
| --- | --- | --- |
| Usage facts | Input, output, cached input, cache write, reasoning, total tokens, observed timestamp, and source-provided cost when available. | Store as canonical event fields when the source exposes them. Keep absent values unknown. |
| Grouping | Harness, provider, model, optional model version, session identity, and a project label when available without content ingestion. | Store only the minimum needed for breakdowns; project-label privacy rules remain open. |
| Source state | Adapter identity, display label, source status, parser version, last successful scan, warnings, and cursor metadata. | Store for diagnostics and incremental scanning. |
| Provenance | Stable source identity, file identity, bounded offset/line, normalized-event hash, and import/parser versions. | Store so an event can be audited without retaining the raw record. |
| Pricing | Versioned rate snapshot, source, effective date, currency, and checksum used for an estimate. | Store with the derived cost explanation. |
| User settings | Portable alert rules, selected display settings, timezone, and explicit export/import preferences. | Export only settings that are safe and meaningful on another machine. |

The application should not silently broaden this boundary when a parser sees
additional fields. A parser may use a field transiently to derive a canonical
fact, but the field should remain out of persistent storage unless the data
model and privacy documentation are updated.

## Data that must not be collected by default

The database and normal exports must exclude:

- prompts and responses;
- source code, diffs, file contents, and complete working-directory snapshots;
- API keys, OAuth tokens, cookies, credentials, or provider secrets;
- complete raw logs or raw session payloads;
- arbitrary environment variables;
- cloud account identifiers or remote billing data;
- notification secrets or OS-specific credential material.

Raw material may exist temporarily in process memory while parsing, but it must
not be logged, included in error messages, placed in the database, or copied
into normal exports. Redacted fixtures for parser tests belong in a separate
development-only fixture area, not in user data.

## Privacy-sensitive metadata

Even metadata can be identifying. Project names, usernames embedded in paths,
repository names, model names, timestamps, and source hashes can reveal work
patterns. The current proposal is:

- show full source paths only in an authenticated local diagnostics surface;
- omit or redact full paths in `.tokenstats`, CSV, and JSON exports by default;
- allow an explicit path-inclusion choice only after showing the privacy
  consequence;
- use stable internal source identities and hashes for deduplication without
  requiring a full path in every exported record;
- never claim that a hash is anonymous when an attacker can compare it with a
  known input;
- document project-label handling before implementation if labels can include
  repository or client names.

The exact path and project-label policy is open in [Q-011](../ideas/00-open-questions.md)
and [Q-012](../ideas/00-open-questions.md).

## Proposed SQLite model

SQLite is the proposed local database because it supports a portable file,
transactions, indexes, and no server dependency. The main process owns the
connection and all SQL access.

### `sources`

One discovered or manually selected source, including adapter ID, display name,
canonical location or location hash, source status, last scan time, parser
version, cursor metadata, and diagnostic summary.

### `sessions`

A normalized session when the source supplies a stable identity. Fields may
include harness, external session ID, project label, start/end times, and
provenance. Sessions are optional; events must remain useful without them.

### `usage_events`

An append-oriented canonical fact with:

- stable event ID or deterministic deduplication fingerprint;
- source and optional session relationships;
- observed timestamp in UTC;
- harness, provider, model, and optional model version;
- input, output, cached input, cache write, reasoning, and total token values;
- cost amount/currency only when available;
- `cost_kind`: `observed`, `estimated`, or `unknown`;
- `confidence`: `exact`, `partial`, `inferred`, or `unknown`;
- adapter/parser version and bounded provenance metadata.

Canonical usage facts are append-oriented. The first scan imports all safely
available supported history, and retained history remains cumulative until the
user explicitly deletes it. Disabling or forgetting a source must not silently
delete its retained history. Exact deletion UX remains open. Statistics and
rollups are derived and rebuildable from this history. Whether a harness emits
raw deltas or cumulative snapshots remains an adapter-normalization question
to validate from fixtures.

### `pricing_snapshots`

A versioned table containing effective date, input/output/cache rates,
currency, source reference, and checksum. A cost estimate must point to the
snapshot used to derive it. A changed public price must not silently rewrite
historical estimates.

### Alerts, imports, migrations, and rollups

`alert_rules` stores period, metric, personal-budget amount, thresholds, scope, timezone, and
enabled state. `alert_deliveries` stores the period key, threshold, delivery
time, observed usage snapshot, and status; a unique rule/period/threshold key
prevents repeated notifications.

`imports` and `schema_migrations` provide an audit trail. Daily rollups are
derived caches and must be rebuildable from `usage_events`.

## Provenance and deduplication

Every canonical event needs enough provenance to explain where it came from
without retaining the source payload. The preferred identity inputs are:

- stable source identity;
- file identity that survives or explains rotation;
- bounded byte offset or line when available;
- parser and format version;
- normalized event fields needed to distinguish duplicates.

If a source supplies a stable event ID, use it with source identity. Otherwise,
derive a deterministic fingerprint from the normalized event and source
context. A rotated or mirrored file may present the same fact twice; the
fingerprint should prevent a second insert while the audit trail can record the
duplicate observation.

Import and scan operations must be idempotent. If two records claim the same
identity but differ in meaningful fields, do not silently overwrite local
history. Preserve a conflict record and apply an explicit, documented rule
only after review.

## Observed cost, estimated cost, and unknown cost

Cost has three independent concerns:

1. **Availability** — whether the source exposes a usable cost at all.
2. **Kind** — `observed` when the source provides a cost fact, `estimated` when
   TokenStats calculates it, or `unknown` when neither is defensible.
3. **Confidence** — how complete or exact the underlying usage and pricing
   fields are.

The dashboard, alerts, exports, and notifications must carry this distinction.
Subscription usage without a defensible API equivalent remains `unknown`; it
must not be converted into a pseudo-bill merely because a model price exists.

## Pricing snapshots

Pricing is a versioned, explicit input rather than an untracked live lookup.
The accepted version 1 catalog and schema live in `../pricing/`; the current
runtime bundles that catalog and calculates query-time Codex and complete
Copilot estimates without adding derived cost columns to `usage_events`.
Dashboard responses include the matching snapshot metadata and event coverage.
A snapshot includes:

- provider and model identifiers;
- input, output, cached-input, cache-write, or other supported rates;
- currency and unit basis;
- effective date and retrieval date;
- public source reference;
- an immutable snapshot ID.

The runtime should not use an AI connector to search pricing pages. That would
introduce network dependence, nondeterministic interpretation, and a risk of
wrong rates. Offline import must not depend on fetching current pricing. A
future explicit, non-AI refresh may prepare a new snapshot from official
provider sources, but a user or maintainer must review it before use and
historical events retain the snapshot that explains their derived estimate.

Keep this pricing catalog as versioned data rather than hard-coding rates in
application code. It can be reviewed, checksummed, updated before a release,
and carried forward as an auditable input without requiring a code change for
every price revision. Provider-specific semantics for Claude Code, Grok, and
other sources remain unknown until reviewed snapshots are added; GitHub Copilot
has a reviewed provider-reference snapshot, while unsupported Copilot surfaces
remain unknown.

Snapshot maintenance links to the official pricing sources for the supported
providers, for example [OpenAI API pricing](https://developers.openai.com/api/docs/pricing),
[Anthropic pricing](https://www.anthropic.com/pricing), and [GitHub Copilot
plans](https://github.com/features/copilot/plans). These links are source
references, not a promise that every plan or Copilot surface exposes a directly
comparable API price. The snapshot must record the exact source and retrieval
date used by the maintainer.

## Canonical `.tokenstats` archive

The preferred transfer format is a versioned logical ZIP archive rather than a
raw active database file:

```text
manifest.json       # format version, app version, export time, timezone, counts
events.jsonl        # canonical usage events, without prompt/response content
sessions.jsonl      # optional stable session identities
sources.json        # adapter and display metadata; paths optional/redacted
pricing.json        # snapshots used to explain estimates
settings.json       # portable settings only; no secrets
checksums.txt       # SHA-256 for every archive member
```

An optional `snapshot.sqlite` may be provided for advanced backup, but the
logical archive is the canonical interchange format so it can survive internal
schema changes. The archive must declare its format version, counts, and
whether paths or other sensitive metadata were included.

## CSV and JSON export

CSV is for summaries that a user can inspect in spreadsheet tools: daily,
model, or harness totals with explicit units, currency, cost kind, confidence,
timezone, and source-age caveats. JSON is for integrations and should expose
the canonical event or summary schema with a version field.

Neither format should include full paths by default. Any export that includes
more sensitive metadata must require an explicit user choice and state what is
included. Raw-log export is not part of the normal MVP flow; if a future
diagnostic export needs it, it must be a separate, clearly confirmed action
with redaction and retention warnings.

## Import behavior

Import should be a reviewable, idempotent operation:

1. validate archive format, checksums, and member limits before reading data;
2. show counts of new records, duplicates, conflicts, unknown fields, and
   unavailable source paths;
3. map the archive format to the current schema without trusting the original
   machine's path or database version;
4. insert new canonical events in a transaction;
5. preserve local events and never overwrite them silently;
6. record conflict and import provenance;
7. mark migrated/unavailable sources until a new local scan reconnects them;
8. rebuild or invalidate derived rollups safely;
9. backfill historical alert state silently by default, with an explicit option
   to notify about current-period crossings;
10. show a clear completion summary and retain the import audit record.

Schema version and parser version remain separate. An import from a newer
format must fail safely with an actionable message rather than partially
writing records.

## Backup and migration rules

The application must not treat a copy of an active SQLite file as a complete
backup when WAL sidecar files may contain committed data. Use SQLite backup or
snapshot behavior, or a logical export inside a safe transaction. See the
official [SQLite backup API](https://www.sqlite.org/backup.html) and
[SQLite WAL documentation](https://www.sqlite.org/wal.html).

Proposed rules:

- create and verify a recoverable backup before every schema migration that can
  alter schema or data;
- record the schema version and application version with the backup;
- run migrations in a transaction where SQLite and the migration permit it;
- validate event counts, indexes, and key invariants after migration;
- retain the prior database and backup until post-migration checks succeed;
- retain the latest three verified pre-migration backups per data profile after
  successful validation, while never deleting user-created exports;
- block the migration if the backup cannot be created or verified;
- never auto-downgrade the database schema;
- if migration fails, stop before ingestion and offer recovery using the prior
  database or export;
- do not delete a backup solely because an update process completed;
- test migration chains from the oldest supported schema and from a database
  containing duplicates, conflicts, and incomplete source states.

The user-facing backup location and cleanup UX can still be refined, but the
three-backup safety default is the current project decision.

## Nightly and profile safety

Nightly builds use a separate application-data profile by default in the
proposal. This prevents a forward-only Nightly migration from moving the Stable
database to a schema that Stable cannot read. Before switching channels, offer
a `.tokenstats` export and identify the active profile.

Channel selection must not modify source files, harness settings, or API
credentials. Automatic downgrade of the database is forbidden; a user may
manually restore an exported archive into a compatible profile after review.

## Privacy risks and mitigations

| Risk | Mitigation in the proposal |
| --- | --- |
| Project names or paths reveal client/work context. | Minimize labels, show paths only in local diagnostics, redact exports by default, and make the policy explicit. |
| Parser errors leak raw records. | Structured errors, bounded metadata, no raw payload logging, and redacted fixtures. |
| Hashes are mistaken for anonymity. | Document that hashes are pseudonymous and may be reversible by comparison. |
| Estimated costs appear to be invoices. | Make observed/estimated/unknown and confidence visible in every surface. |
| Import overwrites local history. | Preview, idempotent fingerprints, conflict records, and explicit rules. |
| Migration or update loses data. | Transactional migration where possible, pre-migration backup, validation, and no downgrade. |
| Export contains secrets or content. | Member allowlist, redaction tests, checksums, and no raw content by default. |
| A future cloud feature expands collection silently. | Keep cloud sync out of scope and require a new privacy decision before adding it. |

## Open decisions

The following remain proposed until answered and recorded:

- required token categories and cost policy (Q-005–Q-007);
- accepted metadata, paths, and project labels (Q-011–Q-012);
- whether `.tokenstats` is the sole or shared canonical backup format (Q-013);
- import alert backfill behavior and exact retained-history deletion UX (Q-014
  and Q-025);

The current migration safety decisions are already recorded: verified backup
before every migration, blocking on backup failure, retention of the latest
three pre-migration backups per profile, no automatic schema downgrade, and a
separate Nightly profile (Q-015–Q-016). They should be treated as accepted
requirements for later implementation, even though this document remains
`Proposed` until code and verification evidence exist.
