# Product definition

## Product vision

ProjectDeck is a beautiful, practical developer command center for an entire software-project portfolio.

It gives an individual developer one calm place to see their projects, understand where each stands, notice what needs attention, and continue useful work. It connects project-level meaning to the repositories, deployments, issues, releases, documents, and links that support it without trying to replace those systems.

Project resumption is important: ProjectDeck should reduce the effort required to return after an interruption. It is one capability within the broader command-center experience, not the product's identity or organizing metaphor.

## Core jobs

ProjectDeck should help the user:

- see every Planning, Development, Maintenance, Paused, Archived, or Unknown project clearly;
- understand the current state of a project in human terms;
- see the strongest current automatic Next action or an explicit manual override;
- see whether explicitly monitored operational resources are Healthy, Degraded, Down, Unknown, or Not monitored;
- see what needs attention without scanning every source;
- understand meaningful recent work rather than raw activity volume;
- inspect relevant releases, deployments, and issues;
- understand the components and repositories that make up one product;
- access important project resources quickly;
- return to useful work with minimal reconstruction.

## Product principles

### The project is primary

A Project represents a product or meaningful body of work. A repository is a component or resource associated with it, not a synonym for the Project. One Project may include a desktop application, website, services, multiple repositories, deployments, documentation, and external resources.

### Human meaning comes before source exhaust

The first view should explain where a project stands, what matters, and what is next. Raw commits, events, issue lists, and deployment logs remain available in their appropriate views but should not dominate orientation.

### “Next” is first-class, automatic by default, and manually overridable

The next action is core project information. ProjectDeck normally selects it deterministically from the resolved GitHub Project: open In Progress work first, then Verify, then Ready, with Priority used only within the same Status. Backlog, Done, closed Issues, and non-Issue items are never selected merely to fill the UI. A non-empty ProjectDeck-owned Next value is an explicit manual override and always wins until the user clears it.

When no eligible work exists, ProjectDeck says “No clear next action.” When GitHub Project evidence is unavailable, unresolved, ambiguous, nonstandard, or insufficient, it says that Next is unavailable rather than implying that no work exists. Multi-repository Products retain the selected Issue's repository or Component context.

### Phase, attention, and health stay separate

Project Phase describes the product lifecycle: Planning, Development, Maintenance, Paused, or Archived. ProjectDeck synthesizes Phase from deterministic repository implementation maturity, published GitHub Releases, and bounded file-level implementation activity. GitHub Project work-item Status and Priority do not determine Phase; they belong to automatic Next. Unknown is a deliberate automatic result when required repository or activity evidence is unavailable, partial, or contradictory. The user can explicitly override Phase; Paused and Archived require that user intent in v1 and are never inferred from inactivity.

Planning means connected repositories conclusively contain no meaningful implementation footprint. An unreleased product with an established implementation remains Development even when it has no recent commits. A released product is Development while meaningful implementation files are changing and Maintenance when bounded activity evidence is conclusively inactive. Tags and manifest versions do not establish released maturity; only a published GitHub Release does.

“Needs Attention” is a deterministic intervention layer above observed evidence, separate from Phase, Health, and Next. Manual Force Needs Attention remains an explicit override and always wins. Automatic v1 attention is limited to required operational resources that are Down, structured failed-latest-production evidence even when older production remains available, explicit monitoring configuration/reconnection failures, and open Issues with the canonical `bug` label, P0/P1 Priority, and Ready, In Progress, or Verify Status. Degraded alone does not imply Needs Attention: normal building, deploying, or queued work is not escalated. Backlog volume, inactivity, lifecycle Phase, ordinary feature work, and absence of Next are not attention signals.

Health is provider-agnostic. Railway and Vercel deployment observations, a bounded read-only PostgreSQL connectivity check, and an explicit HTTP/HTTPS health endpoint all normalize into the same resource evidence. Railway is connected once at provider level through read-only OAuth; authorized workspaces, projects, environments, services, and deployment state are discovered for the whole portfolio. Exact GitHub source identity can associate a production service automatically, while ambiguous resources require explicit mapping. Only enabled observations explicitly marked as affecting Project Health participate in the top-level result. No configured observation means Not monitored; configured monitoring whose state cannot be established means Unknown.

### Activity is not automatically progress

ProjectDeck should favor meaningful outcomes—such as a release, resolved issue, decision, rollback, or learned constraint—over activity counts. Failure and rollback may still be important project history.

### Source state is represented honestly

When relevant information is stale, unavailable, or only last known, the product should say so calmly and locally. Failure in one source must not make the whole project unusable.

Remote repository or deployment information must never imply knowledge of unobserved local changes. ProjectDeck should not claim a local workspace is clean, current, or synchronized unless it can actually observe that state.

### Augment systems of record

ProjectDeck should connect to existing tools and link back to them. It should not recreate GitHub, an issue tracker, a deployment console, or a second task-management system.

### Automation assists orientation

Automation should summarize, connect, and suggest. It should preserve user intent, expose important uncertainty when needed, and avoid turning the interface into a governance or confidence-analysis console.

## Explicit non-goals

ProjectDeck is not intended to:

- replace GitHub, GitLab, or a Git client;
- replace issue trackers or become another task manager;
- become Jira or a generic enterprise project-management suite;
- manage teams, capacity, time tracking, or organizational reporting in the MVP;
- autonomously run or prioritize a developer's portfolio;
- serve primarily as an AI situation-report or checkpoint engine;
- expose a complex semantic-claim, authority, freshness, or confidence-governance model;
- infer unobserved local-machine state;
- maximize engagement through notifications, streaks, or gamification.
