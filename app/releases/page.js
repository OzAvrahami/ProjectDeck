import { Suspense } from "react";

import { AppShell } from "../../components/app-shell.js";
import {
  ObservationDatabaseError,
  ReleasesView,
} from "../../components/github/github-observation-views.js";
import { SurfaceLoading } from "../../components/surface-loading.js";
import { observeProjectsGitHub } from "../../lib/projects/github-observations.js";
import {
  listCrossProjectReleases,
  summarizeCrossProjectChecks,
} from "../../lib/projects/github-summary.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

async function ObservedReleases() {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <ObservationDatabaseError subject="Releases" />
    );
  }

  const observedProjects = await observeProjectsGitHub(projects, {
    features: ["releases"],
  });

  return (
    <ReleasesView
      releases={listCrossProjectReleases(observedProjects)}
      check={summarizeCrossProjectChecks(observedProjects, "releases")}
    />
  );
}

export default function ReleasesPage() {
  return (
    <AppShell activeSection="Releases">
      <Suspense
        fallback={(
          <SurfaceLoading
            title="Releases"
            message="Reading published GitHub Releases. Tags alone are not shown as released versions."
          />
        )}
      >
        <ObservedReleases />
      </Suspense>
    </AppShell>
  );
}
