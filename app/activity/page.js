import { Suspense } from "react";

import { AppShell } from "../../components/app-shell.js";
import { ActivityView } from "../../components/github/activity-view.js";
import { ObservationDatabaseError } from "../../components/github/github-observation-views.js";
import { SurfaceLoading } from "../../components/surface-loading.js";
import { observeProjectsGitHub } from "../../lib/projects/github-observations.js";
import {
  listCrossProjectActivity,
  summarizeCrossProjectChecks,
} from "../../lib/projects/github-summary.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

async function ObservedActivity() {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <ObservationDatabaseError subject="Activity" />
    );
  }

  const observedProjects = await observeProjectsGitHub(projects, {
    features: ["activity"],
  });

  return (
    <ActivityView
      activity={listCrossProjectActivity(observedProjects)}
      check={summarizeCrossProjectChecks(observedProjects, "activity")}
    />
  );
}

export default function ActivityPage() {
  return (
    <AppShell activeSection="Activity">
      <Suspense
        fallback={(
          <SurfaceLoading
            title="Activity"
            message="Reading recent commits with repository and Component provenance."
          />
        )}
      >
        <ObservedActivity />
      </Suspense>
    </AppShell>
  );
}
