import { AppShell } from "../../components/app-shell.js";
import {
  ObservationDatabaseError,
  ReleasesView,
} from "../../components/github/github-observation-views.js";
import { observeProjectsGitHub } from "../../lib/projects/github-observations.js";
import {
  listCrossProjectReleases,
  summarizeCrossProjectChecks,
} from "../../lib/projects/github-summary.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

export default async function ReleasesPage() {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <AppShell activeSection="Releases">
        <ObservationDatabaseError subject="Releases" />
      </AppShell>
    );
  }

  const observedProjects = await observeProjectsGitHub(projects, {
    features: ["releases"],
  });

  return (
    <AppShell activeSection="Releases">
      <ReleasesView
        releases={listCrossProjectReleases(observedProjects)}
        check={summarizeCrossProjectChecks(observedProjects, "releases")}
      />
    </AppShell>
  );
}
