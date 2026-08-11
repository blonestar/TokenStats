# GitHub Copilot OTel ingestion

Status: Implemented adapter, fixture coverage, and a controlled live CLI smoke check on the current Fedora host

Audience: TokenStats users and contributors validating local Copilot usage collection

TokenStats can read the GitHub Copilot CLI's optional OpenTelemetry file export. This is the source that can expose input, output, cache, and reasoning token metadata while a CLI session is still active.

## Enable the local exporter

Launch Copilot with a private local JSONL path and content capture disabled:

```bash
COPILOT_OTEL_FILE_EXPORTER_PATH=~/.copilot/otel/tokenstats.jsonl \
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=false \
copilot
```

TokenStats also accepts an absolute `COPILOT_OTEL_FILE_EXPORTER_PATH` override. If no override is present, it checks `<copilot-home>/otel/tokenstats.jsonl`; the file is opt-in because Copilot OTel is disabled by default.

The exporter configuration is a property of the Copilot process. TokenStats cannot retroactively add OTel records to a Copilot session that was started without the exporter.

## What TokenStats imports

The adapter accepts only complete OTel `chat` spans and an allowlist of metadata:

- request/response model;
- conversation/session and turn identifiers;
- span completion timestamp;
- input, output, cache-read, cache-creation, and reasoning token counts.

It ignores metrics, agent-level aggregate spans, incomplete final JSONL lines, and arbitrary attributes. Prompt/response content, tool arguments/results, repository names, paths, and raw provider payloads are never stored. This remains true even if a user has enabled content capture in the Copilot exporter.

The OTel cursor and non-content file metadata are kept under the stable internal file identity `otel/tokenstats.jsonl`; raw JSONL content is never hashed or stored. File changes trigger a safe reparse from the beginning, while stable event IDs prevent duplicate rows. A complete OTel span must include a known conversation ID. TokenStats retains OTel and session-state provenance rows separately and switches away from a matching fallback only after the aggregate input/output/known category values agree; this prevents a partial OTel turn from deleting or hiding a complete shutdown snapshot. Repeated scans re-apply that reconciliation. Missing, truncated, or rotated files reset only OTel tracking and retain historical rows; symlinked paths are skipped. A present file with no currently selected complete chat spans is reported as `otel file present`, while selected usable data is reported as `otel enabled`.

OTel `total_tokens` is normalized as input plus output. Cache-read, cache-creation,
and reasoning fields remain separately reported categories and are not added a
second time to the total.

## Cost semantics

Complete OTel token fields can receive the existing GitHub Copilot provider-reference API-equivalent estimate. This is a derived estimate from the reviewed pricing snapshot, not a Copilot subscription invoice. Missing token fields remain `Incomplete token data` even when the model has a price.

See GitHub's [Copilot CLI monitoring documentation](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) for the exporter contract and content-capture setting.
