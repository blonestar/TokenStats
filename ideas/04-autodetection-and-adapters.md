# 04 — Autodetection and adapters

## Discovery principle

Do not scan the entire home directory. Discovery should be fast, predictable, and explainable:

1. known OS app-data/configuration directories;
2. known environment variables;
3. executable/config presence on `PATH`;
4. a small file/directory probe;
5. a custom folder or advanced scan only when requested by the user.

The result is not only `found/not found`, but one of:

- `found and parseable`;
- `found but unsupported format`;
- `found but permission denied`;
- `not found`;
- `disabled by user`;
- `stale/no new data`.

## Adapter contract

Each adapter should conceptually implement:

```ts
type HarnessAdapter = {
  id: string;
  label: string;
  discover(ctx: DiscoveryContext): Promise<DiscoveryCandidate[]>;
  probe(candidate: DiscoveryCandidate): Promise<ProbeResult>;
  ingest(candidate: Source, cursor: Cursor): AsyncIterable<CanonicalUsageEvent>;
  diagnose(source: Source): Promise<DiagnosticReport>;
};
```

An adapter must not write directly to SQLite. It produces canonical events; the central ingestion layer handles deduplication, transactions, cursors, and audit history.

## Incremental scanning

- A watcher signals that a source changed, but periodic rescanning remains the fallback.
- The parser reads from the cursor; an incomplete final JSONL line is retried on the next scan.
- A rotated or renamed file gets a new file identity, while the same event fingerprint prevents duplicates.
- The cursor includes the parser version; a parser change can trigger a controlled reparse.
- Scans must be cancellable and pauseable for large logs.
- Sleep/resume and application restart trigger a reconciliation scan.

## Candidate v1 adapters

1. Codex local session/usage records.
2. Copilot local usage/session records.
3. Claude Code local session/usage records.
4. OpenCode local usage/session records as a follow-on candidate.

These are adapter priorities, not confirmed paths. Each requires an anonymized
fixture pack and a live read-only probe on the supported platforms before
implementation is committed. The official current scope is in
[`../docs/product-requirements.md`](../docs/product-requirements.md).

## Unavoidable edge cases

- an event has no model or no cost;
- a provider changes a model name;
- cached input appears without regular input;
- reasoning is included in output or exposed as a separate field;
- timestamps use different time zones or formats;
- a log is large, compressed, or partially corrupted;
- the user moves the home directory or imports an archive from another machine;
- the same event appears in multiple mirror/source files.

## Manual fallback for later consideration

The Source screen may later allow `Add folder/file` for a known adapter. This
is not a v0.1 requirement: autodetection and explicit source-health states come
first. If the option is added, the parser still has to say what it recognized
and what it ignored.
