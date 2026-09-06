import "server-only";

import { GitHubProviderError } from "../client.js";
import { fetchGitHubRepositoryLabels } from "../labels.js";
import { parseGitHubRepositoryResource } from "../resource-identity.js";
import { auditGitHubDevelopmentStandard } from "./audit.js";
import { getGitHubStandardWriteCapabilities } from "./credentials.js";
import { buildGitHubStandardMigrationPlan } from "./plan.js";

const STANDARD_AUDIT_REPOSITORY_CONCURRENCY = 4;

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

function providerError(error) {
  return {
    code: error instanceof GitHubProviderError ? error.code : "provider",
    message:
      error instanceof GitHubProviderError
        ? error.message
        : "GitHub returned an unexpected repository-label response.",
  };
}

function releaseEvidence(project, resource, repository) {
  const summaries = project.githubSummary?.releases?.repositories ?? [];
  return summaries.find((summary) => {
    if (summary.resourceId && resource.id) {
      return String(summary.resourceId) === String(resource.id);
    }

    return (
      summary.repository?.fullName?.toLowerCase() ===
      repository?.fullName?.toLowerCase()
    );
  });
}

async function observeRepositoryStandard(project, resource, options) {
  const repository = parseGitHubRepositoryResource(resource);
  const release = releaseEvidence(project, resource, repository);
  const base = {
    resourceId: resource.id ?? null,
    repository,
    component: resource.componentId
      ? {
          id: resource.componentId,
          name: resource.componentName ?? null,
        }
      : null,
    labels: [],
    latestRelease: release?.latestRelease ?? null,
    releaseStatus: release
      ? release.providerStatus === "success"
        ? "available"
        : "unavailable"
      : "unavailable",
  };

  if (!repository) {
    return {
      ...base,
      status: "unavailable",
      error: {
        code: "invalid_identity",
        message: "The connected GitHub repository identity could not be verified.",
      },
    };
  }

  try {
    return {
      ...base,
      status: "available",
      labels: await fetchGitHubRepositoryLabels(repository, options),
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      status: "unavailable",
      error: providerError(error),
    };
  }
}

export async function observeGitHubDevelopmentStandard(
  project,
  {
    workflowEvidence = project.githubWorkflowEvidence,
    token = process.env.GITHUB_TOKEN,
    fetchImpl = fetch,
    environment = process.env,
    now = new Date(),
  } = {},
) {
  const repositoryEvidence = await mapWithConcurrency(
    project.githubRepositories ?? [],
    STANDARD_AUDIT_REPOSITORY_CONCURRENCY,
    (resource) =>
      observeRepositoryStandard(project, resource, { token, fetchImpl }),
  );
  const audit = auditGitHubDevelopmentStandard({
    project,
    workflowEvidence,
    repositories: repositoryEvidence,
    observedAt: now.toISOString(),
    writeCapabilities: getGitHubStandardWriteCapabilities(environment),
  });

  return {
    ...audit,
    plan: buildGitHubStandardMigrationPlan(audit),
  };
}
