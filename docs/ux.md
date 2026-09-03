# UX specification

The approved interactive design is the primary visual reference: [ProjectDeck.dc.html](../design-reference/projectdeck-v0.1/ProjectDeck.dc.html).

This document captures its information structure and interaction guardrails. It does not finalize branding beyond the direction already present in that reference.

## Global navigation

The desktop application uses five primary destinations:

- **Overview** — portfolio home and fast orientation;
- **Projects** — complete searchable and filterable project list;
- **Activity** — recent observed development activity across projects;
- **Releases** — important releases across projects;
- **Issues** — important open issues across projects.

Global portfolio navigation is shown in normal portfolio views. When the user enters a Project Workspace, the header switches to a focused breadcrumb and back affordance in the form “All projects / ProjectName.” The workspace then uses local tabs rather than carrying the global portfolio navigation into the focused project context. The approved interactive design reference is authoritative for this transition.

The compact avatar menu contains only Settings and Log out. Settings is a restrained integration-status and navigation surface, not a general account or administration dashboard.

The implemented Activity destination is a calm chronological view of recent GitHub commits. It describes observed repository activity, not inferred progress, feature completion, or user intent.

## Overview

The Overview opens with a greeting and a compact portfolio summary. It should answer “What do I have?” and “What deserves a look?” without becoming a metrics dashboard.

“Continue where you left off” primarily opens the most recently used or worked ProjectDeck project context. It is not an AI-generated portfolio recommendation and does not claim to know which project the user ought to prioritize. Smarter relevance selection may be considered later.

The main visual object is a responsive grid of project cards. Cards carry enough information to compare and enter projects without turning into miniature dashboards.

## Project card hierarchy

Every card follows the same reading order:

1. project identity;
2. synthesized Project Phase;
3. compact operational Health;
4. short description;
5. **Next**;
6. version, issues, and components;
7. recent meaningful work.

“Next” is visually important because it connects portfolio understanding to useful action. It is automatic by default, selected from open GitHub Project work in In Progress, Verify, then Ready order; Priority breaks ties only within a Status. A manual override is labeled subtly and always wins until cleared. “No clear next action” means the resolved workflow has no eligible Issue, while “Unavailable” means ProjectDeck could not establish the answer. Secondary facts should support Next rather than compete with it. Project-specific accents improve recognition without changing the meaning of common states.

Phase, Health, Next, and attention remain separate: Phase communicates lifecycle, Next selects work, Health reports operational state, and Needs Attention surfaces strong intervention signals. A card may show a Project in Development with Health Down and automatically synthesized Needs Attention. Degraded does not always require attention; ordinary deployment transitions remain quiet. Health is compact and always uses plain text in addition to color. Inferred Phase is shown plainly; a manual override receives a subtle indicator, and Unknown remains visible rather than being hidden.

Selecting a card opens its Project Workspace. Links or controls inside a card must have clear, non-overlapping targets and predictable keyboard focus.

The compact card Issue summary shows canonical-label bugs and total open work, for example `3 bugs · 10 open`. Exact zero-bug results show only the open total, partial repository reads use `+` lower-bound markers, and total failure says `Issues unavailable`. The totals link to the Workspace Issues tab, with bug counts opening its canonical `bug` filter. Bug count remains separate from Needs Attention.

Card Release text links to the Workspace Releases tab and represents only published, non-draft GitHub Releases. Single repositories may show the exact tag and an explicit pre-release marker. One released repository in a multi-repository Product is scope-prefixed; multiple released Components use a compact count instead of a synthetic Product version. The Workspace lists every connected repository, including successful `No published GitHub Release` and per-repository unavailable states. Recorded Component application versions are labeled as metadata, not published Releases.

## Projects

Projects provides the full portfolio with search, Project Phase filtering, an independent Needs Attention filter, and the primary “Add projects” entry point into GitHub import. Results retain recognizable project identity and a clear route into each workspace. Empty search results should explain that no projects match and make it easy to clear the query or filters.

## Project Workspace

The workspace maintains a strong project identity and exposes local tabs:

- Overview
- Issues
- Releases
- Activity
- Docs

The Overview should feel like a project command center.

The main content contains:

- **Where we are** — a concise current-state summary;
- **Health** — the synthesized operational result plus resource/Component evidence and concise failure reasons;
- **Next up** — the automatic GitHub Project candidate or explicit manual override, with concise Issue, Status, Priority, and Component context where useful;
- **Needs attention** — selective intervention items;
- **Recent work** — recent observed development activity, clearly distinguished from inferred progress.

A secondary rail contains:

- Components;
- Latest release;
- Issues;
- Quick links.

The main column explains the project; the rail provides supporting facts and routes. On narrower layouts, the rail moves below the main content without changing the information priority.

A secondary Edit Project action opens a focused form for ProjectDeck-owned context. Display-name changes keep the existing project URL stable. Phase offers Automatic plus explicit Planning, Development, Maintenance, Paused, and Archived overrides. Unknown is never a manual option. Next offers Automatic or Manual override; selecting Automatic clears the stored `next_action`, while a non-empty manual value takes precedence over provider evidence. Phase and Needs Attention use separate controls; clearing Needs Attention removes its summary from current presentation. Provider observations are visible but cannot be edited through this form.

