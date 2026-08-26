import { AppShell } from "../../components/app-shell.js";
import {
  IssuesView,
  ObservationDatabaseError,
} from "../../components/github/github-observation-views.js";
import { observeProjectsGitHub } from "../../lib/projects/github-observations.js";
import {
  listCrossProjectIssues,
  summarizeCrossProjectChecks,
} from "../../lib/projects/github-summary.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

export default async function IssuesPage() {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <AppShell activeSection="Issues">
        <ObservationDatabaseError subject="Issues" />
      </AppShell>
    );
  }

  const observedProjects = await observeProjectsGitHub(projects, {
    features: ["issues"],
  });

  return (
    <AppShell activeSection="Issues">
      <IssuesView
        issues={listCrossProjectIssues(observedProjects)}
        check={summarizeCrossProjectChecks(observedProjects, "issues")}
      />
    </AppShell>
  );
}
