# Changelog

## [Unreleased]

## [0.2.0] - 2026-09-07

### Added

- Automatic Project Phase from implementation and activity evidence, automatic Next from canonical GitHub Project Status/Priority, and explainable Needs Attention signals, with explicit manual overrides.
- Configurable operational Health from HTTP endpoints, read-only PostgreSQL checks, and Railway/Vercel deployment monitors, retaining Component scope and distinct Healthy, Degraded, Down, Unknown, and Not monitored states.
- Railway read-only OAuth connection, workspace/service discovery, exact repository associations, and centralized manual resource mapping. Provider credentials are encrypted at rest; legacy monitor configuration remains supported.
- GitHub Development Standard audit, migration planning, and explicitly approved safe Apply operations with separate server-only Project-field and repository-label write credentials, stale-plan checks, and post-Apply verification.
- Project editing and integration Settings, including Project identity, accent, manual Phase/Next overrides, attention context, and monitor configuration.
- A public, non-cached `/api/health` liveness endpoint that exposes no database or provider details.
- Repository Issue Forms and documented canonical workflow, Priority, type-label, and release conventions.

### Changed

- Portfolio cards prioritize Phase, operational Health, Needs Attention, Next, canonical bug/open-Issue counts, authoritative Releases, and explicit Latest Commit context.
- Published GitHub Releases are the only authoritative released-version evidence. Portfolio, Workspace and global Release views provide explicit GitHub actions and internal Releases navigation; multi-repository versions remain independently scoped.
- Workspace Overview separates Release, Deployment and Health with their own evidence and provenance. Active/serving deployments and latest attempts are shown independently where supported, and deployment-only Health identifies its monitoring limits.
- Application and Workspace identity stream before secondary provider work. Issues, Releases and Activity request only their relevant GitHub evidence; Docs stays local and GitHub Standard audit loads separately on Overview.
- Workspace and global Issues use bounded pagination with repository-wide open/bug counts, filter-aware navigation, and explicit partial-provider results.

### Fixed

- GitHub work-item Status no longer determines Project Phase; repository implementation maturity and activity remain separate from workflow and Health.
- Partial GitHub Project repository visibility no longer discards otherwise usable Project evidence or implies full visibility.
- Railway deployment Health distinguishes a failed latest attempt with an older active deployment from complete downtime, and keeps unavailable or incomplete provider evidence explicit.

[Unreleased]: https://github.com/OzAvrahami/ProjectDeck/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/OzAvrahami/ProjectDeck/compare/v0.1.0...v0.2.0
