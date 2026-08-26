import "server-only";

import { GitHubProviderError } from "../github/client.js";
import { fetchOpenGitHubIssues } from "../github/issues.js";
import { fetchLatestPublishedGitHubRelease } from "../github/releases.js";
import { parseGitHubRepositoryResource } from "../github/resource-identity.js";
import { attachGitHubSummaries } from "./github-summary.js";

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
      release: features.has("releases")
        ? error
        : { status: "not_requested" },
    };
  }

  const [issues, release] = await Promise.allSettled([
    features.has("issues")
      ? fetchOpenGitHubIssues(repository, { token, fetchImpl })
      : Promise.resolve(null),
    features.has("releases")
      ? fetchLatestPublishedGitHubRelease(repository, { token, fetchImpl })
      : Promise.resolve(null),
  ]);
  const issueResult = !features.has("issues")
    ? { status: "not_requested" }
    : issues.status === "fulfilled"
      ? { status: "success", items: issues.value }
      : unavailableResult(issues.reason);
  const releaseResult = !features.has("releases")
    ? { status: "not_requested" }
    : release.status === "fulfilled"
      ? { status: "success", item: release.value }
      : unavailableResult(release.reason);

  return {
    ...base,
    issues: issueResult,
    release: releaseResult,
  };
}

export async function observeProjectsGitHub(
  projects,
  {
    token = process.env.GITHUB_TOKEN,
    fetchImpl = fetch,
    now = new Date(),
    features = ["issues", "releases"],
  } = {},
) {
  const checkedAt = now.toISOString();
  const requestedFeatures = new Set(features);
  const observations = await Promise.all(
    projects.flatMap((project) =>
      (project.githubRepositories ?? []).map((resource) =>
        observeRepository(project, resource, {
          token,
          fetchImpl,
          checkedAt,
          features: requestedFeatures,
        }),
      ),
    ),
  );

  return attachGitHubSummaries(projects, observations);
}
