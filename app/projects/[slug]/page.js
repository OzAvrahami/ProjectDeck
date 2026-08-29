import { notFound } from "next/navigation";

import { AppShell } from "../../../components/app-shell.js";
import { ProjectWorkspace } from "../../../components/workspace/project-workspace.js";
import { observeProjectsWithAutomation } from "../../../lib/projects/phase-observations.js";
import { buildProjectCardViewModel } from "../../../lib/projects/portfolio.js";
import { getProjectWorkspaceBySlug } from "../../../lib/projects/queries.js";
import { WORKSPACE_TABS } from "../../../lib/projects/navigation.js";
import { getRailwayIntegrationView } from "../../../lib/railway/connection.js";

export const dynamic = "force-dynamic";

export default async function ProjectIdentityPage({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const requestedTab = typeof query?.tab === "string" ? query.tab : "overview";
  const activeTab = WORKSPACE_TABS.some(({ id }) => id === requestedTab)
    ? requestedTab
    : "overview";
  const projectUpdated = query?.updated === "1";
  let project;

  try {
    project = await getProjectWorkspaceBySlug(slug);
  } catch {
    return (
      <AppShell workspaceName="Project">
        <section className="mx-auto max-w-[760px] px-5 py-12 sm:px-8">
          <h1 className="text-2xl font-semibold">Project unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-subtle">
            ProjectDeck could not reach its database. Try opening this Project
            again shortly.
          </p>
        </section>
      </AppShell>
    );
  }

  if (!project) {
    notFound();
  }

  const [observedProjects, railwayIntegration] = await Promise.all([
    observeProjectsWithAutomation([project]),
    getRailwayIntegrationView().catch(() => null),
  ]);
  const [observedProject] = observedProjects;
  const card = buildProjectCardViewModel(observedProject);

  return (
    <AppShell workspaceName={card.name}>
      <ProjectWorkspace
        project={observedProject}
        card={card}
        activeTab={activeTab}
        projectUpdated={projectUpdated}
        railwayIntegration={railwayIntegration}
      />
    </AppShell>
  );
}
