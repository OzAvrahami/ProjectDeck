# Competitive landscape

## Purpose and scope

This summary distills the earlier ProjectDeck landscape research and supplements two missing comparisons with official product documentation. It is not a claim that ProjectDeck replaces these tools. The market and product details should be rechecked when integration or commercial decisions are made.

ProjectDeck's current position is a **personal developer command center for an entire software-project portfolio**. Its differentiator is the project-level combination of current state, next planned action, attention, meaningful recent work, releases, issues, components, and resources. Resumption supports that experience but is not the whole proposition.

## Comparison

| Category | What the existing tool centers | ProjectDeck's intended distinction |
| --- | --- | --- |
| GitHub Projects | Planning and tracking work through issues, pull requests, tables, boards, roadmaps, and custom fields. | A personal cross-project command center that summarizes project meaning and links back to GitHub instead of becoming another planning board. |
| Linear | Product-development planning and execution through issues, projects, cycles, updates, and related workflow. | Portfolio orientation across heterogeneous personal projects, including deployments, components, documents, resources, and a user-owned next action. |
| GitKraken | Git workflows and repository workspaces, including grouping repositories, multi-repository actions, and pull-request or issue triage. | Treating repositories as resources within a larger Project and centering product state rather than Git operations. ProjectDeck should complement, not duplicate, Git tooling. |
| Backstage | An extensible, organization-scale developer portal and centralized software catalog for services, ownership, metadata, infrastructure, and plugins. | A lightweight personal command center with minimal administration, no service-catalog rollout, and no enterprise ownership model. |
| Agent-oriented development tools | Giving an AI assistant codebase context, reusable instructions, memories, conversation context, or artifacts needed to perform development work. | Giving the human a stable portfolio overview and explicit control of project state and next action. Agent context may become an input later, not the primary interaction model. |

## Evidence from adjacent products

### GitHub Projects

GitHub describes Issues and Projects as adaptable tools for planning and tracking work, with views such as tables, boards, and roadmaps connected to issues and pull requests. This makes GitHub a natural system of record for development work, but not necessarily a calm explanation of an individual's whole product portfolio. ProjectDeck should surface selected issue, release, and repository context and route edits back to GitHub rather than copying its workflows.

Sources: [GitHub Issues and Projects](https://github.com/features/issues), [GitHub Projects documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)

### Linear

Linear centers issues, projects, cycles, initiatives, and project updates for product-development execution. Its structured planning and workflow are adjacent to ProjectDeck's project status and attention views. ProjectDeck should stay narrower as a personal portfolio command center and avoid growing a parallel backlog, cycle, or team-planning model.

Sources: [Linear features](https://linear.app/features), [Linear project updates](https://linear.app/docs/project-updates)

### GitKraken

GitKraken Workspaces can group repositories, perform actions across repositories, and provide pull-request views or triage across a workspace. That overlap validates the need to understand multi-repository work, but GitKraken remains centered on Git and repository operations. ProjectDeck's Project can also include deployments, documents, services, milestones, and human-authored context; it should deep-link to Git tooling where repository action is required.

Sources: [GitKraken Desktop Workspaces](https://help.gitkraken.com/gitkraken-desktop/workspaces/), [GitKraken.dev feature overview](https://help.gitkraken.com/gk-dev/gk-dev-home/)

### Backstage

Backstage is an open-source framework for developer portals. Its Software Catalog tracks ownership and metadata for software such as services, websites, libraries, and data pipelines and can organize infrastructure tools through plugins. The component/resource distinction is useful product-model evidence, but Backstage targets organizational discovery and extensibility at a much larger operational scale. ProjectDeck should remain personal, immediately useful, and configuration-light.

Sources: [Backstage overview](https://backstage.io/docs/overview/generated-index/), [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/)

### Agent-oriented development tools

The original research reviewed products and capabilities such as GitHub Copilot Spaces, Cursor memories, and Pieces Long-Term Memory. They demonstrate demand for persistent context around code and AI-assisted work. Their center is usually the agent session, codebase, or captured material. ProjectDeck's center is the human-readable Project and portfolio; automatic conversation ingestion and detailed memory provenance should remain later, validation-driven capabilities.

Sources: [GitHub Copilot Spaces](https://docs.github.com/en/copilot/concepts/context/spaces), [Cursor memories](https://docs.cursor.com/context/memories), [Pieces Long-Term Memory](https://docs.pieces.app/products/core-dependencies/pieces-os/quick-menu/ltm-2)

## Product implications

- Preserve Project as a higher-level concept than repository.
- Offer a calm overview before detailed source activity.
- Make the user's next action prominent and editable without building a new task manager.
- Treat issues, releases, deployments, and agent context as inputs or linked details, not competing product centers.
- Begin with manually useful project context, then add integrations selectively.
- Judge future automation by whether it improves portfolio understanding or continuation without taking control away from the user.
