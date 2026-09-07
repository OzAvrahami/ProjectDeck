import "server-only";

import { GitHubProviderError } from "../github/client.js";
import { fetchRecentGitHubCommits } from "../github/commits.js";
import { observeRepositoryImplementation } from "../github/implementation.js";
import {
  DEFAULT_ISSUE_PAGE_SIZE,
  fetchGitHubIssuePage,
} from "../github/issues.js";
import { fetchLatestPublishedGitHubRelease } from "../github/releases.js";
import { parseGitHubRepositoryResource } from "../github/resource-identity.js";
import { attachGitHubSummaries } from "./github-summary.js";
import {
  composeIssuePage,
  decodeIssuePageCursor,
  issueObservationKey,
} from "./issue-pagination.js";

const REPOSITORY_OBSERVATION_CONCURRENCY = 6;

function uniqueRepositoryInputs(inputs, { acrossProjects = false } = {}) {
  const seen = new Set();

  return inputs.filter(({ project, resource }) => {
    const repository = parseGitHubRepositoryResource(resource);
    const identity = repository?.fullName?.toLowerCase() ?? `resource:${resource.id}`;
    const key = acrossProjects ? identity : `${project.id}:${identity}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function mapWithConcurrency(inputs, concurrency, mapper) {
  const results = new Array(inputs.length);
  let cursor = 0;

  async function worker() {
    while (cursor < inputs.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(inputs[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, inputs.length) },
      () => worker(),
    ),
  );

  return results;
}

function unavailableResult(error) {
  if (error instanceof GitHubProviderError) {
    return {
      status: "unavailable",
      error: { code: error.code, message: error.message },
    };
  }

  return {
    status: "unavailable",
    error: {
      code: "provider",
      message: "GitHub returned an unexpected provider response.",
    },
  };
}

async function observeRepository(
  project,
  resource,
  { token, fetchImpl, checkedAt, features, issuePagination },
) {
  const repository = parseGitHubRepositoryResource(resource);
  const base = {
    projectId: project.id,
    resourceId: resource.id,
    componentId: resource.componentId,
    componentName: resource.componentName,
    repository,
    scopeLabel: resource.componentName || repository?.name || resource.label,
    checkedAt,
  };

  if (!repository) {
    const error = {
      status: "unavailable",
      error: {
        code: "invalid_identity",
        message: "The connected GitHub repository URL could not be verified.",
      },
    };

    return {
      ...base,
      issues: features.has("issues") ? error : { status: "not_requested" },
      release: features.has("releases") ? error : { status: "not_requested" },
      activity: features.has("activity") ? error : { status: "not_requested" },
      implementation: features.has("implementation")
        ? error
        : { status: "not_requested" },
    };
  }

  const needsRelease =
    features.has("releases") || features.has("implementation");
  const needsActivity =
    features.has("activity") || features.has("implementation");
  const [issues, release, activity] = await Promise.allSettled([
    features.has("issues")
      ? fetchGitHubIssuePage(repository, {
          token,
          fetchImpl,
          after: issuePagination?.positions?.[
            `${project.id}:${repository.fullName.toLowerCase()}`
          ] ?? null,
          type: issuePagination?.type,
          pageSize: issuePagination?.pageSize,
        })
      : Promise.resolve(null),
    needsRelease
      ? fetchLatestPublishedGitHubRelease(repository, { token, fetchImpl })
      : Promise.resolve(null),
    needsActivity
      ? fetchRecentGitHubCommits(repository, { token, fetchImpl })
      : Promise.resolve(null),
  ]);
  const issueResult = !features.has("issues")
    ? { status: "not_requested" }
    : issues.status === "fulfilled"
      ? { status: "success", ...issues.value }
      : unavailableResult(issues.reason);
  const observedReleaseResult = !needsRelease
    ? { status: "not_requested" }
    : release.status === "fulfilled"
      ? { status: "success", item: release.value }
      : unavailableResult(release.reason);
  const observedActivityResult = !needsActivity
    ? { status: "not_requested" }
    : activity.status === "fulfilled"
      ? { status: "success", items: activity.value }
      : unavailableResult(activity.reason);
  let implementationResult = { status: "not_requested" };

  if (features.has("implementation")) {
    try {
      implementationResult = await observeRepositoryImplementation(repository, {
        release: observedReleaseResult,
        activity: observedActivityResult,
        token,
        fetchImpl,
        now: checkedAt ? new Date(checkedAt) : new Date(),
      });
    } catch (error) {
      implementationResult = unavailableResult(error);
    }
  }

  return {
    ...base,
    issues: issueResult,
    release: features.has("releases")
      ? observedReleaseResult
      : { status: "not_requested" },
    activity: features.has("activity")
      ? observedActivityResult
      : { status: "not_requested" },
    implementation: implementationResult,
  };
}

export async function observeProjectsGitHub(
  projects,
  {
    token = process.env.GITHUB_TOKEN,
    fetchImpl = fetch,
    now = new Date(),
    features = ["issues", "releases", "activity", "implementation"],
    issuePagination = null,
  } = {},
) {
  const checkedAt = now.toISOString();
  const requestedFeatures = new Set(features);
  const repositoryInputs = uniqueRepositoryInputs(
    projects.flatMap((project) =>
      (project.githubRepositories ?? []).map((resource) => ({
        project,
        resource,
      })),
    ),
  );
  const observations = await mapWithConcurrency(
    repositoryInputs,
    REPOSITORY_OBSERVATION_CONCURRENCY,
    ({ project, resource }) =>
      observeRepository(project, resource, {
        token,
        fetchImpl,
        checkedAt,
        features: requestedFeatures,
        issuePagination,
      }),
  );

  return attachGitHubSummaries(projects, observations);
}

export async function observeProjectsGitHubIssuePage(
  projects,
  {
    token = process.env.GITHUB_TOKEN,
    fetchImpl = fetch,
    now = new Date(),
    cursor = null,
    type = "all",
    pageSize = DEFAULT_ISSUE_PAGE_SIZE,
  } = {},
) {
  const normalizedType = type === "bug" ? "bug" : "all";
  const decoded = decodeIssuePageCursor(cursor, normalizedType);
  const checkedAt = now.toISOString();
  const repositoryInputs = uniqueRepositoryInputs(
    projects.flatMap((project) =>
      (project.githubRepositories ?? []).map((resource) => ({
        project,
        resource,
      })),
    ),
    { acrossProjects: projects.length > 1 },
  );
  const observations = await mapWithConcurrency(
    repositoryInputs,
    REPOSITORY_OBSERVATION_CONCURRENCY,
    ({ project, resource }) =>
      observeRepository(project, resource, {
        token,
        fetchImpl,
        checkedAt,
        features: new Set(["issues"]),
        issuePagination: {
          positions: decoded.state.positions,
          type: normalizedType,
          pageSize,
        },
      }),
  );
  const observedProjects = attachGitHubSummaries(projects, observations);
  const pagination = composeIssuePage({
    observations,
    projects: observedProjects,
    state: decoded.state,
    invalidCursor: decoded.invalid,
    type: normalizedType,
    pageSize,
  });
  const visible = new Set(
    pagination.items.map((item) => `${item.project?.id}:${item.id}`),
  );
  const pagedProjects = observedProjects.map((project) => ({
    ...project,
    githubSummary: {
      ...project.githubSummary,
      issues: {
        ...project.githubSummary.issues,
        items: project.githubSummary.issues.items.filter((item) =>
          visible.has(`${project.id}:${item.id}`),
        ),
      },
    },
  }));

  return {
    projects: pagedProjects,
    pagination,
    observations: observations.map((observation) => ({
      projectId: observation.projectId,
      resourceId: observation.resourceId,
      repository: observation.repository,
      key: observation.repository ? issueObservationKey(observation) : null,
      status: observation.issues.status,
    })),
  };
}
