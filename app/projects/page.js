import { Suspense } from "react";

import { AppShell } from "../../components/app-shell.js";
import { PortfolioErrorState } from "../../components/portfolio/portfolio-home.js";
import { ProjectsView } from "../../components/projects/projects-view.js";
import { SurfaceLoading } from "../../components/surface-loading.js";
import { observeProjectsWithAutomation } from "../../lib/projects/phase-observations.js";
import { buildProjectCardViewModel } from "../../lib/projects/portfolio.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

async function ObservedProjects() {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <PortfolioErrorState />
    );
  }

  const observedProjects = await observeProjectsWithAutomation(projects);

  return (
    <ProjectsView
      cards={observedProjects.map((project) =>
        buildProjectCardViewModel(project),
      )}
    />
  );
}

export default function ProjectsPage() {
  return (
    <AppShell activeSection="Projects">
      <Suspense
        fallback={(
          <SurfaceLoading
            title="Projects"
            message="Loading current portfolio evidence. Filters will be available when the verified Project summaries arrive."
          />
        )}
      >
        <ObservedProjects />
      </Suspense>
    </AppShell>
  );
}