Railway is connected once from Settings, where the user can refresh discovery, reconnect, disconnect locally, and see mapped or unmapped resources. ProjectDeck presents discovered Railway projects, production environments, and services by name; the user never copies opaque IDs. An exact source-repository match may associate a service automatically, while an ambiguous match stays unmapped until the user chooses a Project and optional Component. Each associated service can be disabled or made informational without deleting the provider resource. Legacy manual-ID Railway monitors remain visible during migration but are not offered as the normal setup path.

Other manual monitoring configuration stays scoped to the relevant Project Workspace. The user explicitly chooses an HTTP endpoint or PostgreSQL and whether the monitor affects Project Health. Existing manual Vercel deployment monitors remain visible as legacy/deprecated evidence, but cannot be newly created; future provider-level Vercel onboarding is deferred to Issue #13. Existing generic Resources are not pinged automatically. GitHub setup remains reachable through Projects and Settings, while the Railway provider connection remains a restrained integration surface rather than an infrastructure console.

## Returning to work

Resumption is supported in context rather than presented as a separate operating system:

1. the user enters from “Continue where you left off,” a project card, or a list;
2. the workspace immediately shows saved project context;
3. source-backed sections refresh independently where integrations exist;
4. the user sees where the project stands, what changed meaningfully, what needs attention, and the current automatic or manually overridden Next action;
5. quick links take the user to the appropriate working tool.

Cached and manually maintained context should appear immediately. Refreshing one source must not block the whole workspace. If nothing meaningful changed, Recent work should say so succinctly instead of replaying history.

## States and feedback

Project Phase uses the plain-language outputs Planning, Development, Maintenance, Paused, Archived, and Unknown. Automatic inference explains repository lifecycle evidence concisely in the Workspace: implementation has not begun, unreleased implementation exists, a released product has recent implementation activity, or a released product has no recent implementation activity. GitHub Issue Status never appears as a Phase reason. Paused and Archived require manual intent in v1. Needs Attention and operational Health remain independent of Phase and Next.

Operational Health uses Healthy, Degraded, Down, Unknown, and Not monitored. Not monitored means no enabled observation has been designated to affect top-level Health. Unknown means monitoring exists but its state could not be established. For Railway, a failed latest production build with an older active deployment is Degraded rather than Healthy or Down; a current crash is Down. The Workspace retains provider, Resource, Component, observation time, and a concise reason; cards show only the aggregate state. Needs Attention then escalates required Down evidence, failed latest production attempts, explicit monitoring reconnection/configuration failures, and canonical open `bug` Issues whose Priority is P0/P1 and Status is Ready, In Progress, or Verify. Edit Project offers Automatic or Force Needs Attention; returning to Automatic clears the saved manual reason.

Automatic Next uses only open Issue items in Standard v1 In Progress, Verify, or Ready states. Backlog alone never becomes Next. Equal Status and Priority candidates resolve deterministically by most recently updated Issue, stable repository identity, then Issue number. Multi-repository cards show Component or repository scope only when needed.

This separation is deliberate: Phase uses implementation maturity, published Releases, and file-level implementation activity; Next uses GitHub Project Status and Priority; Health uses explicitly monitored operational Resources.

- **New project:** explain the few details needed to make the first card useful, centered on identity, automatic Phase, description, next action, components, and resources.
- **Empty portfolio:** introduce ProjectDeck's purpose and offer one clear create-project action.
- **Dormant project:** show Unknown when evidence is insufficient; inactivity alone must not infer Paused, Archived, or an attention condition.
- **Paused or archived project:** make the explicit manual Phase clear and suppress attention based only on staleness.
- **Refreshing:** retain existing content, show lightweight local progress, and update sections without layout jumps.
- **Unavailable source:** preserve last-known information, label the affected section, and offer retry or source access where useful.
- **Unknown:** state that information is not known; do not substitute an error or a guess.
- **Conflicting information:** show a calm, localized explanation when the difference could change interpretation or action, with details on demand.

Timestamps, evidence, and source links should be visible where useful but subordinate to the project explanation. Deep verification belongs behind “View source,” “Details,” or an equivalent disclosure.

## Visual system

The approved direction is a premium, modern developer-tool aesthetic with:

- Sora for interface typography;
- Space Mono for compact technical details;
- dark and light themes with a visible theme switcher;
- unique, restrained per-project accents;
- project cards as the primary visual objects;
- restrained shadows and motion;
- strong hierarchy, generous spacing, and calm surfaces;
- responsive desktop, laptop, and tablet behavior.

Motion should clarify transitions and feedback, respect reduced-motion preferences, and never delay access to information. Color must not be the only way a state is communicated. Interactive elements require visible focus, logical keyboard order, and adequate target size and contrast.

## UX guardrails

- No KPI-card overload or giant analytics charts by default.
- No raw commit or event feed as the primary experience.
- Activity remains a restrained, scoped source view rather than a progress score.
- No badge soup; Phase and attention colors require plain-language meaning.
- No excessive nesting of cards inside cards.
- No source, timestamp, confidence, or provenance detail shown merely because it exists.
- No internal semantic model exposed as vocabulary the user must learn.
- No visual blurring of “needs attention,” automatic Next, a manual Next override, or a separate recommendation.
- No recommendation styled as an already-made decision.
- No unavailable integration promoted into a whole-page failure.
