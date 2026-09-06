import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "../../../components/app-shell.js";
import { GitHubDevelopmentStandardPanel } from "../../../components/github/development-standard-panel.js";
import {
  ProjectWorkspaceContent,
  ProjectWorkspaceHeaderSignals,
  ProjectWorkspaceShell,
  WorkspaceProviderLoading,
} from "../../../components/workspace/project-workspace.js";
import { buildProjectCardViewModel } from "../../../lib/projects/portfolio.js";
import { getProjectWorkspaceBySlug } from "../../../lib/projects/queries.js";
import { WORKSPACE_TABS } from "../../../lib/projects/navigation.js";
import {
  observeProjectWorkspaceSurface,
  workspaceObservationRequirements,
} from "../../../lib/projects/workspace-observations.js";
import { getRailwayIntegrationView } from "../../../lib/railway/connection.js";
import { observeGitHubDevelopmentStandard } from "../../../lib/github/standard/observe.js";

export const dynamic = "force-dynamic";

async function ObservedHeaderSignals({ observedProjectPromise }) {
  const observedProject = await observedProjectPromise;
  return (
    <ProjectWorkspaceHeaderSignals
      card={buildProjectCardViewModel(observedProject)}
    />
  );
}

async function GitHubStandardContent({ project }) {
  const audit = await observeGitHubDevelopmentStandard(project).catch(() => null);
  return (
    <GitHubDevelopmentStandardPanel
      initialAudit={audit}
      slug={project.slug}
    />
  );
}

async function ObservedWorkspaceContent({
  activeTab,
  issueType,
  observedProjectPromise,
  railwayIntegrationPromise,
}) {
  const [project, railwayIntegration] = await Promise.all([
    observedProjectPromise,
    railwayIntegrationPromise,
  ]);
  const card = buildProjectCardViewModel(project);
  const githubStandardContent = activeTab === "overview" ? (
    <Suspense
      fallback={<WorkspaceProviderLoading subject="GitHub Standard audit" />}
    >
      <GitHubStandardContent project={project} />
    </Suspense>
  ) : null;

  return (
    <ProjectWorkspaceContent
      project={project}
      card={card}
      activeTab={activeTab}
      issueType={issueType}
      railwayIntegration={railwayIntegration}
      githubStandardContent={githubStandardContent}
    />
  );
}

export default async function ProjectIdentityPage({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const requestedTab = typeof query?.tab === "string" ? query.tab : "overview";
  const activeTab = WORKSPACE_TABS.some(({ id }) => id === requestedTab)
    ? requestedTab
    : "overview";
  const projectUpdated = query?.updated === "1";
  const issueType = query?.type === "bug" ? "bug" : "all";
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

  const requirements = workspaceObservationRequirements(activeTab);
  const observedProjectPromise = observeProjectWorkspaceSurface(
    project,
    activeTab,
  );
  const railwayIntegrationPromise = requirements.railwayIntegration
    ? getRailwayIntegrationView().catch(() => null)
    : Promise.resolve(null);
  const card = buildProjectCardViewModel(project);

  return (
    <AppShell workspaceName={card.name}>
      <ProjectWorkspaceShell
        card={card}
        activeTab={activeTab}
        projectUpdated={projectUpdated}
        headerSignals={requirements.mode === "automation" ? (
          <Suspense fallback={null}>
            <ObservedHeaderSignals
              observedProjectPromise={observedProjectPromise}
            />
          </Suspense>
        ) : null}
      >
        <Suspense
          fallback={(
            <div className="mt-9">
              <WorkspaceProviderLoading subject={`${activeTab} evidence`} />
            </div>
          )}
        >
          <ObservedWorkspaceContent
            activeTab={activeTab}
            issueType={issueType}
            observedProjectPromise={observedProjectPromise}
            railwayIntegrationPromise={railwayIntegrationPromise}
          />
        </Suspense>
      </ProjectWorkspaceShell>
    </AppShell>
  );
}
