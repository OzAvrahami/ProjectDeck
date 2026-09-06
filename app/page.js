import { Suspense } from "react";

import { AppShell } from "../components/app-shell.js";
import {
  PortfolioEmptyState,
  PortfolioErrorState,
  PortfolioHome,
} from "../components/portfolio/portfolio-home.js";
import { SurfaceLoading } from "../components/surface-loading.js";
import { observeProjectsWithAutomation } from "../lib/projects/phase-observations.js";
import { buildPortfolioViewModel } from "../lib/projects/portfolio.js";
import { listPortfolioProjects } from "../lib/projects/queries.js";

export const dynamic = "force-dynamic";

async function ObservedPortfolio() {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <PortfolioErrorState />
    );
  }

  projects = await observeProjectsWithAutomation(projects);

  return (
    projects.length > 0 ? (
      <PortfolioHome portfolio={buildPortfolioViewModel(projects)} />
    ) : (
      <PortfolioEmptyState />
    )
  );
}

export default function HomePage() {
  return (
    <AppShell activeSection="Overview">
      <Suspense
        fallback={(
          <SurfaceLoading
            title="Portfolio"
            message="Reading current Project and provider evidence. No status is inferred while observations are pending."
          />
        )}
      >
        <ObservedPortfolio />
      </Suspense>
    </AppShell>
  );
}
