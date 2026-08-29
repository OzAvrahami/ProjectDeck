function issueLabel(count, partial) {
  const countText = partial ? `${count}+` : String(count);
  return `${countText} open ${count === 1 && !partial ? "issue" : "issues"}`;
}

function observationStatus(successCount, failureCount, totalCount) {
  if (totalCount === 0) {
    return "not_connected";
  }

  if (successCount === totalCount) {
    return "complete";
  }

  return successCount > 0 && failureCount > 0 ? "partial" : "unavailable";
}

function newestFirst(field) {
  return (left, right) => {
    const leftTime = left[field] ? Date.parse(left[field]) : 0;
    const rightTime = right[field] ? Date.parse(right[field]) : 0;
    return (Number.isNaN(rightTime) ? 0 : rightTime) -
      (Number.isNaN(leftTime) ? 0 : leftTime);
  };
}

function withProjectContext(item, project, observation) {
  return {
    ...item,
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      accent: project.accent,
    },
    component: observation.componentId
      ? {
          id: observation.componentId,
          name: observation.componentName,
        }
      : null,
    scopeLabel: observation.scopeLabel,
  };
}

export function summarizeProjectGitHub(project, observations) {
  const projectObservations = observations.filter(
    (observation) => observation.projectId === project.id,
  );
  const issueObservations = projectObservations.filter(
    (observation) => observation.issues.status !== "not_requested",
  );
  const issueSuccesses = issueObservations.filter(
    (observation) => observation.issues.status === "success",
  );
  const issueFailures = issueObservations.filter(
    (observation) => observation.issues.status === "unavailable",
  );
  const issueItems = issueSuccesses
    .flatMap((observation) =>
      observation.issues.items.map((issue) =>
        withProjectContext(issue, project, observation),
      ),
    )
    .sort(newestFirst("updatedAt"));
  const issueStatus = observationStatus(
    issueSuccesses.length,
    issueFailures.length,
    issueObservations.length,
  );

  const releaseObservations = projectObservations.filter(
    (observation) => observation.release.status !== "not_requested",
  );
  const releaseSuccesses = releaseObservations.filter(
    (observation) => observation.release.status === "success",
  );
  const releaseFailures = releaseObservations.filter(
    (observation) => observation.release.status === "unavailable",
  );
  const releaseItems = releaseSuccesses
    .filter((observation) => observation.release.item)
    .map((observation) =>
      withProjectContext(observation.release.item, project, observation),
    )
    .sort(newestFirst("publishedAt"));
  const releaseStatus = observationStatus(
    releaseSuccesses.length,
    releaseFailures.length,
    releaseObservations.length,
  );
  let compactReleaseLabel = null;

  if (releaseStatus === "complete" && releaseItems.length === 1) {
    compactReleaseLabel =
      releaseObservations.length === 1
        ? releaseItems[0].tagName
        : `${releaseItems[0].scopeLabel} ${releaseItems[0].tagName}`;
  }

  const activityObservations = projectObservations.filter(
    (observation) =>
      observation.activity && observation.activity.status !== "not_requested",
  );
  const activitySuccesses = activityObservations.filter(
    (observation) => observation.activity.status === "success",
  );
  const activityFailures = activityObservations.filter(
    (observation) => observation.activity.status === "unavailable",
  );
  const activityItems = activitySuccesses
    .flatMap((observation) =>
      observation.activity.items.map((activity) =>
        withProjectContext(activity, project, observation),
      ),
    )
    .sort(newestFirst("committedAt"));
  const activityStatus = observationStatus(
    activitySuccesses.length,
    activityFailures.length,
    activityObservations.length,
  );
  const implementationObservations = projectObservations.filter(
    (observation) =>
      observation.implementation &&
      observation.implementation.status !== "not_requested",
  );
  const implementationSuccesses = implementationObservations.filter(
    (observation) => observation.implementation.status === "success",
  );
  const implementationFailures = implementationObservations.filter(
    (observation) => observation.implementation.status === "unavailable",
  );
  const implementationStatus = observationStatus(
    implementationSuccesses.length,
    implementationFailures.length,
    implementationObservations.length,
  );
  const implementationRepositories = implementationSuccesses.map(
    (observation) => ({
      resourceId: observation.resourceId,
      repository: observation.repository,
      component: observation.componentId
        ? {
            id: observation.componentId,
            name: observation.componentName,
          }
        : null,
      scopeLabel: observation.scopeLabel,
      maturity: observation.implementation.maturity,
      activity: observation.implementation.activity,
      checkedAt: observation.checkedAt,
    }),
  );

  return {
    repositoryCount: projectObservations.length,
    checkedAt:
      projectObservations
        .map((observation) => observation.checkedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    issues: {
      status: issueStatus,
      count: issueItems.length,
      label:
        issueStatus === "not_connected"
          ? null
          : issueStatus === "unavailable"
            ? "Issues unavailable"
            : issueLabel(issueItems.length, issueStatus === "partial"),
      items: issueItems,
      checkedRepositoryCount: issueSuccesses.length,
      failedRepositoryCount: issueFailures.length,
      failures: issueFailures.map((observation) => observation.issues.error),
    },
    releases: {
      status: releaseStatus,
      items: releaseItems,
      compactLabel: compactReleaseLabel,
      checkedRepositoryCount: releaseSuccesses.length,
      failedRepositoryCount: releaseFailures.length,
      failures: releaseFailures.map(
        (observation) => observation.release.error,
      ),
    },
    activity: {
      status: activityStatus,
      items: activityItems,
      checkedRepositoryCount: activitySuccesses.length,
      failedRepositoryCount: activityFailures.length,
      failures: activityFailures.map(
        (observation) => observation.activity.error,
      ),
    },
    implementation: {
      status: implementationStatus,
      repositories: implementationRepositories,
      checkedRepositoryCount: implementationSuccesses.length,
      failedRepositoryCount: implementationFailures.length,
      failures: implementationFailures.map(
        (observation) => observation.implementation.error,
      ),
    },
  };
}

export function attachGitHubSummaries(projects, observations) {
  return projects.map((project) => ({
    ...project,
    githubSummary: summarizeProjectGitHub(project, observations),
  }));
}

export function listCrossProjectIssues(projects) {
  return projects
    .flatMap((project) => project.githubSummary?.issues.items ?? [])
    .sort(newestFirst("updatedAt"));
}

export function listCrossProjectReleases(projects) {
  return projects
    .flatMap((project) => project.githubSummary?.releases.items ?? [])
    .sort(newestFirst("publishedAt"));
}

export function listCrossProjectActivity(projects) {
  return projects
    .flatMap((project) => project.githubSummary?.activity.items ?? [])
    .sort(newestFirst("committedAt"));
}

export function summarizeCrossProjectChecks(projects, feature) {
  const summaries = projects
    .map((project) => project.githubSummary?.[feature])
    .filter(Boolean);

  return {
    repositoryCount: summaries.reduce(
      (count, summary) =>
        count + summary.checkedRepositoryCount + summary.failedRepositoryCount,
      0,
    ),
    checkedRepositoryCount: summaries.reduce(
      (count, summary) => count + summary.checkedRepositoryCount,
      0,
    ),
    failedRepositoryCount: summaries.reduce(
      (count, summary) => count + summary.failedRepositoryCount,
      0,
    ),
    failures: summaries.flatMap((summary) => summary.failures),
  };
}
