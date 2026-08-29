# MVP scope

The implemented MVP establishes ProjectDeck as a useful command center before adding broad automation. This document defines product behavior; technical boundaries are documented separately in [architecture.md](architecture.md).

## Portfolio / Overview

The Overview is the home screen. It should show the portfolio as a prominent responsive grid of project cards, supported by a compact portfolio summary and a “Continue where you left off” entry point.

Each project card should communicate, where applicable:

- project identity and project-specific accent;
- synthesized Project Phase and short description;
- current version or milestone;
- next planned action;
- open issue count;
- component count or summary;
- latest meaningful work;
- last-worked or last-updated information.

Cards should remain easy to scan. Missing optional data should not produce empty metadata rows or warning clutter.

“Continue where you left off” primarily returns the user to the most recently used or worked ProjectDeck project context. It is not an AI-generated portfolio recommendation and must not imply that ProjectDeck has selected the user's highest-priority project. Smarter relevance selection may be considered later.

## Projects

The Projects view provides the complete project list with:

- text search;
- Project Phase filtering, including Unknown;
- an independent Needs Attention filter;
- a clear Add projects action that opens the GitHub repository import flow;
- clear access to each Project Workspace.

It is a navigation and portfolio-management surface, not a spreadsheet-style project administration screen.

## Project Workspace

Each project has a dedicated workspace with these tabs:

- Overview
- Issues
- Releases
- Activity
- Docs

The project Overview contains:

- **Where we are:** a concise human-readable description of current state;
- **Next up:** the user's planned next action;
- **Needs attention:** a short list of items that may require intervention;
- **Recent work:** meaningful outcomes and changes;
- **Components:** the product's repositories, applications, services, or other major parts;
- **Latest release:** the most relevant release information;
- **Issues:** open issue count with a route to details;
- **Quick links:** important repositories, deployments, documents, and other resources.

The other tabs provide focused access to their subject without reproducing the full experience of the source system.

ProjectDeck-owned fields can be edited from the Workspace: display name, tagline, an optional manual Project Phase override, the independent Needs Attention condition and summary, next action, and a restrained project accent. Automatic is the default Phase mode. Changing a display name keeps the existing slug stable. GitHub Project workflow data, Issues, Releases, activity, repository metadata, and Railway deployment observations remain read-only.

## Settings and integration access

The header account menu provides access to a small Settings page and logout. Settings shows only non-secret provider configuration state and connected Resource counts. GitHub repository management returns to the existing scan/import flow; Railway associations remain explicitly managed from each Project Workspace rather than from a global administration console.

## Cross-project views

Global views provide selective portfolio-wide visibility:

- **Activity:** recent observed development activity across projects;
- **Releases:** recent and relevant releases;
- **Issues:** important open issues and items needing attention.

These views are useful read-only summaries with direct routes to the source. GitHub commits are labeled as observed repository activity rather than automatically described as meaningful progress, product completion, or user intent.

## Project and resource model

The MVP must be able to represent these product concepts without prescribing database tables:

- **Project:** the primary portfolio object;
- **Component:** a meaningful part of a Project, such as an application, service, site, or library;
- **Repository/resource association:** a repository or external resource related to a Project or Component;
- **Deployment/runtime resource:** a deployed environment or service whose current state may differ from repository or release state;
- **Documentation resource:** a document or documentation destination;
- **Project Phase:** Automatic synthesis may return Planning, Development, Maintenance, or Unknown; Paused and Archived require a manual override in v1;
- **Attention condition:** whether something currently Needs Attention, independent of Phase—a project may be in Development and also Need Attention;
- **Runtime Health:** observed deployment/runtime state, independent of Phase and never used alone to change it;
- **Next action:** the explicit action the user intends to advance next.

A resource may support more than one component where that reflects reality. Project-level orientation remains primary even when details come from several resources.

## Themes and responsive behavior

The MVP supports:

- dark and light themes;
- a user-controlled theme toggle;
- sensible use of the operating-system preference;
- desktop-first layouts that adapt cleanly to laptop and tablet widths.

Mobile should remain usable for orientation, but mobile-first workflows and a broad theme system are outside this MVP.

## Trust and freshness minimum

Trustworthy behavior should be simple and mostly unobtrusive:

- show “last checked” or “last known” information where recency could affect interpretation;
- identify an unavailable source close to the affected information;
- preserve usable cached or manually entered context while a source refreshes or fails;
- never fabricate local workspace state;
- never treat activity volume as meaningful progress without a clear basis;
- never overwrite the user's next action with an automated suggestion.

Detailed provenance, source-authority rules, confidence scoring, and semantic claim machinery are not required for the MVP.

## Explicit MVP exclusions

- signup, accounts, organizations, roles, permissions, or other multi-user authentication features; the private deployment uses only a minimal single-password access gate;
- an automated local-machine observer or agent;
- broad AI-conversation ingestion;
- a generalized semantic claim engine;
- autonomous cross-project prioritization;
- dozens of integrations;
- a duplicate task- or issue-management system;
- generalized integration-governance administration;
- enterprise collaboration, permissions, reporting, or commercial features unless later validated;
- a notification-driven engagement system;
- a power-user command system beyond sensible accessibility and keyboard navigation.

## Implemented integration boundary

The MVP reads repository identity, open Issues, published Releases, and a small recent commit window from connected GitHub repositories. Pull Requests are excluded from Issue counts. Project totals preserve complete, partial, and unavailable provider coverage.

Railway is connected once through a read-only OAuth `workspace:viewer` grant. ProjectDeck discovers the selected workspaces, projects, environments, services, and deployment state; it may associate a unique production service by exact GitHub source-repository identity, while ambiguous resources require explicit mapping by name in the Workspace. Stable provider IDs are stored internally, and no source data is written back to Railway. Existing `RAILWAY_TOKEN`-based manual monitors remain a deprecated compatibility path only.
