import "server-only";

import {
  clarifyGitHubRepositoryEndpointError,
  encodeGitHubRepositoryPath,
  fetchGitHubJson,
} from "./client.js";

const CONVENTIONAL_PREFIX = /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([^)]*\))?!?:\s*/i;

export function detectCommitKind(message) {
  return String(message ?? "").split(/\r?\n/, 1)[0].match(CONVENTIONAL_PREFIX)?.[1]?.toLowerCase() ?? null;
}

export function formatCommitMessage(message, maxLength = 120) {
  const firstLine = String(message ?? "")
    .split(/\r?\n/, 1)[0]
    .replace(CONVENTIONAL_PREFIX, "")
    .trim();
  const normalized = firstLine || "Commit details unavailable";

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
}

export function normalizeGitHubCommit(commit, repository) {
  return {
    id: commit.sha,
    sha: commit.sha,
    shortSha: String(commit.sha ?? "").slice(0, 7),
    message: formatCommitMessage(commit.commit?.message),
    kind: detectCommitKind(commit.commit?.message),
    repository,
    author: commit.commit?.author?.name ?? commit.author?.login ?? null,
    committedAt:
      commit.commit?.author?.date ?? commit.commit?.committer?.date ?? null,
    url: commit.html_url,
  };
}

export async function fetchRecentGitHubCommits(
  repository,
  { token, fetchImpl = fetch, limit = 6 } = {},
) {
  const repositoryPath = encodeGitHubRepositoryPath(
    repository.owner,
    repository.name,
  );
  const options = { token, fetchImpl };

  try {
    const { data } = await fetchGitHubJson(
      `/repos/${repositoryPath}/commits?per_page=${Math.min(Math.max(limit, 1), 20)}`,
      { ...options, capability: "recent repository activity" },
    );

    return data.map((commit) => normalizeGitHubCommit(commit, repository));
  } catch (error) {
    return clarifyGitHubRepositoryEndpointError(
      error,
      repository,
      options,
      "recent repository activity",
    );
  }
}
