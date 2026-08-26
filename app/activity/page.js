import { AppShell } from "../../components/app-shell.js";
import { ActivityView } from "../../components/github/activity-view.js";
import { ObservationDatabaseError } from "../../components/github/github-observation-views.js";
import { observeProjectsGitHub } from "../../lib/projects/github-observations.js";
import {
  listCrossProjectActivity,
  summarizeCrossProjectChecks,
} from "../../lib/projects/github-summary.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <AppShell activeSection="Activity">
        <ObservationDatabaseError subject="Activity" />
      </AppShell>
    );
  }

  const observedProjects = await observeProjectsGitHub(projects, {
    features: ["activity"],
  });

  return (
    <AppShell activeSection="Activity">
      <ActivityView
        activity={listCrossProjectActivity(observedProjects)}
        check={summarizeCrossProjectChecks(observedProjects, "activity")}
      />
    </AppShell>
  );
}
