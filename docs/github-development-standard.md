# Oz GitHub Development Standard v1

ProjectDeck is the pilot repository for this standard. Any rollout to another repository should follow a separate review of that repository's durable scopes and existing workflow.

## Workflow

GitHub Project Status is the source of truth for workflow state:

```text
Backlog → Ready → In Progress → Verify → Done
```

- **Backlog:** Captured work that is not currently planned for active implementation.
- **Ready:** Defined, prioritized, and ready to be started.
- **In Progress:** Currently being implemented.
- **Verify:** Implementation is complete and awaiting verification.
- **Done:** Completed and verified.

New Issues enter Backlog. Closing an Issue moves it to Done, while reopening an Issue moves it to Ready. Transitions from Ready through Verify remain deliberate, manual decisions.

### Default Project Views

- `Development` — Board grouped by Status.
- `All work` — Table for inspection and editing.
- Preferred card fields are Priority, Labels, and Assignees.
- Do not proliferate views without a demonstrated need.

## Priority

Priority is a GitHub Project single-select field, ordered from highest to lowest:

- **P0 — Critical:** Production outage, data-loss or corruption risk, or another problem requiring immediate intervention.
- **P1 — High:** Important work that should be among the next items addressed.
- **P2 — Medium:** Normal planned development work and the default priority.
- **P3 — Low:** Nice-to-have work or something that can reasonably wait.

## Type labels

Use at most one primary type label per Issue:

- `bug`
- `feature`
- `enhancement`
- `chore`
- `documentation`

## Meta labels

- `duplicate`
- `invalid`
- `wontfix`

## Scope labels

Scope labels identify durable, repository-specific technical or product surfaces. Multiple scopes may apply to one Issue. ProjectDeck begins with `frontend`, `backend`, `database`, `github`, and `railway`; other repositories should define only the scopes that genuinely fit their architecture.

## Issue templates

The standard Issue Forms are:

- Bug
- Feature
- Enhancement
- Chore

Blank Issues are disabled. Documentation work uses the canonical `documentation` label and does not require a dedicated form in v1.

## Release policy

Released versions use Semantic Versioning with a leading `v`:

- `vMAJOR.MINOR.PATCH`
- `vMAJOR.MINOR.PATCH-alpha.N`
- `vMAJOR.MINOR.PATCH-beta.N`

A GitHub Release represents a meaningful published version and is authoritative for the released version. A Git tag by itself is not a published release. Generated release notes group changes by the canonical type labels and exclude `duplicate`, `invalid`, and `wontfix` items.

## Core rules

- Status lives in GitHub Project fields, never labels.
- Priority lives in GitHub Project fields, never labels.
- Type lives in labels.
- Scope lives in labels.
- Use at most one primary type label per Issue.
- Multiple scope labels may apply.
- Project-specific operational workflows remain project-specific.

These conventions let ProjectDeck later interpret type, scope, workflow status, priority, releases, recent commits, and Railway runtime state without conflating their separate meanings. That inference is not part of this pilot.
