import "server-only";

import { GitHubProviderError } from "../github/client.js";
import { fetchRecentGitHubCommits } from "../github/commits.js";
import { observeRepositoryImplementation } from "../github/implementation.js";
import { fetchOpenGitHubIssues } from "../github/issues.js";
import { fetchLatestPublishedGitHubRelease } from "../github/releases.js";
import { parseGitHubRepositoryResource } from "../github/resource-identity.js";
import { attachGitHubSummaries } from "./github-summary.js";

const REPOSITORY_OBSERVATION_CONCURRENCY = 6;

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
  { token, fetchImpl, checkedAt, features },
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
      ? fetchOpenGitHubIssues(repository, { token, fetchImpl })
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
      ? { status: "success", items: issues.value }
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
  } = {},
) {
  const checkedAt = now.toISOString();
  const requestedFeatures = new Set(features);
  const repositoryInputs = projects.flatMap((project) =>
    (project.githubRepositories ?? []).map((resource) => ({
      project,
      resource,
    })),
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
      }),
  );

  return attachGitHubSummaries(projects, observations);
}
