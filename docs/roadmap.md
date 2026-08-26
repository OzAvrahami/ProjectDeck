# Conceptual roadmap

This roadmap describes product sequencing rather than delivery commitments. Phases 0–3 form the implemented single-user MVP; later work remains validation-driven.

## Phase 0 — Foundation

Completed for MVP.

- establish the canonical product documentation;
- select the technical architecture and stack;
- create the application skeleton and development baseline.

## Phase 1 — Local ProjectDeck MVP

Completed for MVP, with Project state populated through the existing import/data paths rather than a broad administration interface.

- project creation, editing, lifecycle state (Planning, Active, Stable, Paused, Completed, or Archived), a separate Needs Attention condition, and configuration;
- portfolio Overview and responsive project-card grid;
- searchable and filterable Projects view;
- Project Workspace with Overview, Issues, Releases, Activity, and Docs structure;
- manually entered project lifecycle state, next action, components, and resources;
- “Continue where you left off” based primarily on the most recently used or worked ProjectDeck project context;
- dark and light themes.

## Phase 2 — GitHub

Completed for MVP as a read-only PAT integration. Recent commits are presented conservatively as observed development activity rather than synthesized progress.

- connect repositories to Projects and Components;
- show relevant issues and releases;
- present a small recent commit window as observed development activity;
- link back to GitHub for source-system actions;
- communicate last-checked and unavailable states honestly.

## Phase 3 — Runtime and deployment

Completed for MVP with explicit Railway service association and latest deployment observation. Live use requires `RAILWAY_TOKEN`.

- add the first deployment-provider integration;
- show latest provider-native deployment state where available;
- keep deployment state distinct from repository and release state;
- degrade locally when the provider is unavailable.

## Phase 4 — Smarter project context

- improve recent-work synthesis across available sources;
- strengthen resumption assistance;
- consider smarter relevance selection for “Continue where you left off”;
- add selective suggestions without overwriting user intent;
- automate only where the result is understandable and useful.

## Later / validation-driven

- selected AI-conversation context;
- a local workspace observer;
- additional deployment and development-tool providers;
- advanced portfolio recommendations;
- collaboration or commercial features, if they are ever justified.
