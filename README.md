# ProjectDeck

ProjectDeck is a personal developer command center for managing and understanding multiple software projects from one place.

Software projects rarely live in one tidy system. A single product may span several repositories, deployments, issue queues, documents, and useful links. When work is spread across many projects, understanding where each one stands—and what to do next—takes repeated reconstruction.

ProjectDeck is intended to provide a clear portfolio view, then a focused workspace for each project. It should make it easy to see project lifecycle state, separate attention conditions, meaningful recent work, releases, issues, components, resources, and the next planned action. Returning to work after an interruption is an important part of that experience, but not the product's entire identity.

## MVP capabilities

The current single-user MVP includes:

- an Overview with a responsive project-card grid and “Continue where you left off” based primarily on the most recently used ProjectDeck project context;
- searchable and filterable Projects;
- project workspaces with Overview, Issues, Releases, Activity, and Docs;
- read-only GitHub repository discovery/import plus cross-project Activity, Releases, and Issues views;
- explicit Railway service association with latest deployment state in Project Workspace;
- project-level modeling of components, repositories, deployments, documentation, and links;
- manually maintained project lifecycle state and next actions, followed by selective source integrations;
- dark and light themes with project-specific accents.

## Current status

ProjectDeck has a runnable Next.js 16 MVP backed by its own Neon database. It is intended for a private, single-user deployment protected by one password and a signed session cookie; signup, accounts, and multi-user authentication are deliberately not implemented. Background synchronization, AI synthesis, and team features also remain outside the MVP. Database, provider, and access credentials remain server-side.

## Documentation

- [Product definition](docs/product.md)
- [MVP scope](docs/mvp.md)
- [UX specification](docs/ux.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Competitive landscape](docs/research/competitive-landscape.md)

The approved interactive design reference is [ProjectDeck.dc.html](design-reference/projectdeck-v0.1/ProjectDeck.dc.html). It is the visual source of truth for the current product direction.
