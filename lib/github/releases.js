import "server-only";

import {
  clarifyGitHubRepositoryEndpointError,
  encodeGitHubRepositoryPath,
  fetchGitHubJson,
  hasNextGitHubPage,
} from "./client.js";

const PAGE_SIZE = 100;

export function normalizeGitHubRelease(release, repository) {
  if (!release || release.id == null || !release.tag_name) {
    throw new Error("GitHub returned an invalid Release record.");
  }

  return {
    id: String(release.id),
    tagName: release.tag_name,
    name: release.name?.trim() || null,
    repository,
    url: release.html_url,
    publishedAt: release.published_at ?? null,
    prerelease: Boolean(release.prerelease),
  };
}

function releaseTimestamp(release) {
  const timestamp = release.publishedAt
    ? Date.parse(release.publishedAt)
    : Number.NEGATIVE_INFINITY;

  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export async function fetchLatestPublishedGitHubRelease(
  repository,
  { token = process.env.GITHUB_TOKEN, fetchImpl = fetch } = {},
) {
  const releases = [];
  const repositoryPath = encodeGitHubRepositoryPath(
    repository.owner,
    repository.name,
  );
  let page = 1;

  try {
    while (true) {
      const url = new URL(
        `/repos/${repositoryPath}/releases`,
        "https://api.github.com",
      );
      url.searchParams.set("per_page", String(PAGE_SIZE));
      url.searchParams.set("page", String(page));

      const response = await fetchGitHubJson(url, {
        token,
        fetchImpl,
        capability: "Release access",
      });

      if (!Array.isArray(response.data)) {
        throw new Error("GitHub returned an invalid Releases response.");
      }

      releases.push(
        ...response.data
          .filter((release) => !release.draft && release.published_at)
          .map((release) => normalizeGitHubRelease(release, repository)),
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
      "Release access",
    );
    throw error;
  }

  return releases.sort(
    (left, right) => releaseTimestamp(right) - releaseTimestamp(left),
  )[0] ?? null;
}
