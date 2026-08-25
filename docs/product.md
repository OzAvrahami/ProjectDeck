# Product definition

## Product vision

ProjectDeck is a beautiful, practical developer command center for an entire software-project portfolio.

It gives an individual developer one calm place to see their projects, understand where each stands, notice what needs attention, and continue useful work. It connects project-level meaning to the repositories, deployments, issues, releases, documents, and links that support it without trying to replace those systems.

Project resumption is important: ProjectDeck should reduce the effort required to return after an interruption. It is one capability within the broader command-center experience, not the product's identity or organizing metaphor.

## Core jobs

ProjectDeck should help the user:

- see every Planning, Active, Stable, Paused, Completed, or Archived project clearly;
- understand the current state of a project in human terms;
- see the next planned action;
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

### “Next” is first-class and user-owned

The next planned action is core project information. Automation may suggest a better next step, but must not silently replace an action the user explicitly chose.

### Attention is selective

Lifecycle state describes where a project stands: Planning, Active, Stable, Paused, Completed, or Archived. “Needs Attention” is a separate condition indicating something that may require intervention; for example, a project may be Active and also Need Attention. Age alone should not turn a deliberately paused, completed, or archived project into a warning.

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
