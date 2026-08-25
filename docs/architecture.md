# ProjectDeck architecture

This document defines the initial technical architecture for ProjectDeck v0.1. Product behavior remains governed by the [product definition](product.md), [MVP scope](mvp.md), and [UX specification](ux.md).

## 1. Architecture Overview

ProjectDeck is one full-stack Next.js 16 application in one repository, deployed as one Railway service. React and Tailwind CSS provide the application UI. Next.js App Router handles pages, server rendering, mutations, and the limited HTTP endpoints the product genuinely needs.

All ProjectDeck-owned data is stored in a dedicated Neon PostgreSQL database. Server-side modules access that database through Drizzle and call external providers such as GitHub and Railway.

```text
Browser
  |
  v
Next.js 16 App Router (React + Tailwind CSS)
  |
  v
Server-side integration and data layer
  |---> Neon PostgreSQL (ProjectDeck-owned data)
  |---> GitHub API (external observed data)
  `---> Railway API (external observed data)
```

There is no separate Express server, API service, worker deployment, or microservice boundary in the MVP.

## 2. Core Architecture Principles

- Keep the MVP monolithic, understandable, and easy for one developer to operate.
- Keep secrets and external-service credentials on the server.
- Treat Project as the primary product concept; a repository, deployment, document, or other resource belongs to or supports a Project.
- Keep ProjectDeck-owned data distinct from data observed from external providers.
- Organize integrations as modular server-side code inside the monolith, not as separate services.
- Scope integration failures locally so one unavailable provider does not hide unrelated project information.
- Avoid speculative infrastructure and abstraction until measured needs justify them.
- Prefer direct, readable application code over complex repository, service, or domain layering.

## 3. Application Structure

The initial repository should use a small structure aligned with Next.js App Router:

```text
app/                     # Routes, layouts, Server Components, and route-local code
  globals.css            # Tailwind entry point and global styles
components/              # Shared UI components
  portfolio/             # Portfolio and project-card UI
  projects/              # Project Workspace UI
  ui/                    # Small reusable interface primitives
lib/                     # Server-side application and integration modules
  github/                # GitHub adapter and mapping code
  railway/               # Railway adapter and mapping code
  projects/              # Project queries and application operations
db/
  client.js              # Server-only Drizzle database client
  schema.js              # ProjectDeck database schema
  migrations/            # Versioned schema migrations
tests/
  unit/
  integration/
  e2e/
