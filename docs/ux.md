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

The implemented Activity destination is a calm chronological view of recent GitHub commits. It describes observed repository activity, not inferred progress, feature completion, or user intent.

## Overview

The Overview opens with a greeting and a compact portfolio summary. It should answer “What do I have?” and “What deserves a look?” without becoming a metrics dashboard.

“Continue where you left off” primarily opens the most recently used or worked ProjectDeck project context. It is not an AI-generated portfolio recommendation and does not claim to know which project the user ought to prioritize. Smarter relevance selection may be considered later.

The main visual object is a responsive grid of project cards. Cards carry enough information to compare and enter projects without turning into miniature dashboards.

## Project card hierarchy

Every card follows the same reading order:

1. project identity;
2. lifecycle state;
3. short description;
4. **Next**;
5. version, issues, and components;
6. recent meaningful work.

“Next” is visually important because it connects portfolio understanding to useful action. Secondary facts should support it rather than compete with it. Project-specific accents improve recognition without changing the meaning of common states.

Lifecycle state and attention remain separate: a card may show a project as Active while also indicating that it Needs Attention.

Selecting a card opens its Project Workspace. Links or controls inside a card must have clear, non-overlapping targets and predictable keyboard focus.

## Projects

Projects provides the full portfolio with search and lifecycle-state filtering. Results retain recognizable project identity and a clear route into each workspace. Empty search results should explain that no projects match and make it easy to clear the query or filters.

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
- **Next up** — the user's planned next action;
- **Needs attention** — selective intervention items;
- **Recent work** — recent observed development activity, clearly distinguished from inferred progress.

A secondary rail contains:

- Components;
- Latest release;
- Issues;
- Quick links.

The main column explains the project; the rail provides supporting facts and routes. On narrower layouts, the rail moves below the main content without changing the information priority.

Where a Railway service is explicitly connected, the rail also presents its latest provider-native deployment state. Missing credentials or provider failure remain local to that runtime resource.

## Returning to work

Resumption is supported in context rather than presented as a separate operating system:

1. the user enters from “Continue where you left off,” a project card, or a list;
2. the workspace immediately shows saved project context;
3. source-backed sections refresh independently where integrations exist;
4. the user sees where the project stands, what changed meaningfully, what needs attention, and the recorded next action;
5. quick links take the user to the appropriate working tool.

Cached and manually maintained context should appear immediately. Refreshing one source must not block the whole workspace. If nothing meaningful changed, Recent work should say so succinctly instead of replaying history.

## States and feedback

Project lifecycle uses the plain-language states Planning, Active, Stable, Paused, Completed, and Archived. “Needs Attention” is an independent condition, not another lifecycle state.

- **New project:** explain the few details needed to make the first card useful, centered on identity, lifecycle state, description, next action, components, and resources.
- **Empty portfolio:** introduce ProjectDeck's purpose and offer one clear create-project action.
- **Dormant project:** retain its lifecycle state and show the last known context without escalating inactivity alone into an attention condition.
- **Paused, completed, or archived project:** make the lifecycle state clear and suppress attention based only on staleness.
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
- No badge soup; lifecycle and attention colors require plain-language meaning.
- No excessive nesting of cards inside cards.
- No source, timestamp, confidence, or provenance detail shown merely because it exists.
- No internal semantic model exposed as vocabulary the user must learn.
- No visual blurring of “needs attention,” user-owned “next,” or an automated suggestion.
- No recommendation styled as an already-made decision.
- No unavailable integration promoted into a whole-page failure.
