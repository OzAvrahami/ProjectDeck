import "server-only";

import {
  clarifyGitHubRepositoryEndpointError,
  encodeGitHubRepositoryPath,
  fetchGitHubJson,
  hasNextGitHubPage,
} from "./client.js";

const PAGE_SIZE = 100;

export function normalizeGitHubIssue(issue, repository) {
  if (!issue || issue.id == null || issue.number == null || !issue.title) {
    throw new Error("GitHub returned an invalid Issue record.");
  }

  return {
    id: String(issue.id),
    number: issue.number,
    title: issue.title,
    repository,
    url: issue.html_url,
    createdAt: issue.created_at ?? null,
    updatedAt: issue.updated_at ?? null,
    labels: (issue.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean),
    assignees: (issue.assignees ?? [])
      .map((assignee) => assignee?.login)
      .filter(Boolean),
    state: "open",
  };
}

export async function fetchOpenGitHubIssues(
  repository,
  { token = process.env.GITHUB_TOKEN, fetchImpl = fetch } = {},
) {
  const issues = [];
  const repositoryPath = encodeGitHubRepositoryPath(
    repository.owner,
    repository.name,
  );
  let page = 1;

  try {
    while (true) {
      const url = new URL(
        `/repos/${repositoryPath}/issues`,
        "https://api.github.com",
      );
      url.searchParams.set("state", "open");
      url.searchParams.set("per_page", String(PAGE_SIZE));
      url.searchParams.set("page", String(page));

      const response = await fetchGitHubJson(url, {
        token,
        fetchImpl,
        capability: "Issues access",
      });

      if (!Array.isArray(response.data)) {
        throw new Error("GitHub returned an invalid Issues response.");
      }

      issues.push(
        ...response.data
          .filter((issue) => !issue.pull_request)
          .map((issue) => normalizeGitHubIssue(issue, repository)),
      );

      const hasNextPage = hasNextGitHubPage(response.link);

      if (
        hasNextPage === false ||
        (hasNextPage === null && response.data.length < PAGE_SIZE)
      ) {
        break;
      }

      page += 1;
    }
  } catch (error) {
    await clarifyGitHubRepositoryEndpointError(
      error,
      repository,
      { token, fetchImpl },
      "Issues access",
    );
    throw error;
  }

  return issues;
}