```

Folders should be introduced only when their first real use exists. Route-specific UI and logic may stay beside its route. Shared code should move into `components/` or `lib/` when reuse or a clear boundary is demonstrated; the application does not need a ceremonial repository/service/domain stack.

The codebase uses JavaScript rather than TypeScript.

## 4. Data Ownership

### ProjectDeck-owned data

ProjectDeck owns information the user creates or controls, including:

- Project identity, description, and lifecycle state;
- the separate Needs Attention condition and its ProjectDeck context;
- the user's next action;
- project accent and display preferences;
- Components;
- associations between Projects, Components, repositories, deployments, documents, and other resources;
- manually maintained project notes or context;
- theme or user preferences if they are persisted later.

### External observed data

External providers remain authoritative for information ProjectDeck observes, including:

- GitHub repository metadata, issues, releases, and repository activity;
- Railway deployments and runtime state;
- future Supabase or Neon metadata about monitored projects;
- data from other future project resources.

ProjectDeck may store normalized snapshots or last-known external data to support fast loading and local failure handling. Stored observations must remain distinguishable from user-owned state and must retain enough provider and freshness context to avoid presenting stale data as current.

ProjectDeck's Neon database is its own application database. It is independent of any Neon, Supabase, PostgreSQL, or other database used by a monitored project. ProjectDeck does not read a monitored project's application database merely because that project is represented in ProjectDeck.

This document deliberately does not define detailed tables or columns.

## 5. Database

ProjectDeck uses Neon PostgreSQL for its own persistent data and Drizzle for schema definition, migrations, and queries.

- Schema changes are versioned through migrations.
- Next.js server-side code accesses the database directly through the Drizzle client.
- Browser code never receives database credentials or connects directly to Neon.
- Database operations should stay close to the feature or server-side project module that uses them.

Drizzle is used because it provides a lightweight schema, migration, and query layer that remains close to SQL. The MVP should not place a generic repository abstraction over every query; abstraction should follow demonstrated repetition or testing needs.

## 6. Next.js Server Boundaries

- Use Server Components for data-backed pages and read-heavy composition where appropriate.
- Use Client Components only where browser interaction or client state requires them.
- Use Server Actions for ordinary internal mutations such as creating a Project, updating lifecycle state, changing the next action, or editing resources when that keeps the flow simple.
- Use Route Handlers when an HTTP endpoint is genuinely useful, such as a provider callback, webhook, export, or endpoint consumed outside the normal application render flow.
- Keep database access, provider tokens, and secret-bearing integration calls in server-only modules.

Ordinary application behavior does not require an internal REST API between the React UI and the Next.js server. Pages and actions may call the same server-side project and integration modules directly.

## 7. GitHub Integration

The initial GitHub integration uses a Personal Access Token stored as a server-side environment secret.

The MVP may read:

- repository identity and metadata;
- relevant open issues;
- releases;
- meaningful recent repository activity.

The token must never be exposed to browser code, client-rendered configuration, logs, or error details. GitHub calls originate from server-side integration modules, and responses are reduced to the information ProjectDeck needs.

The MVP does not include GitHub OAuth, a GitHub App, per-user connections, or a multi-user credential model. A future public or commercial version would likely require a GitHub App or OAuth-based connection flow with user-scoped authorization.

## 8. Railway Integration

Railway is the first deployment and runtime provider. Its server-side adapter should fetch and normalize only the deployment, environment, and runtime information needed by ProjectDeck.

Provider-specific API details stay inside `lib/railway/`. Project-facing code consumes a small ProjectDeck-shaped result rather than Railway's raw response format. Future providers can follow the same local adapter pattern without changing the Project model or creating a generalized plugin framework.

## 9. Failure and Freshness Behavior

- Render useful ProjectDeck-owned and cached context immediately where available.
- Keep last-known external data usable when it helps, with a clear last-checked or unavailable indication.
- Scope provider errors to the affected section or resource.
- Never represent unavailable or stale provider data as current.
- Never infer local branches, uncommitted changes, or workspace cleanliness from remote GitHub state.
- Do not let one provider failure break the portfolio or unrelated project information.

This requires straightforward timestamps, cached observations, and localized error handling—not a semantic-claim, authority, or confidence-governance engine.

## 10. Auth and Security

ProjectDeck v0.1 is single-user and has no authentication UI. It is intended for a private, controlled deployment rather than exposure as a public multi-user SaaS application.

Database credentials, GitHub tokens, Railway credentials, and future provider secrets remain server-side and are supplied through deployment environment variables. Sensitive values must not enter client bundles, browser storage, rendered HTML, or routine logs.

Authentication and access control must be introduced before any public deployment that exposes personal project data. The no-auth v0.1 decision must not be carried into a public or multi-user release by default.

## 11. Testing

- Use Vitest for unit tests and server-side integration tests.
- Use Playwright for key end-to-end flows such as viewing the portfolio, opening a Project Workspace, editing ProjectDeck-owned state, and handling a locally unavailable integration.
- Keep GitHub and Railway adapters testable with fixtures, fakes, or mocked transport so routine tests do not require live provider calls.
- Use live integration tests selectively when credentials and a controlled test resource are explicitly available.

Tests should emphasize product boundaries: lifecycle versus attention, Project versus resource, user-owned versus observed data, and local degradation when a provider fails.

## 12. Deployment

The MVP deployment consists of:

- one Railway service running the full Next.js application;
- one Neon PostgreSQL database owned by ProjectDeck;
- Railway-managed environment variables for the database connection and provider credentials.

The Railway service handles page rendering, Server Actions, Route Handlers, database access, and synchronous provider requests. There is no separate API, worker, scheduler, Redis instance, or queue in the MVP.

## 13. Explicit Non-Architecture

The following are deliberately not part of the MVP architecture:

- Express backend;
- separate API service;
- microservices;
- Redis;
- job queue;
- background worker architecture;
- event bus;
- Kubernetes;
- multi-tenant architecture;
- generalized integration or plugin platform;
- AI or LLM infrastructure;
- local-machine agent.

## 14. Evolution Triggers

Architecture should evolve in response to demonstrated constraints:

| Trigger | Possible response—not an MVP commitment |
| --- | --- |
| Provider refreshes become too slow or unreliable for request-time work | Add scheduled or queued background jobs for the affected refresh paths. |
| ProjectDeck becomes public or multi-user | Add authentication, authorization, user isolation, and GitHub App or OAuth connections. |
| The number or diversity of providers grows materially | Strengthen the common integration contract while preserving provider-specific adapters. |
| Local workspace observation is validated as valuable | Introduce a deliberately scoped local agent or companion service. |
| AI synthesis proves useful and trustworthy | Add an explicit AI layer with bounded inputs, outputs, and failure behavior. |
| One Railway service can no longer meet measured operational needs | Split only the workload whose scaling or reliability characteristics justify separation. |

None of these responses should be built before its trigger exists.

## 15. Architecture Decisions Summary

| Concern | v0.1 decision |
| --- | --- |
| Application shape | Full-stack monolith in one repository |
| Web framework | Next.js 16 App Router with React |
| Language | JavaScript, not TypeScript |
| Styling | Tailwind CSS |
| ProjectDeck database | Dedicated Neon PostgreSQL database |
| Database layer | Drizzle for schema, migrations, and queries |
| Server API boundary | Server Components and Server Actions by default; Route Handlers only when useful |
| GitHub connection | Server-side Personal Access Token |
| First runtime integration | Railway |
| Hosting | One Railway service |
| Authentication | None in v0.1; private single-user deployment only |
| Testing | Vitest for unit/integration; Playwright for end-to-end |
| Background infrastructure | None in MVP |
| Integration model | Modular in-process provider adapters, not plugins or microservices |
| External project databases | Independent from and not used as ProjectDeck's own database |
