import { AppShell } from "../../components/app-shell.js";
import { PortfolioErrorState } from "../../components/portfolio/portfolio-home.js";
import { ProjectsView } from "../../components/projects/projects-view.js";
import { observeProjectsWithAutomation } from "../../lib/projects/phase-observations.js";
import { buildProjectCardViewModel } from "../../lib/projects/portfolio.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <AppShell activeSection="Projects">
        <PortfolioErrorState />
      </AppShell>
    );
  }

  const observedProjects = await observeProjectsWithAutomation(projects);

  return (
    <AppShell activeSection="Projects">
      <ProjectsView
        cards={observedProjects.map((project) =>
          buildProjectCardViewModel(project),
        )}
      />
    </AppShell>
  );
}
