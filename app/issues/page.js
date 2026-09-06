import { Suspense } from "react";

import { AppShell } from "../../components/app-shell.js";
import {
  IssuesView,
  ObservationDatabaseError,
} from "../../components/github/github-observation-views.js";
import { SurfaceLoading } from "../../components/surface-loading.js";
import { observeProjectsGitHub } from "../../lib/projects/github-observations.js";
import {
  listCrossProjectIssues,
  summarizeCrossProjectChecks,
} from "../../lib/projects/github-summary.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

async function ObservedIssues() {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <ObservationDatabaseError subject="Issues" />
    );
  }

  const observedProjects = await observeProjectsGitHub(projects, {
    features: ["issues"],
  });

  return (
    <IssuesView
      issues={listCrossProjectIssues(observedProjects)}
      check={summarizeCrossProjectChecks(observedProjects, "issues")}
    />
  );
}

export default function IssuesPage() {
  return (
    <AppShell activeSection="Issues">
      <Suspense
        fallback={(
          <SurfaceLoading
            title="Issues"
            message="Reading open GitHub Issues. Partial or unavailable repositories will remain explicit."
          />
        )}
      >
        <ObservedIssues />
      </Suspense>
    </AppShell>
  );
}
