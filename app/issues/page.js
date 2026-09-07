import { Suspense } from "react";

import { AppShell } from "../../components/app-shell.js";
import {
  IssuesView,
  ObservationDatabaseError,
} from "../../components/github/github-observation-views.js";
import { SurfaceLoading } from "../../components/surface-loading.js";
import { observeProjectsGitHubIssuePage } from "../../lib/projects/github-observations.js";
import {
  listCrossProjectIssues,
  summarizeCrossProjectChecks,
  summarizeCrossProjectIssueCounts,
} from "../../lib/projects/github-summary.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

async function ObservedIssues({ issueType, cursor }) {
  let projects;

  try {
    projects = await listPortfolioProjects();
  } catch {
    return (
      <ObservationDatabaseError subject="Issues" />
    );
  }

  const result = await observeProjectsGitHubIssuePage(projects, {
    type: issueType,
    cursor,
  });
  const observedProjects = result.projects;

  return (
    <IssuesView
      issues={listCrossProjectIssues(observedProjects)}
      check={summarizeCrossProjectChecks(observedProjects, "issues")}
      counts={summarizeCrossProjectIssueCounts(observedProjects)}
      pagination={result.pagination}
      issueType={issueType}
    />
  );
}

export default async function IssuesPage({ searchParams }) {
  const query = await searchParams;
  const issueType = query?.type === "bug" ? "bug" : "all";
  const cursor = typeof query?.cursor === "string" ? query.cursor : null;

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
        <ObservedIssues issueType={issueType} cursor={cursor} />
      </Suspense>
    </AppShell>
  );
}
