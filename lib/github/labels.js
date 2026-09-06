import "server-only";

import {
  clarifyGitHubRepositoryEndpointError,
  encodeGitHubRepositoryPath,
  fetchGitHubJson,
  hasNextGitHubPage,
} from "./client.js";

const PAGE_SIZE = 100;

export function normalizeGitHubRepositoryLabel(label) {
  if (!label || label.id == null || !label.name) {
    throw new Error("GitHub returned an invalid repository label.");
  }

  return {
    id: String(label.id),
    name: label.name,
    color: label.color ?? null,
    description: label.description ?? null,
    default: Boolean(label.default),
  };
}

export async function fetchGitHubRepositoryLabels(
  repository,
  { token = process.env.GITHUB_TOKEN, fetchImpl = fetch } = {},
) {
  const labels = [];
  const repositoryPath = encodeGitHubRepositoryPath(
    repository.owner,
    repository.name,
  );
  let page = 1;

  try {
    while (true) {
      const url = new URL(
        `/repos/${repositoryPath}/labels`,
        "https://api.github.com",
      );
      url.searchParams.set("per_page", String(PAGE_SIZE));
      url.searchParams.set("page", String(page));

      const response = await fetchGitHubJson(url, {
        token,
        fetchImpl,
        capability: "repository labels",
      });

      if (!Array.isArray(response.data)) {
        throw new Error("GitHub returned an invalid repository label response.");
      }

      labels.push(...response.data.map(normalizeGitHubRepositoryLabel));
      const hasNextPage = hasNextGitHubPage(response.link);

      if (
        hasNextPage === false ||
        (hasNextPage === null && response.data.length < PAGE_SIZE)
      ) {
        return labels;
      }

      page += 1;
    }
  } catch (error) {
    await clarifyGitHubRepositoryEndpointError(
      error,
      repository,
      { token, fetchImpl },
      "repository labels",
    );
    throw error;
  }
}
