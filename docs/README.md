Status: Proposed

Audience: contributors, product reviewers, architecture reviewers, and users evaluating project direction

Source of truth: accepted project documentation in /docs, with unresolved questions in /ideas

Last reviewed: 2026-08-10

# TokenStats documentation

This folder is the canonical home for official TokenStats documentation. The
current documents describe a proposed product and architecture; they do not
describe an implemented application.

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
- [Platform, packaging, and release](platform-packaging-and-release.md)
- [Versioning and update channels](versioning-and-update-channels.md)
- [UI, window, tray, and alerts](ui-window-tray-alerts.md)

## Planning material

- [Open questions](../ideas/00-open-questions.md)
- [Ideas index](../ideas/README.md)
