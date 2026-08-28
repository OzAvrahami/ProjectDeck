import { AppShell } from "../components/app-shell.js";
import {
  PortfolioEmptyState,
  PortfolioErrorState,
  PortfolioHome,
} from "../components/portfolio/portfolio-home.js";
import { observeProjectsWithPhase } from "../lib/projects/phase-observations.js";
import { buildPortfolioViewModel } from "../lib/projects/portfolio.js";
import { listPortfolioProjects } from "../lib/projects/queries.js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <AppShell activeSection="Overview">
        <PortfolioErrorState />
      </AppShell>
    );
  }

  projects = await observeProjectsWithPhase(projects);

  return (
    <AppShell activeSection="Overview">
      {projects.length > 0 ? (
        <PortfolioHome portfolio={buildPortfolioViewModel(projects)} />
      ) : (
        <PortfolioEmptyState />
      )}
    </AppShell>
  );
}
