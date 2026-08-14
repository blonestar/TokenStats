Status: Implemented Fedora slice; remaining direction proposed

Audience: contributors, product reviewers, architecture reviewers, and users evaluating project direction

Source of truth: accepted project documentation in /docs, with unresolved questions in /ideas

Last reviewed: 2026-08-13

# TokenStats documentation

This folder is the canonical home for official TokenStats documentation. A
narrow Fedora/Electron slice is implemented, including current-user Codex,
Claude Code, and experimental GitHub Copilot scanning, model-aware retained
usage, period views, a real Line/Bar/Pie dashboard with custom date ranges, and estimated API-equivalent
USD costs for Codex and complete Copilot snapshots with pricing date/coverage
metadata. The packaged Fedora
AppImage and multi-source scan have local runtime evidence: Codex usage was
imported, the current Claude root was found but yielded no usage events, and
the current Copilot CLI session-state root was found with active
output-token records. The implemented Copilot adapter also supports the
opt-in CLI OTel JSONL file and keeps session-state as a fallback. A controlled
live OTel smoke run passed on the current Fedora host; this remains
runtime-surface-specific; most
behavior described by these documents remains proposed rather than implemented.

The Fedora Electron slice now also implements close-to-tray behavior, a basic
tray menu with Show/Hide window and Exit, and an electron-builder RPM target
that registers a standard desktop launcher. These are local implementation
facts; clean-machine installation and broader platform support still require
separate evidence.

The packaged Linux AppImage slice now also checks the Stable GitHub feed at
startup and every six hours by default. Settings exposes automatic-check enablement,
startup-check behavior, and a 1/6/12/24-hour interval; a visible update action
appears near the version/author when a release is found. Downloads happen only
after the user clicks, followed by a separate install-and-restart action. RPM
and the current macOS ZIP are not covered by this updater path.

The implemented current-user source set is Codex, Claude Code, and experimental
GitHub Copilot on Fedora. Exact supported OS versions and later platforms remain
tracked in the open-question matrix. Linux GitHub CI, the tag-driven `v0.1.0`
release run, and native macOS arm64 workflow run `31606807111` passed; the
resulting GitHub Release is published with Linux and macOS arm64 artifacts plus
a combined checksum manifest. The macOS package is ad-hoc-signed and
unnotarized, so this is internal preview evidence, not clean-machine or
production distribution evidence.

The [GitHub Copilot OTel ingestion](copilot-otel.md) note documents the opt-in
file exporter, privacy allowlist, cursor behavior, and fallback reconciliation.

## Documentation structure

`/docs` contains project requirements, architecture boundaries, data and
privacy rules, packaging and release policy, versioning, and user-facing UI
behavior. `docs/decisions/` is reserved for accepted architecture or product
decisions when a separate decision record is useful; no decision records exist
yet.

`/ideas` is deliberately separate. It contains brainstorming, exploratory UX,
unresolved alternatives, and open questions. It is authoritative for what is
still undecided, but it is not evidence that a proposed feature exists.

`/README.md` is the public project homepage. `AGENTS.md` is repository and
agent guidance and must remain synchronized with the actual tree and workflow.

## Document status labels

Every official document starts with a status label:

- `Proposed` — planned direction that still needs decisions, spikes, or
  validation;
- `Accepted` — an explicit project decision has been recorded, with a link to
  the relevant idea or decision record;
- `Implemented` — repository evidence shows that the described behavior exists;
- `Verified` — implementation evidence has been exercised in the relevant
  runtime, CI, or supported platform environment;
- `Deprecated` — retained for history but no longer the current direction.

A document may contain planned behavior while its status is `Proposed`. The
words “should,” “proposed,” and “planned” are intentional until implementation
and verification evidence exists.

## Source-of-truth rules

- `/docs` is authoritative for accepted project documentation.
- `/ideas` is authoritative for unresolved brainstorming and open questions.
- Accepted decisions must link back to the relevant idea or decision record.
- Do not keep conflicting copies of one decision; update the authoritative
  document and link from related material.
- The root README links to both documentation areas and must remain accurate.
- When implementation begins, update the relevant `/docs` document in the same
  change when behavior, privacy, or workflow changes.
- Never mark a feature `Implemented` or `Verified` without repository, runtime,
  CI, or platform evidence.

## How a proposal becomes verified

1. Record the unresolved question or alternative in `/ideas`.
2. Make a decision and link it to the affected `/docs` document or a decision
   record.
3. Implement the decision in the repository with tests or other appropriate
   checks.
4. Verify the behavior in the relevant runtime, CI, packaged artifact, or
   supported platform environment.
5. Update the document status and evidence date. Keep the distinction between
   a local change, committed or pushed change, merged change, released
   artifact, and verified live behavior.

## Official documentation

- [Documentation index](README.md)
- [Product requirements](product-requirements.md)
- [Architecture overview](architecture-overview.md)
- [Data, privacy, and portability](data-privacy-and-portability.md)
- [API pricing catalog](api-pricing.md)
- [Platform, packaging, and release](platform-packaging-and-release.md)
- [Versioning and update channels](versioning-and-update-channels.md)
- [UI, window, tray, and alerts](ui-window-tray-alerts.md)

## Planning material

- [Open questions](../ideas/00-open-questions.md)
- [Ideas index](../ideas/README.md)
